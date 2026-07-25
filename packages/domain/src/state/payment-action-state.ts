import { accept, refuse, type DomainResult } from '../result.js';
import type { PolicyRoute, VerificationMode } from '../policy/routes.js';
import { isCanonicalUtcInstant } from './temporal.js';

export const paymentActionStates = [
  'CAPTURED',
  'CLASSIFIED',
  'VERIFICATION_QUOTED',
  'VERIFICATION_PAID',
  'EVIDENCE_SATISFIED',
  'AWAITING_APPROVALS',
  'AUTHORIZED',
  'AUTHORIZATION_RECOVERY',
  'AUDIT_COMMITTED',
  'SETTLEMENT_PENDING',
  'SETTLEMENT_RECOVERY',
  'SETTLED',
  'RECONCILING',
  'RECONCILED',
  'RECONCILIATION_EXCEPTION',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED',
  'CANCELLED',
] as const;

export type PaymentActionState = (typeof paymentActionStates)[number];

type ExpiringEvent = Readonly<{
  expiresAt: string;
  now: string;
}>;

export type PaymentActionEvent =
  | Readonly<{ type: 'CLASSIFY' }>
  | Readonly<{ route: PolicyRoute; type: 'REJECT_POLICY_BLOCK' }>
  | Readonly<{
      type: 'SATISFY_EVIDENCE_NOT_REQUIRED';
      verificationMode: VerificationMode;
    }>
  | Readonly<{
      type: 'QUOTE_VERIFICATION';
      verificationMode: VerificationMode;
    }>
  | Readonly<{ type: 'RECORD_VERIFICATION_PAYMENT' }>
  | Readonly<{
      result: 'MATCH' | 'MISMATCH' | 'UNKNOWN';
      type: 'ACCEPT_VERIFICATION';
    }>
  | Readonly<{
      result: 'MATCH' | 'MISMATCH' | 'UNKNOWN';
      type: 'REJECT_VERIFICATION';
    }>
  | (ExpiringEvent &
      Readonly<{
        capReserved: boolean;
        mandateContained: boolean;
        route: PolicyRoute;
        type: 'AUTHORIZE_MANDATE';
      }>)
  | Readonly<{
      route: PolicyRoute;
      type: 'AWAIT_APPROVALS';
    }>
  | (ExpiringEvent &
      Readonly<{
        quorumSatisfied: boolean;
        type: 'AUTHORIZE_APPROVALS';
      }>)
  | Readonly<{ type: 'REJECT_APPROVALS' }>
  | (ExpiringEvent &
      Readonly<{
        hcsAuthorizationCommitted: boolean;
        type: 'COMMIT_AUDIT';
      }>)
  | Readonly<{ type: 'START_AUTHORIZATION_RECOVERY' }>
  | (ExpiringEvent &
      Readonly<{
        hcsAuthorizationCommitted: boolean;
        type: 'RECOVER_AUDIT';
      }>)
  | (ExpiringEvent & Readonly<{ type: 'QUEUE_SETTLEMENT' }>)
  | Readonly<{
      consensusReceiptValid: boolean;
      type: 'SETTLE_CONSENSUS';
    }>
  | Readonly<{ type: 'START_SETTLEMENT_RECOVERY' }>
  | Readonly<{
      consensusReceiptValid: boolean;
      type: 'RECOVER_SETTLEMENT';
    }>
  | Readonly<{
      sameTransaction: boolean;
      type: 'RETRY_SAME_TRANSACTION';
    }>
  | Readonly<{ type: 'START_RECONCILIATION' }>
  | Readonly<{ type: 'RECONCILE_SUCCESS' }>
  | Readonly<{ type: 'RECONCILE_EXCEPTION' }>
  | (ExpiringEvent & Readonly<{ type: 'EXPIRE' }>)
  | Readonly<{
      hcsAuthorizationCommitted: boolean;
      transactionSignedOrSubmitted: boolean;
      type: 'SUPERSEDE';
    }>
  | Readonly<{
      hcsCancellationCommitted: boolean;
      transactionSignedOrSubmitted: boolean;
      type: 'CANCEL';
    }>;

export type PaymentActionEventType = PaymentActionEvent['type'];

