import { readFile } from 'node:fs/promises';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  actionFactBinding,
  createAdapterVerifiedApprovalFact,
  createAdapterVerifiedAuthorizationAudit,
  createAdapterVerifiedEvidenceResult,
  createAdapterVerifiedSettlementReceipt,
  createAdapterVerifiedVerificationPayment,
  createAtomicSettlementConsumptionClaim,
  createFrozenSettlementAttempt,
  createMandateReservationLedger,
  createPaymentActionAggregate,
  createRequestingAgentExecutionFact,
  encodeCanonicalSignedTransactionBytes,
  transitionPaymentAction,
  validateMandateContainment,
  type PaymentActionAggregate,
  type PaymentActionEvent,
  type PaymentActionTransition,
  type PaymentAuthorizationContext,
  type FrozenSettlementAttempt,
} from '@invoiceguard/domain';
import {
  createAuthorizationBundle,
  createStandingMandate,
} from '../../../protocol/src/hashing.js';
import {
  actionCore,
  activeMandateAggregate,
  authorization,
  humanAuthorization,
  policyEvaluationForCore,
  standingMandate,
} from '../../../domain/test/fixtures/authorization.js';

import {
  applyPaymentEffectContractsMigration,
  createPostgresOutboxRepository,
  createPostgresPaymentActionRepository,
  paymentPersistenceUniquenessContract,
} from '../../src/index.js';

const databaseUrl = process.env['PERSISTENCE_TEST_DATABASE_URL'];
if (databaseUrl === undefined) {
  throw new Error('PERSISTENCE_TEST_DATABASE_URL is required');
}

const sql = postgres(databaseUrl, {
  max: 4,
  onnotice: () => undefined,
});
const migrationUrl = new URL(
  '../../migrations/0001_payment_effect_contracts.sql',
  import.meta.url,
);
const migrationSql = await readFile(migrationUrl, 'utf8');

beforeAll(async () => {
  await sql.unsafe('DROP SCHEMA public CASCADE');
  await sql.unsafe('CREATE SCHEMA public');
  await applyPaymentEffectContractsMigration(sql, migrationSql);
});

afterAll(async () => {
  await sql.end();
});

describe('PostgreSQL payment-effect schema', () => {
  it('applies once, records its checksum, and rejects drift', async () => {
    await expect(
      applyPaymentEffectContractsMigration(sql, migrationSql),
    ).resolves.toBe('ALREADY_APPLIED');
    await expect(
      applyPaymentEffectContractsMigration(
        sql,
        `${migrationSql}\nSELECT 'drift';`,
      ),
    ).rejects.toThrow('migration checksum mismatch');
  });

  it('physically reserves every declared uniqueness identity', async () => {
    const rows = await sql<readonly Readonly<{ name: string }>[]>`
      SELECT conname AS name
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
      UNION
      SELECT indexname AS name
      FROM pg_indexes
      WHERE schemaname = 'public'
    `;
    const physicalNames = new Set(rows.map(({ name }) => name));
    const missing = paymentPersistenceUniquenessContract.uniqueKeys
      .map(({ name }) => name)
      .filter((name) => !physicalNames.has(name));

    expect(missing).toEqual([]);
  });
});

const repository = createPostgresPaymentActionRepository(sql);
const outbox = createPostgresOutboxRepository(sql);

function initialAggregate(): PaymentActionAggregate {
  const result = createPaymentActionAggregate(humanAuthorization);
  if (!result.ok) {
    throw new Error(`fixture aggregate failed: ${result.error.code}`);
  }
  return result.value;
}

function mandateAggregate(): PaymentActionAggregate {
  const result = createPaymentActionAggregate(authorization);
  if (!result.ok) {
    throw new Error(`fixture aggregate failed: ${result.error.code}`);
  }
  return result.value;
}

function requestingAgent(
  frozenAuthorization: PaymentAuthorizationContext,
  verifiedAt: string,
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
    expiresAt: '2026-07-25T10:59:00.000Z',
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
  });
}

