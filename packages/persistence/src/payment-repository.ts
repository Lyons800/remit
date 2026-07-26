import type {
  PaymentActionAggregate,
  PaymentActionEvent,
  PaymentActionTransition,
  TrustedTransitionContext,
} from '@invoiceguard/domain';

import type { PaymentWriterAuthorization } from './payment-writer-authorization.js';

export type PaymentPersistenceResult = 'ALREADY_APPLIED' | 'APPLIED';

export type PaymentTransitionCommand = Readonly<
  PaymentActionTransition & {
    event: PaymentActionEvent;
    context: TrustedTransitionContext;
  }
>;

export interface PaymentActionRepository {
  applyTransition(
    command: PaymentTransitionCommand,
    authorization: PaymentWriterAuthorization,
  ): Promise<PaymentPersistenceResult>;
  create(aggregate: PaymentActionAggregate): Promise<PaymentPersistenceResult>;
  findById(
    organizationId: string,
    actionId: string,
  ): Promise<PaymentActionAggregate | null>;
}
