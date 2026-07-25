import { describe, expect, it } from 'vitest';

import { paymentPersistenceUniquenessContract } from '../src/index.js';

describe('payment persistence uniqueness contract', () => {
  it('names every one-use business and settlement identity', () => {
    const names = paymentPersistenceUniquenessContract.uniqueKeys.map(
      ({ name }) => name,
    );
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'one_nonterminal_action_per_obligation',
        'one_settlement_per_obligation',
        'one_action_per_invoice_revision',
        'payment_action_nonce',
        'settlement_idempotency_key',
        'outbox_event_identity',
        'settlement_attempt_identity',
        'settlement_receipt_identity',
        'settlement_consumption_claim_identity',
        'standing_mandate_version_identity',
        'mandate_reservation_action',
        'approval_identity',
        'approval_decision_identity',
        'approval_session_identity',
        'world_proof_identity',
        'agentkit_challenge_identity',
        'approval_consumption_identity',
        'approval_subject_per_action',
        'approval_agentbook_principal_per_action',
        'approval_action_human_principal_per_action',
      ]),
    );
  });

  it('reserves replay and quorum identities in the authorization transaction', () => {
    expect(
      paymentPersistenceUniquenessContract.atomicAuthorizationWrite,
    ).toEqual({
      atomicGroupKeyField: 'transition.atomicGroupKey',
      compareAndSwapField: 'aggregate.metadata.version',
      requiredMembers: [
        'paymentAggregate',
        'requestingAgentChallengeConsumption',
        'mandateReservationMutationWhenApplicable',
        'approvalFactsWhenApplicable',
        'approvalDecisionIdentitiesWhenApplicable',
        'approvalSessionConsumptionsWhenApplicable',
        'worldProofConsumptionsWhenApplicable',
        'approvalAgentKitChallengeConsumptionsWhenApplicable',
        'quorumIdentityClaimsWhenApplicable',
      ],
      transactionIsolation: 'SERIALIZABLE',
    });
  });

  it('persists every requested effect with the aggregate transition', () => {
    expect(
      paymentPersistenceUniquenessContract.atomicEffectOutboxWrite,
    ).toEqual({
      atomicGroupKeyField: 'transition.atomicGroupKey',
      compareAndSwapField: 'aggregate.metadata.version',
      outboxConflictPolicy: 'UPSERT_SAME_EVENT',
      outboxIdentityField: 'effect.eventId',
      requiredMembers: ['paymentAggregate', 'eventIdentifiedOutboxEffects'],
      transactionIsolation: 'SERIALIZABLE',
    });
  });

  it('requires aggregate, consumption, receipt, reservation, and audit outbox writes atomically', () => {
    expect(paymentPersistenceUniquenessContract.atomicPaymentWrite).toEqual({
      atomicGroupKeyField: 'transition.atomicGroupKey',
      compareAndSwapField: 'aggregate.metadata.version',
      outboxConflictPolicy: 'UPSERT_SAME_EVENT',
      outboxIdentityField: 'effect.eventId',
      requiredMembers: [
        'paymentAggregate',
        'settlementConsumptionClaim',
        'settlementReceipt',
        'mandateReservationMutationWhenApplicable',
        'outboxEffects',
      ],
      transactionIsolation: 'SERIALIZABLE',
    });
    expect(paymentPersistenceUniquenessContract.implementationPhase).toBe(
      'POSTGRESQL_V1',
    );
    expect(paymentPersistenceUniquenessContract.schemaVersion).toBe(2);
  });

  it('makes concurrent replay global and quorum claims action-scoped', () => {
    const contractByName = new Map(
      paymentPersistenceUniquenessContract.uniqueKeys.map((key) => [
        key.name,
        key,
      ]),
    );
    for (const [name, identityField] of [
      ['approval_identity', 'approvalId'],
      ['approval_decision_identity', 'decisionId'],
      ['approval_session_identity', 'approvalSessionId'],
      ['world_proof_identity', 'worldProofId'],
      ['agentkit_challenge_identity', 'agentKitChallengeId'],
      ['approval_consumption_identity', 'consumptionClaimId'],
    ] as const) {
      expect(contractByName.get(name)).toEqual({
        fields: ['organizationId', identityField],
        name,
        predicate: null,
      });
    }
    expect(contractByName.get('outbox_event_identity')).toEqual({
      fields: ['organizationId', 'eventId'],
      name: 'outbox_event_identity',
      predicate: null,
    });
    for (const [name, principalField] of [
      ['approval_subject_per_action', 'subjectId'],
      ['approval_agentbook_principal_per_action', 'agentTenantPrincipal'],
      ['approval_action_human_principal_per_action', 'actionHumanPrincipal'],
    ] as const) {
      expect(contractByName.get(name)).toEqual({
        fields: ['organizationId', 'actionDigest', principalField],
        name,
        predicate: null,
      });
    }
  });
});