export const paymentActionEventTypes = [
  'CLASSIFY',
  'REJECT_POLICY_BLOCK',
  'SATISFY_EVIDENCE_NOT_REQUIRED',
  'QUOTE_VERIFICATION',
  'RECORD_VERIFICATION_PAYMENT',
  'ACCEPT_VERIFICATION',
  'REJECT_VERIFICATION',
  'AUTHORIZE_MANDATE',
  'AWAIT_APPROVALS',
  'AUTHORIZE_APPROVALS',
  'REJECT_APPROVALS',
  'COMMIT_AUDIT',
  'START_AUTHORIZATION_RECOVERY',
  'RECOVER_AUDIT',
  'QUEUE_SETTLEMENT',
  'SETTLE_CONSENSUS',
  'START_SETTLEMENT_RECOVERY',
  'RECOVER_SETTLEMENT',
  'RETRY_SAME_TRANSACTION',
  'START_RECONCILIATION',
  'RECONCILE_SUCCESS',
  'RECONCILE_EXCEPTION',
  'EXPIRE',
  'SUPERSEDE',
  'CANCEL',
] as const satisfies readonly PaymentActionEventType[];

const terminalStates: ReadonlySet<PaymentActionState> = new Set([
  'RECONCILED',
  'RECONCILIATION_EXCEPTION',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED',
  'CANCELLED',
]);

const transitions: Readonly<
  Record<
    PaymentActionState,
    Readonly<Partial<Record<PaymentActionEventType, PaymentActionState>>>
  >
> = {
  AUDIT_COMMITTED: {
    CANCEL: 'CANCELLED',
    QUEUE_SETTLEMENT: 'SETTLEMENT_PENDING',
  },
  AUTHORIZATION_RECOVERY: {
    EXPIRE: 'EXPIRED',
    RECOVER_AUDIT: 'AUDIT_COMMITTED',
    SUPERSEDE: 'SUPERSEDED',
  },
  AUTHORIZED: {
    COMMIT_AUDIT: 'AUDIT_COMMITTED',
    EXPIRE: 'EXPIRED',
    START_AUTHORIZATION_RECOVERY: 'AUTHORIZATION_RECOVERY',
    SUPERSEDE: 'SUPERSEDED',
  },
  AWAITING_APPROVALS: {
    AUTHORIZE_APPROVALS: 'AUTHORIZED',
    EXPIRE: 'EXPIRED',
    REJECT_APPROVALS: 'REJECTED',
    SUPERSEDE: 'SUPERSEDED',
  },
  CANCELLED: {},
  CAPTURED: {
    CLASSIFY: 'CLASSIFIED',
    EXPIRE: 'EXPIRED',
    SUPERSEDE: 'SUPERSEDED',
  },
  CLASSIFIED: {
    EXPIRE: 'EXPIRED',
    QUOTE_VERIFICATION: 'VERIFICATION_QUOTED',
    REJECT_POLICY_BLOCK: 'REJECTED',
    SATISFY_EVIDENCE_NOT_REQUIRED: 'EVIDENCE_SATISFIED',
    SUPERSEDE: 'SUPERSEDED',
  },
  EVIDENCE_SATISFIED: {
    AUTHORIZE_MANDATE: 'AUTHORIZED',
    AWAIT_APPROVALS: 'AWAITING_APPROVALS',
    EXPIRE: 'EXPIRED',
    SUPERSEDE: 'SUPERSEDED',
  },
  EXPIRED: {},
  RECONCILED: {},
  RECONCILIATION_EXCEPTION: {},
  RECONCILING: {
    RECONCILE_EXCEPTION: 'RECONCILIATION_EXCEPTION',
    RECONCILE_SUCCESS: 'RECONCILED',
  },
  REJECTED: {},
  SETTLED: {
    START_RECONCILIATION: 'RECONCILING',
  },
  SETTLEMENT_PENDING: {
    SETTLE_CONSENSUS: 'SETTLED',
    START_SETTLEMENT_RECOVERY: 'SETTLEMENT_RECOVERY',
  },
  SETTLEMENT_RECOVERY: {
    RECOVER_SETTLEMENT: 'SETTLED',
    RETRY_SAME_TRANSACTION: 'SETTLEMENT_PENDING',
  },
  SUPERSEDED: {},
  VERIFICATION_PAID: {
    ACCEPT_VERIFICATION: 'EVIDENCE_SATISFIED',
    EXPIRE: 'EXPIRED',
    REJECT_VERIFICATION: 'REJECTED',
    SUPERSEDE: 'SUPERSEDED',
  },
  VERIFICATION_QUOTED: {
    EXPIRE: 'EXPIRED',
    RECORD_VERIFICATION_PAYMENT: 'VERIFICATION_PAID',
    SUPERSEDE: 'SUPERSEDED',
  },
};

function isBeforeExpiry(event: ExpiringEvent): boolean {
  return event.now < event.expiresAt;
}

function hasValidTime(event: ExpiringEvent): boolean {
  return (
    isCanonicalUtcInstant(event.now) && isCanonicalUtcInstant(event.expiresAt)
  );
}

