import { isDeepStrictEqual } from 'node:util';

import {
  createMandateReservationLedger,
  deriveExpectedPaymentTransitionEffects,
  hydratePaymentActionAggregate,
  transitionPaymentAction,
  type MandateReservationClaim,
  type MandateReservationLedger,
  type MandateReservationWriteEffect,
  type PaymentActionAggregate,
  type PaymentActionTransition,
  type PaymentDomainEffect,
} from '@remit/domain';
import type postgres from 'postgres';

import { mapPostgresError, PersistenceError } from '../errors.js';
import type {
  PaymentActionRepository,
  PaymentPersistenceResult,
  PaymentTransitionCommand,
} from '../payment-repository.js';
import {
  assertAuthorizedPaymentWrite,
  type PaymentWriterAuthorization,
  type PaymentWriterRepositoryTrust,
} from '../payment-writer-authorization.js';

type TransactionSql = postgres.TransactionSql;

type StoredAggregateRow = Readonly<{
  aggregate: unknown;
  aggregate_version: number;
  atomic_group_key: string;
  last_transition_effects: unknown;
  last_transition_input: unknown;
}>;

type StoredLedgerRow = Readonly<{
  ledger_version: number;
  mandate_digest: string;
  period_cap_atoms: string;
  released_atoms: string;
  reserved_atoms: string;
  settled_atoms: string;
}>;

type StoredReservationRow = Readonly<{
  action_digest: string;
  amount_atoms: string;
  reservation_status: 'RELEASED' | 'RESERVED' | 'SETTLED';
}>;

function actionBinding(aggregate: PaymentActionAggregate) {
  const action = aggregate.authorization.actionCore;
  return {
    actionDigest: aggregate.authorization.envelope.actionDigest,
    actionId: action.actionId,
    invoiceRevisionId: action.sourceInvoice.invoiceRevisionId,
    nonce: action.nonce,
    obligationId: action.sourceInvoice.obligationId,
    organizationId: action.organizationId,
  };
}

function atomicGroupKey(aggregate: PaymentActionAggregate): string {
  return `payment:${aggregate.authorization.envelope.actionDigest}:v${aggregate.metadata.version}`;
}

function asJson(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value)) as postgres.JSONValue;
}

function hydrateStoredAggregate(value: unknown): PaymentActionAggregate {
  const hydrated = hydratePaymentActionAggregate(value);
  if (!hydrated.ok) {
    throw new PersistenceError(
      'INVALID_PERSISTED_AGGREGATE',
      'persisted payment aggregate failed domain hydration',
    );
  }
  return hydrated.value;
}

function requireValidTarget(
  transition: PaymentActionTransition,
): PaymentActionAggregate {
  const hydrated = hydratePaymentActionAggregate(transition.aggregate);
  if (
    !hydrated.ok ||
    transition.atomicGroupKey !== atomicGroupKey(transition.aggregate) ||
    transition.effects.some(
      ({ atomicGroupKey: effectGroup }) =>
        effectGroup !== transition.atomicGroupKey,
    )
  ) {
    throw new PersistenceError(
      'INVALID_TRANSITION',
      'transition aggregate, version, effects, and atomic group must agree',
    );
  }
  return hydrated.value;
}

function transitionBody(command: PaymentTransitionCommand) {
  return Object.freeze({
    aggregate: command.aggregate,
    atomicGroupKey: command.atomicGroupKey,
    effects: command.effects,
  });
}

function transitionInput(command: PaymentTransitionCommand) {
  return Object.freeze({
    context: command.context,
    event: command.event,
  });
}

function mandateClaimForTransition(
  current: PaymentActionAggregate,
  target: PaymentActionAggregate,
): MandateReservationClaim | null {
  const eventType = target.metadata.lastEventType;
  if (eventType === 'AUTHORIZE_MANDATE') {
    const basis = target.authorizationBasis;
    return basis?.kind === 'MANDATE' ? basis.reservationClaim : null;
  }
  if (
    (eventType === 'REJECT_AUTHORIZATION' ||
      eventType === 'EXPIRE' ||
      eventType === 'SUPERSEDE' ||
      eventType === 'CANCEL' ||
      eventType === 'SETTLE_CONSENSUS' ||
      eventType === 'RECOVER_SETTLEMENT') &&
    current.authorizationBasis?.kind === 'MANDATE'
  ) {
    return current.authorizationBasis.reservationClaim;
  }
  return null;
}

