'use client';

import { useReducer } from 'react';

import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import {
  approvers,
  createInitialTheatre,
  theatreReducer,
} from '../../../../lib/demo';

import type { ApprovalScenario } from './approval-scenarios';

const phaseLabel = {
  QUORUM_PENDING: ['Simulation · review pending', 'destructive'],
  QUORUM_REACHED: ['Simulation · quorum reached', 'default'],
  VOIDED: ['Simulation · digest changed', 'destructive'],
} as const;

export function ApprovalSimulation({
  scenario,
}: Readonly<{ scenario: ApprovalScenario }>) {
  const [state, dispatch] = useReducer(
    theatreReducer,
    createInitialTheatre(scenario.actionDigest),
  );

  const [statusText, statusVariant] = phaseLabel[state.phase];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-xs text-muted-foreground">
          Synthetic approval simulation / {scenario.invoiceId}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {scenario.supplier} — {scenario.amount}
          </h1>
          <Badge variant={statusVariant}>{statusText}</Badge>
        </div>
      </div>

      <div className="border border-border bg-muted/30 px-4 py-3 text-sm">
        <b>Synthetic payment; live World proof.</b>{' '}
        <span className="text-muted-foreground">
          The simulation controls run a local reducer. The Connect World App
          section opens and verifies a real World proof, but does not purchase
          verification, submit to Hedera, or move value.
        </span>
      </div>

      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <b>Why this scenario was held:</b> {scenario.reason}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exact request</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {scenario.facts.map(([key, value, delta]) => (
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
            Simulated approvals — {state.counted.length}/2 backing classes
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
                Simulate {approver.label} ({approver.id})
              </Button>
            ))}
          </div>
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            {approvers.map((approver) => (
              <p className="border border-border p-2" key={approver.id}>
                <b className="text-foreground">{approver.id}</b> ·{' '}
                {approver.detail}
              </p>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A1 and A2 deliberately share one synthetic backing class. This
            demonstrates the intended refusal rule. The phone flow separately
            proves the action-bound World approval for A1.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Control simulation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            disabled={state.phase === 'VOIDED'}
            onClick={() =>
              dispatch({
                digest: scenario.changedActionDigest,
                type: 'tamper',
              })
            }
            variant="destructive"
          >
            Change one IBAN character
          </Button>
          <Button
            onClick={() =>
              dispatch({ digest: scenario.actionDigest, type: 'reset' })
            }
            variant="outline"
          >
            Reset scenario
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
