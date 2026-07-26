import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  actionFactBinding,
  createAdapterVerifiedApprovalFact,
  createAdapterVerifiedAuthorizationAudit,
  createAdapterVerifiedEvidenceResult,
  createAdapterVerifiedSettlementReceipt,
  createAdapterVerifiedSettlementUncertainty,
  createAdapterVerifiedVerificationPayment,
  createAtomicSettlementConsumptionClaim,
  createFrozenSettlementAttempt,
  createMandateReservationLedger,
  createPaymentActionAggregate,
  createRequestingAgentExecutionFact,
  encodeCanonicalSignedTransactionBytes,
  isPaymentDomainEventId,
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
  createPaymentWriterAuthorizationBoundary,
  createPostgresOutboxRepository,
  createPostgresPaymentActionRepository,
  paymentPersistenceUniquenessContract,
  type PaymentWriterAuthorization,
} from '../../src/index.js';
import {
  DISPOSABLE_DATABASE_CONFIRMATION,
  assertDisposableDatabaseUrl,
  assertDisposableSchemaName,
  assertLiveDisposableDatabase,
  type LiveDatabaseIdentity,
} from './disposable-database.js';

const databaseUrl = assertDisposableDatabaseUrl(
  process.env['PERSISTENCE_TEST_DATABASE_URL'],
  process.env['PERSISTENCE_TEST_DISPOSABLE_CONFIRM'],
).toString();
const testSchema = `invoiceguard_test_${process.pid}_${randomUUID().replaceAll(
  '-',
  '',
)}`;
assertDisposableSchemaName(testSchema);
const adminSql = postgres(databaseUrl, {
  max: 1,
  onnotice: () => undefined,
});
const sql = postgres(databaseUrl, {
  connection: { search_path: testSchema },
  max: 4,
  onnotice: () => undefined,
});
const migrationUrl = new URL(
  '../../migrations/0001_payment_effect_contracts.sql',
  import.meta.url,
);
const migrationSql = await readFile(migrationUrl, 'utf8');

async function verifyLiveDatabase(): Promise<void> {
  const rows = await adminSql<readonly LiveDatabaseIdentity[]>`
    SELECT
      current_database() AS database_name,
      current_user AS user_name,
      inet_server_addr()::text AS server_address
  `;
  const identity = rows[0];
  if (identity === undefined) {
    throw new Error('connected PostgreSQL identity is unavailable');
  }
  assertLiveDisposableDatabase(identity);
}

beforeAll(async () => {
  await verifyLiveDatabase();
  await adminSql.unsafe(`CREATE SCHEMA "${testSchema}"`);
  const schemaRows = await sql<readonly Readonly<{ schema_name: string }>[]>`
    SELECT current_schema() AS schema_name
  `;
  if (schemaRows[0]?.schema_name !== testSchema) {
    throw new Error('randomized PostgreSQL test schema is not active');
  }
  await applyPaymentEffectContractsMigration(sql, migrationSql);
});

