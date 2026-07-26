import { describe, expect, it } from 'vitest';

import { hashAdapterRecord } from '../src/facts/adapter-record.js';
import {
  actionFactBinding,
  createAdapterVerifiedApprovalFact,
  createAdapterVerifiedAuthorizationAudit,
  createAdapterVerifiedCancellationAudit,
  createAdapterVerifiedEvidenceResult,
  createAdapterVerifiedExecutionAudit,
  createAdapterVerifiedSettlementReceipt,
  createAdapterVerifiedSettlementUncertainty,
  createAdapterVerifiedVerificationPayment,
  createAtomicSettlementConsumptionClaim,
  encodeCanonicalSignedTransactionBytes,
  createFrozenSettlementAttempt,
  createMandateReservationLedger,
  createPaymentActionAggregate,
  createRequestingAgentExecutionFact,
  deriveExecutionAuditEventId,
  deriveSettlementSubmissionEventId,
  deriveVerificationQuoteEventId,
  hydratePaymentActionAggregate,
  invoiceRevisionEvents,
  invoiceRevisionStates,
  isTerminalInvoiceRevisionState,
  isTerminalPaymentActionState,
  isTerminalStandingMandateState,
  isPaymentDomainEventId,
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
  type PaymentAuthorizationBasis,
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
const T9 = '2026-07-25T10:00:09.000Z';
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
    agentBookRegistry: 'world-agentbook:eip155:480',
    agentBookStatus: 'CURRENT',
    agentId: 'payment-agent-1',
    agentKitChallengeId: `agentkit-challenge:${frozenAuthorization.actionCore.actionId}`,
    agentTenantPrincipal: 'agent-tenant-1',
    audience: 'invoiceguard:settlement',
    companyRoleStatus: 'CURRENT',
    expiresAt: FACT_EXPIRES_AT,
    factId: `requesting-agent-proof:${frozenAuthorization.actionCore.actionId}`,
    grantDigest: '7'.repeat(64),
    grantId: 'payment-executor-grant',
    grantStatus: 'CURRENT',
    grantVersion: 1,
    role: 'PAYMENT_EXECUTOR',
    roleCredentialId: 'role-credential-payment-executor-1',
    scope: 'payments:execute',
    signedProofDigest: frozenAuthorization.envelope.actionDigest,
    subjectId: 'payment-agent-1',
    tenantId: frozenAuthorization.actionCore.organizationId,
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
      agentKitChallengeId: 'approval-agentkit-challenge-1',
      approvalId: 'approval-1',
      approvalSessionId: 'approval-session-1',
      companyRoleStatus: 'CURRENT',
      consumptionClaimId: 'approval-consumption-1',
      decision: 'APPROVE',
      decisionId: 'decision-1',
      expiresAt: FACT_EXPIRES_AT,
      humanDecisionStatus: 'VERIFIED',
      kind: 'APPROVAL_FACT',
      role: 'FINANCE_APPROVER',
      roleCredentialId: 'role-credential-finance-1',
      signedProofDigest: '1'.repeat(64),
      subjectId: 'subject-1',
      verifiedAt,
      worldProofId: 'world-proof-1',
      ...overrides,
    }),
    createAdapterVerifiedApprovalFact({
      ...binding,
      actionHumanPrincipal: 'human-2',
      adapterId: 'world-approval-adapter',
      agentBackingRecordId: 'agent-backing-approval-2',
      agentBackingStatus: 'CURRENT',
      agentTenantPrincipal: 'approval-agent-2',
      agentKitChallengeId: 'approval-agentkit-challenge-2',
      approvalId: 'approval-2',
      approvalSessionId: 'approval-session-2',
      companyRoleStatus: 'CURRENT',
      consumptionClaimId: 'approval-consumption-2',
      decision: 'APPROVE',
      decisionId: 'decision-2',
      expiresAt: FACT_EXPIRES_AT,
      humanDecisionStatus: 'VERIFIED',
      kind: 'APPROVAL_FACT',
      role: 'TREASURY_APPROVER',
      roleCredentialId: 'role-credential-treasury-2',
      signedProofDigest: '2'.repeat(64),
      subjectId: 'subject-2',
      verifiedAt,
      worldProofId: 'world-proof-2',
      ...overrides,
    }),
  ];
}