async function requireExactEffects(
  transaction: TransactionSql,
  current: PaymentActionAggregate,
  target: PaymentActionAggregate,
  effects: readonly PaymentDomainEffect[],
): Promise<void> {
  const organizationId = target.authorization.actionCore.organizationId;
  const mandateClaim = mandateClaimForTransition(current, target);
  const ledger =
    mandateClaim === null
      ? null
      : await lockCurrentMandateLedger(
          transaction,
          organizationId,
          mandateClaim,
        );
  const expected = deriveExpectedPaymentTransitionEffects(
    current,
    target,
    ledger,
  );
  if (!expected.ok || !isDeepStrictEqual(effects, expected.value)) {
    throw new PersistenceError(
      'INVALID_TRANSITION',
      'complete transition effect bodies do not match the locked state change',
    );
  }
}

async function insertPaymentAction(
  transaction: TransactionSql,
  aggregate: PaymentActionAggregate,
): Promise<boolean> {
  const binding = actionBinding(aggregate);
  const rows = await transaction<readonly Readonly<{ action_id: string }>[]>`
    INSERT INTO payment_actions (
      organization_id,
      action_id,
      action_digest,
      obligation_id,
      invoice_revision_id,
      nonce,
      payment_state,
      aggregate_version,
      atomic_group_key,
      aggregate,
      last_transition_effects,
      last_transition_input
    )
    VALUES (
      ${binding.organizationId},
      ${binding.actionId},
      ${binding.actionDigest},
      ${binding.obligationId},
      ${binding.invoiceRevisionId},
      ${binding.nonce},
      ${aggregate.state},
      ${aggregate.metadata.version},
      ${atomicGroupKey(aggregate)},
      ${transaction.json(asJson(aggregate))},
      ${transaction.json([])},
      ${transaction.json({})}
    )
    ON CONFLICT (organization_id, action_id) DO NOTHING
    RETURNING action_id
  `;
  return rows.length === 1;
}

