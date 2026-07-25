'use client';

import { useEffect, useReducer } from 'react';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import {
  approvers,
  initialTheatre,
  theatreReducer,
} from '../../../lib/demo';

const facts: readonly (readonly [string, string, boolean?])[] = [
  ['Supplier', 'Padel Surfaces Lda (SUP-4471)'],
  ['Amount', '€25,000.00'],
  ['Account on file', 'PT50 0002 0123 …9015 4'],
  ['Account on invoice', 'LT12 1000 1111 …1000', true],
  ['Reference', 'Court resurfacing — final'],
  ['Expires', '24 Aug 2026'],
];

const phaseLabel = {
  CONSUMED: ['Settled & consumed', 'default'],
  QUORUM_PENDING: ['Held for approval', 'destructive'],
  SETTLING: ['Settling on Hedera', 'warning'],
  VERIFYING: ['Paying verification', 'warning'],
  VOIDED: ['Approvals void', 'destructive'],
} as const;

export default function ApprovalPage() {
  const [state, dispatch] = useReducer(theatreReducer, initialTheatre);

  // Auto-advance the pipeline beats so the demo narrates itself.
  useEffect(() => {
    if (state.phase !== 'VERIFYING' && state.phase !== 'SETTLING') return;
    const timer = setTimeout(() => dispatch({ type: 'advance' }), 1600);
    return () => clearTimeout(timer);
  }, [state.phase]);

  const [statusText, statusVariant] = phaseLabel[state.phase];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-xs text-muted-foreground">
          Approvals / INV-2026-0912
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Padel Surfaces Lda — €25,000.00
          </h1>
          <Badge variant={statusVariant}>{statusText}</Badge>
        </div>
      </div>

      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <b>Why this was held:</b> the bank account on this invoice differs from
        the account this supplier has been paid to 14 times before.
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exact request</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {facts.map(([key, value, delta]) => (
            <div
              className="flex justify-between gap-4 border-b border-border py-2 text-sm"
              key={key}
            >
              <span className="text-muted-foreground">{key}</span>
              <span
                className={
                  delta ? 'font-medium text-destructive' : 'font-medium'
                }
              >
                {value}
              </span>
            </div>
          ))}
          <div className="flex flex-col gap-1 py-2 sm:col-span-2">
            <span className="text-sm text-muted-foreground">
              Action digest — approvals bind to this, not to “the invoice”
            </span>
            <code
              className={`tabular text-xs break-all ${state.tampered ? 'text-destructive' : 'text-primary'}`}
            >
              {state.digest}
            </code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Approvals — {state.counted.length}/2 distinct humans
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {approvers.map((approver) => (
              <Button
                disabled={state.phase !== 'QUORUM_PENDING'}
                key={approver.id}
                onClick={() =>
                  dispatch({ approver: approver.id, type: 'approve' })
                }
                variant={approver.id === 'A2' ? 'outline' : 'secondary'}
              >
                Approve as {approver.label} ({approver.id})
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A1 and A2 are two different agents backed by the same person. B1 is
            backed by a genuinely different person — verified through World,
            not by counting logins.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attacks — try to break it</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => dispatch({ type: 'tamper' })} variant="destructive">
            Tamper with the IBAN
          </Button>
          <Button
            disabled={state.phase !== 'CONSUMED'}
            onClick={() => dispatch({ type: 'replay' })}
            variant="destructive"
          >
            Replay the settlement
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event log</CardTitle>
        </CardHeader>
        <CardContent>
          {state.log.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No decisions yet. Approve as Ana, then try her second agent.
            </p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {state.log.map((entry, index) => (
                <li
                  className={`border-l-2 pl-3 ${
                    entry.includes('declined') ||
                    entry.includes('void') ||
                    entry.includes('refused')
                      ? 'border-destructive text-destructive'
                      : 'border-primary'
                  }`}
                  key={index}
                >
                  {entry}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
