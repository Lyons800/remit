import {
  verifyAuthorizationBundle,
  type AuthorizationBundleV1,
} from '@invoiceguard/protocol/hashing';

import {
  validateApprovalQuorum,
  type AdapterVerifiedApprovalFact,
} from '../invariants/approval-quorum.js';
import { validateMandateContainment } from '../invariants/mandate-containment.js';
import {
  validateActiveMandateReservation,
  type MandateReservationLedger,
} from '../invariants/mandate.js';
import type {
  StandingMandateAggregate,
  TrustedTransitionContext,
} from '../payment-context.js';
import { accept, refuse, type DomainResult } from '../result.js';
import {
  isNonEmptyBoundedString,
  isRecord,
  isSha256Digest,
} from '../values/validation.js';
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

export type PaymentActionAggregate = Readonly<{
  authorization: AuthorizationBundleV1;
  state: PaymentActionState;
}>;

export type AdapterVerifiedConsensusCommit = Readonly<{
  actionDigest: string;
  status: 'CONSENSUS';
}>;

export type AdapterVerifiedServicePayment = Readonly<{
  actionDigest: string;
  status: 'CONSENSUS';
}>;

export type AdapterVerifiedSettlementReceipt = Readonly<{
  actionDigest: string;
  status: 'SUCCESS';
  transactionId: string;
}>;

export type AdapterVerifiedEvidenceResult = Readonly<{
  actionDigest: string;
  expiresAt: string;
  result: 'MATCH' | 'MISMATCH' | 'UNKNOWN';
  status: 'VERIFIED';
}>;

export type FrozenTransactionRetryFact = Readonly<{
  actionDigest: string;
  frozenTransactionHash: string;
  retryTransactionHash: string;
}>;

export type PaymentActionEvent =
  | Readonly<{ type: 'CLASSIFY' }>
  | Readonly<{ type: 'REJECT_POLICY_BLOCK' }>
  | Readonly<{ type: 'SATISFY_EVIDENCE_NOT_REQUIRED' }>
  | Readonly<{ type: 'QUOTE_VERIFICATION' }>
  | Readonly<{
      servicePayment: AdapterVerifiedServicePayment;
      type: 'RECORD_VERIFICATION_PAYMENT';
    }>
  | Readonly<{
      type: 'ACCEPT_VERIFICATION';
      verification: AdapterVerifiedEvidenceResult;
    }>
  | Readonly<{
      type: 'REJECT_VERIFICATION';
      verification: AdapterVerifiedEvidenceResult;
    }>
  | Readonly<{
      mandate: StandingMandateAggregate;
      reservationLedger: MandateReservationLedger;
      type: 'AUTHORIZE_MANDATE';
    }>
  | Readonly<{ type: 'AWAIT_APPROVALS' }>
  | Readonly<{
      approvals: readonly AdapterVerifiedApprovalFact[];
      type: 'AUTHORIZE_APPROVALS';
    }>
  | Readonly<{ type: 'REJECT_APPROVALS' }>
  | Readonly<{
      authorizationCommit: AdapterVerifiedConsensusCommit;
      type: 'COMMIT_AUDIT';
    }>
  | Readonly<{ type: 'START_AUTHORIZATION_RECOVERY' }>
  | Readonly<{
      authorizationCommit: AdapterVerifiedConsensusCommit;
      type: 'RECOVER_AUDIT';
    }>
  | Readonly<{ type: 'QUEUE_SETTLEMENT' }>
  | Readonly<{
      receipt: AdapterVerifiedSettlementReceipt;
      type: 'SETTLE_CONSENSUS';
    }>
  | Readonly<{ type: 'START_SETTLEMENT_RECOVERY' }>
  | Readonly<{
      receipt: AdapterVerifiedSettlementReceipt;
      type: 'RECOVER_SETTLEMENT';
    }>
  | Readonly<{
      recovery: FrozenTransactionRetryFact;
      type: 'RETRY_SAME_TRANSACTION';
    }>
  | Readonly<{ type: 'START_RECONCILIATION' }>
  | Readonly<{ type: 'RECONCILE_SUCCESS' }>
  | Readonly<{ type: 'RECONCILE_EXCEPTION' }>
  | Readonly<{ type: 'EXPIRE' }>
  | Readonly<{ type: 'SUPERSEDE' }>
  | Readonly<{
      cancellationCommit: AdapterVerifiedConsensusCommit;
      effectStatus: 'NOT_SIGNED';
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

const NO_PAYLOAD_EVENTS: ReadonlySet<PaymentActionEventType> = new Set([
  'CLASSIFY',
  'REJECT_POLICY_BLOCK',
  'SATISFY_EVIDENCE_NOT_REQUIRED',
  'QUOTE_VERIFICATION',
  'AWAIT_APPROVALS',
  'REJECT_APPROVALS',
  'START_AUTHORIZATION_RECOVERY',
  'QUEUE_SETTLEMENT',
  'START_SETTLEMENT_RECOVERY',
  'START_RECONCILIATION',
  'RECONCILE_SUCCESS',
  'RECONCILE_EXCEPTION',
  'EXPIRE',
  'SUPERSEDE',
]);

const PRE_EXPIRY_EVENTS: ReadonlySet<PaymentActionEventType> = new Set([
  'AUTHORIZE_MANDATE',
  'AUTHORIZE_APPROVALS',
  'COMMIT_AUDIT',
  'RECOVER_AUDIT',
  'QUEUE_SETTLEMENT',
]);

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function verifyAggregate(input: unknown): DomainResult<PaymentActionAggregate> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ['authorization', 'state']) ||
    !paymentActionStates.includes(input.state as PaymentActionState)
  ) {
    return refuse('POLICY_CORE_BINDING_MISMATCH');
  }

  try {
    return accept(
      Object.freeze({
        authorization: verifyAuthorizationBundle(
          input.authorization as AuthorizationBundleV1,
        ),
        state: input.state as PaymentActionState,
      }),
    );
  } catch {
    return refuse('POLICY_CORE_BINDING_MISMATCH');
  }
}

