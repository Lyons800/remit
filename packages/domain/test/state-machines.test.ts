import { describe, expect, it } from 'vitest';

import {
  actionFactBinding,
  createAdapterVerifiedApprovalFact,
  createAdapterVerifiedAuthorizationAudit,
  createAdapterVerifiedCancellationAudit,
  createAdapterVerifiedEvidenceResult,
  createAdapterVerifiedSettlementReceipt,
  createAdapterVerifiedSettlementUncertainty,
  createAdapterVerifiedVerificationPayment,
  createAtomicSettlementConsumptionClaim,
  createFrozenSettlementAttempt,
  createMandateReservationLedger,
  createPaymentActionAggregate,
  createRequestingAgentExecutionFact,
  invoiceRevisionEvents,
  invoiceRevisionStates,
  isTerminalInvoiceRevisionState,
  isTerminalPaymentActionState,
  isTerminalStandingMandateState,
  paymentActionEventTypes,
  paymentActionStates,
  sourceObservationEvents,
  sourceObservationStates,
  standingMandateStates,
  transitionInvoiceRevision,
  transitionPaymentAction,
  transitionSourceObservation,
  transitionStandingMandate,
  validateMandateContainment,
  type AdapterVerifiedApprovalFact,
  type AdapterVerifiedApprovalFactCore,
  type FrozenSettlementAttempt,
  type MandateReservationLedger,
  type PaymentActionAggregate,
  type PaymentActionEvent,
  type PaymentActionTransition,
  type RequestingAgentExecutionFactCore,
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
const T1 = '2026-07-25T10:00:01.000Z';
const T2 = '2026-07-25T10:00:02.000Z';
const T3 = '2026-07-25T10:00:03.000Z';
const T4 = '2026-07-25T10:00:04.000Z';
const T5 = '2026-07-25T10:00:05.000Z';
const T6 = '2026-07-25T10:00:06.000Z';
const T7 = '2026-07-25T10:00:07.000Z';
const T8 = '2026-07-25T10:00:08.000Z';
const BEFORE = '2026-07-25T09:00:00.000Z';
const FACT_EXPIRES_AT = '2026-07-25T10:59:00.000Z';
const EVIDENCE_EXPIRES_AT = '2026-07-25T10:50:00.000Z';

function initialAggregate(
  frozenAuthorization = authorization,
): PaymentActionAggregate {
  const aggregate = createPaymentActionAggregate(frozenAuthorization);
  if (!aggregate.ok) {
    throw new Error('authorization fixture must create an aggregate');
  }
  return aggregate.value;
}

function applyEvent(
  aggregate: PaymentActionAggregate,
  event: PaymentActionEvent,
  now: string,
): PaymentActionTransition {
  const result = transitionPaymentAction(aggregate, event, { now });
  if (!result.ok) {
    throw new Error(`fixture transition failed: ${result.error.code}`);
  }
  return result.value;
}

function requestingAgent(
  frozenAuthorization: typeof authorization,
  verifiedAt: string,
  overrides: Partial<RequestingAgentExecutionFactCore> = {},
) {
  return createRequestingAgentExecutionFact(frozenAuthorization, {
    actionHumanPrincipal: 'requesting-human-1',
    adapterId: 'world-agentbook-adapter',
    agentBackingRecordId: 'agent-backing-record-1',
    agentBookStatus: 'CURRENT',
    agentId: 'payment-agent-1',
    agentTenantPrincipal: 'agent-tenant-1',
    companyRoleStatus: 'CURRENT',
    expiresAt: FACT_EXPIRES_AT,
    factId: `requesting-agent:${verifiedAt}`,
    role: 'PAYMENT_EXECUTOR',
    roleCredentialId: 'role-credential-payment-executor-1',
    verifiedAt,
    ...overrides,
  });
}

function approvalFacts(
  frozenAuthorization: typeof humanAuthorization,
  verifiedAt: string,
  overrides: Partial<AdapterVerifiedApprovalFactCore> = {},
): readonly AdapterVerifiedApprovalFact[] {
  const binding = actionFactBinding(frozenAuthorization);
  return [
    createAdapterVerifiedApprovalFact({
      ...binding,
      actionHumanPrincipal: 'human-1',
      adapterId: 'world-approval-adapter',
      agentBackingRecordId: 'agent-backing-approval-1',
      agentBackingStatus: 'CURRENT',
      agentTenantPrincipal: 'approval-agent-1',
      approvalId: 'approval-1',
      companyRoleStatus: 'CURRENT',
      consumptionClaimId: 'approval-consumption-1',
      decision: 'APPROVE',
      decisionId: 'decision-1',
      expiresAt: FACT_EXPIRES_AT,
      humanDecisionStatus: 'VERIFIED',
      kind: 'APPROVAL_FACT',
      role: 'FINANCE_APPROVER',
      roleCredentialId: 'role-credential-finance-1',
      subjectId: 'subject-1',
      verifiedAt,
      ...overrides,
    }),
    createAdapterVerifiedApprovalFact({
      ...binding,
      actionHumanPrincipal: 'human-2',
      adapterId: 'world-approval-adapter',
      agentBackingRecordId: 'agent-backing-approval-2',
      agentBackingStatus: 'CURRENT',
      agentTenantPrincipal: 'approval-agent-2',
      approvalId: 'approval-2',
      companyRoleStatus: 'CURRENT',
      consumptionClaimId: 'approval-consumption-2',
      decision: 'APPROVE',
      decisionId: 'decision-2',
      expiresAt: FACT_EXPIRES_AT,
      humanDecisionStatus: 'VERIFIED',
      kind: 'APPROVAL_FACT',
      role: 'TREASURY_APPROVER',
      roleCredentialId: 'role-credential-treasury-2',
      subjectId: 'subject-2',
      verifiedAt,
      ...overrides,
    }),
  ];
}

function verificationPayment(verifiedAt = T3) {
  return createAdapterVerifiedVerificationPayment(humanAuthorization, {
    adapterId: 'hedera-x402-adapter',
    networkId: 'hedera:296',
    paidAt: verifiedAt,
    servicePaymentId: 'verification-payment-1',
    serviceRequestDigest: '7'.repeat(64),
    transactionId: '0.0.1000@1753437603.000000001',
  });
}

function evidenceResult(
  payment = verificationPayment(),
  result: 'MATCH' | 'MISMATCH' | 'UNKNOWN' = 'MATCH',
  verifiedAt = T4,
) {
  return createAdapterVerifiedEvidenceResult(humanAuthorization, payment, {
    adapterId: 'verification-service-adapter',
    evidenceResultId: `evidence-result-${result.toLowerCase()}`,
    evidenceRoot: humanAuthorization.actionCore.evidenceRoot,
    expiresAt: EVIDENCE_EXPIRES_AT,
    result,
    verifiedAt,
  });
}

function frozenAttempt(
  frozenAuthorization: typeof authorization,
  createdAt: string,
  overrides: Partial<{
    adapterId: string;
    attemptId: string;
    signedBytesHash: string;
    transactionId: string;
  }> = {},
): FrozenSettlementAttempt {
  return createFrozenSettlementAttempt(frozenAuthorization, {
    adapterId: 'hedera-settlement-adapter',
    attemptId: 'settlement-attempt-1',
    createdAt,
    expiresAt: ACTION_EXPIRES_AT,
    signedBytesHash: 'f'.repeat(64),
    transactionId: 'hedera-frozen-transaction-1',
    ...overrides,
  });
}

function settlementReceipt(
  frozenAuthorization: typeof authorization,
  attempt: FrozenSettlementAttempt,
  settledAt: string,
) {
  return createAdapterVerifiedSettlementReceipt(frozenAuthorization, attempt, {
    adapterId: 'hedera-settlement-adapter',
    receiptId: `settlement-receipt:${attempt.attemptId}`,
    settledAt,
  });
}

function consumptionClaim(
  frozenAuthorization: typeof authorization,
  attempt: FrozenSettlementAttempt,
  receipt: ReturnType<typeof settlementReceipt>,
  consumedAt: string,
) {
  return createAtomicSettlementConsumptionClaim(
    frozenAuthorization,
    attempt,
    receipt,
    {
      adapterId: 'postgres-atomic-payment-writer',
      claimId: `settlement-consumption:${attempt.attemptId}`,
      consumedAt,
    },
  );
}

function emptyMandateLedger(now = T3): MandateReservationLedger {
  const containment = validateMandateContainment(
    authorization,
    activeMandateAggregate,
    now,
  );
  if (!containment.ok) {
    throw new Error('mandate containment fixture must be valid');
  }
  const ledger = createMandateReservationLedger(containment.value);
  if (!ledger.ok) {
    throw new Error('mandate ledger fixture must be valid');
  }
  return ledger.value;
}

function mandateThroughEvidence(): PaymentActionAggregate {
  const classified = applyEvent(
    initialAggregate(),
    { type: 'CLASSIFY' },
    T1,
  ).aggregate;
  return applyEvent(classified, { type: 'SATISFY_EVIDENCE_NOT_REQUIRED' }, T2)
    .aggregate;
}

function authorizedMandate() {
  return applyEvent(
    mandateThroughEvidence(),
    {
      mandate: activeMandateAggregate,
      requestingAgent: requestingAgent(authorization, T3),
      reservationLedger: emptyMandateLedger(),
      type: 'AUTHORIZE_MANDATE',
    },
    T3,
  );
}

function auditedMandate() {
  const authorized = authorizedMandate();
  const basis = authorized.aggregate.authorizationBasis;
  if (basis === null) {
    throw new Error('authorization basis must exist');
  }
  const authorizationAudit = createAdapterVerifiedAuthorizationAudit(
    authorization,
    basis.basisDigest,
    {
      adapterId: 'hedera-consensus-adapter',
      auditId: 'authorization-audit-1',
      committedAt: T4,
      topicId: '0.0.9000',
      transactionId: '0.0.1000@1753437604.000000001',
    },
  );
  return applyEvent(
    authorized.aggregate,
    { authorizationAudit, type: 'COMMIT_AUDIT' },
    T4,
  );
}

function queuedMandate() {
  const audited = auditedMandate();
  const basis = audited.aggregate.authorizationBasis;
  if (basis === null || basis.kind !== 'MANDATE') {
    throw new Error('mandate basis must exist');
  }
  const attempt = frozenAttempt(authorization, T5);
  return applyEvent(
    audited.aggregate,
    {
      approvals: null,
      attempt,
      mandate: activeMandateAggregate,
      requestingAgent: requestingAgent(authorization, T5),
      reservationLedger: basis.reservedLedger,
      type: 'QUEUE_SETTLEMENT',
    },
    T5,
  );
}

function humanThroughEvidence() {
  let aggregate = initialAggregate(humanAuthorization);
  aggregate = applyEvent(aggregate, { type: 'CLASSIFY' }, T1).aggregate;
  aggregate = applyEvent(
    aggregate,
    { type: 'QUOTE_VERIFICATION' },
    T2,
  ).aggregate;
  const payment = verificationPayment();
  aggregate = applyEvent(
    aggregate,
    { payment, type: 'RECORD_VERIFICATION_PAYMENT' },
    T3,
  ).aggregate;
  aggregate = applyEvent(
    aggregate,
    {
      type: 'ACCEPT_VERIFICATION',
      verification: evidenceResult(payment),
    },
    T4,
  ).aggregate;
  return aggregate;
}

function authorizedHuman() {
  let aggregate = humanThroughEvidence();
  aggregate = applyEvent(aggregate, { type: 'AWAIT_APPROVALS' }, T5).aggregate;
  return applyEvent(
    aggregate,
    {
      approvals: approvalFacts(humanAuthorization, T6),
      requestingAgent: requestingAgent(humanAuthorization, T6),
      type: 'AUTHORIZE_APPROVALS',
    },
    T6,
  );
}

function auditedHuman() {
  const authorized = authorizedHuman();
  const basis = authorized.aggregate.authorizationBasis;
  if (basis === null) {
    throw new Error('human basis must exist');
  }
  const audit = createAdapterVerifiedAuthorizationAudit(
    humanAuthorization,
    basis.basisDigest,
    {
      adapterId: 'hedera-consensus-adapter',
      auditId: 'authorization-audit-human-1',
      committedAt: T7,
      topicId: '0.0.9000',
      transactionId: '0.0.1000@1753437607.000000001',
    },
  );
  return applyEvent(
    authorized.aggregate,
    { authorizationAudit: audit, type: 'COMMIT_AUDIT' },
    T7,
  );
}

function queuedHuman() {
  const audited = auditedHuman();
  const attempt = frozenAttempt(humanAuthorization, T8);
  return applyEvent(
    audited.aggregate,
    {
      approvals: approvalFacts(humanAuthorization, T8),
      attempt,
      mandate: null,
      requestingAgent: requestingAgent(humanAuthorization, T8),
      reservationLedger: null,
      type: 'QUEUE_SETTLEMENT',
    },
    T8,
  );
}

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

  it('never reopens an attached observation', () => {
    for (const event of sourceObservationEvents) {
      expect(transitionSourceObservation('ATTACHED', event)).toMatchObject({
        error: { code: 'TERMINAL_STATE' },
        ok: false,
      });
    }
  });
});

