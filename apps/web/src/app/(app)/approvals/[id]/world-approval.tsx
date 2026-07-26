'use client';

/* eslint-disable no-restricted-imports -- IDKit owns the browser-only World App
   transport. The RP signing key and proof verification stay on the server. */
import type {
  IDKitRequestConfig,
  ProofOfHumanPreset,
} from '@worldcoin/idkit-core';
/* eslint-enable no-restricted-imports */
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';

/**
 * Approve one exact payment from a phone.
 *
 * The action digest is carried into the proof as the World ID signal, so what
 * gets approved on the phone is this invoice and no other. A proof lifted onto
 * a different payment fails validation rather than quietly counting.
 */

type Phase =
  'error' | 'idle' | 'opening' | 'verified' | 'verifying' | 'waiting';

interface Properties {
  readonly actionDigest: string;
  readonly agentAddress: string;
  readonly approverLabel: string;
}

export function WorldApproval({
  actionDigest,
  agentAddress,
  approverLabel,
}: Properties) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      activeRequest.current?.abort();
    },
    [],
  );

  const start = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setPhase('opening');
    setMessage(null);
    setQr(null);
    setUri(null);
    setVerifiedAt(null);

    try {
      const minted = await fetch('/api/approvals/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionDigest, agentAddress }),
      });
      const payload = (await minted.json()) as {
        approvalSessionId?: string;
        config?: IDKitRequestConfig;
        error?: string;
        expiresAt?: string;
        preset?: ProofOfHumanPreset;
      };
      if (
        !minted.ok ||
        payload.approvalSessionId === undefined ||
        payload.config === undefined ||
        payload.expiresAt === undefined ||
        payload.preset === undefined
      ) {
        setPhase('error');
        setMessage(payload.error ?? 'Could not open an approval.');
        return;
      }

      /*
       * IDKit and its WASM bridge are loaded only when the user asks to connect
       * World App. Keeping them out of the initial approval-page bundle avoids
       * making every local page compile the sponsor transport.
       *
       * The signing key stays on the server. The browser receives the exact
       * action-bound config and proof-of-human preset built by the adapter.
       */
      const [{ IDKit }, { default: QRCode }] = await Promise.all([
        import('@worldcoin/idkit-core'),
        import('qrcode'),
      ]);
      const request = await IDKit.request(payload.config).preset(
        payload.preset,
      );

      setUri(request.connectorURI);
      setQr(
        await QRCode.toDataURL(request.connectorURI, {
          margin: 1,
          width: 260,
        }),
      );
      setPhase('waiting');

      const remaining = Date.parse(payload.expiresAt) - Date.now();
      const completion = await request.pollUntilCompletion({
        signal: controller.signal,
        timeout: Math.max(1_000, Math.min(5 * 60_000, remaining)),
      });
      if (controller.signal.aborted) return;
      if (!completion.success) {
        setPhase('error');
        setMessage(
          `World App did not complete the approval (${completion.error.replaceAll(
            '_',
            ' ',
          )}).`,
        );
        return;
      }

      setPhase('verifying');
      const verified = await fetch(
        `/api/approvals/verify?session=${encodeURIComponent(
          payload.approvalSessionId,
        )}`,
        {
          body: JSON.stringify(completion.result),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
          signal: controller.signal,
        },
      );
      const verification = (await verified.json()) as {
        actionDigest?: string;
        error?: string;
        success?: boolean;
        verifiedAt?: string;
      };
      if (
        !verified.ok ||
        verification.success !== true ||
        verification.actionDigest !== actionDigest ||
        verification.verifiedAt === undefined
      ) {
        setPhase('error');
        setMessage(
          verification.error ??
            'World returned a response, but the server could not verify it.',
        );
        return;
      }

      setVerifiedAt(verification.verifiedAt);
      setPhase('verified');
    } catch (cause) {
      if (controller.signal.aborted) return;
      setPhase('error');
      setMessage(cause instanceof Error ? cause.message : 'Approval failed.');
    }
  }, [actionDigest, agentAddress]);

  return (
    <div className="flex flex-col gap-3 border border-border p-5">
      <div>
        <p className="microlabel">Approve on your phone</p>
        <p className="mt-1 text-sm text-muted-foreground">
          World App is asked to prove a unique human approved{' '}
          <strong>this</strong> payment. The action digest travels into the
          proof as the signal, so the approval cannot be moved to another
          invoice.
        </p>
      </div>

      {phase === 'idle' || phase === 'error' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void start()}>
            Connect World App for {approverLabel}
          </Button>
          {message === null ? null : (
            <span className="text-xs text-destructive">{message}</span>
          )}
        </div>
      ) : null}

      {phase === 'opening' ? (
        <p className="text-sm text-muted-foreground">Opening a session…</p>
      ) : null}

      {phase === 'waiting' && qr !== null ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* A data URI generated in the browser — no remote asset to optimise. */}
          <img
            alt="Scan with World App to approve this payment"
            className="border border-border"
            height={260}
            src={qr}
            width={260}
          />
          <div className="flex flex-col gap-2 text-xs">
            <Badge variant="warning">Waiting for approval in World App</Badge>
            <p className="text-muted-foreground">
              Scan with World App. The session expires in five minutes; an
              uncompleted request never counts as an approval.
            </p>
            {uri === null ? null : (
              <a className="break-all underline" href={uri}>
                open directly on this device
              </a>
            )}
          </div>
        </div>
      ) : null}

      {phase === 'verifying' ? (
        <p className="text-sm text-muted-foreground">
          World App responded. Verifying the proof on the server…
        </p>
      ) : null}

      {phase === 'verified' ? (
        <div className="flex flex-col gap-2">
          <Badge variant="default">World proof verified</Badge>
          <p className="text-xs text-muted-foreground">
            World verified a proof-of-human response bound to this payment
            action and its single-use approval session
            {verifiedAt === null
              ? '.'
              : ` at ${new Date(verifiedAt).toLocaleTimeString()}.`}
          </p>
          <p className="text-xs text-muted-foreground">
            The local demo consumes the session in memory. It does not claim
            that the proof has been admitted to the durable payment quorum.
          </p>
        </div>
      ) : null}
    </div>
  );
}
