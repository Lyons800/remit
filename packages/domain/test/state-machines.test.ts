import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  invoiceRevisionEvents,
  invoiceRevisionStates,
  isTerminalInvoiceRevisionState,
  isTerminalPaymentActionState,
  isTerminalStandingMandateState,
  paymentActionStates,
  sourceObservationEvents,
  sourceObservationStates,
  standingMandateStates,
  transitionInvoiceRevision,
  transitionPaymentAction,
  transitionSourceObservation,
  transitionStandingMandate,
  type PaymentActionEvent,
} from '../src/index.js';
import {
  MANDATE_EXPIRES_AT,
  activeMandateAggregate,
  standingMandate,
} from './fixtures/authorization.js';

const NOW = '2026-07-25T10:00:00.000Z';
const LATER = '2026-07-25T11:00:00.000Z';
const BEFORE = '2026-07-25T09:00:00.000Z';

function expectAcceptedState(
  result: ReturnType<typeof transitionPaymentAction>,
  state: string,
): void {
  expect(result).toEqual({ ok: true, value: state });
}

const paymentEvents = [
  { type: 'CLASSIFY' },
  { route: 'BLOCK', type: 'REJECT_POLICY_BLOCK' },
  {
    type: 'SATISFY_EVIDENCE_NOT_REQUIRED',
    verificationMode: 'NOT_REQUIRED',
  },
  { type: 'QUOTE_VERIFICATION', verificationMode: 'REQUIRED' },
  { type: 'RECORD_VERIFICATION_PAYMENT' },
  { result: 'MATCH', type: 'ACCEPT_VERIFICATION' },
  { result: 'UNKNOWN', type: 'REJECT_VERIFICATION' },
  {
    capReserved: true,
    expiresAt: LATER,
    mandateContained: true,
    now: NOW,
    route: 'STRAIGHT_THROUGH',
    type: 'AUTHORIZE_MANDATE',
  },
  { route: 'HUMAN_APPROVAL', type: 'AWAIT_APPROVALS' },
  {
    expiresAt: LATER,
    now: NOW,
    quorumSatisfied: true,
    type: 'AUTHORIZE_APPROVALS',
  },
  { type: 'REJECT_APPROVALS' },
  {
    expiresAt: LATER,
    hcsAuthorizationCommitted: true,
    now: NOW,
    type: 'COMMIT_AUDIT',
  },
  { type: 'START_AUTHORIZATION_RECOVERY' },
  {
    expiresAt: LATER,
    hcsAuthorizationCommitted: true,
    now: NOW,
    type: 'RECOVER_AUDIT',
  },
  { expiresAt: LATER, now: NOW, type: 'QUEUE_SETTLEMENT' },
  { consensusReceiptValid: true, type: 'SETTLE_CONSENSUS' },
  { type: 'START_SETTLEMENT_RECOVERY' },
  { consensusReceiptValid: true, type: 'RECOVER_SETTLEMENT' },
  { sameTransaction: true, type: 'RETRY_SAME_TRANSACTION' },
  { type: 'START_RECONCILIATION' },
  { type: 'RECONCILE_SUCCESS' },
  { type: 'RECONCILE_EXCEPTION' },
  { expiresAt: NOW, now: NOW, type: 'EXPIRE' },
  {
    hcsAuthorizationCommitted: false,
    transactionSignedOrSubmitted: false,
    type: 'SUPERSEDE',
  },
  {
    hcsCancellationCommitted: true,
    transactionSignedOrSubmitted: false,
    type: 'CANCEL',
  },
] as const satisfies readonly PaymentActionEvent[];

