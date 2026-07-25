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
        'settlement_attempt_identity',
        'settlement_receipt_identity',
        'settlement_consumption_claim_identity',
        'standing_mandate_version_identity',
        'mandate_reservation_action',
        'approval_identity',
        'approval_consumption_identity',
      ]),
    );
  });

  it('requires aggregate, consumption, receipt, reservation, and outbox writes atomically', () => {
    expect(paymentPersistenceUniquenessContract.atomicPaymentWrite).toEqual({
      compareAndSwapField: 'aggregate.metadata.version',
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
      'PR3_DATABASE_CONSTRAINTS',
    );
  });
});