function approvalFacts(verifiedAt: string) {
  const binding = actionFactBinding(humanAuthorization);
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
      expiresAt: '2026-07-25T10:59:00.000Z',
      humanDecisionStatus: 'VERIFIED',
      kind: 'APPROVAL_FACT',
      role: 'FINANCE_APPROVER',
      roleCredentialId: 'role-credential-finance-1',
      signedProofDigest: '1'.repeat(64),
      subjectId: 'subject-1',
      verifiedAt,
      worldProofId: 'world-proof-1',
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
      expiresAt: '2026-07-25T10:59:00.000Z',
      humanDecisionStatus: 'VERIFIED',
      kind: 'APPROVAL_FACT',
      role: 'TREASURY_APPROVER',
      roleCredentialId: 'role-credential-treasury-2',
      signedProofDigest: '2'.repeat(64),
      subjectId: 'subject-2',
      verifiedAt,
      worldProofId: 'world-proof-2',
    }),
  ] as const;
}

function emptyMandateLedger() {
  const containment = validateMandateContainment(
    authorization,
    activeMandateAggregate,
    '2026-07-25T10:00:03.000Z',
  );
  if (!containment.ok) {
    throw new Error(`fixture containment failed: ${containment.error.code}`);
  }
  const ledger = createMandateReservationLedger(containment.value);
  if (!ledger.ok) {
    throw new Error(`fixture ledger failed: ${ledger.error.code}`);
  }
  return ledger.value;
}

function frozenAttempt(createdAt: string): FrozenSettlementAttempt {
  return createFrozenSettlementAttempt(authorization, {
    adapterId: 'hedera-settlement-adapter',
    attemptId: 'settlement-attempt-1',
    createdAt,
    expiresAt: '2026-07-25T11:00:00.000Z',
    signedTransactionBytes: encodeCanonicalSignedTransactionBytes(
      Buffer.from('invoiceguard-frozen-settlement-transaction-1'),
    ),
    transactionId: 'hedera-frozen-transaction-1',
  });
}

const { mandateDigest: ignoredMandateDigest, ...standingMandateCore } =
  standingMandate;
void ignoredMandateDigest;
const cappedMandate = createStandingMandate({
  ...standingMandateCore,
  mandateId: '019f939b-fe5e-7e92-b72e-8d4531958e02',
  maximumSettlementInvoiceAmountAtoms: '6000000',
  maximumSettlementPeriodAmountAtoms: '10000000',
  maximumSourceInvoiceAmountAtoms: '6000000',
});
const cappedMandateAggregate = {
  record: cappedMandate,
  state: 'ACTIVE',
} as const;

function cappedAuthorization(index: 1 | 2) {
  const suffix = index === 1 ? '1' : '2';
  const core = {
    ...actionCore,
    actionId: `019f939b-fe5e-7e92-b72e-8d4531958e${suffix}1`,
    nonce:
      index === 1
        ? '1123456789abcdef0123456789abcdef'
        : '2123456789abcdef0123456789abcdef',
    settlement: {
      ...actionCore.settlement,
      amountAtoms: '6000000',
    },
    sourceInvoice: {
      ...actionCore.sourceInvoice,
      amountAtoms: '6000000',
      invoiceRevisionId: `019f939b-fe5e-7e92-b72e-8d4531958e${suffix}6`,
      obligationId: `019f939b-fe5e-7e92-b72e-8d4531958e${suffix}3`,
    },
  } as const;
  const evaluation = policyEvaluationForCore(core);
  return createAuthorizationBundle(core, {
    ...evaluation,
    input: {
      ...evaluation.input,
      mandate: {
        activeStatus: 'ACTIVE',
        evidencePolicy: cappedMandate.requiredEvidencePolicy,
        exactContainment: true,
        periodCapAvailable: true,
        reference: {
          mandateDigest: cappedMandate.mandateDigest,
          mandateId: cappedMandate.mandateId,
          mandateVersion: cappedMandate.mandateVersion,
        },
        sourceRequirement: cappedMandate.sourceRequirement,
        verificationMode: cappedMandate.verificationMode,
      },
    },
  });
}

