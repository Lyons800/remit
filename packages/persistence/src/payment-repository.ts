import type {
  PaymentActionAggregate,
  PaymentActionTransition,
} from '@invoiceguard/domain';

import type { PaymentWriterAuthorization } from './payment-writer-authorization.js';

export type PaymentPersistenceResult = 'ALREADY_APPLIED' | 'APPLIED';

export interface PaymentActionRepository {
  applyTransition(
    transition: PaymentActionTransition,
    authorization: PaymentWriterAuthorization,
  ): Promise<PaymentPersistenceResult>;
  create(aggregate: PaymentActionAggregate): Promise<PaymentPersistenceResult>;
  findById(
    organizationId: string,
    actionId: string,
  ): Promise<PaymentActionAggregate | null>;
}
