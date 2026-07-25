import type {
  PaymentActionAggregate,
  PaymentActionTransition,
} from '@invoiceguard/domain';

export type PaymentPersistenceResult = 'ALREADY_APPLIED' | 'APPLIED';

export interface PaymentActionRepository {
  applyTransition(
    transition: PaymentActionTransition,
  ): Promise<PaymentPersistenceResult>;
  create(aggregate: PaymentActionAggregate): Promise<PaymentPersistenceResult>;
  findById(
    organizationId: string,
    actionId: string,
  ): Promise<PaymentActionAggregate | null>;
}
