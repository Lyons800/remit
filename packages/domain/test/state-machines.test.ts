import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createMandateReservationLedger,
  invoiceRevisionEvents,
  invoiceRevisionStates,
  isTerminalInvoiceRevisionState,
  isTerminalPaymentActionState,
  isTerminalStandingMandateState,
  paymentActionStates,
  reserveMandateCapacity,
  sourceObservationEvents,
  sourceObservationStates,
  standingMandateStates,
  transitionInvoiceRevision,
  transitionPaymentAction,
  transitionSourceObservation,
  transitionStandingMandate,
  validateMandateContainment,
  type AdapterVerifiedApprovalFact,
  type PaymentActionAggregate,
  type PaymentActionEvent,
} from '../src/index.js';
import {
  ACTION_EXPIRES_AT,
  MANDATE_EXPIRES_AT,
  activeMandateAggregate,
  authorization,
  blockAuthorization,
  humanAuthorization,
  standingMandate,
} from './fixtures/authorization.js';

const NOW = '2026-07-25T10:00:00.000Z';
const LATER = '2026-07-25T11:00:00.000Z';
const BEFORE = '2026-07-25T09:00:00.000Z';

function expectAcceptedState(
  result: ReturnType<typeof transitionPaymentAction>,
  state: string,
  expectedAuthorization = authorization,
): void {
  expect(result).toEqual({
    ok: true,
    value: { authorization: expectedAuthorization, state },
  });
}

function paymentAggregate(
  state: PaymentActionAggregate['state'],
  frozenAuthorization = authorization,
): PaymentActionAggregate {
  return { authorization: frozenAuthorization, state };
}

function createReservedMandateLedger() {
  const containment = validateMandateContainment(
    authorization,
    activeMandateAggregate,
    NOW,
  );
  if (!containment.ok) {
    throw new Error('mandate containment fixture must be valid');
  }
  const ledger = createMandateReservationLedger(containment.value);
  if (!ledger.ok) {
    throw new Error('mandate ledger fixture must be valid');
  }
  const reserved = reserveMandateCapacity(ledger.value, containment.value);
  if (!reserved.ok) {
    throw new Error('mandate reservation fixture must be valid');
  }
  return reserved.value.ledger;
}

function approvalFacts(
  actionDigest: string,
): readonly AdapterVerifiedApprovalFact[] {
  return [
    {
      actionDigest,
      actionHumanPrincipal: 'human-1',
      agentBackingStatus: 'CURRENT',
      agentTenantPrincipal: 'agent-1',
      companyRoleStatus: 'CURRENT',
      decision: 'APPROVE',
      expiresAt: '2026-07-25T10:05:00.000Z',
      humanDecisionStatus: 'VERIFIED',
      role: 'FINANCE_APPROVER',
      subjectId: 'subject-1',
      verifiedAt: NOW,
    },
    {
      actionDigest,
      actionHumanPrincipal: 'human-2',
      agentBackingStatus: 'CURRENT',
      agentTenantPrincipal: 'agent-2',
      companyRoleStatus: 'CURRENT',
      decision: 'APPROVE',
      expiresAt: '2026-07-25T10:05:00.000Z',
      humanDecisionStatus: 'VERIFIED',
      role: 'TREASURY_APPROVER',
      subjectId: 'subject-2',
      verifiedAt: NOW,
    },
  ];
}

const ACTION_DIGEST = authorization.envelope.actionDigest;
const HUMAN_ACTION_DIGEST = humanAuthorization.envelope.actionDigest;
const TRANSACTION_HASH = 'f'.repeat(64);