function parseContext(input: unknown): DomainResult<TrustedTransitionContext> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ['now']) ||
    !isCanonicalUtcInstant(typeof input.now === 'string' ? input.now : '')
  ) {
    return refuse('ACTION_TIME_INVALID');
  }

  return accept(Object.freeze({ now: input.now as string }));
}

function parseEventType(input: unknown): PaymentActionEventType | null {
  if (
    !isRecord(input) ||
    typeof input.type !== 'string' ||
    !paymentActionEventTypes.includes(input.type as PaymentActionEventType)
  ) {
    return null;
  }
  return input.type as PaymentActionEventType;
}

function hasExactActionStatus(
  input: unknown,
  actionDigest: string,
  status: string,
): boolean {
  return (
    isRecord(input) &&
    hasExactKeys(input, ['actionDigest', 'status']) &&
    input.actionDigest === actionDigest &&
    input.status === status
  );
}

function validateVerification(
  input: unknown,
  authorization: AuthorizationBundleV1,
  now: string,
): DomainResult<'MATCH' | 'MISMATCH' | 'UNKNOWN'> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ['actionDigest', 'expiresAt', 'result', 'status']) ||
    input.actionDigest !== authorization.envelope.actionDigest ||
    input.status !== 'VERIFIED' ||
    (input.result !== 'MATCH' &&
      input.result !== 'MISMATCH' &&
      input.result !== 'UNKNOWN')
  ) {
    return input !== null &&
      isRecord(input) &&
      input.actionDigest !== authorization.envelope.actionDigest
      ? refuse('ACTION_DIGEST_MISMATCH')
      : refuse('VERIFICATION_MISMATCH');
  }

  if (
    !isCanonicalUtcInstant(
      typeof input.expiresAt === 'string' ? input.expiresAt : '',
    ) ||
    now >= (input.expiresAt as string) ||
    (input.expiresAt as string) > authorization.actionCore.expiresAt
  ) {
    return refuse('VERIFICATION_EXPIRED');
  }

  return accept(input.result);
}

function validateCommit(
  input: unknown,
  actionDigest: string,
): DomainResult<true> {
  return hasExactActionStatus(input, actionDigest, 'CONSENSUS')
    ? accept(true)
    : refuse('HCS_AUTHORIZATION_REQUIRED');
}