describe('source-observation lifecycle', () => {
  it('advances one immutable observation through extraction and attachment', () => {
    expect(transitionSourceObservation('RECEIVED', 'STORE')).toEqual({
      ok: true,
      value: 'STORED',
    });
    expect(transitionSourceObservation('STORED', 'START_EXTRACTION')).toEqual({
      ok: true,
      value: 'EXTRACTING',
    });
    expect(
      transitionSourceObservation('EXTRACTING', 'ACCEPT_EXTRACTION'),
    ).toEqual({ ok: true, value: 'EXTRACTED' });
    expect(transitionSourceObservation('EXTRACTED', 'ATTACH')).toEqual({
      ok: true,
      value: 'ATTACHED',
    });
  });

  it('releases a quarantined observation back to the same stored record', () => {
    expect(transitionSourceObservation('EXTRACTING', 'QUARANTINE')).toEqual({
      ok: true,
      value: 'QUARANTINED',
    });
    expect(transitionSourceObservation('QUARANTINED', 'RELEASE')).toEqual({
      ok: true,
      value: 'STORED',
    });
  });

  it('rejects every event after attachment', () => {
    for (const event of sourceObservationEvents) {
      expect(transitionSourceObservation('ATTACHED', event)).toMatchObject({
        error: { code: 'TERMINAL_STATE' },
        ok: false,
      });
    }
  });
});

describe('invoice-revision lifecycle', () => {
  it('freezes only a ready revision', () => {
    expect(transitionInvoiceRevision('DRAFT', 'MARK_READY')).toEqual({
      ok: true,
      value: 'READY',
    });
    expect(transitionInvoiceRevision('READY', 'FREEZE_ACTION')).toEqual({
      ok: true,
      value: 'ACTION_FROZEN',
    });
    expect(transitionInvoiceRevision('DRAFT', 'FREEZE_ACTION')).toMatchObject({
      error: { code: 'INVALID_STATE_TRANSITION' },
      ok: false,
    });
  });

  it('never reopens terminal invoice revisions', () => {
    const terminalStates = invoiceRevisionStates.filter(
      isTerminalInvoiceRevisionState,
    );
    for (const state of terminalStates) {
      for (const event of invoiceRevisionEvents) {
        expect(transitionInvoiceRevision(state, event)).toMatchObject({
          error: { code: 'TERMINAL_STATE' },
          ok: false,
        });
      }
    }
  });
});

describe('standing-mandate lifecycle', () => {
  const issuedMandate = {
    record: standingMandate,
    state: 'ISSUED',
  } as const;

  it('activates, pauses, resumes, and expires only inside its time window', () => {
    expect(
      transitionStandingMandate(
        issuedMandate,
        { type: 'ACTIVATE' },
        { now: NOW },
      ),
    ).toEqual({
      ok: true,
      value: { record: standingMandate, state: 'ACTIVE' },
    });
    expect(
      transitionStandingMandate(
        activeMandateAggregate,
        { type: 'PAUSE' },
        { now: NOW },
      ),
    ).toEqual({
      ok: true,
      value: { record: standingMandate, state: 'PAUSED' },
    });
    expect(
      transitionStandingMandate(
        { record: standingMandate, state: 'PAUSED' },
        { type: 'RESUME' },
        { now: NOW },
      ),
    ).toEqual({
      ok: true,
      value: { record: standingMandate, state: 'ACTIVE' },
    });
    expect(
      transitionStandingMandate(
        activeMandateAggregate,
        { type: 'EXPIRE' },
        { now: MANDATE_EXPIRES_AT },
      ),
    ).toEqual({
      ok: true,
      value: { record: standingMandate, state: 'EXPIRED' },
    });
  });

  it('derives all time bounds from the verified mandate record', () => {
    expect(
      transitionStandingMandate(
        activeMandateAggregate,
        { type: 'EXPIRE' },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_NOT_EXPIRED' },
      ok: false,
    });
    expect(
      transitionStandingMandate(
        issuedMandate,
        { type: 'ACTIVATE' },
        { now: MANDATE_EXPIRES_AT },
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_NOT_ACTIVE' },
      ok: false,
    });
    expect(
      transitionStandingMandate(
        issuedMandate,
        { type: 'ACTIVATE' },
        { now: 'not-an-instant' },
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_TIME_INVALID' },
      ok: false,
    });
    expect(
      transitionStandingMandate(
        issuedMandate,
        {
          expiresAt: '2999-01-01T00:00:00.000Z',
          notBefore: BEFORE,
          now: NOW,
          type: 'ACTIVATE',
        },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_TIME_INVALID' },
      ok: false,
    });
  });

  it('re-verifies the mandate envelope and never reopens terminal states', () => {
    expect(
      transitionStandingMandate(
        {
          ...issuedMandate,
          record: { ...standingMandate, expiresAt: '2999-01-01T00:00:00.000Z' },
        },
        { type: 'ACTIVATE' },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_RECORD_INVALID' },
      ok: false,
    });

    for (const state of standingMandateStates.filter(
      isTerminalStandingMandateState,
    )) {
      expect(
        transitionStandingMandate(
          { record: standingMandate, state },
          { type: 'REVOKE' },
          { now: NOW },
        ),
      ).toMatchObject({
        error: { code: 'TERMINAL_STATE' },
        ok: false,
      });
    }
  });
});

