export type PersistenceUniqueKey = Readonly<{
  fields: readonly string[];
  name: string;
  predicate: string | null;
}>;

export type PaymentPersistenceUniquenessContract = Readonly<{
  atomicPaymentWrite: Readonly<{
    compareAndSwapField: 'aggregate.metadata.version';
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
  schemaVersion: 1;
  uniqueKeys: readonly PersistenceUniqueKey[];
}>;

export const paymentPersistenceUniquenessContract: PaymentPersistenceUniquenessContract =
  Object.freeze({
    atomicPaymentWrite: Object.freeze({
      compareAndSwapField: 'aggregate.metadata.version',
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
    schemaVersion: 1,
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
        fields: Object.freeze(['organizationId', 'consumptionClaimId']),
        name: 'approval_consumption_identity',
        predicate: null,
      }),
    ]),
  });
