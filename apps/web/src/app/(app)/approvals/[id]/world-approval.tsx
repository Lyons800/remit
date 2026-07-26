'use client';

/* eslint-disable no-restricted-imports -- IDKit initialises a WASM module and
   only runs in the browser, so it cannot be proxied through the adapter the
   way every other sponsor SDK is. The signing key stays on the server; this
   component receives an already-signed request and never sees key material. */
import { CredentialRequest, IDKit } from '@worldcoin/idkit-core';
/* eslint-enable no-restricted-imports */

import QRCode from 'qrcode';
import { useCallback, useState } from 'react';

import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';

/**
 * Approve one exact payment from a phone.
 *
 * The action digest is carried into the proof as the World ID signal, so what
 * gets approved on the phone is this invoice and no other. A proof lifted onto
 * a different payment fails validation rather than quietly counting.
 */

type Phase = 'error' | 'idle' | 'opening' | 'verified' | 'waiting';

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
  const [humanNote, setHumanNote] = useState<string | null>(null);

  const start = useCallback(async () => {
    setPhase('opening');
    setMessage(null);
    setQr(null);

    try {
      const minted = await fetch('/api/approvals/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionDigest, agentAddress }),
      });
      const payload = (await minted.json()) as {
        config?: unknown;
        error?: string;
      };
      if (!minted.ok || payload.config === undefined) {
        setPhase('error');
        setMessage(payload.error ?? 'Could not open an approval.');
        return;
      }

      // IDKit builds the request; the session flow takes constraints rather
      // than a preset.
      const request = await (
        IDKit.createSession(
          payload.config as Parameters<typeof IDKit.createSession>[0],
        ) as unknown as {
          constraints(node: unknown): Promise<{
            connectorURI: string;
            pollUntilCompletion(): Promise<unknown>;
          }>;
        }
      ).constraints(CredentialRequest('proof_of_human'));

      setUri(request.connectorURI);
      setQr(
        await QRCode.toDataURL(request.connectorURI, {
          margin: 1,
          width: 260,
        }),
      );
      setPhase('waiting');

      const result = await request.pollUntilCompletion();
      setPhase('verified');
      setHumanNote(
        typeof result === 'object' && result !== null
          ? JSON.stringify(result).slice(0, 160)
          : String(result),
      );
    } catch (cause) {
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
            Request approval from {approverLabel}
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
              Scan with World App. The session expires in five minutes — an
              approval left open is an approval.
            </p>
            {uri === null ? null : (
              <a className="break-all underline" href={uri}>
                open directly on this device
              </a>
            )}
          </div>
        </div>
      ) : null}

      {phase === 'verified' ? (
        <div className="flex flex-col gap-2">
          <Badge variant="default">Approved and verified</Badge>
          <p className="text-xs text-muted-foreground">
            A proof came back bound to this action digest. It still counts as
            one human: a second approval from the same person is refused as
            ACTION_HUMAN_NOT_DISTINCT.
          </p>
          {humanNote === null ? null : (
            <code className="tabular text-[10px] break-all text-muted-foreground">
              {humanNote}
            </code>
          )}
        </div>
      ) : null}
    </div>
  );
}