function validateSettlementReceipt(
  input: unknown,
  actionDigest: string,
): DomainResult<true> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ['actionDigest', 'status', 'transactionId']) ||
    input.actionDigest !== actionDigest ||
    input.status !== 'SUCCESS' ||
    !isNonEmptyBoundedString(input.transactionId)
  ) {
    return refuse('SETTLEMENT_TRANSACTION_MISMATCH');
  }
  return accept(true);
}

function validateEventGuard(
  authorization: AuthorizationBundleV1,
  event: Record<string, unknown>,
  eventType: PaymentActionEventType,
  context: TrustedTransitionContext,
): DomainResult<true> {
  const actionDigest = authorization.envelope.actionDigest;
  const decision = authorization.decision;

  if (NO_PAYLOAD_EVENTS.has(eventType) && !hasExactKeys(event, ['type'])) {
    return refuse('INVALID_STATE_TRANSITION');
  }

  if (PRE_EXPIRY_EVENTS.has(eventType) && context.now < decision.evaluatedAt) {
    return refuse('ACTION_TIME_INVALID');
  }

  if (
    PRE_EXPIRY_EVENTS.has(eventType) &&
    context.now >= authorization.actionCore.expiresAt
  ) {
    return refuse('ACTION_EXPIRED');
  }

  if (
    eventType === 'EXPIRE' &&
    context.now < authorization.actionCore.expiresAt
  ) {
    return refuse('ACTION_NOT_EXPIRED');
  }

  if (eventType === 'REJECT_POLICY_BLOCK' && decision.route !== 'BLOCK') {
    return refuse('POLICY_ROUTE_MISMATCH');
  }

  if (
    eventType === 'SATISFY_EVIDENCE_NOT_REQUIRED' &&
    (decision.verificationMode !== 'NOT_REQUIRED' || decision.route === 'BLOCK')
  ) {
    return refuse('VERIFICATION_MODE_MISMATCH');
  }

  if (
    eventType === 'QUOTE_VERIFICATION' &&
    decision.verificationMode !== 'REQUIRED'
  ) {
    return refuse('VERIFICATION_REQUIRED');
  }

  if (eventType === 'RECORD_VERIFICATION_PAYMENT') {
    if (
      decision.verificationMode !== 'REQUIRED' ||
      !hasExactKeys(event, ['servicePayment', 'type']) ||
      !hasExactActionStatus(event.servicePayment, actionDigest, 'CONSENSUS')
    ) {
      return refuse('ACTION_DIGEST_MISMATCH');
    }
  }

  if (
    eventType === 'ACCEPT_VERIFICATION' ||
    eventType === 'REJECT_VERIFICATION'
  ) {
    if (
      decision.verificationMode !== 'REQUIRED' ||
      !hasExactKeys(event, ['type', 'verification'])
    ) {
      return refuse('VERIFICATION_MISMATCH');
    }
    const verification = validateVerification(
      event.verification,
      authorization,
      context.now,
    );
    if (!verification.ok) {
      return verification;
    }
    if (eventType === 'ACCEPT_VERIFICATION' && verification.value !== 'MATCH') {
      return verification.value === 'MISMATCH'
        ? refuse('VERIFICATION_MISMATCH')
        : refuse('VERIFICATION_UNKNOWN');
    }
    if (eventType === 'REJECT_VERIFICATION' && verification.value === 'MATCH') {
      return refuse('VERIFICATION_MODE_MISMATCH');
    }
  }

  if (eventType === 'AUTHORIZE_MANDATE') {
    if (!hasExactKeys(event, ['mandate', 'reservationLedger', 'type'])) {
      return refuse('MANDATE_CONTAINMENT_FAILED');
    }
    const containment = validateMandateContainment(
      authorization,
      event.mandate,
      context.now,
    );
    if (!containment.ok) {
      return containment;
    }
    const reservation = validateActiveMandateReservation(
      event.reservationLedger,
      containment.value,
    );
    if (!reservation.ok) {
      return reservation;
    }
  }

  if (eventType === 'AWAIT_APPROVALS' && decision.route !== 'HUMAN_APPROVAL') {
    return refuse('POLICY_ROUTE_MISMATCH');
  }

  if (eventType === 'REJECT_APPROVALS' && decision.route !== 'HUMAN_APPROVAL') {
    return refuse('POLICY_ROUTE_MISMATCH');
  }

  if (eventType === 'AUTHORIZE_APPROVALS') {
    if (
      !hasExactKeys(event, ['approvals', 'type']) ||
      decision.route !== 'HUMAN_APPROVAL'
    ) {
      return refuse('APPROVAL_FACT_INVALID');
    }
    const approvals = validateApprovalQuorum(
      actionDigest,
      decision.requiredAuthority,
      event.approvals,
      context.now,
    );
    if (!approvals.ok) {
      return approvals;
    }
  }

  if (eventType === 'COMMIT_AUDIT' || eventType === 'RECOVER_AUDIT') {
    if (!hasExactKeys(event, ['authorizationCommit', 'type'])) {
      return refuse('HCS_AUTHORIZATION_REQUIRED');
    }
    const commit = validateCommit(event.authorizationCommit, actionDigest);
    if (!commit.ok) {
      return commit;
    }
  }

  if (eventType === 'SETTLE_CONSENSUS' || eventType === 'RECOVER_SETTLEMENT') {
    if (!hasExactKeys(event, ['receipt', 'type'])) {
      return refuse('SETTLEMENT_TRANSACTION_MISMATCH');
    }
    const receipt = validateSettlementReceipt(event.receipt, actionDigest);
    if (!receipt.ok) {
      return receipt;
    }
  }

  if (eventType === 'RETRY_SAME_TRANSACTION') {
    if (
      !hasExactKeys(event, ['recovery', 'type']) ||
      !isRecord(event.recovery) ||
      !hasExactKeys(event.recovery, [
        'actionDigest',
        'frozenTransactionHash',
        'retryTransactionHash',
      ]) ||
      event.recovery.actionDigest !== actionDigest ||
      !isSha256Digest(event.recovery.frozenTransactionHash) ||
      !isSha256Digest(event.recovery.retryTransactionHash) ||
      event.recovery.frozenTransactionHash !==
        event.recovery.retryTransactionHash
    ) {
      return refuse('SETTLEMENT_TRANSACTION_MISMATCH');
    }
  }

  if (eventType === 'CANCEL') {
    if (
      !hasExactKeys(event, ['cancellationCommit', 'effectStatus', 'type']) ||
      event.effectStatus !== 'NOT_SIGNED' ||
      !hasExactActionStatus(event.cancellationCommit, actionDigest, 'CONSENSUS')
    ) {
      return refuse('ACTION_CANCEL_TOO_LATE');
    }
  }

  return accept(true);
}