afterAll(async () => {
  await sql.end();
  await verifyLiveDatabase();
  assertDisposableSchemaName(testSchema);
  await adminSql.unsafe(`DROP SCHEMA "${testSchema}" CASCADE`);
  await adminSql.end();
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

  it('physically enforces declared identities, bindings, and predicates', async () => {
    const rows = await sql<
      readonly Readonly<{
        definition: string;
        kind: 'CONSTRAINT' | 'INDEX';
        name: string;
      }>[]
    >`
      SELECT
        conname AS name,
        pg_get_constraintdef(oid, true) AS definition,
        'CONSTRAINT' AS kind
      FROM pg_constraint
      WHERE connamespace = current_schema()::regnamespace
      UNION ALL
      SELECT
        indexname AS name,
        indexdef AS definition,
        'INDEX' AS kind
      FROM pg_indexes
      WHERE schemaname = current_schema()
    `;
    const physicalNames = new Set(rows.map(({ name }) => name));
    const missing = paymentPersistenceUniquenessContract.uniqueKeys
      .map(({ name }) => name)
      .filter((name) => !physicalNames.has(name));

    expect(missing).toEqual([]);
    const definitions = new Map(
      rows.map(({ definition, name }) => [
        name,
        definition.replaceAll(/\s+/gu, ' '),
      ]),
    );
    expect(definitions.get('settlement_receipt_attempt_binding')).toContain(
      'FOREIGN KEY (organization_id, attempt_id, action_digest, transaction_id, network_id, signed_bytes_hash, effect_digest, adapter_id)',
    );
    expect(definitions.get('settlement_consumption_receipt_binding')).toContain(
      'FOREIGN KEY (organization_id, receipt_id, attempt_id, action_digest, transaction_id, network_id, signed_bytes_hash, effect_digest, attempt_adapter_id)',
    );
    expect(definitions.get('settlement_consumption_payment_binding')).toContain(
      'FOREIGN KEY (organization_id, action_digest, obligation_id)',
    );
    expect(definitions.get('settlement_attempt_json_binding')).toContain(
      "(attempt #>> '{transactionId}'::text[])",
    );
    expect(definitions.get('settlement_receipt_json_binding')).toContain(
      "(receipt #>> '{signedBytesHash}'::text[])",
    );
    expect(definitions.get('settlement_consumption_json_binding')).toContain(
      'to_jsonb(expected_aggregate_version)',
    );
    expect(definitions.get('outbox_payload_binding')).toContain(
      "(payload #>> '{eventId}'::text[])",
    );
    expect(definitions.get('one_nonterminal_action_per_obligation')).toContain(
      'WHERE',
    );
    expect(definitions.get('one_nonterminal_action_per_obligation')).toContain(
      "'CANCELLED'::text",
    );
    expect(definitions.get('one_settlement_per_obligation')).toContain(
      "WHERE (consumption_status = 'CONSUMED'::text)",
    );
    expect(definitions.get('outbox_events_claimable')).toContain('WHERE');
    expect(definitions.get('outbox_events_claimable')).toContain(
      "'LEASED'::text",
    );
  });
});

const writerBoundary = createPaymentWriterAuthorizationBoundary([
  {
    permittedEffectAdapterIds: [
      'hedera-consensus-adapter',
      'hedera-settlement-adapter',
      'postgres-atomic-payment-writer',
      'supplier-verifier-v1',
      'world-agentbook-adapter',
    ],
    permittedEffectTypes: [
      'EXECUTION_AUDIT_REQUEST',
      'MANDATE_RESERVATION_WRITE',
      'SETTLEMENT_CONSUMPTION_WRITE',
      'SETTLEMENT_RETRY_REQUEST',
      'SETTLEMENT_SUBMISSION_REQUEST',
      'VERIFICATION_QUOTE_REQUEST',
    ],
    permittedFactAdapterIds: [
      'hedera-consensus-adapter',
      'hedera-settlement-adapter',
      'hedera-x402-adapter',
      'postgres-atomic-payment-writer',
      'verification-service-adapter',
      'world-agentbook-adapter',
      'world-approval-adapter',
    ],
    processId: 'persistence-contract-test-writer',
  },
]);
const writerAuthorization = writerBoundary.issue(
  'persistence-contract-test-writer',
);
const rawRepository = createPostgresPaymentActionRepository(
  sql,
  writerBoundary.repositoryTrust,
);
const repository = Object.freeze({
  applyTransition(transition: PaymentActionTransition) {
    return rawRepository.applyTransition(transition, writerAuthorization);
  },
  create(aggregate: PaymentActionAggregate) {
    return rawRepository.create(aggregate);
  },
  findById(organizationId: string, actionId: string) {
    return rawRepository.findById(organizationId, actionId);
  },
});
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