function emptyCappedLedger(
  frozenAuthorization: ReturnType<typeof cappedAuthorization>,
) {
  const containment = validateMandateContainment(
    frozenAuthorization,
    cappedMandateAggregate,
    '2026-07-25T10:00:03.000Z',
  );
  if (!containment.ok) {
    throw new Error(`fixture containment failed: ${containment.error.code}`);
  }
  const ledger = createMandateReservationLedger(containment.value);
  if (!ledger.ok) {
    throw new Error(`fixture ledger failed: ${ledger.error.code}`);
  }
  return ledger.value;
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

async function resetPaymentData(): Promise<void> {
  await sql.unsafe(
    'TRUNCATE payment_actions, standing_mandate_versions CASCADE',
  );
}

async function seedQuoteEvent(): Promise<PaymentActionTransition> {
  const aggregate = initialAggregate();
  await repository.create(aggregate);
  const classified = applyEvent(
    aggregate,
    { type: 'CLASSIFY' },
    '2026-07-25T10:00:01.000Z',
  );
  await repository.applyTransition(classified);
  const quoted = applyEvent(
    classified.aggregate,
    { type: 'QUOTE_VERIFICATION' },
    '2026-07-25T10:00:02.000Z',
  );
  await repository.applyTransition(quoted);
  return quoted;
}

describe('PostgreSQL payment repository', () => {
  it('admits, hydrates, and idempotently replays an exact action', async () => {
    await resetPaymentData();
    const aggregate = initialAggregate();

    await expect(repository.create(aggregate)).resolves.toBe('APPLIED');
    await expect(repository.create(aggregate)).resolves.toBe('ALREADY_APPLIED');
    await expect(
      repository.findById(
        aggregate.authorization.actionCore.organizationId,
        aggregate.authorization.actionCore.actionId,
      ),
    ).resolves.toEqual(aggregate);
  });

  it('commits a state change and its deterministic outbox event atomically', async () => {
    await resetPaymentData();
    const aggregate = initialAggregate();
    await repository.create(aggregate);
    const classified = applyEvent(
      aggregate,
      { type: 'CLASSIFY' },
      '2026-07-25T10:00:01.000Z',
    );
    await repository.applyTransition(classified);
    const quoted = applyEvent(
      classified.aggregate,
      { type: 'QUOTE_VERIFICATION' },
      '2026-07-25T10:00:02.000Z',
    );

    await expect(
      repository.applyTransition({ ...quoted, effects: [] }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(
      repository.findById(
        aggregate.authorization.actionCore.organizationId,
        aggregate.authorization.actionCore.actionId,
      ),
    ).resolves.toEqual(classified.aggregate);

    await expect(repository.applyTransition(quoted)).resolves.toBe('APPLIED');
    await expect(repository.applyTransition(quoted)).resolves.toBe(
      'ALREADY_APPLIED',
    );

    const events = await sql<
      readonly Readonly<{
        action_digest: string;
        event_id: string;
        first_atomic_group_key: string;
        last_atomic_group_key: string;
      }>[]
    >`
      SELECT
        action_digest,
        event_id,
        first_atomic_group_key,
        last_atomic_group_key
      FROM outbox_events
    `;
    expect(events).toEqual([
      {
        action_digest: humanAuthorization.envelope.actionDigest,
        event_id:
          quoted.effects[0] !== undefined && 'eventId' in quoted.effects[0]
            ? quoted.effects[0].eventId
            : '',
        first_atomic_group_key: quoted.atomicGroupKey,
        last_atomic_group_key: quoted.atomicGroupKey,
      },
    ]);
  });

  it('serializes concurrent copies of one transition without duplicating state', async () => {
    await resetPaymentData();
    const aggregate = initialAggregate();
    await repository.create(aggregate);
    const transition = applyEvent(
      aggregate,
      { type: 'CLASSIFY' },
      '2026-07-25T10:00:01.000Z',
    );

    const results = await Promise.all([
      repository.applyTransition(transition),
      repository.applyTransition(transition),
    ]);
    expect(results.sort()).toEqual(['ALREADY_APPLIED', 'APPLIED']);

    const rows = await sql<
      readonly Readonly<{ aggregate_version: number; row_count: string }>[]
    >`
      SELECT max(aggregate_version)::integer AS aggregate_version,
             count(*)::text AS row_count
      FROM payment_actions
    `;
    expect(rows).toEqual([{ aggregate_version: 2, row_count: '1' }]);
  });

  it('locks and persists the mandate reservation with authorization', async () => {
    await resetPaymentData();
    const aggregate = mandateAggregate();
    await repository.create(aggregate);
    const classified = applyEvent(
      aggregate,
      { type: 'CLASSIFY' },
      '2026-07-25T10:00:01.000Z',
    );
    await repository.applyTransition(classified);
    const evidenced = applyEvent(
      classified.aggregate,
      { type: 'SATISFY_EVIDENCE_NOT_REQUIRED' },
      '2026-07-25T10:00:02.000Z',
    );
    await repository.applyTransition(evidenced);
    const authorized = applyEvent(
      evidenced.aggregate,
      {
        mandate: activeMandateAggregate,
        requestingAgent: requestingAgent(
          authorization,
          '2026-07-25T10:00:03.000Z',
        ),
        reservationLedger: emptyMandateLedger(),
        type: 'AUTHORIZE_MANDATE',
      },
      '2026-07-25T10:00:03.000Z',
    );

    await expect(repository.applyTransition(authorized)).resolves.toBe(
      'APPLIED',
    );
    const rows = await sql<
      readonly Readonly<{
        amount_atoms: string;
        reserved_atoms: string;
        reservation_status: string;
      }>[]
    >`
      SELECT
        reservation.amount_atoms::text,
        ledger.reserved_atoms::text,
        reservation.reservation_status
      FROM mandate_reservations AS reservation
      JOIN mandate_period_ledgers AS ledger
        USING (organization_id, mandate_id, mandate_version, period_key)
    `;
    expect(rows).toEqual([
      {
        amount_atoms: authorization.actionCore.settlement.amountAtoms,
        reservation_status: 'RESERVED',
        reserved_atoms: authorization.actionCore.settlement.amountAtoms,
      },
    ]);
  });

  it('atomically persists settlement consumption, mandate settlement, and audit outbox', async () => {
    await resetPaymentData();
    let aggregate = mandateAggregate();
    await repository.create(aggregate);
    for (const [event, now] of [
      [{ type: 'CLASSIFY' }, '2026-07-25T10:00:01.000Z'],
      [{ type: 'SATISFY_EVIDENCE_NOT_REQUIRED' }, '2026-07-25T10:00:02.000Z'],
    ] as const) {
      const step = applyEvent(aggregate, event, now);
      await repository.applyTransition(step);
      aggregate = step.aggregate;
    }
    let step = applyEvent(
      aggregate,
      {
        mandate: activeMandateAggregate,
        requestingAgent: requestingAgent(
          authorization,
          '2026-07-25T10:00:03.000Z',
        ),
        reservationLedger: emptyMandateLedger(),
        type: 'AUTHORIZE_MANDATE',
      },
      '2026-07-25T10:00:03.000Z',
    );
    await repository.applyTransition(step);
    aggregate = step.aggregate;
    const basis = aggregate.authorizationBasis;
    if (basis === null || basis.kind !== 'MANDATE') {
      throw new Error('authorized mandate basis is required');
    }

    const auditAuthority = requestingAgent(
      authorization,
      '2026-07-25T10:00:04.000Z',
    );
    const authorizationAudit = createAdapterVerifiedAuthorizationAudit(
      authorization,
      basis.basisDigest,
      auditAuthority,
      {
        adapterId: 'hedera-consensus-adapter',
        auditId: 'authorization-audit-1',
        committedAt: '2026-07-25T10:00:04.000Z',
        networkId: 'hedera:296',
        topicId: '0.0.9000',
        transactionId: '0.0.1000@1753437604.000000001',
        writerAccountId: '0.0.1000',
        writerId: 'authorization-audit-writer',
        writerKeyId: 'hedera-audit-key-1',
      },
    );
    step = applyEvent(
      aggregate,
      {
        authorizationAudit,
        requestingAgent: auditAuthority,
        type: 'COMMIT_AUDIT',
      },
      '2026-07-25T10:00:04.000Z',
    );
    await repository.applyTransition(step);
    aggregate = step.aggregate;

    const attempt = frozenAttempt('2026-07-25T10:00:05.000Z');
    step = applyEvent(
      aggregate,
      {
        approvals: null,
        attempt,
        mandate: activeMandateAggregate,
        requestingAgent: requestingAgent(
          authorization,
          '2026-07-25T10:00:05.000Z',
        ),
        reservationLedger: basis.reservedLedger,
        type: 'QUEUE_SETTLEMENT',
      },
      '2026-07-25T10:00:05.000Z',
    );
    await repository.applyTransition(step);
    aggregate = step.aggregate;

    const receipt = createAdapterVerifiedSettlementReceipt(
      authorization,
      attempt,
      {
        adapterId: 'hedera-settlement-adapter',
        receiptId: `settlement-receipt:${attempt.attemptId}`,
        receiptSource: 'MIRROR_NODE',
        settledAt: '2026-07-25T10:00:06.000Z',
        sourceNodeId: 'hedera-mirror-node-testnet',
      },
    );
    const claim = createAtomicSettlementConsumptionClaim(
      authorization,
      attempt,
      receipt,
      {
        adapterId: 'postgres-atomic-payment-writer',
        atomicGroupKey: `payment:${attempt.actionDigest}:v${
          aggregate.metadata.version + 1
        }`,
        claimId: `settlement-consumption:${attempt.attemptId}`,
        consumedAt: '2026-07-25T10:00:06.000Z',
        expectedAggregateVersion: aggregate.metadata.version,
        writerId: 'postgres-payment-writer',
        writerVersion: 1,
      },
    );
    const settled = applyEvent(
      aggregate,
      {
        consumptionClaim: claim,
        receipt,
        reservationLedger: basis.reservedLedger,
        type: 'SETTLE_CONSENSUS',
      },
      '2026-07-25T10:00:06.000Z',
    );

    await expect(repository.applyTransition(settled)).resolves.toBe('APPLIED');
    await expect(repository.applyTransition(settled)).resolves.toBe(
      'ALREADY_APPLIED',
    );
    const rows = await sql<
      readonly Readonly<{
        audit_events: string;
        claims: string;
        receipts: string;
        reservation_status: string;
        settled_atoms: string;
        state: string;
      }>[]
    >`
      SELECT
        action.payment_state AS state,
        ledger.settled_atoms::text,
        reservation.reservation_status,
        (SELECT count(*)::text FROM settlement_receipts) AS receipts,
        (SELECT count(*)::text FROM settlement_consumptions) AS claims,
        (
          SELECT count(*)::text
          FROM outbox_events
          WHERE effect_family = 'EXECUTION_AUDIT'
        ) AS audit_events
      FROM payment_actions AS action
      JOIN mandate_reservations AS reservation
        USING (organization_id, action_digest)
      JOIN mandate_period_ledgers AS ledger
        USING (organization_id, mandate_id, mandate_version, period_key)
    `;
    expect(rows).toEqual([
      {
        audit_events: '1',
        claims: '1',
        receipts: '1',
        reservation_status: 'SETTLED',
        settled_atoms: authorization.actionCore.settlement.amountAtoms,
        state: 'SETTLED_AUDIT_PENDING',
      },
    ]);
  });

  it('consumes approval and quorum identities with human authorization', async () => {
    await resetPaymentData();
    let aggregate = initialAggregate();
    await repository.create(aggregate);

    for (const [event, now] of [
      [{ type: 'CLASSIFY' }, '2026-07-25T10:00:01.000Z'],
      [{ type: 'QUOTE_VERIFICATION' }, '2026-07-25T10:00:02.000Z'],
    ] as const) {
      const step = applyEvent(aggregate, event, now);
      await repository.applyTransition(step);
      aggregate = step.aggregate;
    }

    const payment = createAdapterVerifiedVerificationPayment(
      humanAuthorization,
      {
        adapterId: 'hedera-x402-adapter',
        paidAt: '2026-07-25T10:00:03.000Z',
        paymentAttemptId: 'verification-payment-attempt-1',
        paymentNetworkId: 'hedera:296',
        paymentTransactionId: '0.0.1000@1753437603.000000001',
        quoteDigest: '6'.repeat(64),
        quoteId: 'verification-quote-1',
        servicePaymentId: 'verification-payment-1',
        serviceRequestDigest: '7'.repeat(64),
      },
    );
    let step = applyEvent(
      aggregate,
      { payment, type: 'RECORD_VERIFICATION_PAYMENT' },
      '2026-07-25T10:00:03.000Z',
    );
    await repository.applyTransition(step);
    aggregate = step.aggregate;

    const evidence = createAdapterVerifiedEvidenceResult(
      humanAuthorization,
      payment,
      {
        adapterId: 'verification-service-adapter',
        evidenceResultId: 'evidence-result-match',
        evidenceRoot: humanAuthorization.actionCore.evidenceRoot,
        expiresAt: '2026-07-25T10:50:00.000Z',
        result: 'MATCH',
        verifiedAt: '2026-07-25T10:00:04.000Z',
      },
    );
    step = applyEvent(
      aggregate,
      { type: 'ACCEPT_VERIFICATION', verification: evidence },
      '2026-07-25T10:00:04.000Z',
    );
    await repository.applyTransition(step);
    aggregate = step.aggregate;

    step = applyEvent(
      aggregate,
      { type: 'AWAIT_APPROVALS' },
      '2026-07-25T10:00:05.000Z',
    );
    await repository.applyTransition(step);
    aggregate = step.aggregate;

    step = applyEvent(
      aggregate,
      {
        approvals: approvalFacts('2026-07-25T10:00:06.000Z'),
        requestingAgent: requestingAgent(
          humanAuthorization,
          '2026-07-25T10:00:06.000Z',
        ),
        type: 'AUTHORIZE_APPROVALS',
      },
      '2026-07-25T10:00:06.000Z',
    );
    await expect(repository.applyTransition(step)).resolves.toBe('APPLIED');

    const counts = await sql<
      readonly Readonly<{ approvals: string; challenges: string }>[]
    >`
      SELECT
        (SELECT count(*)::text FROM approval_facts) AS approvals,
        (
          SELECT count(*)::text
          FROM agentkit_challenge_consumptions
        ) AS challenges
    `;
    expect(counts).toEqual([{ approvals: '2', challenges: '3' }]);
  });

  it('serializes competing reservations so the mandate cap cannot be exceeded', async () => {
    await resetPaymentData();
    const candidates = [cappedAuthorization(1), cappedAuthorization(2)];
    const ready: PaymentActionAggregate[] = [];
    for (const candidate of candidates) {
      const created = createPaymentActionAggregate(candidate);
      if (!created.ok) {
        throw new Error(`fixture aggregate failed: ${created.error.code}`);
      }
      await repository.create(created.value);
      const classified = applyEvent(
        created.value,
        { type: 'CLASSIFY' },
        '2026-07-25T10:00:01.000Z',
      );
      await repository.applyTransition(classified);
      const evidenced = applyEvent(
        classified.aggregate,
        { type: 'SATISFY_EVIDENCE_NOT_REQUIRED' },
        '2026-07-25T10:00:02.000Z',
      );
      await repository.applyTransition(evidenced);
      ready.push(evidenced.aggregate);
    }

    const transitions = ready.map((aggregate, index) => {
      const candidate = candidates[index];
      if (candidate === undefined) {
        throw new Error('capped authorization fixture is missing');
      }
      return applyEvent(
        aggregate,
        {
          mandate: cappedMandateAggregate,
          requestingAgent: requestingAgent(
            candidate,
            '2026-07-25T10:00:03.000Z',
          ),
          reservationLedger: emptyCappedLedger(candidate),
          type: 'AUTHORIZE_MANDATE',
        },
        '2026-07-25T10:00:03.000Z',
      );
    });
    const results = await Promise.allSettled(
      transitions.map((transition) => repository.applyTransition(transition)),
    );

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    const totals = await sql<
      readonly Readonly<{
        reservation_count: string;
        reserved_atoms: string;
      }>[]
    >`
      SELECT
        count(reservation.action_digest)::text AS reservation_count,
        ledger.reserved_atoms::text
      FROM mandate_period_ledgers AS ledger
      LEFT JOIN mandate_reservations AS reservation
        USING (organization_id, mandate_id, mandate_version, period_key)
      GROUP BY ledger.reserved_atoms
    `;
    expect(totals).toEqual([
      { reservation_count: '1', reserved_atoms: '6000000' },
    ]);
  });
});

describe('PostgreSQL outbox repository', () => {
  it('leases one event to only one competing worker', async () => {
    await resetPaymentData();
    const quoted = await seedQuoteEvent();
    const claims = await Promise.all([
      outbox.claimNext('worker-a', 30),
      outbox.claimNext('worker-b', 30),
    ]);
    const active = claims.filter((claim) => claim !== null);

    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      deliveryAttempt: 1,
      eventId:
        quoted.effects[0] !== undefined && 'eventId' in quoted.effects[0]
          ? quoted.effects[0].eventId
          : '',
    });
    const claim = active[0];
    if (claim === undefined) {
      throw new Error('one worker must hold the outbox lease');
    }
    await expect(
      outbox.acknowledge(
        claim.organizationId,
        claim.eventId,
        '00000000-0000-4000-8000-000000000000',
      ),
    ).rejects.toMatchObject({ code: 'OUTBOX_EVENT_CONFLICT' });
    await outbox.acknowledge(
      claim.organizationId,
      claim.eventId,
      claim.leaseToken,
    );
    await expect(outbox.claimNext('worker-c', 30)).resolves.toBeNull();
  });

  it('releases for retry and rejects a stale lease after expiry', async () => {
    await resetPaymentData();
    await seedQuoteEvent();
    const first = await outbox.claimNext('worker-a', 30);
    if (first === null) {
      throw new Error('seeded event must be claimable');
    }
    await outbox.release(
      first.organizationId,
      first.eventId,
      first.leaseToken,
      0,
    );
    const second = await outbox.claimNext('worker-b', 30);
    if (second === null) {
      throw new Error('released event must be claimable');
    }
    expect(second.deliveryAttempt).toBe(2);
    expect(second.leaseToken).not.toBe(first.leaseToken);

    await sql`
      UPDATE outbox_events
      SET lease_expires_at = transaction_timestamp() - interval '1 second'
      WHERE organization_id = ${second.organizationId}
        AND event_id = ${second.eventId}
    `;
    const recovered = await outbox.claimNext('worker-c', 30);
    if (recovered === null) {
      throw new Error('expired event must be recoverable');
    }
    expect(recovered.deliveryAttempt).toBe(3);
    await expect(
      outbox.acknowledge(
        second.organizationId,
        second.eventId,
        second.leaseToken,
      ),
    ).rejects.toMatchObject({ code: 'OUTBOX_EVENT_CONFLICT' });
    await outbox.acknowledge(
      recovered.organizationId,
      recovered.eventId,
      recovered.leaseToken,
    );
  });
});