function verificationPayment(verifiedAt = T3) {
  return createAdapterVerifiedVerificationPayment(humanAuthorization, {
    adapterId: 'hedera-x402-adapter',
    paidAt: verifiedAt,
    paymentAttemptId: 'verification-payment-attempt-1',
    paymentNetworkId: 'hedera:296',
    paymentTransactionId: '0.0.1000@1753437603.000000001',
    quoteDigest: '6'.repeat(64),
    quoteId: 'verification-quote-1',
    servicePaymentId: 'verification-payment-1',
    serviceRequestDigest: '7'.repeat(64),
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
    signedTransactionBytes: string;
    transactionId: string;
  }> = {},
): FrozenSettlementAttempt {
  return createFrozenSettlementAttempt(frozenAuthorization, {
    adapterId: 'hedera-settlement-adapter',
    attemptId: 'settlement-attempt-1',
    createdAt,
    expiresAt: ACTION_EXPIRES_AT,
    signedTransactionBytes: encodeCanonicalSignedTransactionBytes(
      Buffer.from('invoiceguard-frozen-settlement-transaction-1'),
    ),
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
    receiptSource: 'MIRROR_NODE',
    settledAt,
    sourceNodeId: 'hedera-mirror-node-testnet',
  });
}

function consumptionClaim(
  frozenAuthorization: typeof authorization,
  aggregate: PaymentActionAggregate,
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
      atomicGroupKey: `payment:${attempt.actionDigest}:v${
        aggregate.metadata.version + 1
      }`,
      claimId: `settlement-consumption:${attempt.attemptId}`,
      consumedAt,
      expectedAggregateVersion: aggregate.metadata.version,
      writerId: 'postgres-payment-writer',
      writerVersion: 1,
    },
  );
}

