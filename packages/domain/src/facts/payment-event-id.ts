import { hashAdapterRecord } from './adapter-record.js';

export const PAYMENT_DOMAIN_EVENT_ID_PREFIX = 'invoiceguard:event:v1:';
export const PAYMENT_DOMAIN_EVENT_ID_LENGTH =
  PAYMENT_DOMAIN_EVENT_ID_PREFIX.length + 64;

export type PaymentDomainEventKind =
  | 'EXECUTION_AUDIT'
  | 'SETTLEMENT_RETRY'
  | 'SETTLEMENT_SUBMISSION'
  | 'VERIFICATION_QUOTE';

export function derivePaymentDomainEventId(
  kind: PaymentDomainEventKind,
  binding: Readonly<Record<string, unknown>>,
): string {
  return `${PAYMENT_DOMAIN_EVENT_ID_PREFIX}${hashAdapterRecord(
    `PAYMENT_DOMAIN_EVENT_${kind}`,
    binding,
  )}`;
}

export function isPaymentDomainEventId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === PAYMENT_DOMAIN_EVENT_ID_LENGTH &&
    value.startsWith(PAYMENT_DOMAIN_EVENT_ID_PREFIX) &&
    /^[0-9a-f]{64}$/u.test(value.slice(PAYMENT_DOMAIN_EVENT_ID_PREFIX.length))
  );
}