function validateEventGuard(
  event: PaymentActionEvent,
): DomainResult<PaymentActionEvent> {
  if ('now' in event && !hasValidTime(event)) {
    return refuse('ACTION_TIME_INVALID');
  }

  if (event.type === 'REJECT_POLICY_BLOCK' && event.route !== 'BLOCK') {
    return refuse('POLICY_ROUTE_MISMATCH');
  }

  if (
    event.type === 'SATISFY_EVIDENCE_NOT_REQUIRED' &&
    event.verificationMode !== 'NOT_REQUIRED'
  ) {
    return refuse('VERIFICATION_MODE_MISMATCH');
  }

  if (
    event.type === 'QUOTE_VERIFICATION' &&
    event.verificationMode !== 'REQUIRED'
  ) {
    return refuse('VERIFICATION_REQUIRED');
  }

  if (event.type === 'ACCEPT_VERIFICATION' && event.result !== 'MATCH') {
    return event.result === 'MISMATCH'
      ? refuse('VERIFICATION_MISMATCH')
      : refuse('VERIFICATION_UNKNOWN');
  }

  if (event.type === 'REJECT_VERIFICATION' && event.result === 'MATCH') {
    return refuse('VERIFICATION_MODE_MISMATCH');
  }

  if (
    event.type === 'AUTHORIZE_MANDATE' &&
    (event.route !== 'STRAIGHT_THROUGH' ||
      !event.mandateContained ||
      !event.capReserved)
  ) {
    return refuse('MANDATE_CONTAINMENT_FAILED');
  }

  if (event.type === 'AWAIT_APPROVALS' && event.route !== 'HUMAN_APPROVAL') {
    return refuse('POLICY_ROUTE_MISMATCH');
  }

  if (event.type === 'AUTHORIZE_APPROVALS' && !event.quorumSatisfied) {
    return refuse('APPROVAL_QUORUM_NOT_MET');
  }

  if (
    (event.type === 'COMMIT_AUDIT' || event.type === 'RECOVER_AUDIT') &&
    !event.hcsAuthorizationCommitted
  ) {
    return refuse('HCS_AUTHORIZATION_REQUIRED');
  }

  if (
    (event.type === 'SETTLE_CONSENSUS' ||
      event.type === 'RECOVER_SETTLEMENT') &&
    !event.consensusReceiptValid
  ) {
    return refuse('SETTLEMENT_TRANSACTION_MISMATCH');
  }

  if (event.type === 'RETRY_SAME_TRANSACTION' && !event.sameTransaction) {
    return refuse('SETTLEMENT_TRANSACTION_MISMATCH');
  }

  if (
    event.type === 'SUPERSEDE' &&
    (event.hcsAuthorizationCommitted || event.transactionSignedOrSubmitted)
  ) {
    return refuse('ACTION_SUPERSEDE_TOO_LATE');
  }

  if (
    event.type === 'CANCEL' &&
    (!event.hcsCancellationCommitted || event.transactionSignedOrSubmitted)
  ) {
    return refuse('ACTION_CANCEL_TOO_LATE');
  }

  if (event.type === 'EXPIRE' && isBeforeExpiry(event)) {
    return refuse('ACTION_NOT_EXPIRED');
  }

  if (
    (event.type === 'AUTHORIZE_MANDATE' ||
      event.type === 'AUTHORIZE_APPROVALS' ||
      event.type === 'COMMIT_AUDIT' ||
      event.type === 'RECOVER_AUDIT' ||
      event.type === 'QUEUE_SETTLEMENT') &&
    !isBeforeExpiry(event)
  ) {
    return refuse('ACTION_EXPIRED');
  }

  return accept(event);
}

export function isTerminalPaymentActionState(
  state: PaymentActionState,
): boolean {
  return terminalStates.has(state);
}

export function transitionPaymentAction(
  state: PaymentActionState,
  event: PaymentActionEvent,
): DomainResult<PaymentActionState> {
  if (isTerminalPaymentActionState(state)) {
    return refuse('TERMINAL_STATE');
  }

  const next = transitions[state][event.type];
  if (next === undefined) {
    return refuse('INVALID_STATE_TRANSITION');
  }

  const guard = validateEventGuard(event);
  if (!guard.ok) {
    return guard;
  }

  return accept(next);
}

export function routeForEvidenceTransition(
  route: PolicyRoute,
  verificationMode: VerificationMode,
): PaymentActionEvent {
  if (route === 'BLOCK') {
    return { route, type: 'REJECT_POLICY_BLOCK' };
  }

  return verificationMode === 'REQUIRED'
    ? { type: 'QUOTE_VERIFICATION', verificationMode }
    : { type: 'SATISFY_EVIDENCE_NOT_REQUIRED', verificationMode };
}