describe('invoice-revision lifecycle', () => {
  it('freezes only a ready revision and never reopens terminal revisions', () => {
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
    for (const state of invoiceRevisionStates.filter(
      isTerminalInvoiceRevisionState,
    )) {
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

  it('activates, pauses, resumes, and expires from the verified record', () => {
    expect(
      transitionStandingMandate(
        issuedMandate,
        { type: 'ACTIVATE' },
        { now: NOW },
      ),
    ).toMatchObject({ ok: true, value: { state: 'ACTIVE' } });
    expect(
      transitionStandingMandate(
        activeMandateAggregate,
        { type: 'PAUSE' },
        { now: NOW },
      ),
    ).toMatchObject({ ok: true, value: { state: 'PAUSED' } });
    expect(
      transitionStandingMandate(
        { record: standingMandate, state: 'PAUSED' },
        { type: 'RESUME' },
        { now: NOW },
      ),
    ).toMatchObject({ ok: true, value: { state: 'ACTIVE' } });
    expect(
      transitionStandingMandate(
        activeMandateAggregate,
        { type: 'EXPIRE' },
        { now: MANDATE_EXPIRES_AT },
      ),
    ).toMatchObject({ ok: true, value: { state: 'EXPIRED' } });
  });

  it('derives time bounds from the record and never reopens terminal states', () => {
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
        {
          expiresAt: '2999-01-01T00:00:00.000Z',
          notBefore: BEFORE,
          type: 'ACTIVATE',
        },
        { now: NOW },
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_TIME_INVALID' },
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

describe('persisted payment-action aggregate', () => {
  it('completes the mandate path with atomic reservation and consumption effects', () => {
    const authorized = authorizedMandate();
    expect(authorized.aggregate.state).toBe('AUTHORIZED');
    expect(authorized.aggregate.authorizationBasis?.kind).toBe('MANDATE');
    expect(authorized.effects).toMatchObject([
      {
        operation: 'RESERVE',
        type: 'MANDATE_RESERVATION_WRITE',
      },
    ]);

    const queued = queuedMandate();
    expect(queued.aggregate.state).toBe('SETTLEMENT_PENDING');
    expect(queued.aggregate.settlementAttempt?.status).toBe('FROZEN');
    expect(queued.aggregate.executionAuthority?.agentBookStatus).toBe(
      'CURRENT',
    );

    const basis = queued.aggregate.authorizationBasis;
    const attempt = queued.aggregate.settlementAttempt;
    if (basis === null || basis.kind !== 'MANDATE' || attempt === null) {
      throw new Error('queued mandate fixtures must carry their basis');
    }
    const receipt = settlementReceipt(authorization, attempt, T6);
    const claim = consumptionClaim(authorization, attempt, receipt, T6);
    const settled = applyEvent(
      queued.aggregate,
      {
        consumptionClaim: claim,
        receipt,
        reservationLedger: basis.reservedLedger,
        type: 'SETTLE_CONSENSUS',
      },
      T6,
    );
    expect(settled.aggregate.state).toBe('SETTLED');
    expect(settled.effects.map(({ type }) => type).sort()).toEqual([
      'MANDATE_RESERVATION_WRITE',
      'SETTLEMENT_CONSUMPTION_WRITE',
    ]);
    expect(settled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          atomicGroupKey: settled.atomicGroupKey,
          operation: 'SETTLE',
        }),
        expect.objectContaining({
          atomicGroupKey: settled.atomicGroupKey,
          claim,
          receipt,
        }),
      ]),
    );

    const reconciling = applyEvent(
      settled.aggregate,
      { type: 'START_RECONCILIATION' },
      T7,
    );
    const reconciled = applyEvent(
      reconciling.aggregate,
      { type: 'RECONCILE_SUCCESS' },
      T8,
    );
    expect(reconciled.aggregate.state).toBe('RECONCILED');
    expect(reconciled.aggregate.terminal).toMatchObject({
      eventType: 'RECONCILE_SUCCESS',
      outcome: 'RECONCILED',
    });
  });

  it('persists paid verification, MATCH evidence, original approvals, and fresh execution authority', () => {
    const authorized = authorizedHuman();
    expect(authorized.aggregate.authorizationBasis).toMatchObject({
      approvals: expect.any(Array),
      kind: 'HUMAN_APPROVAL',
      requestingAgent: { companyRoleStatus: 'CURRENT' },
    });

    const queued = queuedHuman();
    expect(queued.aggregate.state).toBe('SETTLEMENT_PENDING');
    expect(queued.aggregate.verificationPayment?.kind).toBe(
      'VERIFICATION_PAYMENT',
    );
    expect(queued.aggregate.evidenceResult).toMatchObject({
      kind: 'VERIFICATION_EVIDENCE',
      result: 'MATCH',
    });
    expect(queued.aggregate.executionApprovals).toHaveLength(2);
    expect(queued.aggregate.executionAuthority?.verifiedAt).toBe(T8);
  });

  it('rejects forged hydration of an advanced state', () => {
    const captured = initialAggregate();
    expect(
      transitionPaymentAction(
        {
          ...captured,
          metadata: {
            lastEventType: 'SETTLE_CONSENSUS',
            lastTransitionAt: T1,
            previousState: 'SETTLEMENT_PENDING',
            transitionCount: 1,
            version: 2,
          },
          state: 'SETTLED',
        },
        { type: 'START_RECONCILIATION' },
        { now: T2 },
      ),
    ).toMatchObject({
      error: { code: 'POLICY_CORE_BINDING_MISMATCH' },
      ok: false,
    });
  });

  it('compares retries with the aggregate-held frozen attempt', () => {
    const queued = queuedMandate();
    const attempt = queued.aggregate.settlementAttempt;
    if (attempt === null) {
      throw new Error('settlement attempt must exist');
    }
    const uncertainty = createAdapterVerifiedSettlementUncertainty(
      authorization,
      attempt,
      {
        adapterId: 'hedera-settlement-adapter',
        observedAt: T6,
        reason: 'SUBMISSION_RESULT_UNKNOWN',
        uncertaintyId: 'settlement-uncertainty-1',
      },
    );
    const recovery = applyEvent(
      queued.aggregate,
      { type: 'START_SETTLEMENT_RECOVERY', uncertainty },
      T6,
    );
    expect(recovery.effects).toEqual([]);
    expect(recovery.aggregate.authorizationBasis?.kind).toBe('MANDATE');

    expect(
      transitionPaymentAction(
        recovery.aggregate,
        { candidate: attempt, type: 'RETRY_SAME_TRANSACTION' },
        { now: T7 },
      ),
    ).toMatchObject({
      ok: true,
      value: { aggregate: { state: 'SETTLEMENT_PENDING' } },
    });

    const alternate = frozenAttempt(authorization, T5, {
      attemptId: 'settlement-attempt-2',
      signedBytesHash: 'e'.repeat(64),
      transactionId: 'hedera-frozen-transaction-2',
    });
    expect(
      transitionPaymentAction(
        recovery.aggregate,
        { candidate: alternate, type: 'RETRY_SAME_TRANSACTION' },
        { now: T7 },
      ),
    ).toMatchObject({
      error: { code: 'SETTLEMENT_TRANSACTION_MISMATCH' },
      ok: false,
    });
  });

  it('rejects a receipt that belongs to another self-consistent attempt', () => {
    const queued = queuedMandate();
    const original = queued.aggregate.settlementAttempt;
    const basis = queued.aggregate.authorizationBasis;
    if (original === null || basis === null || basis.kind !== 'MANDATE') {
      throw new Error('queued mandate must carry its attempt and basis');
    }
    const alternate = frozenAttempt(authorization, T5, {
      attemptId: 'settlement-attempt-2',
      signedBytesHash: 'e'.repeat(64),
      transactionId: 'hedera-frozen-transaction-2',
    });
    const receipt = settlementReceipt(authorization, alternate, T6);
    const claim = consumptionClaim(authorization, alternate, receipt, T6);

    expect(
      transitionPaymentAction(
        queued.aggregate,
        {
          consumptionClaim: claim,
          receipt,
          reservationLedger: basis.reservedLedger,
          type: 'SETTLE_CONSENSUS',
        },
        { now: T6 },
      ),
    ).toMatchObject({
      error: { code: 'SETTLEMENT_TRANSACTION_MISMATCH' },
      ok: false,
    });
  });

  it.each(['PAUSED', 'REVOKED'] as const)(
    'revalidates a %s mandate before queueing',
    (state) => {
      const audited = auditedMandate();
      const basis = audited.aggregate.authorizationBasis;
      if (basis === null || basis.kind !== 'MANDATE') {
        throw new Error('mandate basis must exist');
      }
      expect(
        transitionPaymentAction(
          audited.aggregate,
          {
            approvals: null,
            attempt: frozenAttempt(authorization, T5),
            mandate: { ...activeMandateAggregate, state },
            requestingAgent: requestingAgent(authorization, T5),
            reservationLedger: basis.reservedLedger,
            type: 'QUEUE_SETTLEMENT',
          },
          { now: T5 },
        ),
      ).toMatchObject({
        error: { code: 'MANDATE_NOT_ACTIVE' },
        ok: false,
      });
    },
  );

  it('revalidates company role, AgentBook status, and original requesting-agent identity', () => {
    const audited = auditedMandate();
    const basis = audited.aggregate.authorizationBasis;
    if (basis === null || basis.kind !== 'MANDATE') {
      throw new Error('mandate basis must exist');
    }
    const baseEvent = {
      approvals: null,
      attempt: frozenAttempt(authorization, T5),
      mandate: activeMandateAggregate,
      reservationLedger: basis.reservedLedger,
      type: 'QUEUE_SETTLEMENT',
    } as const;

    expect(
      transitionPaymentAction(
        audited.aggregate,
        {
          ...baseEvent,
          requestingAgent: requestingAgent(authorization, T5, {
            companyRoleStatus: 'REVOKED',
          }),
        },
        { now: T5 },
      ),
    ).toMatchObject({ error: { code: 'ROLE_REVOKED' }, ok: false });
    expect(
      transitionPaymentAction(
        audited.aggregate,
        {
          ...baseEvent,
          requestingAgent: requestingAgent(authorization, T5, {
            agentBookStatus: 'CHANGED',
          }),
        },
        { now: T5 },
      ),
    ).toMatchObject({
      error: { code: 'AGENT_BACKING_UNVERIFIED' },
      ok: false,
    });
    expect(
      transitionPaymentAction(
        audited.aggregate,
        {
          ...baseEvent,
          requestingAgent: requestingAgent(authorization, T5, {
            agentBackingRecordId: 'changed-agent-backing-record',
          }),
        },
        { now: T5 },
      ),
    ).toMatchObject({
      error: { code: 'REQUESTING_AGENT_IDENTITY_CHANGED' },
      ok: false,
    });
  });

  it('revalidates counted human approvals and their original identities at queue time', () => {
    const audited = auditedHuman();
    const attempt = frozenAttempt(humanAuthorization, T8);
    const base = {
      attempt,
      mandate: null,
      requestingAgent: requestingAgent(humanAuthorization, T8),
      reservationLedger: null,
      type: 'QUEUE_SETTLEMENT',
    } as const;
    expect(
      transitionPaymentAction(
        audited.aggregate,
        {
          ...base,
          approvals: approvalFacts(humanAuthorization, T8, {
            companyRoleStatus: 'REVOKED',
          }),
        },
        { now: T8 },
      ),
    ).toMatchObject({ error: { code: 'ROLE_REVOKED' }, ok: false });

    const changed = approvalFacts(humanAuthorization, T8).map(
      (approval, index) => {
        if (index !== 0) {
          return approval;
        }
        const { recordDigest, ...core } = approval;
        void recordDigest;
        return createAdapterVerifiedApprovalFact({
          ...core,
          roleCredentialId: 'replacement-role-credential',
        });
      },
    );
    expect(
      transitionPaymentAction(
        audited.aggregate,
        { ...base, approvals: changed },
        { now: T8 },
      ),
    ).toMatchObject({
      error: { code: 'APPROVAL_IDENTITY_CHANGED' },
      ok: false,
    });
  });

  it('checks exact expiry boundaries before quote, payment, and evidence work', () => {
    const classified = applyEvent(
      initialAggregate(humanAuthorization),
      { type: 'CLASSIFY' },
      T1,
    ).aggregate;
    expect(
      transitionPaymentAction(
        classified,
        { type: 'QUOTE_VERIFICATION' },
        { now: ACTION_EXPIRES_AT },
      ),
    ).toMatchObject({ error: { code: 'ACTION_EXPIRED' }, ok: false });

    const quoted = applyEvent(
      classified,
      { type: 'QUOTE_VERIFICATION' },
      T2,
    ).aggregate;
    expect(
      transitionPaymentAction(
        quoted,
        {
          payment: { forged: true },
          type: 'RECORD_VERIFICATION_PAYMENT',
        },
        { now: ACTION_EXPIRES_AT },
      ),
    ).toMatchObject({ error: { code: 'ACTION_EXPIRED' }, ok: false });

    const payment = verificationPayment();
    const paid = applyEvent(
      quoted,
      { payment, type: 'RECORD_VERIFICATION_PAYMENT' },
      T3,
    ).aggregate;
    expect(
      transitionPaymentAction(
        paid,
        {
          type: 'ACCEPT_VERIFICATION',
          verification: evidenceResult(payment, 'MATCH', T4),
        },
        { now: EVIDENCE_EXPIRES_AT },
      ),
    ).toMatchObject({ error: { code: 'VERIFICATION_EXPIRED' }, ok: false });
  });

  it('releases mandate reservations on expire, supersede, and cancel before effect', () => {
    const authorized = authorizedMandate();
    const basis = authorized.aggregate.authorizationBasis;
    if (basis === null || basis.kind !== 'MANDATE') {
      throw new Error('mandate basis must exist');
    }
    for (const event of [
      {
        reservationLedger: basis.reservedLedger,
        type: 'REJECT_AUTHORIZATION',
      },
      {
        reservationLedger: basis.reservedLedger,
        type: 'SUPERSEDE',
      },
      {
        reservationLedger: basis.reservedLedger,
        type: 'EXPIRE',
      },
    ] as const) {
      const now = event.type === 'EXPIRE' ? ACTION_EXPIRES_AT : T4;
      const result = transitionPaymentAction(authorized.aggregate, event, {
        now,
      });
      expect(result).toMatchObject({
        ok: true,
        value: {
          effects: [
            {
              operation: 'RELEASE',
              type: 'MANDATE_RESERVATION_WRITE',
            },
          ],
        },
      });
    }

    const audited = auditedMandate();
    const auditedBasis = audited.aggregate.authorizationBasis;
    const audit = audited.aggregate.authorizationAudit;
    if (
      auditedBasis === null ||
      auditedBasis.kind !== 'MANDATE' ||
      audit === null
    ) {
      throw new Error('audited mandate fixtures must exist');
    }
    const cancellationAudit = createAdapterVerifiedCancellationAudit(
      authorization,
      audit,
      {
        adapterId: 'hedera-consensus-adapter',
        cancellationId: 'cancellation-audit-1',
        committedAt: T5,
        topicId: '0.0.9000',
        transactionId: '0.0.1000@1753437605.000000001',
      },
    );
    expect(
      transitionPaymentAction(
        audited.aggregate,
        {
          cancellationAudit,
          reservationLedger: auditedBasis.reservedLedger,
          type: 'CANCEL',
        },
        { now: T5 },
      ),
    ).toMatchObject({
      ok: true,
      value: {
        aggregate: { state: 'CANCELLED' },
        effects: [{ operation: 'RELEASE' }],
      },
    });
  });

  it('rejects evidence and payment substitution even when the substituted record is valid', () => {
    const payment = verificationPayment();
    let aggregate = initialAggregate(humanAuthorization);
    aggregate = applyEvent(aggregate, { type: 'CLASSIFY' }, T1).aggregate;
    aggregate = applyEvent(
      aggregate,
      { type: 'QUOTE_VERIFICATION' },
      T2,
    ).aggregate;
    const substitutedPayment = createAdapterVerifiedVerificationPayment(
      humanAuthorization,
      {
        adapterId: 'hedera-x402-adapter',
        networkId: 'hedera:296',
        paidAt: T3,
        servicePaymentId: 'verification-payment-substituted',
        serviceRequestDigest: '8'.repeat(64),
        transactionId: '0.0.1000@1753437603.000000002',
      },
    );
    aggregate = applyEvent(
      aggregate,
      {
        payment: substitutedPayment,
        type: 'RECORD_VERIFICATION_PAYMENT',
      },
      T3,
    ).aggregate;
    expect(
      transitionPaymentAction(
        aggregate,
        {
          type: 'ACCEPT_VERIFICATION',
          verification: evidenceResult(payment),
        },
        { now: T4 },
      ),
    ).toMatchObject({
      error: { code: 'VERIFICATION_MISMATCH' },
      ok: false,
    });
  });

  it('records monotonic versions and refuses time reversal', () => {
    const initial = initialAggregate();
    const classified = applyEvent(initial, { type: 'CLASSIFY' }, T2);
    expect(classified.aggregate.metadata).toMatchObject({
      lastEventType: 'CLASSIFY',
      previousState: 'CAPTURED',
      transitionCount: 1,
      version: 2,
    });
    expect(
      transitionPaymentAction(
        classified.aggregate,
        { type: 'SATISFY_EVIDENCE_NOT_REQUIRED' },
        { now: T1 },
      ),
    ).toMatchObject({ error: { code: 'ACTION_TIME_INVALID' }, ok: false });
  });

  it('routes a block directly to a persisted terminal rejection', () => {
    const classified = applyEvent(
      initialAggregate(blockAuthorization),
      { type: 'CLASSIFY' },
      T1,
    );
    const rejected = applyEvent(
      classified.aggregate,
      { type: 'REJECT_POLICY_BLOCK' },
      T2,
    );
    expect(rejected.aggregate).toMatchObject({
      state: 'REJECTED',
      terminal: {
        eventType: 'REJECT_POLICY_BLOCK',
        outcome: 'REJECTED',
      },
    });
    expect(
      transitionPaymentAction(
        rejected.aggregate,
        { reservationLedger: null, type: 'EXPIRE' },
        { now: ACTION_EXPIRES_AT },
      ),
    ).toMatchObject({ error: { code: 'TERMINAL_STATE' }, ok: false });
  });

  it('exposes complete, duplicate-free state and event vocabularies', () => {
    expect(new Set(paymentActionStates).size).toBe(paymentActionStates.length);
    expect(new Set(paymentActionEventTypes).size).toBe(
      paymentActionEventTypes.length,
    );
    expect(new Set(sourceObservationStates).size).toBe(
      sourceObservationStates.length,
    );
    expect(paymentActionStates.filter(isTerminalPaymentActionState)).toEqual([
      'RECONCILED',
      'RECONCILIATION_EXCEPTION',
      'REJECTED',
      'EXPIRED',
      'SUPERSEDED',
      'CANCELLED',
    ]);
  });
});