function frozenAttempt(
  createdAt: string,
  attemptId = 'settlement-attempt-1',
): FrozenSettlementAttempt {
  return createFrozenSettlementAttempt(authorization, {
    adapterId: 'hedera-settlement-adapter',
    attemptId,
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

async function seedMandateSettlementSubmission(
  attemptId: string,
): Promise<PaymentActionTransition> {
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
    throw new Error('mandate settlement seed requires authorization');
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
      auditId: 'max-event-authorization-audit',
      committedAt: '2026-07-25T10:00:04.000Z',
      networkId: 'hedera:296',
      topicId: '0.0.9000',
      transactionId: '0.0.1000@1753437604.000000099',
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
  const queued = applyEvent(
    aggregate,
    {
      approvals: null,
      attempt: frozenAttempt('2026-07-25T10:00:05.000Z', attemptId),
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
  await repository.applyTransition(queued);
  return queued;
}

describe('PostgreSQL payment repository', () => {
  it('rejects caller assertions and capabilities from another writer boundary', async () => {
    await resetPaymentData();
    const aggregate = initialAggregate();
    await repository.create(aggregate);
    const classified = applyEvent(
      aggregate,
      { type: 'CLASSIFY' },
      '2026-07-25T10:00:01.000Z',
    );
    const forged = {} as PaymentWriterAuthorization;
    await expect(
      rawRepository.applyTransition(classified, forged),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED_WRITER' });

    const otherBoundary = createPaymentWriterAuthorizationBoundary([
      {
        permittedEffectAdapterIds: [],
        permittedEffectTypes: [],
        permittedFactAdapterIds: [],
        processId: 'other-process',
      },
    ]);
    await expect(
      rawRepository.applyTransition(
        classified,
        otherBoundary.issue('other-process'),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED_WRITER' });
    await expect(repository.applyTransition(classified)).resolves.toBe(
      'APPLIED',
    );
    const quoted = applyEvent(
      classified.aggregate,
      { type: 'QUOTE_VERIFICATION' },
      '2026-07-25T10:00:02.000Z',
    );
    const restrictedBoundary = createPaymentWriterAuthorizationBoundary([
      {
        permittedEffectAdapterIds: [],
        permittedEffectTypes: ['VERIFICATION_QUOTE_REQUEST'],
        permittedFactAdapterIds: [],
        processId: 'restricted-process',
      },
    ]);
    const restrictedRepository = createPostgresPaymentActionRepository(
      sql,
      restrictedBoundary.repositoryTrust,
    );
    await expect(
      restrictedRepository.applyTransition(
        quoted,
        restrictedBoundary.issue('restricted-process'),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED_WRITER' });
    await repository.applyTransition(quoted);
    const payment = createAdapterVerifiedVerificationPayment(
      humanAuthorization,
      {
        adapterId: 'hedera-x402-adapter',
        paidAt: '2026-07-25T10:00:03.000Z',
        paymentAttemptId: 'writer-boundary-payment-attempt',
        paymentNetworkId: 'hedera:296',
        paymentTransactionId: '0.0.1000@1753437603.000000099',
        quoteDigest: '8'.repeat(64),
        quoteId: 'writer-boundary-quote',
        servicePaymentId: 'writer-boundary-payment',
        serviceRequestDigest: '9'.repeat(64),
      },
    );
    const paid = applyEvent(
      quoted.aggregate,
      { payment, type: 'RECORD_VERIFICATION_PAYMENT' },
      '2026-07-25T10:00:03.000Z',
    );
    await expect(
      restrictedRepository.applyTransition(
        paid,
        restrictedBoundary.issue('restricted-process'),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED_WRITER' });
  });

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
    const quoteEffect = quoted.effects[0];
    if (
      quoteEffect === undefined ||
      quoteEffect.type !== 'VERIFICATION_QUOTE_REQUEST'
    ) {
      throw new Error('quote transition must carry its request');
    }

    await expect(
      repository.applyTransition({ ...quoted, effects: [] }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(
      repository.applyTransition({
        ...quoted,
        effects: [
          {
            ...quoteEffect,
            serviceKeyId: 'substituted-but-same-effect-type',
          },
        ],
      }),
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
    await expect(
      repository.applyTransition({
        ...quoted,
        effects: [
          {
            ...quoteEffect,
            serviceKeyId: 'substituted-after-durable-apply',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

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

  it('re-enqueues an exact retry under the original logical outbox identity', async () => {
    await resetPaymentData();
    const queued = await seedMandateSettlementSubmission(
      'settlement-retry-attempt',
    );
    const attempt = queued.aggregate.settlementAttempt;
    const basis = queued.aggregate.authorizationBasis;
    if (attempt === null || basis === null || basis.kind !== 'MANDATE') {
      throw new Error('retry seed must retain its attempt and mandate basis');
    }
    const uncertainty = createAdapterVerifiedSettlementUncertainty(
      authorization,
      attempt,
      {
        adapterId: 'hedera-settlement-adapter',
        observedAt: '2026-07-25T10:00:06.000Z',
        reason: 'SUBMISSION_RESULT_UNKNOWN',
        uncertaintyId: 'settlement-retry-uncertainty',
      },
    );
    const recovery = applyEvent(
      queued.aggregate,
      { type: 'START_SETTLEMENT_RECOVERY', uncertainty },
      '2026-07-25T10:00:06.000Z',
    );
    await repository.applyTransition(recovery);
    const retried = applyEvent(
      recovery.aggregate,
      {
        approvals: null,
        mandate: activeMandateAggregate,
        requestingAgent: requestingAgent(
          authorization,
          '2026-07-25T10:00:07.000Z',
        ),
        reservationLedger: basis.reservedLedger,
        type: 'RETRY_SAME_TRANSACTION',
      },
      '2026-07-25T10:00:07.000Z',
    );
    const initialEffect = queued.effects[0];
    const retryEffect = retried.effects[0];
    if (
      initialEffect === undefined ||
      retryEffect === undefined ||
      !('eventId' in initialEffect) ||
      !('eventId' in retryEffect)
    ) {
      throw new Error('settlement requests must carry event identities');
    }
    expect(retryEffect.eventId).toBe(initialEffect.eventId);
    await repository.applyTransition(retried);

    const rows = await sql<
      readonly Readonly<{
        effect_type: string;
        event_id: string;
        first_atomic_group_key: string;
        last_atomic_group_key: string;
      }>[]
    >`
      SELECT
        event_id,
        effect_type,
        first_atomic_group_key,
        last_atomic_group_key
      FROM outbox_events
    `;
    expect(rows).toEqual([
      {
        effect_type: 'SETTLEMENT_RETRY_REQUEST',
        event_id: initialEffect.eventId,
        first_atomic_group_key: queued.atomicGroupKey,
        last_atomic_group_key: retried.atomicGroupKey,
      },
    ]);
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
    const reservationEffect = authorized.effects[0];
    if (
      reservationEffect === undefined ||
      reservationEffect.type !== 'MANDATE_RESERVATION_WRITE'
    ) {
      throw new Error('mandate authorization must reserve capacity');
    }

    await expect(
      repository.applyTransition({
        ...authorized,
        effects: [
          {
            ...reservationEffect,
            claim: {
              ...reservationEffect.claim,
              settlementAmountAtoms: '1',
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
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
    const substitutedAuditEffects = settled.effects.map((effect) =>
      effect.type === 'EXECUTION_AUDIT_REQUEST'
        ? {
            ...effect,
            receiptId: 'substituted-but-same-effect-type',
          }
        : effect,
    );

    await expect(
      repository.applyTransition({
        ...settled,
        effects: substitutedAuditEffects,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
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
  it('claims, releases, and acknowledges an event derived from a maximum-length input', async () => {
    await resetPaymentData();
    const queued = await seedMandateSettlementSubmission('a'.repeat(512));
    const effect = queued.effects[0];
    if (effect === undefined || !('eventId' in effect)) {
      throw new Error('settlement submission must carry an event identity');
    }
    expect(isPaymentDomainEventId(effect.eventId)).toBe(true);
    expect(effect.eventId.length).toBeLessThanOrEqual(256);

    const first = await outbox.claimNext('max-input-worker-a', 30);
    if (first === null) {
      throw new Error('maximum-input event must be claimable');
    }
    expect(first.eventId).toBe(effect.eventId);
    await outbox.release(
      first.organizationId,
      first.eventId,
      first.leaseToken,
      0,
    );
    const second = await outbox.claimNext('max-input-worker-b', 30);
    if (second === null) {
      throw new Error('released maximum-input event must be reclaimable');
    }
    expect(second.eventId).toBe(effect.eventId);
    await outbox.acknowledge(
      second.organizationId,
      second.eventId,
      second.leaseToken,
    );
    await expect(
      outbox.claimNext('max-input-worker-c', 30),
    ).resolves.toBeNull();
  });

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
