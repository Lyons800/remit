export type PersistenceUniqueKey = Readonly<{
  fields: readonly string[];
  name: string;
  predicate: string | null;
}>;

export type PaymentPersistenceUniquenessContract = Readonly<{
  atomicAuthorizationWrite: Readonly<{
    atomicGroupKeyField: 'transition.atomicGroupKey';
    compareAndSwapField: 'aggregate.metadata.version';
    requiredMembers: readonly [
      'paymentAggregate',
      'requestingAgentChallengeConsumption',
      'mandateReservationMutationWhenApplicable',
      'approvalFactsWhenApplicable',
      'approvalDecisionIdentitiesWhenApplicable',
      'approvalSessionConsumptionsWhenApplicable',
      'worldProofConsumptionsWhenApplicable',
      'approvalAgentKitChallengeConsumptionsWhenApplicable',
      'quorumIdentityClaimsWhenApplicable',
    ];
    transactionIsolation: 'SERIALIZABLE';
  }>;
  atomicEffectOutboxWrite: Readonly<{
    atomicGroupKeyField: 'transition.atomicGroupKey';
    compareAndSwapField: 'aggregate.metadata.version';
    outboxConflictPolicy: 'UPSERT_SAME_EVENT';
    outboxIdentityField: 'effect.eventId';
    requiredMembers: readonly [
      'paymentAggregate',
      'eventIdentifiedOutboxEffects',
    ];
    transactionIsolation: 'SERIALIZABLE';
  }>;
  atomicPaymentWrite: Readonly<{
    atomicGroupKeyField: 'transition.atomicGroupKey';
    compareAndSwapField: 'aggregate.metadata.version';
    outboxConflictPolicy: 'UPSERT_SAME_EVENT';
    outboxIdentityField: 'effect.eventId';
    requiredMembers: readonly [
      'paymentAggregate',
      'settlementConsumptionClaim',
      'settlementReceipt',
      'mandateReservationMutationWhenApplicable',
      'outboxEffects',
    ];
    transactionIsolation: 'SERIALIZABLE';
  }>;
  implementationPhase: 'PR3_DATABASE_CONSTRAINTS';
  schemaVersion: 2;
  uniqueKeys: readonly PersistenceUniqueKey[];
}>;

export const paymentPersistenceUniquenessContract: PaymentPersistenceUniquenessContract =
  Object.freeze({
    atomicAuthorizationWrite: Object.freeze({
      atomicGroupKeyField: 'transition.atomicGroupKey',
      compareAndSwapField: 'aggregate.metadata.version',
      requiredMembers: Object.freeze([
        'paymentAggregate',
        'requestingAgentChallengeConsumption',
        'mandateReservationMutationWhenApplicable',
        'approvalFactsWhenApplicable',
        'approvalDecisionIdentitiesWhenApplicable',
        'approvalSessionConsumptionsWhenApplicable',
        'worldProofConsumptionsWhenApplicable',
        'approvalAgentKitChallengeConsumptionsWhenApplicable',
        'quorumIdentityClaimsWhenApplicable',
      ] as const),
      transactionIsolation: 'SERIALIZABLE',
    }),
    atomicEffectOutboxWrite: Object.freeze({
      atomicGroupKeyField: 'transition.atomicGroupKey',
      compareAndSwapField: 'aggregate.metadata.version',
      outboxConflictPolicy: 'UPSERT_SAME_EVENT',
      outboxIdentityField: 'effect.eventId',
      requiredMembers: Object.freeze([
        'paymentAggregate',
        'eventIdentifiedOutboxEffects',
      ] as const),
      transactionIsolation: 'SERIALIZABLE',
    }),
    atomicPaymentWrite: Object.freeze({
      atomicGroupKeyField: 'transition.atomicGroupKey',
      compareAndSwapField: 'aggregate.metadata.version',
      outboxConflictPolicy: 'UPSERT_SAME_EVENT',
      outboxIdentityField: 'effect.eventId',
      requiredMembers: Object.freeze([
        'paymentAggregate',
        'settlementConsumptionClaim',
        'settlementReceipt',
        'mandateReservationMutationWhenApplicable',
        'outboxEffects',
      ] as const),
      transactionIsolation: 'SERIALIZABLE',
    }),
    implementationPhase: 'PR3_DATABASE_CONSTRAINTS',
    schemaVersion: 2,
    uniqueKeys: Object.freeze([
      Object.freeze({
        fields: Object.freeze(['organizationId', 'actionId']),
        name: 'payment_action_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'actionDigest']),
        name: 'payment_action_digest',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'obligationId']),
        name: 'one_nonterminal_action_per_obligation',
        predicate: 'payment_state NOT IN terminal_payment_states',
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'obligationId']),
        name: 'one_settlement_per_obligation',
        predicate: 'settlement_consumption_status = CONSUMED',
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'invoiceRevisionId']),
        name: 'one_action_per_invoice_revision',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'nonce']),
        name: 'payment_action_nonce',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'idempotencyKey']),
        name: 'settlement_idempotency_key',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'eventId']),
        name: 'outbox_event_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'attemptId']),
        name: 'settlement_attempt_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'receiptId']),
        name: 'settlement_receipt_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'claimId']),
        name: 'settlement_consumption_claim_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze([
          'organizationId',
          'mandateId',
          'mandateVersion',
        ]),
        name: 'standing_mandate_version_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze([
          'organizationId',
          'mandateId',
          'mandateVersion',
          'periodKey',
          'actionDigest',
        ]),
        name: 'mandate_reservation_action',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'approvalId']),
        name: 'approval_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'decisionId']),
        name: 'approval_decision_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'approvalSessionId']),
        name: 'approval_session_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'worldProofId']),
        name: 'world_proof_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'agentKitChallengeId']),
        name: 'agentkit_challenge_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'consumptionClaimId']),
        name: 'approval_consumption_identity',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze(['organizationId', 'actionDigest', 'subjectId']),
        name: 'approval_subject_per_action',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze([
          'organizationId',
          'actionDigest',
          'agentTenantPrincipal',
        ]),
        name: 'approval_agentbook_principal_per_action',
        predicate: null,
      }),
      Object.freeze({
        fields: Object.freeze([
          'organizationId',
          'actionDigest',
          'actionHumanPrincipal',
        ]),
        name: 'approval_action_human_principal_per_action',
        predicate: null,
      }),
    ]),
  });