async function selectPaymentActionForUpdate(
  transaction: TransactionSql,
  organizationId: string,
  actionId: string,
): Promise<StoredAggregateRow | null> {
  const rows = await transaction<readonly StoredAggregateRow[]>`
    SELECT
      aggregate,
      aggregate_version,
      atomic_group_key,
      last_transition_effects,
      last_transition_input
    FROM payment_actions
    WHERE organization_id = ${organizationId}
      AND action_id = ${actionId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function insertApprovalFacts(
  transaction: TransactionSql,
  current: PaymentActionAggregate,
  target: PaymentActionAggregate,
  atomicGroup: string,
): Promise<void> {
  if (
    current.authorizationBasis !== null ||
    target.authorizationBasis === null
  ) {
    return;
  }
  const basis = target.authorizationBasis;
  const organizationId = target.authorization.actionCore.organizationId;
  const actionDigest = target.authorization.envelope.actionDigest;
  const approvals = basis.kind === 'HUMAN_APPROVAL' ? basis.approvals : [];

  for (const approval of approvals) {
    await transaction`
      INSERT INTO approval_facts (
        organization_id,
        action_digest,
        approval_id,
        decision_id,
        approval_session_id,
        world_proof_id,
        consumption_claim_id,
        subject_id,
        agent_tenant_principal,
        action_human_principal,
        record_digest,
        atomic_group_key,
        fact
      )
      VALUES (
        ${organizationId},
        ${actionDigest},
        ${approval.approvalId},
        ${approval.decisionId},
        ${approval.approvalSessionId},
        ${approval.worldProofId},
        ${approval.consumptionClaimId},
        ${approval.subjectId},
        ${approval.agentTenantPrincipal},
        ${approval.actionHumanPrincipal},
        ${approval.recordDigest},
        ${atomicGroup},
        ${transaction.json(asJson(approval))}
      )
    `;
    await transaction`
      INSERT INTO agentkit_challenge_consumptions (
        organization_id,
        agentkit_challenge_id,
        action_digest,
        fact_kind,
        fact_record_digest,
        atomic_group_key
      )
      VALUES (
        ${organizationId},
        ${approval.agentKitChallengeId},
        ${actionDigest},
        'APPROVAL',
        ${approval.recordDigest},
        ${atomicGroup}
      )
    `;
  }

  await transaction`
    INSERT INTO agentkit_challenge_consumptions (
      organization_id,
      agentkit_challenge_id,
      action_digest,
      fact_kind,
      fact_record_digest,
      atomic_group_key
    )
    VALUES (
      ${organizationId},
      ${basis.requestingAgent.agentKitChallengeId},
      ${actionDigest},
      'REQUESTING_AGENT',
      ${basis.requestingAgent.recordDigest},
      ${atomicGroup}
    )
  `;
}

async function ensureStandingMandate(
  transaction: TransactionSql,
  target: PaymentActionAggregate,
): Promise<void> {
  const basis = target.authorizationBasis;
  if (basis?.kind !== 'MANDATE') {
    return;
  }
  const mandate = basis.mandate.record;
  const inserted = await transaction<
    readonly Readonly<{ mandate_id: string }>[]
  >`
    INSERT INTO standing_mandate_versions (
      organization_id,
      mandate_id,
      mandate_version,
      mandate_digest,
      mandate
    )
    VALUES (
      ${mandate.organizationId},
      ${mandate.mandateId},
      ${mandate.mandateVersion},
      ${mandate.mandateDigest},
      ${transaction.json(asJson(basis.mandate))}
    )
    ON CONFLICT (
      organization_id,
      mandate_id,
      mandate_version
    ) DO NOTHING
    RETURNING mandate_id
  `;
  if (inserted.length === 1) {
    return;
  }
  const rows = await transaction<
    readonly Readonly<{
      mandate: unknown;
      mandate_digest: string;
    }>[]
  >`
    SELECT mandate, mandate_digest
    FROM standing_mandate_versions
    WHERE organization_id = ${mandate.organizationId}
      AND mandate_id = ${mandate.mandateId}
      AND mandate_version = ${mandate.mandateVersion}
    FOR UPDATE
  `;
  if (
    rows.length !== 1 ||
    rows[0]?.mandate_digest !== mandate.mandateDigest ||
    !isDeepStrictEqual(rows[0].mandate, basis.mandate)
  ) {
    throw new PersistenceError(
      'MANDATE_LEDGER_CONFLICT',
      'standing mandate version conflicts with the persisted version',
    );
  }
}

function totals(ledger: MandateReservationLedger) {
  let released = 0n;
  let reserved = 0n;
  let settled = 0n;
  for (const entry of ledger.entries) {
    const amount = BigInt(entry.amountAtoms);
    if (entry.status === 'RELEASED') {
      released += amount;
    } else if (entry.status === 'RESERVED') {
      reserved += amount;
    } else {
      settled += amount;
    }
  }
  return {
    released: released.toString(),
    reserved: reserved.toString(),
    settled: settled.toString(),
  };
}

function ledgerEntries(
  rows: readonly StoredReservationRow[],
): MandateReservationLedger['entries'] {
  return rows.map((row) => ({
    actionDigest: row.action_digest,
    amountAtoms: row.amount_atoms,
    status: row.reservation_status,
  }));
}

function ledgerCoreMatches(
  ledger: MandateReservationLedger,
  claim: MandateReservationWriteEffect['claim'],
): boolean {
  return (
    ledger.mandateDigest === claim.mandateDigest &&
    ledger.mandateId === claim.mandateId &&
    ledger.mandateVersion === claim.mandateVersion &&
    ledger.periodCapAtoms === claim.periodCapAtoms &&
    ledger.periodKey === claim.periodKey
  );
}

async function selectLedger(
  transaction: TransactionSql,
  organizationId: string,
  claim: MandateReservationClaim,
): Promise<{
  ledger: StoredLedgerRow;
  reservations: readonly StoredReservationRow[];
}> {
  const ledgers = await transaction<readonly StoredLedgerRow[]>`
    SELECT
      ledger_version,
      mandate_digest,
      period_cap_atoms::text,
      released_atoms::text,
      reserved_atoms::text,
      settled_atoms::text
    FROM mandate_period_ledgers
    WHERE organization_id = ${organizationId}
      AND mandate_id = ${claim.mandateId}
      AND mandate_version = ${claim.mandateVersion}
      AND period_key = ${claim.periodKey}
    FOR UPDATE
  `;
  const ledger = ledgers[0];
  if (ledger === undefined) {
    throw new PersistenceError(
      'MANDATE_LEDGER_CONFLICT',
      'mandate period ledger does not exist',
    );
  }
  const reservations = await transaction<readonly StoredReservationRow[]>`
    SELECT
      action_digest,
      amount_atoms::text,
      reservation_status
    FROM mandate_reservations
    WHERE organization_id = ${organizationId}
      AND mandate_id = ${claim.mandateId}
      AND mandate_version = ${claim.mandateVersion}
      AND period_key = ${claim.periodKey}
    ORDER BY action_digest
  `;
  return { ledger, reservations };
}

async function lockCurrentMandateLedger(
  transaction: TransactionSql,
  organizationId: string,
  claim: MandateReservationClaim,
): Promise<MandateReservationLedger> {
  const rows = await transaction<readonly StoredLedgerRow[]>`
    SELECT
      ledger_version,
      mandate_digest,
      period_cap_atoms::text,
      released_atoms::text,
      reserved_atoms::text,
      settled_atoms::text
    FROM mandate_period_ledgers
    WHERE organization_id = ${organizationId}
      AND mandate_id = ${claim.mandateId}
      AND mandate_version = ${claim.mandateVersion}
      AND period_key = ${claim.periodKey}
    FOR UPDATE
  `;
  const stored = rows[0];
  if (stored === undefined) {
    const empty = createMandateReservationLedger(claim);
    if (!empty.ok) {
      throw new PersistenceError(
        'MANDATE_LEDGER_CONFLICT',
        'mandate claim cannot initialize a period ledger',
      );
    }
    return empty.value;
  }
  const reservations = await transaction<readonly StoredReservationRow[]>`
    SELECT
      action_digest,
      amount_atoms::text,
      reservation_status
    FROM mandate_reservations
    WHERE organization_id = ${organizationId}
      AND mandate_id = ${claim.mandateId}
      AND mandate_version = ${claim.mandateVersion}
      AND period_key = ${claim.periodKey}
    ORDER BY action_digest
  `;
  return Object.freeze({
    entries: Object.freeze(ledgerEntries(reservations)),
    mandateDigest: stored.mandate_digest,
    mandateId: claim.mandateId,
    mandateVersion: claim.mandateVersion,
    periodCapAtoms: stored.period_cap_atoms,
    periodKey: claim.periodKey,
  });
}

async function applyMandateReservation(
  transaction: TransactionSql,
  target: PaymentActionAggregate,
  effect: MandateReservationWriteEffect,
): Promise<void> {
  const organizationId = target.authorization.actionCore.organizationId;
  const claim = effect.claim;
  if (
    !ledgerCoreMatches(effect.expectedLedger, claim) ||
    !ledgerCoreMatches(effect.nextLedger, claim)
  ) {
    throw new PersistenceError(
      'MANDATE_LEDGER_CONFLICT',
      'mandate reservation effect does not bind one ledger',
    );
  }

  const existing = await transaction<readonly Readonly<{ present: number }>[]>`
    SELECT 1 AS present
    FROM mandate_period_ledgers
    WHERE organization_id = ${organizationId}
      AND mandate_id = ${claim.mandateId}
      AND mandate_version = ${claim.mandateVersion}
      AND period_key = ${claim.periodKey}
    FOR UPDATE
  `;
  if (existing.length === 0) {
    if (effect.expectedLedger.entries.length !== 0) {
      throw new PersistenceError(
        'MANDATE_LEDGER_CONFLICT',
        'a nonempty expected mandate ledger cannot be created implicitly',
      );
    }
    await transaction`
      INSERT INTO mandate_period_ledgers (
        organization_id,
        mandate_id,
        mandate_version,
        period_key,
        mandate_digest,
        period_cap_atoms
      )
      VALUES (
        ${organizationId},
        ${claim.mandateId},
        ${claim.mandateVersion},
        ${claim.periodKey},
        ${claim.mandateDigest},
        ${claim.periodCapAtoms}
      )
    `;
  }

  const before = await selectLedger(transaction, organizationId, claim);
  const expectedTotals = totals(effect.expectedLedger);
  if (
    before.ledger.mandate_digest !== claim.mandateDigest ||
    before.ledger.period_cap_atoms !== claim.periodCapAtoms ||
    before.ledger.released_atoms !== expectedTotals.released ||
    before.ledger.reserved_atoms !== expectedTotals.reserved ||
    before.ledger.settled_atoms !== expectedTotals.settled ||
    !isDeepStrictEqual(
      ledgerEntries(before.reservations),
      effect.expectedLedger.entries,
    )
  ) {
    throw new PersistenceError(
      'MANDATE_LEDGER_CONFLICT',
      'locked mandate ledger does not match the transition expectation',
    );
  }

  if (effect.operation === 'RESERVE') {
    await transaction`
      INSERT INTO mandate_reservations (
        organization_id,
        mandate_id,
        mandate_version,
        period_key,
        action_digest,
        amount_atoms,
        reservation_status,
        atomic_group_key
      )
      VALUES (
        ${organizationId},
        ${claim.mandateId},
        ${claim.mandateVersion},
        ${claim.periodKey},
        ${claim.actionDigest},
        ${claim.settlementAmountAtoms},
        'RESERVED',
        ${effect.atomicGroupKey}
      )
    `;
  } else {
    const receiptId =
      effect.operation === 'SETTLE'
        ? target.settlementReceipt?.receiptId
        : undefined;
    if (effect.operation === 'SETTLE' && receiptId === undefined) {
      throw new PersistenceError(
        'MANDATE_LEDGER_CONFLICT',
        'settled mandate reservation requires the atomic receipt',
      );
    }
    const reservations = await transaction<
      readonly Readonly<{ action_digest: string }>[]
    >`
      UPDATE mandate_reservations
      SET
        reservation_status = ${
          effect.operation === 'SETTLE' ? 'SETTLED' : 'RELEASED'
        },
        atomic_group_key = ${effect.atomicGroupKey},
        receipt_id = ${receiptId ?? null},
        updated_at = transaction_timestamp()
      WHERE organization_id = ${organizationId}
        AND mandate_id = ${claim.mandateId}
        AND mandate_version = ${claim.mandateVersion}
        AND period_key = ${claim.periodKey}
        AND action_digest = ${claim.actionDigest}
        AND amount_atoms = ${claim.settlementAmountAtoms}
        AND reservation_status = 'RESERVED'
      RETURNING action_digest
    `;
    if (reservations.length !== 1) {
      throw new PersistenceError(
        'MANDATE_LEDGER_CONFLICT',
        'mandate reservation is missing, terminal, or amount-mismatched',
      );
    }
  }

  const amount = claim.settlementAmountAtoms;
  const updates =
    effect.operation === 'RESERVE'
      ? await transaction<readonly Readonly<{ ledger_version: number }>[]>`
          UPDATE mandate_period_ledgers
          SET
            reserved_atoms = reserved_atoms + ${amount},
            ledger_version = ledger_version + 1,
            updated_at = transaction_timestamp()
          WHERE organization_id = ${organizationId}
            AND mandate_id = ${claim.mandateId}
            AND mandate_version = ${claim.mandateVersion}
            AND period_key = ${claim.periodKey}
            AND reserved_atoms + settled_atoms + ${amount} <= period_cap_atoms
          RETURNING ledger_version
        `
      : effect.operation === 'SETTLE'
        ? await transaction<readonly Readonly<{ ledger_version: number }>[]>`
            UPDATE mandate_period_ledgers
            SET
              reserved_atoms = reserved_atoms - ${amount},
              settled_atoms = settled_atoms + ${amount},
              ledger_version = ledger_version + 1,
              updated_at = transaction_timestamp()
            WHERE organization_id = ${organizationId}
              AND mandate_id = ${claim.mandateId}
              AND mandate_version = ${claim.mandateVersion}
              AND period_key = ${claim.periodKey}
              AND reserved_atoms >= ${amount}
            RETURNING ledger_version
          `
        : await transaction<readonly Readonly<{ ledger_version: number }>[]>`
            UPDATE mandate_period_ledgers
            SET
              reserved_atoms = reserved_atoms - ${amount},
              released_atoms = released_atoms + ${amount},
              ledger_version = ledger_version + 1,
              updated_at = transaction_timestamp()
            WHERE organization_id = ${organizationId}
              AND mandate_id = ${claim.mandateId}
              AND mandate_version = ${claim.mandateVersion}
              AND period_key = ${claim.periodKey}
              AND reserved_atoms >= ${amount}
            RETURNING ledger_version
          `;
  if (updates.length !== 1) {
    throw new PersistenceError(
      'MANDATE_LEDGER_CONFLICT',
      'mandate period cap or reservation totals rejected the mutation',
    );
  }

  const after = await selectLedger(transaction, organizationId, claim);
  const nextTotals = totals(effect.nextLedger);
  if (
    after.ledger.released_atoms !== nextTotals.released ||
    after.ledger.reserved_atoms !== nextTotals.reserved ||
    after.ledger.settled_atoms !== nextTotals.settled ||
    !isDeepStrictEqual(
      ledgerEntries(after.reservations),
      effect.nextLedger.entries,
    )
  ) {
    throw new PersistenceError(
      'MANDATE_LEDGER_CONFLICT',
      'persisted mandate mutation does not match the domain result',
    );
  }
}

function outboxEffect(
  effect: PaymentDomainEffect,
): effect is Extract<PaymentDomainEffect, { eventId: string }> {
  return 'eventId' in effect;
}

function effectFamily(
  effect: Extract<PaymentDomainEffect, { eventId: string }>,
): 'EXECUTION_AUDIT' | 'SETTLEMENT_SUBMISSION' | 'VERIFICATION_QUOTE' {
  if (effect.type === 'EXECUTION_AUDIT_REQUEST') {
    return 'EXECUTION_AUDIT';
  }
  if (effect.type === 'VERIFICATION_QUOTE_REQUEST') {
    return 'VERIFICATION_QUOTE';
  }
  return 'SETTLEMENT_SUBMISSION';
}

function immutableOutboxBinding(
  effect: Extract<PaymentDomainEffect, { eventId: string }>,
): postgres.JSONValue {
  if (effect.type === 'VERIFICATION_QUOTE_REQUEST') {
    return asJson({
      actionDigest: effect.actionDigest,
      evidencePolicyDigest: effect.evidencePolicyDigest,
      idempotencyKey: effect.idempotencyKey,
      serviceId: effect.serviceId,
      serviceKeyId: effect.serviceKeyId,
      serviceNetworkId: effect.serviceNetworkId,
    });
  }
  if (effect.type === 'EXECUTION_AUDIT_REQUEST') {
    const { atomicGroupKey: ignored, ...binding } = effect;
    void ignored;
    return asJson(binding);
  }
  const attempt = effect.attempt;
  return asJson({
    actionDigest: attempt.actionDigest,
    attemptId: attempt.attemptId,
    effectDigest: attempt.effectDigest,
    idempotencyKey: attempt.idempotencyKey,
    networkId: attempt.networkId,
    recordDigest: attempt.recordDigest,
    signedBytesHash: attempt.signedBytesHash,
    transactionId: attempt.transactionId,
  });
}

async function upsertOutbox(
  transaction: TransactionSql,
  organizationId: string,
  actionDigest: string,
  atomicGroup: string,
  effect: Extract<PaymentDomainEffect, { eventId: string }>,
): Promise<void> {
  const rows = await transaction<readonly Readonly<{ event_id: string }>[]>`
    INSERT INTO outbox_events (
      organization_id,
      event_id,
      action_digest,
      effect_type,
      effect_family,
      idempotency_key,
      immutable_binding,
      payload,
      first_atomic_group_key,
      last_atomic_group_key
    )
    VALUES (
      ${organizationId},
      ${effect.eventId},
      ${actionDigest},
      ${effect.type},
      ${effectFamily(effect)},
      ${effect.idempotencyKey},
      ${transaction.json(immutableOutboxBinding(effect))},
      ${transaction.json(asJson(effect))},
      ${atomicGroup},
      ${atomicGroup}
    )
    ON CONFLICT ON CONSTRAINT outbox_event_identity DO UPDATE
    SET
      effect_type = EXCLUDED.effect_type,
      payload = EXCLUDED.payload,
      last_atomic_group_key = EXCLUDED.last_atomic_group_key,
      delivery_status = 'PENDING',
      available_at = transaction_timestamp(),
      lease_token = NULL,
      lease_owner = NULL,
      lease_expires_at = NULL,
      delivered_at = NULL,
      updated_at = transaction_timestamp()
    WHERE outbox_events.immutable_binding = EXCLUDED.immutable_binding
      AND (
        outbox_events.delivery_status <> 'LEASED'
        OR outbox_events.lease_expires_at <= transaction_timestamp()
      )
    RETURNING event_id
  `;
  if (rows.length !== 1) {
    throw new PersistenceError(
      'OUTBOX_EVENT_CONFLICT',
      'outbox event is leased or has a different immutable binding',
    );
  }
}

async function insertSettlementAttempt(
  transaction: TransactionSql,
  current: PaymentActionAggregate,
  target: PaymentActionAggregate,
  atomicGroup: string,
): Promise<void> {
  const attempt = target.settlementAttempt;
  if (attempt === null || current.settlementAttempt !== null) {
    return;
  }
  const organizationId = target.authorization.actionCore.organizationId;
  const inserted = await transaction<
    readonly Readonly<{ attempt_id: string }>[]
  >`
    INSERT INTO settlement_attempts (
      organization_id,
      attempt_id,
      action_digest,
      idempotency_key,
      transaction_id,
      signed_bytes_hash,
      effect_digest,
      network_id,
      adapter_id,
      atomic_group_key,
      attempt
    )
    VALUES (
      ${organizationId},
      ${attempt.attemptId},
      ${attempt.actionDigest},
      ${attempt.idempotencyKey},
      ${attempt.transactionId},
      ${attempt.signedBytesHash},
      ${attempt.effectDigest},
      ${attempt.networkId},
      ${attempt.adapterId},
      ${atomicGroup},
      ${transaction.json(asJson(attempt))}
    )
    ON CONFLICT (organization_id, attempt_id) DO NOTHING
    RETURNING attempt_id
  `;
  if (inserted.length === 1) {
    return;
  }
  const rows = await transaction<readonly Readonly<{ attempt: unknown }>[]>`
    SELECT attempt
    FROM settlement_attempts
    WHERE organization_id = ${organizationId}
      AND attempt_id = ${attempt.attemptId}
  `;
  if (rows.length !== 1 || !isDeepStrictEqual(rows[0]?.attempt, attempt)) {
    throw new PersistenceError(
      'UNIQUE_IDENTITY_CONFLICT',
      'settlement attempt identity is bound to different bytes',
      'settlement_attempt_identity',
    );
  }
}

async function insertSettlementResult(
  transaction: TransactionSql,
  current: PaymentActionAggregate,
  target: PaymentActionAggregate,
  atomicGroup: string,
): Promise<void> {
  const receipt = target.settlementReceipt;
  const claim = target.consumptionClaim;
  if (
    (receipt === null && claim === null) ||
    (current.settlementReceipt !== null && current.consumptionClaim !== null)
  ) {
    return;
  }
  if (
    receipt === null ||
    claim === null ||
    claim.expectedAggregateVersion !== target.metadata.version - 1 ||
    claim.atomicGroupKey !== atomicGroup
  ) {
    throw new PersistenceError(
      'INVALID_TRANSITION',
      'settlement receipt and consumption claim must share the transition CAS',
    );
  }
  const organizationId = target.authorization.actionCore.organizationId;
  await transaction`
    INSERT INTO settlement_receipts (
      organization_id,
      receipt_id,
      attempt_id,
      action_digest,
      transaction_id,
      signed_bytes_hash,
      effect_digest,
      network_id,
      adapter_id,
      atomic_group_key,
      receipt
    )
    VALUES (
      ${organizationId},
      ${receipt.receiptId},
      ${receipt.attemptId},
      ${receipt.actionDigest},
      ${receipt.transactionId},
      ${receipt.signedBytesHash},
      ${receipt.effectDigest},
      ${receipt.networkId},
      ${receipt.adapterId},
      ${atomicGroup},
      ${transaction.json(asJson(receipt))}
    )
  `;
  await transaction`
    INSERT INTO settlement_consumptions (
      organization_id,
      claim_id,
      obligation_id,
      action_digest,
      attempt_id,
      receipt_id,
      transaction_id,
      network_id,
      signed_bytes_hash,
      effect_digest,
      attempt_adapter_id,
      claim_adapter_id,
      consumption_status,
      expected_aggregate_version,
      atomic_group_key,
      claim
    )
    VALUES (
      ${organizationId},
      ${claim.claimId},
      ${claim.obligationId},
      ${claim.actionDigest},
      ${claim.attemptId},
      ${claim.receiptId},
      ${receipt.transactionId},
      ${receipt.networkId},
      ${receipt.signedBytesHash},
      ${receipt.effectDigest},
      ${receipt.attemptAdapterId},
      ${claim.adapterId},
      ${claim.status},
      ${claim.expectedAggregateVersion},
      ${atomicGroup},
      ${transaction.json(asJson(claim))}
    )
  `;
}

async function updatePaymentAction(
  transaction: TransactionSql,
  command: PaymentTransitionCommand,
  expectedVersion: number,
  atomicGroup: string,
): Promise<void> {
  const target = command.aggregate;
  const binding = actionBinding(target);
  const rows = await transaction<readonly Readonly<{ action_id: string }>[]>`
    UPDATE payment_actions
    SET
      payment_state = ${target.state},
      aggregate_version = ${target.metadata.version},
      atomic_group_key = ${atomicGroup},
      aggregate = ${transaction.json(asJson(target))},
      last_transition_effects = ${transaction.json(asJson(command.effects))},
      last_transition_input = ${transaction.json(
        asJson(transitionInput(command)),
      )},
      updated_at = transaction_timestamp()
    WHERE organization_id = ${binding.organizationId}
      AND action_id = ${binding.actionId}
      AND aggregate_version = ${expectedVersion}
    RETURNING action_id
  `;
  if (rows.length !== 1) {
    throw new PersistenceError(
      'STALE_AGGREGATE_VERSION',
      'payment aggregate version changed before commit',
    );
  }
}

export function createPostgresPaymentActionRepository(
  sql: postgres.Sql,
  writerTrust: PaymentWriterRepositoryTrust,
): PaymentActionRepository {
  return Object.freeze({
    async create(
      aggregate: PaymentActionAggregate,
    ): Promise<PaymentPersistenceResult> {
      const hydrated = hydratePaymentActionAggregate(aggregate);
      if (
        !hydrated.ok ||
        aggregate.metadata.version !== 1 ||
        aggregate.state !== 'CAPTURED'
      ) {
        throw new PersistenceError(
          'INVALID_TRANSITION',
          'payment admission requires a hydrated version-one captured aggregate',
        );
      }
      const binding = actionBinding(aggregate);
      try {
        return await sql.begin(
          'isolation level serializable',
          async (transaction) => {
            if (await insertPaymentAction(transaction, aggregate)) {
              return 'APPLIED';
            }
            const stored = await selectPaymentActionForUpdate(
              transaction,
              binding.organizationId,
              binding.actionId,
            );
            if (
              stored !== null &&
              stored.atomic_group_key === atomicGroupKey(aggregate) &&
              isDeepStrictEqual(
                hydrateStoredAggregate(stored.aggregate),
                aggregate,
              )
            ) {
              return 'ALREADY_APPLIED';
            }
            throw new PersistenceError(
              'UNIQUE_IDENTITY_CONFLICT',
              'payment action identity is already bound to another aggregate',
              'payment_action_identity',
            );
          },
        );
      } catch (error) {
        return mapPostgresError(error);
      }
    },

    async findById(
      organizationId: string,
      actionId: string,
    ): Promise<PaymentActionAggregate | null> {
      const rows = await sql<readonly Readonly<{ aggregate: unknown }>[]>`
        SELECT aggregate
        FROM payment_actions
        WHERE organization_id = ${organizationId}
          AND action_id = ${actionId}
      `;
      return rows[0] === undefined
        ? null
        : hydrateStoredAggregate(rows[0].aggregate);
    },

    async applyTransition(
      command: PaymentTransitionCommand,
      authorization: PaymentWriterAuthorization,
    ): Promise<PaymentPersistenceResult> {
      const transition = transitionBody(command);
      const target = requireValidTarget(transition);
      const binding = actionBinding(target);
      const expectedVersion = target.metadata.version - 1;
      try {
        return await sql.begin(
          'isolation level serializable',
          async (transaction) => {
            const stored = await selectPaymentActionForUpdate(
              transaction,
              binding.organizationId,
              binding.actionId,
            );
            if (stored === null) {
              throw new PersistenceError(
                'STALE_AGGREGATE_VERSION',
                'payment aggregate does not exist',
              );
            }
            const current = hydrateStoredAggregate(stored.aggregate);
            assertAuthorizedPaymentWrite(
              writerTrust,
              authorization,
              current,
              target,
              transition.effects,
            );
            if (
              stored.aggregate_version === target.metadata.version &&
              stored.atomic_group_key === transition.atomicGroupKey &&
              isDeepStrictEqual(current, target) &&
              isDeepStrictEqual(
                stored.last_transition_effects,
                transition.effects,
              ) &&
              isDeepStrictEqual(
                stored.last_transition_input,
                transitionInput(command),
              )
            ) {
              return 'ALREADY_APPLIED';
            }
            if (
              stored.aggregate_version === target.metadata.version &&
              stored.atomic_group_key === transition.atomicGroupKey &&
              isDeepStrictEqual(current, target)
            ) {
              throw new PersistenceError(
                'INVALID_TRANSITION',
                'idempotent replay effects differ from the durable transition',
              );
            }
            if (stored.aggregate_version !== expectedVersion) {
              throw new PersistenceError(
                'STALE_AGGREGATE_VERSION',
                'payment aggregate version changed before transition',
              );
            }
            if (
              target.metadata.previousState !== current.state ||
              target.metadata.transitionCount !==
                current.metadata.transitionCount + 1
            ) {
              throw new PersistenceError(
                'INVALID_TRANSITION',
                'target metadata does not follow the locked aggregate',
              );
            }
            const recomputed = transitionPaymentAction(
              current,
              command.event,
              command.context,
            );
            if (
              !recomputed.ok ||
              !isDeepStrictEqual(recomputed.value, transition)
            ) {
              throw new PersistenceError(
                'INVALID_TRANSITION',
                'complete target aggregate and effects are not the canonical reducer successor',
              );
            }
            await requireExactEffects(
              transaction,
              current,
              target,
              transition.effects,
            );

            await insertApprovalFacts(
              transaction,
              current,
              target,
              transition.atomicGroupKey,
            );
            await ensureStandingMandate(transaction, target);
            await insertSettlementAttempt(
              transaction,
              current,
              target,
              transition.atomicGroupKey,
            );
            await insertSettlementResult(
              transaction,
              current,
              target,
              transition.atomicGroupKey,
            );
            for (const effect of transition.effects) {
              if (effect.type === 'MANDATE_RESERVATION_WRITE') {
                await applyMandateReservation(transaction, target, effect);
              }
              if (outboxEffect(effect)) {
                await upsertOutbox(
                  transaction,
                  binding.organizationId,
                  binding.actionDigest,
                  transition.atomicGroupKey,
                  effect,
                );
              }
            }
            await updatePaymentAction(
              transaction,
              command,
              expectedVersion,
              transition.atomicGroupKey,
            );
            return 'APPLIED';
          },
        );
      } catch (error) {
        return mapPostgresError(error);
      }
    },
  });
}