const paymentEvents = [
  { type: 'CLASSIFY' },
  { type: 'REJECT_POLICY_BLOCK' },
  { type: 'SATISFY_EVIDENCE_NOT_REQUIRED' },
  { type: 'QUOTE_VERIFICATION' },
  {
    servicePayment: { actionDigest: ACTION_DIGEST, status: 'CONSENSUS' },
    type: 'RECORD_VERIFICATION_PAYMENT',
  },
  {
    type: 'ACCEPT_VERIFICATION',
    verification: {
      actionDigest: ACTION_DIGEST,
      expiresAt: ACTION_EXPIRES_AT,
      result: 'MATCH',
      status: 'VERIFIED',
    },
  },
  {
    type: 'REJECT_VERIFICATION',
    verification: {
      actionDigest: ACTION_DIGEST,
      expiresAt: ACTION_EXPIRES_AT,
      result: 'UNKNOWN',
      status: 'VERIFIED',
    },
  },
  {
    mandate: activeMandateAggregate,
    reservationLedger: createReservedMandateLedger(),
    type: 'AUTHORIZE_MANDATE',
  },
  { type: 'AWAIT_APPROVALS' },
  {
    approvals: approvalFacts(HUMAN_ACTION_DIGEST),
    type: 'AUTHORIZE_APPROVALS',
  },
  { type: 'REJECT_APPROVALS' },
  {
    authorizationCommit: {
      actionDigest: ACTION_DIGEST,
      status: 'CONSENSUS',
    },
    type: 'COMMIT_AUDIT',
  },
  { type: 'START_AUTHORIZATION_RECOVERY' },
  {
    authorizationCommit: {
      actionDigest: ACTION_DIGEST,
      status: 'CONSENSUS',
    },
    type: 'RECOVER_AUDIT',
  },
  { type: 'QUEUE_SETTLEMENT' },
  {
    receipt: {
      actionDigest: ACTION_DIGEST,
      status: 'SUCCESS',
      transactionId: '0.0.1000@1753437600.000000001',
    },
    type: 'SETTLE_CONSENSUS',
  },
  { type: 'START_SETTLEMENT_RECOVERY' },
  {
    receipt: {
      actionDigest: ACTION_DIGEST,
      status: 'SUCCESS',
      transactionId: '0.0.1000@1753437600.000000001',
    },
    type: 'RECOVER_SETTLEMENT',
  },
  {
    recovery: {
      actionDigest: ACTION_DIGEST,
      frozenTransactionHash: TRANSACTION_HASH,
      retryTransactionHash: TRANSACTION_HASH,
    },
    type: 'RETRY_SAME_TRANSACTION',
  },
  { type: 'START_RECONCILIATION' },
  { type: 'RECONCILE_SUCCESS' },
  { type: 'RECONCILE_EXCEPTION' },
  { type: 'EXPIRE' },
  { type: 'SUPERSEDE' },
  {
    cancellationCommit: {
      actionDigest: ACTION_DIGEST,
      status: 'CONSENSUS',
    },
    effectStatus: 'NOT_SIGNED',
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
      transitionPaymentAction(
        paymentAggregate('CAPTURED'),
        { type: 'CLASSIFY' },
        { now: NOW },
      ),
      'CLASSIFIED',
    );
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('CLASSIFIED'),
        { type: 'SATISFY_EVIDENCE_NOT_REQUIRED' },
        { now: NOW },
      ),
      'EVIDENCE_SATISFIED',
    );
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('EVIDENCE_SATISFIED'),
        {
          mandate: activeMandateAggregate,
          reservationLedger: createReservedMandateLedger(),
          type: 'AUTHORIZE_MANDATE',
        },
        { now: NOW },
      ),
      'AUTHORIZED',
    );
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('AUTHORIZED'),
        {
          authorizationCommit: {
            actionDigest: ACTION_DIGEST,
            status: 'CONSENSUS',
          },
          type: 'COMMIT_AUDIT',
        },
        { now: NOW },
      ),
      'AUDIT_COMMITTED',
    );
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('AUDIT_COMMITTED'),
        { type: 'QUEUE_SETTLEMENT' },
        { now: NOW },
      ),
      'SETTLEMENT_PENDING',
    );
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('SETTLEMENT_PENDING'),
        {
          receipt: {
            actionDigest: ACTION_DIGEST,
            status: 'SUCCESS',
            transactionId: '0.0.1000@1753437600.000000001',
          },
          type: 'SETTLE_CONSENSUS',
        },
        { now: NOW },
      ),
      'SETTLED',
    );
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('SETTLED'),
        { type: 'START_RECONCILIATION' },
        { now: NOW },
      ),
      'RECONCILING',
    );
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('RECONCILING'),
        { type: 'RECONCILE_SUCCESS' },
        { now: NOW },
      ),
      'RECONCILED',
    );
  });

  it('routes required evidence through paid MATCH and fresh approvals', () => {
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('CLASSIFIED', humanAuthorization),
        { type: 'QUOTE_VERIFICATION' },
        { now: NOW },
      ),
      'VERIFICATION_QUOTED',
      humanAuthorization,
    );
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('VERIFICATION_QUOTED', humanAuthorization),
        {
          servicePayment: {
            actionDigest: HUMAN_ACTION_DIGEST,
            status: 'CONSENSUS',
          },
          type: 'RECORD_VERIFICATION_PAYMENT',
        },
        { now: NOW },
      ),
      'VERIFICATION_PAID',
      humanAuthorization,
    );
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('VERIFICATION_PAID', humanAuthorization),
        {
          type: 'ACCEPT_VERIFICATION',
          verification: {
            actionDigest: HUMAN_ACTION_DIGEST,
            expiresAt: ACTION_EXPIRES_AT,
            result: 'MATCH',
            status: 'VERIFIED',
          },
        },
        { now: NOW },
      ),
      'EVIDENCE_SATISFIED',
      humanAuthorization,
    );
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('EVIDENCE_SATISFIED', humanAuthorization),
        { type: 'AWAIT_APPROVALS' },
        { now: NOW },
      ),
      'AWAITING_APPROVALS',
      humanAuthorization,
    );
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('AWAITING_APPROVALS', humanAuthorization),
        {
          approvals: approvalFacts(HUMAN_ACTION_DIGEST),
          type: 'AUTHORIZE_APPROVALS',
        },
        { now: NOW },
      ),
      'AUTHORIZED',
      humanAuthorization,
    );
  });

  it.each(['MISMATCH', 'UNKNOWN'] as const)(
    'rejects a paid %s result',
    (result) => {
      expectAcceptedState(
        transitionPaymentAction(
          paymentAggregate('VERIFICATION_PAID', humanAuthorization),
          {
            type: 'REJECT_VERIFICATION',
            verification: {
              actionDigest: HUMAN_ACTION_DIGEST,
              expiresAt: ACTION_EXPIRES_AT,
              result,
              status: 'VERIFIED',
            },
          },
          { now: NOW },
        ),
        'REJECTED',
        humanAuthorization,
      );
    },
  );

  it('applies block precedence without an evidence transition', () => {
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('CLASSIFIED', blockAuthorization),
        { type: 'REJECT_POLICY_BLOCK' },
        { now: NOW },
      ),
      'REJECTED',
      blockAuthorization,
    );
  });

  it('checks state reachability before event payload guards', () => {
    expect(
      transitionPaymentAction(
        paymentAggregate('CAPTURED'),
        {
          capReserved: false,
          expiresAt: NOW,
          mandateContained: false,
          now: LATER,
          route: 'HUMAN_APPROVAL',
          type: 'AUTHORIZE_MANDATE',
        },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'INVALID_STATE_TRANSITION' },
      ok: false,
    });
  });

  it('rejects caller booleans as authorization evidence', () => {
    expect(
      transitionPaymentAction(
        paymentAggregate('EVIDENCE_SATISFIED'),
        {
          capReserved: true,
          expiresAt: '2999-01-01T00:00:00.000Z',
          mandateContained: true,
          route: 'STRAIGHT_THROUGH',
          type: 'AUTHORIZE_MANDATE',
        },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_CONTAINMENT_FAILED' },
      ok: false,
    });

    const containment = validateMandateContainment(
      authorization,
      activeMandateAggregate,
      NOW,
    );
    if (!containment.ok) {
      throw new Error('mandate containment fixture must be valid');
    }
    const emptyLedger = createMandateReservationLedger(containment.value);
    if (!emptyLedger.ok) {
      throw new Error('mandate ledger fixture must be valid');
    }
    expect(
      transitionPaymentAction(
        paymentAggregate('EVIDENCE_SATISFIED'),
        {
          mandate: activeMandateAggregate,
          reservationLedger: emptyLedger.value,
          type: 'AUTHORIZE_MANDATE',
        },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_RESERVATION_NOT_FOUND' },
      ok: false,
    });

    expect(
      transitionPaymentAction(
        paymentAggregate('AWAITING_APPROVALS', humanAuthorization),
        {
          quorumSatisfied: true,
          type: 'AUTHORIZE_APPROVALS',
        },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'APPROVAL_FACT_INVALID' },
      ok: false,
    });

    expect(
      transitionPaymentAction(
        paymentAggregate('AWAITING_APPROVALS', humanAuthorization),
        {
          approvals: approvalFacts(ACTION_DIGEST),
          type: 'AUTHORIZE_APPROVALS',
        },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'ACTION_DIGEST_MISMATCH' },
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
        transitionPaymentAction(
          paymentAggregate(state),
          { type: 'EXPIRE' },
          { now: ACTION_EXPIRES_AT },
        ),
        'EXPIRED',
      );
    }
  });

  it('refuses early expiry, stale authorization, and malformed time', () => {
    expect(
      transitionPaymentAction(
        paymentAggregate('CAPTURED'),
        { type: 'EXPIRE' },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'ACTION_NOT_EXPIRED' },
      ok: false,
    });
    expect(
      transitionPaymentAction(
        paymentAggregate('AWAITING_APPROVALS', humanAuthorization),
        {
          approvals: approvalFacts(HUMAN_ACTION_DIGEST),
          expiresAt: '2999-01-01T00:00:00.000Z',
          type: 'AUTHORIZE_APPROVALS',
        },
        { now: ACTION_EXPIRES_AT },
      ),
    ).toMatchObject({
      error: { code: 'ACTION_EXPIRED' },
      ok: false,
    });
    expect(
      transitionPaymentAction(
        paymentAggregate('CAPTURED'),
        { type: 'EXPIRE' },
        { now: 'invalid' },
      ),
    ).toMatchObject({
      error: { code: 'ACTION_TIME_INVALID' },
      ok: false,
    });
  });

  it('supersedes before HCS and cancels after HCS only before signing', () => {
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('AUTHORIZED'),
        { type: 'SUPERSEDE' },
        { now: NOW },
      ),
      'SUPERSEDED',
    );
    expect(
      transitionPaymentAction(
        paymentAggregate('AUTHORIZED'),
        {
          hcsAuthorizationCommitted: false,
          transactionSignedOrSubmitted: false,
          type: 'SUPERSEDE',
        },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'INVALID_STATE_TRANSITION' },
      ok: false,
    });
    expectAcceptedState(
      transitionPaymentAction(
        paymentAggregate('AUDIT_COMMITTED'),
        {
          cancellationCommit: {
            actionDigest: ACTION_DIGEST,
            status: 'CONSENSUS',
          },
          effectStatus: 'NOT_SIGNED',
          type: 'CANCEL',
        },
        { now: NOW },
      ),
      'CANCELLED',
    );
    expect(
      transitionPaymentAction(
        paymentAggregate('AUDIT_COMMITTED'),
        {
          cancellationCommit: {
            actionDigest: ACTION_DIGEST,
            status: 'CONSENSUS',
          },
          effectStatus: 'SIGNED',
          type: 'CANCEL',
        },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'ACTION_CANCEL_TOO_LATE' },
      ok: false,
    });
  });

  it('re-verifies the aggregate and exact retry transaction', () => {
    expect(
      transitionPaymentAction(
        {
          authorization: {
            ...authorization,
            actionCore: {
              ...authorization.actionCore,
              supplierSnapshotDigest: '0'.repeat(64),
            },
          },
          state: 'CAPTURED',
        },
        { type: 'CLASSIFY' },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'POLICY_CORE_BINDING_MISMATCH' },
      ok: false,
    });

    expect(
      transitionPaymentAction(
        paymentAggregate('SETTLEMENT_RECOVERY'),
        {
          recovery: {
            actionDigest: ACTION_DIGEST,
            frozenTransactionHash: TRANSACTION_HASH,
            retryTransactionHash: 'e'.repeat(64),
          },
          type: 'RETRY_SAME_TRANSACTION',
        },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'SETTLEMENT_TRANSACTION_MISMATCH' },
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
          expect(
            transitionPaymentAction(paymentAggregate(state), event, {
              now: NOW,
            }),
          ).toMatchObject({
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