describe('payment-action lifecycle', () => {
  it('completes the mandate-authorized path without a per-invoice approval', () => {
    expectAcceptedState(
      transitionPaymentAction('CAPTURED', { type: 'CLASSIFY' }),
      'CLASSIFIED',
    );
    expectAcceptedState(
      transitionPaymentAction('CLASSIFIED', {
        type: 'SATISFY_EVIDENCE_NOT_REQUIRED',
        verificationMode: 'NOT_REQUIRED',
      }),
      'EVIDENCE_SATISFIED',
    );
    expectAcceptedState(
      transitionPaymentAction('EVIDENCE_SATISFIED', {
        capReserved: true,
        expiresAt: LATER,
        mandateContained: true,
        now: NOW,
        route: 'STRAIGHT_THROUGH',
        type: 'AUTHORIZE_MANDATE',
      }),
      'AUTHORIZED',
    );
    expectAcceptedState(
      transitionPaymentAction('AUTHORIZED', {
        expiresAt: LATER,
        hcsAuthorizationCommitted: true,
        now: NOW,
        type: 'COMMIT_AUDIT',
      }),
      'AUDIT_COMMITTED',
    );
    expectAcceptedState(
      transitionPaymentAction('AUDIT_COMMITTED', {
        expiresAt: LATER,
        now: NOW,
        type: 'QUEUE_SETTLEMENT',
      }),
      'SETTLEMENT_PENDING',
    );
    expectAcceptedState(
      transitionPaymentAction('SETTLEMENT_PENDING', {
        consensusReceiptValid: true,
        type: 'SETTLE_CONSENSUS',
      }),
      'SETTLED',
    );
    expectAcceptedState(
      transitionPaymentAction('SETTLED', {
        type: 'START_RECONCILIATION',
      }),
      'RECONCILING',
    );
    expectAcceptedState(
      transitionPaymentAction('RECONCILING', {
        type: 'RECONCILE_SUCCESS',
      }),
      'RECONCILED',
    );
  });

  it('routes required evidence through paid MATCH and fresh approvals', () => {
    expectAcceptedState(
      transitionPaymentAction('CLASSIFIED', {
        type: 'QUOTE_VERIFICATION',
        verificationMode: 'REQUIRED',
      }),
      'VERIFICATION_QUOTED',
    );
    expectAcceptedState(
      transitionPaymentAction('VERIFICATION_QUOTED', {
        type: 'RECORD_VERIFICATION_PAYMENT',
      }),
      'VERIFICATION_PAID',
    );
    expectAcceptedState(
      transitionPaymentAction('VERIFICATION_PAID', {
        result: 'MATCH',
        type: 'ACCEPT_VERIFICATION',
      }),
      'EVIDENCE_SATISFIED',
    );
    expectAcceptedState(
      transitionPaymentAction('EVIDENCE_SATISFIED', {
        route: 'HUMAN_APPROVAL',
        type: 'AWAIT_APPROVALS',
      }),
      'AWAITING_APPROVALS',
    );
    expectAcceptedState(
      transitionPaymentAction('AWAITING_APPROVALS', {
        expiresAt: LATER,
        now: NOW,
        quorumSatisfied: true,
        type: 'AUTHORIZE_APPROVALS',
      }),
      'AUTHORIZED',
    );
  });

  it.each(['MISMATCH', 'UNKNOWN'] as const)(
    'rejects a paid %s result',
    (result) => {
      expectAcceptedState(
        transitionPaymentAction('VERIFICATION_PAID', {
          result,
          type: 'REJECT_VERIFICATION',
        }),
        'REJECTED',
      );
    },
  );

  it('applies block precedence without an evidence transition', () => {
    expectAcceptedState(
      transitionPaymentAction('CLASSIFIED', {
        route: 'BLOCK',
        type: 'REJECT_POLICY_BLOCK',
      }),
      'REJECTED',
    );
  });

  it('checks state reachability before event payload guards', () => {
    expect(
      transitionPaymentAction('CAPTURED', {
        capReserved: false,
        expiresAt: NOW,
        mandateContained: false,
        now: LATER,
        route: 'HUMAN_APPROVAL',
        type: 'AUTHORIZE_MANDATE',
      }),
    ).toMatchObject({
      error: { code: 'INVALID_STATE_TRANSITION' },
      ok: false,
    });
  });

  it('expires verification and precommit recovery states deterministically', () => {
    for (const state of [
      'VERIFICATION_QUOTED',
      'VERIFICATION_PAID',
      'AUTHORIZATION_RECOVERY',
    ] as const) {
      expectAcceptedState(
        transitionPaymentAction(state, {
          expiresAt: NOW,
          now: NOW,
          type: 'EXPIRE',
        }),
        'EXPIRED',
      );
    }
  });

  it('refuses early expiry, stale authorization, and malformed time', () => {
    expect(
      transitionPaymentAction('CAPTURED', {
        expiresAt: LATER,
        now: NOW,
        type: 'EXPIRE',
      }),
    ).toMatchObject({
      error: { code: 'ACTION_NOT_EXPIRED' },
      ok: false,
    });
    expect(
      transitionPaymentAction('AWAITING_APPROVALS', {
        expiresAt: NOW,
        now: NOW,
        quorumSatisfied: true,
        type: 'AUTHORIZE_APPROVALS',
      }),
    ).toMatchObject({
      error: { code: 'ACTION_EXPIRED' },
      ok: false,
    });
    expect(
      transitionPaymentAction('CAPTURED', {
        expiresAt: LATER,
        now: 'invalid',
        type: 'EXPIRE',
      }),
    ).toMatchObject({
      error: { code: 'ACTION_TIME_INVALID' },
      ok: false,
    });
  });

  it('supersedes before HCS and cancels after HCS only before signing', () => {
    expectAcceptedState(
      transitionPaymentAction('AUTHORIZED', {
        hcsAuthorizationCommitted: false,
        transactionSignedOrSubmitted: false,
        type: 'SUPERSEDE',
      }),
      'SUPERSEDED',
    );
    expect(
      transitionPaymentAction('AUTHORIZED', {
        hcsAuthorizationCommitted: true,
        transactionSignedOrSubmitted: false,
        type: 'SUPERSEDE',
      }),
    ).toMatchObject({
      error: { code: 'ACTION_SUPERSEDE_TOO_LATE' },
      ok: false,
    });
    expectAcceptedState(
      transitionPaymentAction('AUDIT_COMMITTED', {
        hcsCancellationCommitted: true,
        transactionSignedOrSubmitted: false,
        type: 'CANCEL',
      }),
      'CANCELLED',
    );
    expect(
      transitionPaymentAction('AUDIT_COMMITTED', {
        hcsCancellationCommitted: true,
        transactionSignedOrSubmitted: true,
        type: 'CANCEL',
      }),
    ).toMatchObject({
      error: { code: 'ACTION_CANCEL_TOO_LATE' },
      ok: false,
    });
  });

  it('never re-enters an executable state after a terminal outcome', () => {
    const terminalStates = paymentActionStates.filter(
      isTerminalPaymentActionState,
    );

    fc.assert(
      fc.property(
        fc.constantFrom(...terminalStates),
        fc.constantFrom(...paymentEvents),
        (state, event) => {
          expect(transitionPaymentAction(state, event)).toMatchObject({
            error: { code: 'TERMINAL_STATE' },
            ok: false,
          });
        },
      ),
    );
  });

  it('exposes complete state vocabularies without duplicate entries', () => {
    expect(new Set(paymentActionStates).size).toBe(paymentActionStates.length);
    expect(new Set(sourceObservationStates).size).toBe(
      sourceObservationStates.length,
    );
  });
});