export function isTerminalPaymentActionState(
  state: PaymentActionState,
): boolean {
  return terminalStates.has(state);
}

export function transitionPaymentAction(
  aggregateInput: unknown,
  eventInput: unknown,
  contextInput: unknown,
): DomainResult<PaymentActionAggregate> {
  const aggregateResult = verifyAggregate(aggregateInput);
  if (!aggregateResult.ok) {
    return aggregateResult;
  }
  const aggregate = aggregateResult.value;

  if (isTerminalPaymentActionState(aggregate.state)) {
    return refuse('TERMINAL_STATE');
  }

  const eventType = parseEventType(eventInput);
  if (eventType === null || !isRecord(eventInput)) {
    return refuse('INVALID_STATE_TRANSITION');
  }

  const next = transitions[aggregate.state][eventType];
  if (next === undefined) {
    return refuse('INVALID_STATE_TRANSITION');
  }

  const contextResult = parseContext(contextInput);
  if (!contextResult.ok) {
    return contextResult;
  }

  const guard = validateEventGuard(
    aggregate.authorization,
    eventInput,
    eventType,
    contextResult.value,
  );
  if (!guard.ok) {
    return guard;
  }

  return accept(Object.freeze({ ...aggregate, state: next }));
}

export function routeForEvidenceTransition(
  authorizationInput: unknown,
): DomainResult<PaymentActionEvent> {
  try {
    const authorization = verifyAuthorizationBundle(
      authorizationInput as AuthorizationBundleV1,
    );
    if (authorization.decision.route === 'BLOCK') {
      return accept({ type: 'REJECT_POLICY_BLOCK' });
    }
    return accept(
      authorization.decision.verificationMode === 'REQUIRED'
        ? { type: 'QUOTE_VERIFICATION' }
        : { type: 'SATISFY_EVIDENCE_NOT_REQUIRED' },
    );
  } catch {
    return refuse('POLICY_CORE_BINDING_MISMATCH');
  }
}