function executionAudit(
  frozenAuthorization: typeof authorization,
  aggregate: PaymentActionAggregate,
  committedAt: string,
) {
  const authorizationAudit = aggregate.authorizationAudit;
  const attempt = aggregate.settlementAttempt;
  const receipt = aggregate.settlementReceipt;
  if (authorizationAudit === null || attempt === null || receipt === null) {
    throw new Error('settled aggregate fixtures must carry audit evidence');
  }
  return createAdapterVerifiedExecutionAudit(
    frozenAuthorization,
    authorizationAudit,
    attempt,
    receipt,
    {
      adapterId: authorizationAudit.adapterId,
      auditId: `execution-audit:${attempt.attemptId}`,
      committedAt,
      topicId: authorizationAudit.topicId,
      transactionId: `execution-audit-transaction:${attempt.attemptId}`,
      writerAccountId: authorizationAudit.writerAccountId,
      writerId: authorizationAudit.writerId,
      writerKeyId: authorizationAudit.writerKeyId,
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

function replaceBasisAuthority(
  basis: PaymentAuthorizationBasis,
  authority: ReturnType<typeof requestingAgent>,
): PaymentAuthorizationBasis {
  const { basisDigest, ...currentCore } = basis;
  void basisDigest;
  const core = Object.freeze({
    ...currentCore,
    requestingAgent: authority,
  });
  return Object.freeze({
    ...core,
    basisDigest: hashAdapterRecord(
      basis.kind === 'MANDATE'
        ? 'MANDATE_AUTHORIZATION_BASIS'
        : 'HUMAN_AUTHORIZATION_BASIS',
      core,
    ),
  });
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
  const auditAuthority = requestingAgent(authorization, T4);
  const authorizationAudit = createAdapterVerifiedAuthorizationAudit(
    authorization,
    basis.basisDigest,
    auditAuthority,
    {
      adapterId: 'hedera-consensus-adapter',
      auditId: 'authorization-audit-1',
      committedAt: T4,
      networkId: 'hedera:296',
      topicId: '0.0.9000',
      transactionId: '0.0.1000@1753437604.000000001',
      writerAccountId: '0.0.1000',
      writerId: 'authorization-audit-writer',
      writerKeyId: 'hedera-audit-key-1',
    },
  );
  return applyEvent(
    authorized.aggregate,
    {
      authorizationAudit,
      requestingAgent: auditAuthority,
      type: 'COMMIT_AUDIT',
    },
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
  const auditAuthority = requestingAgent(humanAuthorization, T7);
  const audit = createAdapterVerifiedAuthorizationAudit(
    humanAuthorization,
    basis.basisDigest,
    auditAuthority,
    {
      adapterId: 'hedera-consensus-adapter',
      auditId: 'authorization-audit-human-1',
      committedAt: T7,
      networkId: 'hedera:296',
      topicId: '0.0.9000',
      transactionId: '0.0.1000@1753437607.000000001',
      writerAccountId: '0.0.1000',
      writerId: 'authorization-audit-writer',
      writerKeyId: 'hedera-audit-key-1',
    },
  );
  return applyEvent(
    authorized.aggregate,
    {
      authorizationAudit: audit,
      requestingAgent: auditAuthority,
      type: 'COMMIT_AUDIT',
    },
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
  it('rehydrates valid JSON and rejects mutated persisted records', () => {
    const captured = initialAggregate();
    const persisted = JSON.parse(JSON.stringify(captured)) as unknown;

    expect(hydratePaymentActionAggregate(persisted)).toEqual({
      ok: true,
      value: captured,
    });

    const mutated = JSON.parse(JSON.stringify(captured)) as {
      authorization: { actionCore: { supplierId: string } };
    };
    mutated.authorization.actionCore.supplierId =
      '01983b93-5e8c-7000-8000-000000000099';
    expect(hydratePaymentActionAggregate(mutated)).toMatchObject({
      error: { code: 'POLICY_CORE_BINDING_MISMATCH' },
      ok: false,
    });
  });

  it('identifies verification quote effects by frozen action and policy', () => {
    const classified = applyEvent(
      initialAggregate(humanAuthorization),
      { type: 'CLASSIFY' },
      T1,
    ).aggregate;
    const first = applyEvent(classified, { type: 'QUOTE_VERIFICATION' }, T2);
    const eventId = deriveVerificationQuoteEventId(classified);

    expect(first.effects).toEqual([
      {
        actionDigest: humanAuthorization.envelope.actionDigest,
        atomicGroupKey: first.atomicGroupKey,
        evidencePolicyDigest: humanAuthorization.decision.evidencePolicy.digest,
        eventId,
        expiresAt: humanAuthorization.actionCore.expiresAt,
        idempotencyKey: eventId,
        serviceId: humanAuthorization.decision.evidencePolicy.serviceId,
        serviceKeyId: humanAuthorization.decision.evidencePolicy.serviceKeyId,
        serviceNetworkId:
          humanAuthorization.decision.evidencePolicy.serviceNetworkId,
        type: 'VERIFICATION_QUOTE_REQUEST',
      },
    ]);
  });

  it('derives bounded event identities from maximum-length admitted inputs', () => {
    const attempt = frozenAttempt(authorization, T5, {
      attemptId: 'a'.repeat(512),
    });
    const eventIds = [
      deriveExecutionAuditEventId(attempt),
      deriveSettlementSubmissionEventId(attempt),
    ];

    expect(eventIds.every(isPaymentDomainEventId)).toBe(true);
    expect(new Set(eventIds).size).toBe(eventIds.length);
    expect(
      Math.max(...eventIds.map(({ length }) => length)),
    ).toBeLessThanOrEqual(256);
  });

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
    expect(queued.effects).toEqual([
      {
        atomicGroupKey: queued.atomicGroupKey,
        attempt,
        authorityFactDigest: queued.aggregate.executionAuthority?.recordDigest,
        authorizationBasisDigest: basis.basisDigest,
        evidenceResultDigest: null,
        eventId: deriveSettlementSubmissionEventId(attempt),
        idempotencyKey: attempt.idempotencyKey,
        type: 'SETTLEMENT_SUBMISSION_REQUEST',
      },
    ]);
    const receipt = settlementReceipt(authorization, attempt, T6);
    const claim = consumptionClaim(
      authorization,
      queued.aggregate,
      attempt,
      receipt,
      T6,
    );
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
    expect(settled.aggregate.state).toBe('SETTLED_AUDIT_PENDING');
    expect(settled.effects.map(({ type }) => type).sort()).toEqual([
      'EXECUTION_AUDIT_REQUEST',
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
        expect.objectContaining({
          atomicGroupKey: settled.atomicGroupKey,
          authorizationAuditId: queued.aggregate.authorizationAudit?.auditId,
          eventId: deriveExecutionAuditEventId(attempt),
          idempotencyKey: deriveExecutionAuditEventId(attempt),
          receiptId: receipt.receiptId,
          type: 'EXECUTION_AUDIT_REQUEST',
        }),
      ]),
    );

    const audit = executionAudit(authorization, settled.aggregate, T7);
    const auditConfirmed = applyEvent(
      settled.aggregate,
      { executionAudit: audit, type: 'CONFIRM_EXECUTION_AUDIT' },
      T7,
    );
    expect(auditConfirmed.aggregate).toMatchObject({
      executionAudit: audit,
      state: 'SETTLED',
    });
    expect(auditConfirmed.effects).toEqual([]);

    const reconciling = applyEvent(
      auditConfirmed.aggregate,
      { type: 'START_RECONCILIATION' },
      T8,
    );
    const reconciled = applyEvent(
      reconciling.aggregate,
      { type: 'RECONCILE_SUCCESS' },
      T9,
    );
    expect(reconciled.aggregate.state).toBe('RECONCILED');
    expect(reconciled.aggregate.terminal).toMatchObject({
      eventType: 'RECONCILE_SUCCESS',
      outcome: 'RECONCILED',
    });
  });

  it('retries a degraded execution audit without undoing settled value', () => {
    const queued = queuedMandate();
    const basis = queued.aggregate.authorizationBasis;
    const attempt = queued.aggregate.settlementAttempt;
    if (basis === null || basis.kind !== 'MANDATE' || attempt === null) {
      throw new Error('queued mandate fixtures must carry their basis');
    }
    const receipt = settlementReceipt(authorization, attempt, T6);
    const claim = consumptionClaim(
      authorization,
      queued.aggregate,
      attempt,
      receipt,
      T6,
    );
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
    const originalRequest = settled.effects.find(
      ({ type }) => type === 'EXECUTION_AUDIT_REQUEST',
    );
    if (originalRequest?.type !== 'EXECUTION_AUDIT_REQUEST') {
      throw new Error('settlement must emit its execution-audit request');
    }

    const degraded = applyEvent(
      settled.aggregate,
      { type: 'MARK_EXECUTION_AUDIT_DEGRADED' },
      T7,
    );
    expect(degraded.aggregate).toMatchObject({
      consumptionClaim: claim,
      executionAudit: null,
      settlementReceipt: receipt,
      state: 'SETTLED_AUDIT_DEGRADED',
    });

    const retried = applyEvent(
      degraded.aggregate,
      { type: 'RETRY_EXECUTION_AUDIT' },
      T8,
    );
    expect(retried.aggregate).toMatchObject({
      consumptionClaim: claim,
      executionAudit: null,
      settlementReceipt: receipt,
      state: 'SETTLED_AUDIT_DEGRADED',
    });
    expect(retried.effects).toEqual([
      expect.objectContaining({
        eventId: originalRequest.eventId,
        idempotencyKey: originalRequest.idempotencyKey,
        type: 'EXECUTION_AUDIT_REQUEST',
      }),
    ]);
    expect(
      retried.effects.some(
        ({ type }) =>
          type === 'MANDATE_RESERVATION_WRITE' ||
          type === 'SETTLEMENT_CONSUMPTION_WRITE',
      ),
    ).toBe(false);

    const audit = executionAudit(authorization, retried.aggregate, T9);
    const { recordDigest, ...auditCore } = audit;
    void recordDigest;
    const substitutedEventCore = Object.freeze({
      ...auditCore,
      eventId: 'invoiceguard:hcs:execution:v1:substituted',
    });
    const substitutedEventAudit = Object.freeze({
      ...substitutedEventCore,
      recordDigest: hashAdapterRecord('EXECUTION_AUDIT', substitutedEventCore),
    });
    const authorizationAudit = retried.aggregate.authorizationAudit;
    if (authorizationAudit === null) {
      throw new Error('settled aggregate must retain its authorization audit');
    }
    const substitutedWriterAudit = createAdapterVerifiedExecutionAudit(
      authorization,
      authorizationAudit,
      attempt,
      receipt,
      {
        adapterId: authorizationAudit.adapterId,
        auditId: `execution-audit:${attempt.attemptId}`,
        committedAt: T9,
        topicId: authorizationAudit.topicId,
        transactionId: 'execution-audit-transaction:substituted-writer',
        writerAccountId: authorizationAudit.writerAccountId,
        writerId: 'substituted-audit-writer',
        writerKeyId: authorizationAudit.writerKeyId,
      },
    );
    for (const invalidAudit of [
      substitutedEventAudit,
      substitutedWriterAudit,
    ]) {
      expect(
        transitionPaymentAction(
          retried.aggregate,
          {
            executionAudit: invalidAudit,
            type: 'RECOVER_EXECUTION_AUDIT',
          },
          { now: T9 },
        ),
      ).toMatchObject({
        error: { code: 'EXECUTION_AUDIT_MISMATCH' },
        ok: false,
      });
    }

    const recovered = applyEvent(
      retried.aggregate,
      { executionAudit: audit, type: 'RECOVER_EXECUTION_AUDIT' },
      T9,
    );
    expect(recovered.aggregate).toMatchObject({
      consumptionClaim: claim,
      executionAudit: audit,
      settlementReceipt: receipt,
      state: 'SETTLED',
    });
    expect(recovered.effects).toEqual([]);
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
    const basis = queued.aggregate.authorizationBasis;
    const attempt = queued.aggregate.settlementAttempt;
    if (basis === null || attempt === null) {
      throw new Error(
        'queued human fixtures must retain their basis and attempt',
      );
    }
    expect(queued.effects).toEqual([
      expect.objectContaining({
        atomicGroupKey: queued.atomicGroupKey,
        attempt,
        authorityFactDigest: queued.aggregate.executionAuthority?.recordDigest,
        authorizationBasisDigest: basis.basisDigest,
        evidenceResultDigest: queued.aggregate.evidenceResult?.recordDigest,
        eventId: deriveSettlementSubmissionEventId(attempt),
        idempotencyKey: attempt.idempotencyKey,
        type: 'SETTLEMENT_SUBMISSION_REQUEST',
      }),
    ]);
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

  it.each([
    {
      label: 'revoked company role',
      authority: requestingAgent(authorization, T3, {
        companyRoleStatus: 'REVOKED',
      }),
    },
    {
      label: 'expired company role',
      authority: requestingAgent(authorization, T3, {
        companyRoleStatus: 'EXPIRED',
      }),
    },
    {
      label: 'changed AgentBook backing',
      authority: requestingAgent(authorization, T3, {
        agentBookStatus: 'CHANGED',
      }),
    },
    {
      label: 'expired retained fact',
      authority: requestingAgent(authorization, T2, {
        expiresAt: T3,
      }),
    },
    {
      label: 'revoked executor grant',
      authority: requestingAgent(authorization, T3, {
        grantStatus: 'REVOKED',
      }),
    },
    {
      label: 'wrong executor scope',
      authority: requestingAgent(authorization, T3, {
        scope: 'payments:read',
      }),
    },
  ])('refuses a hydrated basis with $label', ({ authority }) => {
    const authorized = authorizedMandate();
    const basis = authorized.aggregate.authorizationBasis;
    if (basis === null) {
      throw new Error('authorization basis must exist');
    }
    expect(
      transitionPaymentAction(
        {
          ...authorized.aggregate,
          authorizationBasis: replaceBasisAuthority(basis, authority),
        },
        { type: 'START_AUTHORIZATION_RECOVERY' },
        { now: T4 },
      ),
    ).toMatchObject({
      error: { code: 'POLICY_CORE_BINDING_MISMATCH' },
      ok: false,
    });
  });

  it('refuses hydrated audit authority whose chronology follows the audit commit', () => {
    const audited = auditedMandate();
    const basis = audited.aggregate.authorizationBasis;
    if (basis === null) {
      throw new Error('authorization basis must exist');
    }
    const lateAuthority = requestingAgent(authorization, T5);
    const lateAudit = createAdapterVerifiedAuthorizationAudit(
      authorization,
      basis.basisDigest,
      lateAuthority,
      {
        adapterId: 'hedera-consensus-adapter',
        auditId: 'authorization-audit-late-authority',
        committedAt: T4,
        networkId: 'hedera:296',
        topicId: '0.0.9000',
        transactionId: '0.0.1000@1753437604.000000099',
        writerAccountId: '0.0.1000',
        writerId: 'authorization-audit-writer',
        writerKeyId: 'hedera-audit-key-1',
      },
    );
    expect(
      transitionPaymentAction(
        {
          ...audited.aggregate,
          auditAuthority: lateAuthority,
          authorizationAudit: lateAudit,
        },
        { reservationLedger: null, type: 'CANCEL' },
        { now: T5 },
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
    const recoveryBasis = recovery.aggregate.authorizationBasis;
    if (recoveryBasis === null || recoveryBasis.kind !== 'MANDATE') {
      throw new Error('recovery must retain its mandate basis');
    }

    const retried = transitionPaymentAction(
      recovery.aggregate,
      {
        approvals: null,
        mandate: activeMandateAggregate,
        requestingAgent: requestingAgent(authorization, T7),
        reservationLedger: recoveryBasis.reservedLedger,
        type: 'RETRY_SAME_TRANSACTION',
      },
      { now: T7 },
    );
    if (!retried.ok) {
      throw new Error(`retry failed: ${retried.error.code}`);
    }
    const initialSubmission = queued.effects[0];
    const retrySubmission = retried.value.effects[0];
    if (
      initialSubmission === undefined ||
      retrySubmission === undefined ||
      !('eventId' in initialSubmission) ||
      !('eventId' in retrySubmission)
    ) {
      throw new Error('settlement requests must carry event identities');
    }
    expect(retrySubmission.eventId).toBe(initialSubmission.eventId);
    expect(retrySubmission.idempotencyKey).toBe(
      initialSubmission.idempotencyKey,
    );
    expect(retried.value).toMatchObject({
      aggregate: {
        settlementUncertainty: uncertainty,
        state: 'SETTLEMENT_PENDING',
      },
      effects: [
        {
          authorizationBasisDigest: recoveryBasis.basisDigest,
          attempt,
          eventId: deriveSettlementSubmissionEventId(attempt),
          idempotencyKey: attempt.idempotencyKey,
          type: 'SETTLEMENT_RETRY_REQUEST',
        },
      ],
    });

    const alternate = frozenAttempt(authorization, T5, {
      adapterId: 'substituted-settlement-adapter',
    });
    expect(
      transitionPaymentAction(
        recovery.aggregate,
        {
          approvals: null,
          attempt: alternate,
          mandate: activeMandateAggregate,
          requestingAgent: requestingAgent(authorization, T7),
          reservationLedger: recoveryBasis.reservedLedger,
          type: 'RETRY_SAME_TRANSACTION',
        },
        { now: T7 },
      ),
    ).toMatchObject({
      error: { code: 'SETTLEMENT_TRANSACTION_MISMATCH' },
      ok: false,
    });
  });

  it('preserves settlement uncertainty when retry authority is no longer valid', () => {
    const queued = queuedMandate();
    const attempt = queued.aggregate.settlementAttempt;
    const basis = queued.aggregate.authorizationBasis;
    if (attempt === null || basis === null || basis.kind !== 'MANDATE') {
      throw new Error('queued mandate must retain its attempt and basis');
    }
    const uncertainty = createAdapterVerifiedSettlementUncertainty(
      authorization,
      attempt,
      {
        adapterId: 'hedera-settlement-adapter',
        observedAt: T6,
        reason: 'SUBMISSION_RESULT_UNKNOWN',
        uncertaintyId: 'settlement-uncertainty-revalidation',
      },
    );
    const recovery = applyEvent(
      queued.aggregate,
      { type: 'START_SETTLEMENT_RECOVERY', uncertainty },
      T6,
    ).aggregate;
    const retry = {
      approvals: null,
      mandate: activeMandateAggregate,
      reservationLedger: basis.reservedLedger,
      type: 'RETRY_SAME_TRANSACTION',
    } as const;

    expect(
      transitionPaymentAction(
        recovery,
        {
          ...retry,
          requestingAgent: requestingAgent(authorization, T7, {
            grantStatus: 'REVOKED',
          }),
        },
        { now: T7 },
      ),
    ).toMatchObject({
      error: { code: 'EXECUTOR_GRANT_REVOKED' },
      ok: false,
    });
    expect(
      transitionPaymentAction(
        recovery,
        {
          ...retry,
          mandate: { ...activeMandateAggregate, state: 'PAUSED' },
          requestingAgent: requestingAgent(authorization, T7),
        },
        { now: T7 },
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_NOT_ACTIVE' },
      ok: false,
    });
    expect(
      transitionPaymentAction(
        recovery,
        {
          ...retry,
          requestingAgent: requestingAgent(authorization, T7),
        },
        { now: ACTION_EXPIRES_AT },
      ),
    ).toMatchObject({
      error: { code: 'ACTION_EXPIRED' },
      ok: false,
    });
    expect(recovery).toMatchObject({
      settlementUncertainty: uncertainty,
      state: 'SETTLEMENT_RECOVERY',
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
      adapterId: 'substituted-settlement-adapter',
    });
    const receipt = settlementReceipt(authorization, alternate, T6);
    const claim = consumptionClaim(
      authorization,
      queued.aggregate,
      alternate,
      receipt,
      T6,
    );

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

  it('rejects signed transaction bytes that no longer match their frozen hash', () => {
    const queued = queuedMandate();
    const attempt = queued.aggregate.settlementAttempt;
    if (attempt === null) {
      throw new Error('queued mandate must retain its settlement attempt');
    }
    const { recordDigest, ...attemptCore } = attempt;
    void recordDigest;
    const tamperedCore = Object.freeze({
      ...attemptCore,
      signedTransactionBytes: encodeCanonicalSignedTransactionBytes(
        Buffer.from('different-but-canonically-encoded-transaction'),
      ),
    });
    const tamperedAttempt = Object.freeze({
      ...tamperedCore,
      recordDigest: hashAdapterRecord(
        'FROZEN_SETTLEMENT_ATTEMPT',
        tamperedCore,
      ),
    });
    expect(
      transitionPaymentAction(
        {
          ...queued.aggregate,
          settlementAttempt: tamperedAttempt,
        },
        {
          type: 'START_SETTLEMENT_RECOVERY',
          uncertainty: { forged: true },
        },
        { now: T6 },
      ),
    ).toMatchObject({
      error: { code: 'POLICY_CORE_BINDING_MISMATCH' },
      ok: false,
    });
  });

  it('rejects a settlement claim with a substituted aggregate CAS context', () => {
    const queued = queuedMandate();
    const attempt = queued.aggregate.settlementAttempt;
    const basis = queued.aggregate.authorizationBasis;
    if (attempt === null || basis === null || basis.kind !== 'MANDATE') {
      throw new Error('queued mandate must retain its attempt and basis');
    }
    const receipt = settlementReceipt(authorization, attempt, T6);
    const substitutedVersion = queued.aggregate.metadata.version + 1;
    const claim = createAtomicSettlementConsumptionClaim(
      authorization,
      attempt,
      receipt,
      {
        adapterId: 'postgres-atomic-payment-writer',
        atomicGroupKey: `payment:${attempt.actionDigest}:v${
          substitutedVersion + 1
        }`,
        claimId: 'settlement-consumption:substituted-cas',
        consumedAt: T6,
        expectedAggregateVersion: substitutedVersion,
        writerId: 'postgres-payment-writer',
        writerVersion: 1,
      },
    );
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
    for (const override of [
      { role: 'PAYMENT_REVIEWER' },
      { scope: 'payments:read' },
      { audience: 'invoiceguard:reporting' },
      { agentBookRegistry: 'unconfigured-agentbook' },
      { adapterId: 'substituted-executor-adapter' },
      { tenantId: 'another-organization' },
    ]) {
      expect(
        transitionPaymentAction(
          audited.aggregate,
          {
            ...baseEvent,
            requestingAgent: requestingAgent(authorization, T5, override),
          },
          { now: T5 },
        ),
      ).toMatchObject({
        error: { code: 'EXECUTOR_POLICY_MISMATCH' },
        ok: false,
      });
    }
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
    for (const override of [
      { agentBackingRecordId: 'changed-agent-backing-record' },
      { agentKitChallengeId: 'changed-agentkit-challenge' },
      { factId: 'changed-requesting-agent-proof' },
      { signedProofDigest: '8'.repeat(64) },
      { expiresAt: ACTION_EXPIRES_AT },
    ]) {
      expect(
        transitionPaymentAction(
          audited.aggregate,
          {
            ...baseEvent,
            requestingAgent: requestingAgent(authorization, T5, override),
          },
          { now: T5 },
        ),
      ).toMatchObject({
        error: { code: 'REQUESTING_AGENT_IDENTITY_CHANGED' },
        ok: false,
      });
    }
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

    for (const override of [
      { adapterId: 'substituted-approval-adapter' },
      { agentKitChallengeId: 'replacement-agentkit-challenge' },
      { approvalSessionId: 'replacement-approval-session' },
      { decisionId: 'replacement-decision' },
      { expiresAt: ACTION_EXPIRES_AT },
      { roleCredentialId: 'replacement-role-credential' },
      { signedProofDigest: '9'.repeat(64) },
      { worldProofId: 'replacement-world-proof' },
    ]) {
      const changed = approvalFacts(humanAuthorization, T8).map(
        (approval, index) => {
          if (index !== 0) {
            return approval;
          }
          const { recordDigest, ...core } = approval;
          void recordDigest;
          return createAdapterVerifiedApprovalFact({
            ...core,
            ...override,
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
    }
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

  it('requires retained MATCH evidence to be current for every new effect', () => {
    const awaitingApprovals = applyEvent(
      humanThroughEvidence(),
      { type: 'AWAIT_APPROVALS' },
      T5,
    ).aggregate;
    expect(
      transitionPaymentAction(
        awaitingApprovals,
        {
          approvals: approvalFacts(humanAuthorization, EVIDENCE_EXPIRES_AT),
          requestingAgent: requestingAgent(
            humanAuthorization,
            EVIDENCE_EXPIRES_AT,
          ),
          type: 'AUTHORIZE_APPROVALS',
        },
        { now: EVIDENCE_EXPIRES_AT },
      ),
    ).toMatchObject({
      error: { code: 'VERIFICATION_EXPIRED' },
      ok: false,
    });

    const authorized = authorizedHuman();
    expect(
      transitionPaymentAction(
        authorized.aggregate,
        {
          authorizationAudit: { forged: true },
          requestingAgent: { forged: true },
          type: 'COMMIT_AUDIT',
        },
        { now: EVIDENCE_EXPIRES_AT },
      ),
    ).toMatchObject({
      error: { code: 'VERIFICATION_EXPIRED' },
      ok: false,
    });

    const audited = auditedHuman();
    expect(
      transitionPaymentAction(
        audited.aggregate,
        {
          approvals: approvalFacts(humanAuthorization, EVIDENCE_EXPIRES_AT),
          attempt: frozenAttempt(humanAuthorization, EVIDENCE_EXPIRES_AT),
          mandate: null,
          requestingAgent: requestingAgent(
            humanAuthorization,
            EVIDENCE_EXPIRES_AT,
          ),
          reservationLedger: null,
          type: 'QUEUE_SETTLEMENT',
        },
        { now: EVIDENCE_EXPIRES_AT },
      ),
    ).toMatchObject({
      error: { code: 'VERIFICATION_EXPIRED' },
      ok: false,
    });

    const queued = queuedHuman();
    const attempt = queued.aggregate.settlementAttempt;
    if (attempt === null) {
      throw new Error('queued human fixture must retain its attempt');
    }
    const recovery = applyEvent(
      queued.aggregate,
      {
        type: 'START_SETTLEMENT_RECOVERY',
        uncertainty: createAdapterVerifiedSettlementUncertainty(
          humanAuthorization,
          attempt,
          {
            adapterId: attempt.adapterId,
            observedAt: T9,
            reason: 'SUBMISSION_RESULT_UNKNOWN',
            uncertaintyId: 'settlement-uncertainty:evidence-expiry',
          },
        ),
      },
      T9,
    );
    expect(
      transitionPaymentAction(
        recovery.aggregate,
        {
          approvals: approvalFacts(humanAuthorization, EVIDENCE_EXPIRES_AT),
          mandate: null,
          requestingAgent: requestingAgent(
            humanAuthorization,
            EVIDENCE_EXPIRES_AT,
          ),
          reservationLedger: null,
          type: 'RETRY_SAME_TRANSACTION',
        },
        { now: EVIDENCE_EXPIRES_AT },
      ),
    ).toMatchObject({
      error: { code: 'VERIFICATION_EXPIRED' },
      ok: false,
    });

    expect(
      transitionPaymentAction(
        queued.aggregate,
        {
          type: 'START_SETTLEMENT_RECOVERY',
          uncertainty: createAdapterVerifiedSettlementUncertainty(
            humanAuthorization,
            attempt,
            {
              adapterId: attempt.adapterId,
              observedAt: EVIDENCE_EXPIRES_AT,
              reason: 'RECEIPT_LOOKUP_INCONCLUSIVE',
              uncertaintyId: 'settlement-uncertainty:historical-hydration',
            },
          ),
        },
        { now: EVIDENCE_EXPIRES_AT },
      ),
    ).toMatchObject({
      ok: true,
      value: { aggregate: { state: 'SETTLEMENT_RECOVERY' } },
    });
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
        networkId: 'hedera:296',
        topicId: '0.0.9000',
        transactionId: '0.0.1000@1753437605.000000001',
        writerAccountId: '0.0.1000',
        writerId: 'authorization-audit-writer',
        writerKeyId: 'hedera-audit-key-1',
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
        paidAt: T3,
        paymentAttemptId: 'verification-payment-attempt-substituted',
        paymentNetworkId: 'hedera:296',
        paymentTransactionId: '0.0.1000@1753437603.000000002',
        quoteDigest: '9'.repeat(64),
        quoteId: 'verification-quote-substituted',
        servicePaymentId: 'verification-payment-substituted',
        serviceRequestDigest: '8'.repeat(64),
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

  it('rejects a verification payment from a substituted service network', () => {
    let aggregate = initialAggregate(humanAuthorization);
    aggregate = applyEvent(aggregate, { type: 'CLASSIFY' }, T1).aggregate;
    aggregate = applyEvent(
      aggregate,
      { type: 'QUOTE_VERIFICATION' },
      T2,
    ).aggregate;
    const payment = createAdapterVerifiedVerificationPayment(
      humanAuthorization,
      {
        adapterId: 'hedera-x402-adapter',
        paidAt: T3,
        paymentAttemptId: 'verification-payment-attempt-wrong-network',
        paymentNetworkId: 'hedera:295',
        paymentTransactionId: '0.0.1000@1753437603.000000099',
        quoteDigest: '6'.repeat(64),
        quoteId: 'verification-quote-1',
        servicePaymentId: 'verification-payment-wrong-network',
        serviceRequestDigest: '7'.repeat(64),
      },
    );
    expect(
      transitionPaymentAction(
        aggregate,
        { payment, type: 'RECORD_VERIFICATION_PAYMENT' },
        { now: T3 },
      ),
    ).toMatchObject({
      error: { code: 'VERIFICATION_PAYMENT_INVALID' },
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
