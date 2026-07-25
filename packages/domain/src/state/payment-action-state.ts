import {
  canonicalizeJson,
  hashPolicyDecision,
  verifyAuthorizationBundle,
  type AuthorizationBundleV1,
} from '@invoiceguard/protocol/hashing';

import {
  parseAdapterVerifiedApprovalFact,
  validateApprovalQuorum,
  type AdapterVerifiedApprovalFact,
  type ApprovalBinding,
} from '../invariants/approval-quorum.js';
import { validateMandateContainment } from '../invariants/mandate-containment.js';
import {
  releaseMandateReservation,
  reserveMandateCapacity,
  settleMandateReservation,
  validateActiveMandateReservation,
  type MandateReservationClaim,
  type MandateReservationLedger,
} from '../invariants/mandate.js';
import {
  actionFactBinding,
  deriveExecutionAuditEventId,
  deriveSettlementEffectDigest,
  deriveSettlementIdempotencyKey,
  parseAdapterVerifiedAuthorizationAudit,
  parseAdapterVerifiedCancellationAudit,
  parseAdapterVerifiedEvidenceResult,
  parseAdapterVerifiedExecutionAudit,
  parseAdapterVerifiedSettlementReceipt,
  parseAdapterVerifiedSettlementUncertainty,
  parseAdapterVerifiedVerificationPayment,
  parseAtomicSettlementConsumptionClaim,
  parseFrozenSettlementAttempt,
  parseRequestingAgentExecutionFact,
  sameActionFactBinding,
  type ActionFactBinding,
  type AdapterVerifiedAuthorizationAudit,
  type AdapterVerifiedCancellationAudit,
  type AdapterVerifiedEvidenceResult,
  type AdapterVerifiedExecutionAudit,
  type AdapterVerifiedSettlementReceipt,
  type AdapterVerifiedSettlementUncertainty,
  type AdapterVerifiedVerificationPayment,
  type AtomicSettlementConsumptionClaim,
  type FrozenSettlementAttempt,
  type RequestingAgentExecutionFact,
} from '../facts/payment-facts.js';
import {
  hasExactKeys,
  hasValidAdapterRecordDigest,
  hashAdapterRecord,
} from '../facts/adapter-record.js';
import type {
  StandingMandateAggregate,
  TrustedTransitionContext,
} from '../payment-context.js';
import { accept, refuse, type DomainResult } from '../result.js';
import { isRecord, isSha256Digest } from '../values/validation.js';
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
  'SETTLED_AUDIT_PENDING',
  'SETTLED_AUDIT_DEGRADED',
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

export type HumanAuthorizationBasisCore = Readonly<{
  approvals: readonly AdapterVerifiedApprovalFact[];
  authorizedAt: string;
  decisionDigest: string;
  kind: 'HUMAN_APPROVAL';
  requestingAgent: RequestingAgentExecutionFact;
}>;
export type HumanAuthorizationBasis = Readonly<
  HumanAuthorizationBasisCore & { basisDigest: string }
>;

export type MandateAuthorizationBasisCore = Readonly<{
  authorizedAt: string;
  kind: 'MANDATE';
  mandate: StandingMandateAggregate;
  requestingAgent: RequestingAgentExecutionFact;
  reservationClaim: MandateReservationClaim;
  reservedLedger: MandateReservationLedger;
}>;
export type MandateAuthorizationBasis = Readonly<
  MandateAuthorizationBasisCore & { basisDigest: string }
>;

export type PaymentAuthorizationBasis =
  HumanAuthorizationBasis | MandateAuthorizationBasis;

export type PaymentAggregateMetadata = Readonly<{
  lastEventType: PaymentActionEventType | null;
  lastTransitionAt: string;
  previousState: PaymentActionState | null;
  transitionCount: number;
  version: number;
}>;

export type PaymentTerminalRecordCore = Readonly<{
  eventType:
    | 'CANCEL'
    | 'EXPIRE'
    | 'RECONCILE_EXCEPTION'
    | 'RECONCILE_SUCCESS'
    | 'REJECT_APPROVALS'
    | 'REJECT_AUTHORIZATION'
    | 'REJECT_POLICY_BLOCK'
    | 'REJECT_VERIFICATION'
    | 'SUPERSEDE';
  kind: 'PAYMENT_TERMINAL';
  outcome:
    | 'CANCELLED'
    | 'EXPIRED'
    | 'RECONCILED'
    | 'RECONCILIATION_EXCEPTION'
    | 'REJECTED'
    | 'SUPERSEDED';
  previousState: PaymentActionState;
  recordedAt: string;
}>;
export type PaymentTerminalRecord = Readonly<
  PaymentTerminalRecordCore & { recordDigest: string }
>;

export type PaymentActionAggregate = Readonly<{
  authorization: AuthorizationBundleV1;
  authorizationAudit: AdapterVerifiedAuthorizationAudit | null;
  authorizationBasis: PaymentAuthorizationBasis | null;
  auditAuthority: RequestingAgentExecutionFact | null;
  cancellationAudit: AdapterVerifiedCancellationAudit | null;
  consumptionClaim: AtomicSettlementConsumptionClaim | null;
  evidenceResult: AdapterVerifiedEvidenceResult | null;
  executionAudit: AdapterVerifiedExecutionAudit | null;
  executionApprovals: readonly AdapterVerifiedApprovalFact[] | null;
  executionAuthority: RequestingAgentExecutionFact | null;
  metadata: PaymentAggregateMetadata;
  settlementAttempt: FrozenSettlementAttempt | null;
  settlementReceipt: AdapterVerifiedSettlementReceipt | null;
  settlementUncertainty: AdapterVerifiedSettlementUncertainty | null;
  state: PaymentActionState;
  terminal: PaymentTerminalRecord | null;
  verificationPayment: AdapterVerifiedVerificationPayment | null;
}>;

export type PaymentActionEvent =
  | Readonly<{ type: 'CLASSIFY' }>
  | Readonly<{ type: 'REJECT_POLICY_BLOCK' }>
  | Readonly<{ type: 'SATISFY_EVIDENCE_NOT_REQUIRED' }>
  | Readonly<{ type: 'QUOTE_VERIFICATION' }>
  | Readonly<{
      payment: AdapterVerifiedVerificationPayment;
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
      requestingAgent: RequestingAgentExecutionFact;
      reservationLedger: MandateReservationLedger;
      type: 'AUTHORIZE_MANDATE';
    }>
  | Readonly<{ type: 'AWAIT_APPROVALS' }>
  | Readonly<{
      approvals: readonly AdapterVerifiedApprovalFact[];
      requestingAgent: RequestingAgentExecutionFact;
      type: 'AUTHORIZE_APPROVALS';
    }>
  | Readonly<{ type: 'REJECT_APPROVALS' }>
  | Readonly<{
      reservationLedger: MandateReservationLedger | null;
      type: 'REJECT_AUTHORIZATION';
    }>
  | Readonly<{
      authorizationAudit: AdapterVerifiedAuthorizationAudit;
      requestingAgent: RequestingAgentExecutionFact;
      type: 'COMMIT_AUDIT';
    }>
  | Readonly<{ type: 'START_AUTHORIZATION_RECOVERY' }>
  | Readonly<{
      authorizationAudit: AdapterVerifiedAuthorizationAudit;
      requestingAgent: RequestingAgentExecutionFact;
      type: 'RECOVER_AUDIT';
    }>
  | Readonly<{
      approvals: readonly AdapterVerifiedApprovalFact[] | null;
      attempt: FrozenSettlementAttempt;
      mandate: StandingMandateAggregate | null;
      requestingAgent: RequestingAgentExecutionFact;
      reservationLedger: MandateReservationLedger | null;
      type: 'QUEUE_SETTLEMENT';
    }>
  | Readonly<{
      consumptionClaim: AtomicSettlementConsumptionClaim;
      receipt: AdapterVerifiedSettlementReceipt;
      reservationLedger: MandateReservationLedger | null;
      type: 'SETTLE_CONSENSUS';
    }>
  | Readonly<{
      type: 'START_SETTLEMENT_RECOVERY';
      uncertainty: AdapterVerifiedSettlementUncertainty;
    }>
  | Readonly<{
      consumptionClaim: AtomicSettlementConsumptionClaim;
      receipt: AdapterVerifiedSettlementReceipt;
      reservationLedger: MandateReservationLedger | null;
      type: 'RECOVER_SETTLEMENT';
    }>
  | Readonly<{
      approvals: readonly AdapterVerifiedApprovalFact[] | null;
      mandate: StandingMandateAggregate | null;
      requestingAgent: RequestingAgentExecutionFact;
      reservationLedger: MandateReservationLedger | null;
      type: 'RETRY_SAME_TRANSACTION';
    }>
  | Readonly<{
      executionAudit: AdapterVerifiedExecutionAudit;
      type: 'CONFIRM_EXECUTION_AUDIT';
    }>
  | Readonly<{ type: 'MARK_EXECUTION_AUDIT_DEGRADED' }>
  | Readonly<{ type: 'RETRY_EXECUTION_AUDIT' }>
  | Readonly<{
      executionAudit: AdapterVerifiedExecutionAudit;
      type: 'RECOVER_EXECUTION_AUDIT';
    }>
  | Readonly<{ type: 'START_RECONCILIATION' }>
  | Readonly<{ type: 'RECONCILE_SUCCESS' }>
  | Readonly<{ type: 'RECONCILE_EXCEPTION' }>
  | Readonly<{
      reservationLedger: MandateReservationLedger | null;
      type: 'EXPIRE';
    }>
  | Readonly<{
      reservationLedger: MandateReservationLedger | null;
      type: 'SUPERSEDE';
    }>
  | Readonly<{
      cancellationAudit: AdapterVerifiedCancellationAudit;
      reservationLedger: MandateReservationLedger | null;
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
  'REJECT_AUTHORIZATION',
  'COMMIT_AUDIT',
  'START_AUTHORIZATION_RECOVERY',
  'RECOVER_AUDIT',
  'QUEUE_SETTLEMENT',
  'SETTLE_CONSENSUS',
  'START_SETTLEMENT_RECOVERY',
  'RECOVER_SETTLEMENT',
  'RETRY_SAME_TRANSACTION',
  'CONFIRM_EXECUTION_AUDIT',
  'MARK_EXECUTION_AUDIT_DEGRADED',
  'RETRY_EXECUTION_AUDIT',
  'RECOVER_EXECUTION_AUDIT',
  'START_RECONCILIATION',
  'RECONCILE_SUCCESS',
  'RECONCILE_EXCEPTION',
  'EXPIRE',
  'SUPERSEDE',
  'CANCEL',
] as const satisfies readonly PaymentActionEventType[];

export type MandateReservationWriteEffect = Readonly<{
  atomicGroupKey: string;
  claim: MandateReservationClaim;
  expectedLedger: MandateReservationLedger;
  nextLedger: MandateReservationLedger;
  operation: 'RELEASE' | 'RESERVE' | 'SETTLE';
  type: 'MANDATE_RESERVATION_WRITE';
}>;

export type SettlementConsumptionWriteEffect = Readonly<{
  atomicGroupKey: string;
  claim: AtomicSettlementConsumptionClaim;
  receipt: AdapterVerifiedSettlementReceipt;
  type: 'SETTLEMENT_CONSUMPTION_WRITE';
}>;

export type VerificationQuoteRequestEffect = Readonly<{
  actionDigest: string;
  atomicGroupKey: string;
  evidencePolicyDigest: string;
  eventId: string;
  expiresAt: string;
  idempotencyKey: string;
  serviceId: string;
  serviceKeyId: string;
  serviceNetworkId: string;
  type: 'VERIFICATION_QUOTE_REQUEST';
}>;

export type SettlementRetryRequestEffect = Readonly<{
  atomicGroupKey: string;
  attempt: FrozenSettlementAttempt;
  authorityFactDigest: string;
  authorizationBasisDigest: string;
  evidenceResultDigest: string | null;
  eventId: string;
  idempotencyKey: string;
  requestingAgent: RequestingAgentExecutionFact;
  type: 'SETTLEMENT_RETRY_REQUEST';
}>;

export type SettlementSubmissionRequestEffect = Readonly<{
  atomicGroupKey: string;
  attempt: FrozenSettlementAttempt;
  authorityFactDigest: string;
  authorizationBasisDigest: string;
  evidenceResultDigest: string | null;
  eventId: string;
  idempotencyKey: string;
  type: 'SETTLEMENT_SUBMISSION_REQUEST';
}>;

export type ExecutionAuditRequestEffect = Readonly<{
  actionDigest: string;
  atomicGroupKey: string;
  authorizationAuditId: string;
  eventId: string;
  idempotencyKey: string;
  attemptId: string;
  networkId: string;
  receiptId: string;
  receiptRecordDigest: string;
  settlementTransactionId: string;
  signedBytesHash: string;
  type: 'EXECUTION_AUDIT_REQUEST';
}>;

export type PaymentDomainEffect =
  | ExecutionAuditRequestEffect
  | MandateReservationWriteEffect
  | SettlementConsumptionWriteEffect
  | SettlementRetryRequestEffect
  | SettlementSubmissionRequestEffect
  | VerificationQuoteRequestEffect;

export type PaymentActionTransition = Readonly<{
  aggregate: PaymentActionAggregate;
  atomicGroupKey: string;
  effects: readonly PaymentDomainEffect[];
}>;

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
    REJECT_AUTHORIZATION: 'REJECTED',
    SUPERSEDE: 'SUPERSEDED',
  },
  AUTHORIZED: {
    COMMIT_AUDIT: 'AUDIT_COMMITTED',
    EXPIRE: 'EXPIRED',
    REJECT_AUTHORIZATION: 'REJECTED',
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
  SETTLED_AUDIT_DEGRADED: {
    RECOVER_EXECUTION_AUDIT: 'SETTLED',
    RETRY_EXECUTION_AUDIT: 'SETTLED_AUDIT_DEGRADED',
  },
  SETTLED_AUDIT_PENDING: {
    CONFIRM_EXECUTION_AUDIT: 'SETTLED',
    MARK_EXECUTION_AUDIT_DEGRADED: 'SETTLED_AUDIT_DEGRADED',
  },
  SETTLEMENT_PENDING: {
    SETTLE_CONSENSUS: 'SETTLED_AUDIT_PENDING',
    START_SETTLEMENT_RECOVERY: 'SETTLEMENT_RECOVERY',
  },
  SETTLEMENT_RECOVERY: {
    RECOVER_SETTLEMENT: 'SETTLED_AUDIT_PENDING',
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

const AGGREGATE_KEYS = [
  'authorization',
  'authorizationAudit',
  'authorizationBasis',
  'auditAuthority',
  'cancellationAudit',
  'consumptionClaim',
  'evidenceResult',
  'executionAudit',
  'executionApprovals',
  'executionAuthority',
  'metadata',
  'settlementAttempt',
  'settlementReceipt',
  'settlementUncertainty',
  'state',
  'terminal',
  'verificationPayment',
] as const;
const METADATA_KEYS = [
  'lastEventType',
  'lastTransitionAt',
  'previousState',
  'transitionCount',
  'version',
] as const;
const HUMAN_BASIS_KEYS = [
  'approvals',
  'authorizedAt',
  'basisDigest',
  'decisionDigest',
  'kind',
  'requestingAgent',
] as const;
const MANDATE_BASIS_KEYS = [
  'authorizedAt',
  'basisDigest',
  'kind',
  'mandate',
  'requestingAgent',
  'reservationClaim',
  'reservedLedger',
] as const;
const TERMINAL_KEYS = [
  'eventType',
  'kind',
  'outcome',
  'previousState',
  'recordDigest',
  'recordedAt',
] as const;
const NO_PAYLOAD_EVENTS: ReadonlySet<PaymentActionEventType> = new Set([
  'AWAIT_APPROVALS',
  'CLASSIFY',
  'MARK_EXECUTION_AUDIT_DEGRADED',
  'RECONCILE_EXCEPTION',
  'RECONCILE_SUCCESS',
  'REJECT_APPROVALS',
  'REJECT_POLICY_BLOCK',
  'RETRY_EXECUTION_AUDIT',
  'SATISFY_EVIDENCE_NOT_REQUIRED',
  'START_AUTHORIZATION_RECOVERY',
  'START_RECONCILIATION',
]);
const LIVE_ACTION_EVENTS: ReadonlySet<PaymentActionEventType> = new Set([
  'ACCEPT_VERIFICATION',
  'AUTHORIZE_APPROVALS',
  'AUTHORIZE_MANDATE',
  'AWAIT_APPROVALS',
  'CLASSIFY',
  'COMMIT_AUDIT',
  'QUEUE_SETTLEMENT',
  'QUOTE_VERIFICATION',
  'RECORD_VERIFICATION_PAYMENT',
  'RECOVER_AUDIT',
  'RETRY_SAME_TRANSACTION',
  'REJECT_APPROVALS',
  'REJECT_AUTHORIZATION',
  'REJECT_POLICY_BLOCK',
  'REJECT_VERIFICATION',
  'SATISFY_EVIDENCE_NOT_REQUIRED',
  'START_AUTHORIZATION_RECOVERY',
]);

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

function approvalBinding(
  authorization: AuthorizationBundleV1,
  minimumVerifiedAt: string,
): ApprovalBinding {
  return Object.freeze({
    ...actionFactBinding(authorization),
    minimumVerifiedAt,
  });
}

function exactBinding(
  authorization: AuthorizationBundleV1,
  actual: ActionFactBinding,
): boolean {
  return sameActionFactBinding(actionFactBinding(authorization), actual);
}

function parseMetadata(
  input: unknown,
  authorization: AuthorizationBundleV1,
  state: PaymentActionState,
): PaymentAggregateMetadata | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, METADATA_KEYS) ||
    !Number.isSafeInteger(input.version) ||
    !Number.isSafeInteger(input.transitionCount) ||
    (input.version as number) <= 0 ||
    (input.transitionCount as number) < 0 ||
    input.version !== (input.transitionCount as number) + 1 ||
    !isCanonicalUtcInstant(
      typeof input.lastTransitionAt === 'string' ? input.lastTransitionAt : '',
    ) ||
    (input.lastTransitionAt as string) < authorization.actionCore.createdAt
  ) {
    return null;
  }

  if (input.transitionCount === 0) {
    if (
      state !== 'CAPTURED' ||
      input.version !== 1 ||
      input.previousState !== null ||
      input.lastEventType !== null ||
      input.lastTransitionAt !== authorization.actionCore.createdAt
    ) {
      return null;
    }
  } else {
    if (
      typeof input.previousState !== 'string' ||
      !paymentActionStates.includes(
        input.previousState as PaymentActionState,
      ) ||
      typeof input.lastEventType !== 'string' ||
      !paymentActionEventTypes.includes(
        input.lastEventType as PaymentActionEventType,
      ) ||
      transitions[input.previousState as PaymentActionState][
        input.lastEventType as PaymentActionEventType
      ] !== state
    ) {
      return null;
    }
  }

  return Object.freeze({
    lastEventType: input.lastEventType as PaymentActionEventType | null,
    lastTransitionAt: input.lastTransitionAt as string,
    previousState: input.previousState as PaymentActionState | null,
    transitionCount: input.transitionCount as number,
    version: input.version as number,
  });
}

function validateRequestingAgentPolicy(
  fact: RequestingAgentExecutionFact,
  authorization: AuthorizationBundleV1,
): DomainResult<RequestingAgentExecutionFact> {
  const required = authorization.decision.requiredExecutor;
  if (
    !exactBinding(authorization, fact) ||
    fact.effectDigest !== deriveSettlementEffectDigest(authorization)
  ) {
    return refuse('ACTION_DIGEST_MISMATCH');
  }
  if (
    fact.adapterId !== required.adapterId ||
    fact.agentBookRegistry !== required.agentBookRegistry ||
    fact.audience !== required.audience ||
    fact.grantDigest !== required.grant.digest ||
    fact.grantId !== required.grant.id ||
    fact.grantVersion !== required.grant.version ||
    fact.role !== required.requiredRole ||
    fact.scope !== required.requiredScope ||
    fact.subjectId !== fact.agentId ||
    fact.tenantId !== authorization.actionCore.organizationId
  ) {
    return refuse('EXECUTOR_POLICY_MISMATCH');
  }
  if (fact.grantStatus === 'REVOKED') {
    return refuse('EXECUTOR_GRANT_REVOKED');
  }
  if (fact.grantStatus === 'EXPIRED') {
    return refuse('EXECUTOR_GRANT_EXPIRED');
  }
  if (fact.grantStatus !== 'CURRENT') {
    return refuse('EXECUTOR_GRANT_UNVERIFIED');
  }
  if (fact.companyRoleStatus === 'REVOKED') {
    return refuse('ROLE_REVOKED');
  }
  if (fact.companyRoleStatus === 'EXPIRED') {
    return refuse('ROLE_EXPIRED');
  }
  if (fact.companyRoleStatus !== 'CURRENT') {
    return refuse('ROLE_UNVERIFIED');
  }
  if (fact.agentBookStatus !== 'CURRENT') {
    return refuse('AGENT_BACKING_UNVERIFIED');
  }
  return accept(fact);
}

function validateRequestingAgent(
  input: unknown,
  authorization: AuthorizationBundleV1,
  now: string,
  minimumVerifiedAt: string,
): DomainResult<RequestingAgentExecutionFact> {
  const fact = parseRequestingAgentExecutionFact(input);
  if (fact === null) {
    return refuse('REQUESTING_AGENT_FACT_INVALID');
  }
  const policy = validateRequestingAgentPolicy(fact, authorization);
  if (!policy.ok) {
    return policy;
  }
  if (
    fact.verifiedAt < minimumVerifiedAt ||
    fact.verifiedAt > now ||
    now >= fact.expiresAt ||
    fact.expiresAt > authorization.actionCore.expiresAt
  ) {
    return refuse('REQUESTING_AGENT_STALE');
  }
  return accept(fact);
}

function sameRequestingAgentIdentity(
  original: RequestingAgentExecutionFact,
  current: RequestingAgentExecutionFact,
): boolean {
  return (
    original.adapterId === current.adapterId &&
    original.agentId === current.agentId &&
    original.agentKitChallengeId === current.agentKitChallengeId &&
    original.agentTenantPrincipal === current.agentTenantPrincipal &&
    original.actionHumanPrincipal === current.actionHumanPrincipal &&
    original.agentBookRegistry === current.agentBookRegistry &&
    original.audience === current.audience &&
    original.grantDigest === current.grantDigest &&
    original.grantId === current.grantId &&
    original.grantVersion === current.grantVersion &&
    original.factId === current.factId &&
    original.role === current.role &&
    original.roleCredentialId === current.roleCredentialId &&
    original.agentBackingRecordId === current.agentBackingRecordId &&
    original.scope === current.scope &&
    original.signedProofDigest === current.signedProofDigest &&
    original.subjectId === current.subjectId &&
    original.tenantId === current.tenantId &&
    current.verifiedAt >= original.verifiedAt &&
    current.expiresAt <= original.expiresAt
  );
}

function createHumanBasis(
  authorization: AuthorizationBundleV1,
  approvals: readonly AdapterVerifiedApprovalFact[],
  requestingAgent: RequestingAgentExecutionFact,
  authorizedAt: string,
): HumanAuthorizationBasis {
  const core = Object.freeze({
    approvals,
    authorizedAt,
    decisionDigest: hashPolicyDecision(authorization.decision),
    kind: 'HUMAN_APPROVAL' as const,
    requestingAgent,
  });
  return Object.freeze({
    ...core,
    basisDigest: hashAdapterRecord('HUMAN_AUTHORIZATION_BASIS', core),
  });
}

function createMandateBasis(
  mandate: StandingMandateAggregate,
  requestingAgent: RequestingAgentExecutionFact,
  reservationClaim: MandateReservationClaim,
  reservedLedger: MandateReservationLedger,
  authorizedAt: string,
): MandateAuthorizationBasis {
  const core = Object.freeze({
    authorizedAt,
    kind: 'MANDATE' as const,
    mandate,
    requestingAgent,
    reservationClaim,
    reservedLedger,
  });
  return Object.freeze({
    ...core,
    basisDigest: hashAdapterRecord('MANDATE_AUTHORIZATION_BASIS', core),
  });
}

function parseAuthorizationBasis(
  input: unknown,
  authorization: AuthorizationBundleV1,
): DomainResult<PaymentAuthorizationBasis> {
  if (
    !isRecord(input) ||
    !isCanonicalUtcInstant(input.authorizedAt as string) ||
    (input.authorizedAt as string) < authorization.decision.evaluatedAt ||
    (input.authorizedAt as string) >= authorization.actionCore.expiresAt
  ) {
    return refuse('AUTHORIZATION_BASIS_INVALID');
  }
  const requestingAgent = validateRequestingAgent(
    input.requestingAgent,
    authorization,
    input.authorizedAt as string,
    authorization.decision.evaluatedAt,
  );
  if (!requestingAgent.ok) {
    return refuse('AUTHORIZATION_BASIS_INVALID');
  }

  if (input.kind === 'HUMAN_APPROVAL') {
    if (
      !hasExactKeys(input, HUMAN_BASIS_KEYS) ||
      !isSha256Digest(input.basisDigest) ||
      input.decisionDigest !== hashPolicyDecision(authorization.decision) ||
      !Array.isArray(input.approvals)
    ) {
      return refuse('AUTHORIZATION_BASIS_INVALID');
    }
    const { basisDigest, ...core } = input;
    if (basisDigest !== hashAdapterRecord('HUMAN_AUTHORIZATION_BASIS', core)) {
      return refuse('AUTHORIZATION_BASIS_INVALID');
    }
    const approvals = validateApprovalQuorum(
      approvalBinding(authorization, authorization.decision.evaluatedAt),
      authorization.decision.requiredAuthority,
      input.approvals,
      input.authorizedAt as string,
    );
    if (!approvals.ok || authorization.decision.route !== 'HUMAN_APPROVAL') {
      return refuse('AUTHORIZATION_BASIS_INVALID');
    }
    return accept(
      Object.freeze({
        approvals: approvals.value,
        authorizedAt: input.authorizedAt as string,
        basisDigest,
        decisionDigest: input.decisionDigest as string,
        kind: input.kind,
        requestingAgent: requestingAgent.value,
      }),
    );
  }

  if (
    input.kind !== 'MANDATE' ||
    !hasExactKeys(input, MANDATE_BASIS_KEYS) ||
    !isSha256Digest(input.basisDigest)
  ) {
    return refuse('AUTHORIZATION_BASIS_INVALID');
  }
  const { basisDigest, ...core } = input;
  if (basisDigest !== hashAdapterRecord('MANDATE_AUTHORIZATION_BASIS', core)) {
    return refuse('AUTHORIZATION_BASIS_INVALID');
  }
  const containment = validateMandateContainment(
    authorization,
    input.mandate,
    input.authorizedAt as string,
  );
  if (
    !containment.ok ||
    canonicalizeJson(containment.value) !==
      canonicalizeJson(input.reservationClaim)
  ) {
    return refuse('AUTHORIZATION_BASIS_INVALID');
  }
  const reserved = validateActiveMandateReservation(
    input.reservedLedger,
    containment.value,
  );
  if (!reserved.ok) {
    return refuse('AUTHORIZATION_BASIS_INVALID');
  }
  return accept(
    Object.freeze({
      authorizedAt: input.authorizedAt as string,
      basisDigest,
      kind: input.kind,
      mandate: input.mandate as StandingMandateAggregate,
      requestingAgent: requestingAgent.value,
      reservationClaim: containment.value,
      reservedLedger: input.reservedLedger as MandateReservationLedger,
    }),
  );
}

function parseTerminalRecord(
  input: unknown,
  state: PaymentActionState,
  metadata: PaymentAggregateMetadata,
): PaymentTerminalRecord | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, TERMINAL_KEYS) ||
    !hasValidAdapterRecordDigest(input, 'PAYMENT_TERMINAL') ||
    input.kind !== 'PAYMENT_TERMINAL' ||
    input.outcome !== state ||
    input.eventType !== metadata.lastEventType ||
    input.previousState !== metadata.previousState ||
    input.recordedAt !== metadata.lastTransitionAt
  ) {
    return null;
  }
  return Object.freeze({ ...input }) as PaymentTerminalRecord;
}

function createTerminalRecord(
  eventType: PaymentTerminalRecordCore['eventType'],
  outcome: PaymentTerminalRecordCore['outcome'],
  previousState: PaymentActionState,
  recordedAt: string,
): PaymentTerminalRecord {
  const core = Object.freeze({
    eventType,
    kind: 'PAYMENT_TERMINAL' as const,
    outcome,
    previousState,
    recordedAt,
  });
  return Object.freeze({
    ...core,
    recordDigest: hashAdapterRecord('PAYMENT_TERMINAL', core),
  });
}

function parseApprovalFacts(
  input: unknown,
): readonly AdapterVerifiedApprovalFact[] | null {
  if (!Array.isArray(input) || input.length > 255) {
    return null;
  }
  const facts: AdapterVerifiedApprovalFact[] = [];
  for (const candidate of input) {
    const fact = parseAdapterVerifiedApprovalFact(candidate);
    if (fact === null) {
      return null;
    }
    facts.push(fact);
  }
  return Object.freeze(facts);
}

type ParsedAggregateFacts = Omit<
  PaymentActionAggregate,
  'authorization' | 'metadata' | 'state'
>;

function parseAggregateFacts(
  input: Record<string, unknown>,
  authorization: AuthorizationBundleV1,
): ParsedAggregateFacts | null {
  const verificationPayment =
    input.verificationPayment === null
      ? null
      : parseAdapterVerifiedVerificationPayment(input.verificationPayment);
  const evidenceResult =
    input.evidenceResult === null
      ? null
      : parseAdapterVerifiedEvidenceResult(input.evidenceResult);
  const executionAudit =
    input.executionAudit === null
      ? null
      : parseAdapterVerifiedExecutionAudit(input.executionAudit);
  const authorizationBasis =
    input.authorizationBasis === null
      ? null
      : parseAuthorizationBasis(input.authorizationBasis, authorization);
  const authorizationAudit =
    input.authorizationAudit === null
      ? null
      : parseAdapterVerifiedAuthorizationAudit(input.authorizationAudit);
  const auditAuthority =
    input.auditAuthority === null
      ? null
      : parseRequestingAgentExecutionFact(input.auditAuthority);
  const cancellationAudit =
    input.cancellationAudit === null
      ? null
      : parseAdapterVerifiedCancellationAudit(input.cancellationAudit);
  const settlementAttempt =
    input.settlementAttempt === null
      ? null
      : parseFrozenSettlementAttempt(input.settlementAttempt);
  const settlementUncertainty =
    input.settlementUncertainty === null
      ? null
      : parseAdapterVerifiedSettlementUncertainty(input.settlementUncertainty);
  const settlementReceipt =
    input.settlementReceipt === null
      ? null
      : parseAdapterVerifiedSettlementReceipt(input.settlementReceipt);
  const consumptionClaim =
    input.consumptionClaim === null
      ? null
      : parseAtomicSettlementConsumptionClaim(input.consumptionClaim);
  const executionAuthority =
    input.executionAuthority === null
      ? null
      : parseRequestingAgentExecutionFact(input.executionAuthority);
  const executionApprovals =
    input.executionApprovals === null
      ? null
      : parseApprovalFacts(input.executionApprovals);

  if (
    (input.verificationPayment !== null && verificationPayment === null) ||
    (input.evidenceResult !== null && evidenceResult === null) ||
    (input.executionAudit !== null && executionAudit === null) ||
    (input.authorizationBasis !== null && !authorizationBasis?.ok) ||
    (input.authorizationAudit !== null && authorizationAudit === null) ||
    (input.auditAuthority !== null && auditAuthority === null) ||
    (input.cancellationAudit !== null && cancellationAudit === null) ||
    (input.settlementAttempt !== null && settlementAttempt === null) ||
    (input.settlementUncertainty !== null && settlementUncertainty === null) ||
    (input.settlementReceipt !== null && settlementReceipt === null) ||
    (input.consumptionClaim !== null && consumptionClaim === null) ||
    (input.executionAuthority !== null && executionAuthority === null) ||
    (input.executionApprovals !== null && executionApprovals === null)
  ) {
    return null;
  }
  const parsedAuthorizationBasis =
    authorizationBasis !== null && authorizationBasis.ok
      ? authorizationBasis.value
      : null;

  return Object.freeze({
    authorizationAudit,
    authorizationBasis: parsedAuthorizationBasis,
    auditAuthority,
    cancellationAudit,
    consumptionClaim,
    evidenceResult,
    executionAudit,
    executionApprovals,
    executionAuthority,
    settlementAttempt,
    settlementReceipt,
    settlementUncertainty,
    terminal: null,
    verificationPayment,
  });
}

function factsBindAuthorization(
  authorization: AuthorizationBundleV1,
  facts: ParsedAggregateFacts,
): boolean {
  const candidates: ActionFactBinding[] = [];
  for (const candidate of [
    facts.verificationPayment,
    facts.evidenceResult,
    facts.executionAudit,
    facts.authorizationAudit,
    facts.auditAuthority,
    facts.cancellationAudit,
    facts.settlementAttempt,
    facts.settlementUncertainty,
    facts.settlementReceipt,
    facts.consumptionClaim,
    facts.executionAuthority,
  ]) {
    if (candidate !== null) {
      candidates.push(candidate);
    }
  }
  candidates.push(...(facts.executionApprovals ?? []));
  return candidates.every((candidate) =>
    exactBinding(authorization, candidate),
  );
}

function evidenceFactsValid(
  authorization: AuthorizationBundleV1,
  facts: ParsedAggregateFacts,
  stage: 'NONE' | 'PAID' | 'SATISFIED' | 'REJECTED',
): boolean {
  const required = authorization.decision.verificationMode === 'REQUIRED';
  if (!required) {
    return facts.verificationPayment === null && facts.evidenceResult === null;
  }
  if (stage === 'NONE') {
    return facts.verificationPayment === null && facts.evidenceResult === null;
  }
  if (facts.verificationPayment === null) {
    return false;
  }
  if (
    facts.verificationPayment.evidencePolicyDigest !==
      authorization.decision.evidencePolicy.digest ||
    facts.verificationPayment.serviceId !==
      authorization.decision.evidencePolicy.serviceId ||
    facts.verificationPayment.serviceKeyId !==
      authorization.decision.evidencePolicy.serviceKeyId ||
    facts.verificationPayment.serviceNetworkId !==
      authorization.decision.evidencePolicy.serviceNetworkId ||
    facts.verificationPayment.paymentNetworkId !==
      authorization.decision.evidencePolicy.serviceNetworkId ||
    facts.verificationPayment.paidAt < authorization.decision.evaluatedAt ||
    facts.verificationPayment.paidAt >= authorization.actionCore.expiresAt
  ) {
    return false;
  }
  if (stage === 'PAID') {
    return facts.evidenceResult === null;
  }
  if (
    facts.evidenceResult === null ||
    facts.evidenceResult.evidencePolicyDigest !==
      authorization.decision.evidencePolicy.digest ||
    facts.evidenceResult.evidenceRoot !==
      authorization.actionCore.evidenceRoot ||
    facts.evidenceResult.servicePaymentId !==
      facts.verificationPayment.servicePaymentId ||
    facts.evidenceResult.serviceRequestDigest !==
      facts.verificationPayment.serviceRequestDigest ||
    facts.evidenceResult.paymentAttemptId !==
      facts.verificationPayment.paymentAttemptId ||
    facts.evidenceResult.paymentNetworkId !==
      facts.verificationPayment.paymentNetworkId ||
    facts.evidenceResult.paymentTransactionId !==
      facts.verificationPayment.paymentTransactionId ||
    facts.evidenceResult.quoteDigest !==
      facts.verificationPayment.quoteDigest ||
    facts.evidenceResult.quoteId !== facts.verificationPayment.quoteId ||
    facts.evidenceResult.serviceId !== facts.verificationPayment.serviceId ||
    facts.evidenceResult.serviceKeyId !==
      facts.verificationPayment.serviceKeyId ||
    facts.evidenceResult.serviceNetworkId !==
      facts.verificationPayment.serviceNetworkId ||
    facts.evidenceResult.verifiedAt < facts.verificationPayment.paidAt ||
    facts.evidenceResult.expiresAt > authorization.actionCore.expiresAt
  ) {
    return false;
  }
  return stage === 'SATISFIED'
    ? facts.evidenceResult.result === 'MATCH'
    : facts.evidenceResult.result !== 'MATCH';
}

function validateCurrentMatchEvidence(
  aggregate: PaymentActionAggregate,
  now: string,
): DomainResult<AdapterVerifiedEvidenceResult | null> {
  if (now >= aggregate.authorization.actionCore.expiresAt) {
    return refuse('ACTION_EXPIRED');
  }
  if (aggregate.authorization.decision.verificationMode === 'NOT_REQUIRED') {
    return aggregate.evidenceResult === null
      ? accept(null)
      : refuse('VERIFICATION_MODE_MISMATCH');
  }
  const evidence = aggregate.evidenceResult;
  if (
    evidence === null ||
    evidence.result !== 'MATCH' ||
    evidence.verifiedAt > now
  ) {
    return refuse('VERIFICATION_MISMATCH');
  }
  if (now >= evidence.expiresAt) {
    return refuse('VERIFICATION_EXPIRED');
  }
  return accept(evidence);
}

function authorizationFactsValid(
  authorization: AuthorizationBundleV1,
  facts: ParsedAggregateFacts,
  requireAudit: boolean,
): boolean {
  const basis = facts.authorizationBasis;
  if (basis === null) {
    return false;
  }
  const audit = facts.authorizationAudit;
  const authority = facts.auditAuthority;
  if (!requireAudit) {
    return (
      audit === null &&
      authority === null &&
      basis.requestingAgent.effectDigest ===
        deriveSettlementEffectDigest(authorization)
    );
  }

  const validatedAuthority =
    audit === null || authority === null
      ? null
      : validateRequestingAgent(
          authority,
          authorization,
          audit.committedAt,
          basis.authorizedAt,
        );
  return (
    audit !== null &&
    authority !== null &&
    validatedAuthority?.ok === true &&
    sameRequestingAgentIdentity(basis.requestingAgent, authority) &&
    audit.authorizationBasisDigest === basis.basisDigest &&
    audit.authorityFactDigest === authority.recordDigest &&
    audit.networkId === authorization.actionCore.settlement.networkId &&
    audit.committedAt >= basis.authorizedAt &&
    audit.committedAt < authorization.actionCore.expiresAt
  );
}

function executionFactsValid(
  authorization: AuthorizationBundleV1,
  facts: ParsedAggregateFacts,
): boolean {
  const basis = facts.authorizationBasis;
  const audit = facts.authorizationAudit;
  const attempt = facts.settlementAttempt;
  const current = facts.executionAuthority;
  if (
    basis === null ||
    audit === null ||
    attempt === null ||
    current === null
  ) {
    return false;
  }
  const validatedAuthority = validateRequestingAgent(
    current,
    authorization,
    attempt.createdAt,
    audit.committedAt,
  );
  if (
    !validatedAuthority.ok ||
    !sameRequestingAgentIdentity(basis.requestingAgent, current) ||
    current.effectDigest !== attempt.effectDigest ||
    attempt.effectDigest !== deriveSettlementEffectDigest(authorization) ||
    attempt.idempotencyKey !== deriveSettlementIdempotencyKey(authorization) ||
    attempt.networkId !== authorization.actionCore.settlement.networkId ||
    attempt.expiresAt !== authorization.actionCore.expiresAt ||
    attempt.createdAt < audit.committedAt ||
    current.verifiedAt > attempt.createdAt ||
    attempt.createdAt >= attempt.expiresAt ||
    current.expiresAt <= attempt.createdAt
  ) {
    return false;
  }
  if (basis.kind === 'MANDATE') {
    return facts.executionApprovals === null;
  }
  if (facts.executionApprovals === null) {
    return false;
  }
  const approvals = validateApprovalQuorum(
    approvalBinding(
      authorization,
      facts.authorizationAudit?.committedAt ?? basis.authorizedAt,
    ),
    authorization.decision.requiredAuthority,
    facts.executionApprovals,
    attempt.createdAt,
  );
  return (
    approvals.ok && sameApprovalIdentities(basis.approvals, approvals.value)
  );
}

function settlementFactsValid(
  facts: ParsedAggregateFacts,
  requireReceipt: boolean,
): boolean {
  const attempt = facts.settlementAttempt;
  if (attempt === null) {
    return false;
  }
  if (!requireReceipt) {
    return facts.settlementReceipt === null && facts.consumptionClaim === null;
  }
  const receipt = facts.settlementReceipt;
  const claim = facts.consumptionClaim;
  return (
    receipt !== null &&
    claim !== null &&
    receipt.adapterId === attempt.adapterId &&
    receipt.attemptAdapterId === attempt.adapterId &&
    receipt.attemptId === attempt.attemptId &&
    receipt.idempotencyKey === attempt.idempotencyKey &&
    receipt.effectDigest === attempt.effectDigest &&
    receipt.transactionId === attempt.transactionId &&
    receipt.signedBytesHash === attempt.signedBytesHash &&
    receipt.signedTransactionBytes === attempt.signedTransactionBytes &&
    receipt.networkId === attempt.networkId &&
    claim.attemptId === attempt.attemptId &&
    claim.idempotencyKey === attempt.idempotencyKey &&
    claim.receiptId === receipt.receiptId &&
    claim.atomicGroupKey ===
      `payment:${attempt.actionDigest}:v${claim.expectedAggregateVersion + 1}` &&
    claim.consumedAt >= receipt.settledAt
  );
}

function executionAuditFactsValid(
  authorization: AuthorizationBundleV1,
  facts: ParsedAggregateFacts,
  requireAudit: boolean,
): boolean {
  const executionAudit = facts.executionAudit;
  if (!requireAudit) {
    return executionAudit === null;
  }
  const authorizationAudit = facts.authorizationAudit;
  const attempt = facts.settlementAttempt;
  const receipt = facts.settlementReceipt;
  return (
    executionAudit !== null &&
    authorizationAudit !== null &&
    attempt !== null &&
    receipt !== null &&
    exactBinding(authorization, executionAudit) &&
    executionAudit.adapterId === authorizationAudit.adapterId &&
    executionAudit.authorizationAuditId === authorizationAudit.auditId &&
    executionAudit.eventId === deriveExecutionAuditEventId(attempt) &&
    executionAudit.attemptId === attempt.attemptId &&
    executionAudit.networkId === attempt.networkId &&
    executionAudit.receiptId === receipt.receiptId &&
    executionAudit.receiptRecordDigest === receipt.recordDigest &&
    executionAudit.settlementTransactionId === attempt.transactionId &&
    executionAudit.signedBytesHash === attempt.signedBytesHash &&
    executionAudit.writerAccountId === authorizationAudit.writerAccountId &&
    executionAudit.writerId === authorizationAudit.writerId &&
    executionAudit.writerKeyId === authorizationAudit.writerKeyId &&
    executionAudit.committedAt >= receipt.settledAt
  );
}

function uncertaintyMatchesAttempt(
  uncertainty: AdapterVerifiedSettlementUncertainty,
  attempt: FrozenSettlementAttempt,
): boolean {
  return (
    uncertainty.adapterId === attempt.adapterId &&
    uncertainty.attemptAdapterId === attempt.adapterId &&
    uncertainty.attemptId === attempt.attemptId &&
    uncertainty.effectDigest === attempt.effectDigest &&
    uncertainty.idempotencyKey === attempt.idempotencyKey &&
    uncertainty.networkId === attempt.networkId &&
    uncertainty.signedBytesHash === attempt.signedBytesHash &&
    uncertainty.signedTransactionBytes === attempt.signedTransactionBytes &&
    uncertainty.transactionId === attempt.transactionId &&
    uncertainty.observedAt >= attempt.createdAt
  );
}

function noAuthorizationFacts(facts: ParsedAggregateFacts): boolean {
  return (
    facts.authorizationBasis === null &&
    facts.authorizationAudit === null &&
    facts.auditAuthority === null &&
    facts.cancellationAudit === null &&
    facts.executionAudit === null &&
    facts.executionAuthority === null &&
    facts.executionApprovals === null &&
    facts.settlementAttempt === null &&
    facts.settlementUncertainty === null &&
    facts.settlementReceipt === null &&
    facts.consumptionClaim === null
  );
}

function validateFactsForState(
  state: PaymentActionState,
  authorization: AuthorizationBundleV1,
  facts: ParsedAggregateFacts,
  rejectedEvidence = false,
): boolean {
  if (
    (state === 'CAPTURED' ||
      state === 'CLASSIFIED' ||
      state === 'VERIFICATION_QUOTED') &&
    !evidenceFactsValid(authorization, facts, 'NONE')
  ) {
    return false;
  }
  if (
    state === 'VERIFICATION_PAID' &&
    !evidenceFactsValid(authorization, facts, 'PAID')
  ) {
    return false;
  }
  const afterEvidence = new Set<PaymentActionState>([
    'EVIDENCE_SATISFIED',
    'AWAITING_APPROVALS',
    'AUTHORIZED',
    'AUTHORIZATION_RECOVERY',
    'AUDIT_COMMITTED',
    'SETTLEMENT_PENDING',
    'SETTLEMENT_RECOVERY',
    'SETTLED_AUDIT_PENDING',
    'SETTLED_AUDIT_DEGRADED',
    'SETTLED',
    'RECONCILING',
    'RECONCILED',
    'RECONCILIATION_EXCEPTION',
  ]);
  if (
    afterEvidence.has(state) &&
    !evidenceFactsValid(
      authorization,
      facts,
      rejectedEvidence ? 'REJECTED' : 'SATISFIED',
    )
  ) {
    return false;
  }

  const beforeAuthorization = new Set<PaymentActionState>([
    'CAPTURED',
    'CLASSIFIED',
    'VERIFICATION_QUOTED',
    'VERIFICATION_PAID',
    'EVIDENCE_SATISFIED',
    'AWAITING_APPROVALS',
  ]);
  if (beforeAuthorization.has(state) && !noAuthorizationFacts(facts)) {
    return false;
  }

  const authorizedStates = new Set<PaymentActionState>([
    'AUTHORIZED',
    'AUTHORIZATION_RECOVERY',
    'AUDIT_COMMITTED',
    'SETTLEMENT_PENDING',
    'SETTLEMENT_RECOVERY',
    'SETTLED_AUDIT_PENDING',
    'SETTLED_AUDIT_DEGRADED',
    'SETTLED',
    'RECONCILING',
    'RECONCILED',
    'RECONCILIATION_EXCEPTION',
  ]);
  if (
    authorizedStates.has(state) &&
    !authorizationFactsValid(
      authorization,
      facts,
      state !== 'AUTHORIZED' && state !== 'AUTHORIZATION_RECOVERY',
    )
  ) {
    return false;
  }
  if (
    (state === 'AUTHORIZED' || state === 'AUTHORIZATION_RECOVERY') &&
    (facts.executionAuthority !== null ||
      facts.auditAuthority !== null ||
      facts.executionAudit !== null ||
      facts.executionApprovals !== null ||
      facts.settlementAttempt !== null ||
      facts.settlementUncertainty !== null ||
      facts.settlementReceipt !== null ||
      facts.consumptionClaim !== null)
  ) {
    return false;
  }
  if (
    state === 'AUDIT_COMMITTED' &&
    (facts.auditAuthority === null ||
      facts.executionAudit !== null ||
      facts.executionAuthority !== null ||
      facts.executionApprovals !== null ||
      facts.settlementAttempt !== null ||
      facts.settlementUncertainty !== null ||
      facts.settlementReceipt !== null ||
      facts.consumptionClaim !== null)
  ) {
    return false;
  }

  const attemptedStates = new Set<PaymentActionState>([
    'SETTLEMENT_PENDING',
    'SETTLEMENT_RECOVERY',
    'SETTLED_AUDIT_PENDING',
    'SETTLED_AUDIT_DEGRADED',
    'SETTLED',
    'RECONCILING',
    'RECONCILED',
    'RECONCILIATION_EXCEPTION',
  ]);
  if (
    attemptedStates.has(state) &&
    (!executionFactsValid(authorization, facts) ||
      !settlementFactsValid(
        facts,
        state === 'SETTLED_AUDIT_PENDING' ||
          state === 'SETTLED_AUDIT_DEGRADED' ||
          state === 'SETTLED' ||
          state === 'RECONCILING' ||
          state === 'RECONCILED' ||
          state === 'RECONCILIATION_EXCEPTION',
      ))
  ) {
    return false;
  }
  const executionAuditCommittedStates = new Set<PaymentActionState>([
    'SETTLED',
    'RECONCILING',
    'RECONCILED',
    'RECONCILIATION_EXCEPTION',
  ]);
  if (
    !executionAuditFactsValid(
      authorization,
      facts,
      executionAuditCommittedStates.has(state),
    )
  ) {
    return false;
  }
  if (
    state === 'SETTLEMENT_RECOVERY' &&
    (facts.settlementUncertainty === null ||
      facts.settlementAttempt === null ||
      !uncertaintyMatchesAttempt(
        facts.settlementUncertainty,
        facts.settlementAttempt,
      ))
  ) {
    return false;
  }
  if (
    state === 'SETTLEMENT_PENDING' &&
    facts.settlementUncertainty !== null &&
    (facts.settlementAttempt === null ||
      !uncertaintyMatchesAttempt(
        facts.settlementUncertainty,
        facts.settlementAttempt,
      ))
  ) {
    return false;
  }
  return true;
}

function retainedFactChronologyValid(
  authorization: AuthorizationBundleV1,
  facts: ParsedAggregateFacts,
  metadata: PaymentAggregateMetadata,
): boolean {
  const timestamps: string[] = [];
  const payment = facts.verificationPayment;
  const evidence = facts.evidenceResult;
  const basis = facts.authorizationBasis;
  const audit = facts.authorizationAudit;
  const auditAuthority = facts.auditAuthority;
  const attempt = facts.settlementAttempt;
  const executionAuthority = facts.executionAuthority;
  const uncertainty = facts.settlementUncertainty;
  const receipt = facts.settlementReceipt;
  const claim = facts.consumptionClaim;
  const executionAudit = facts.executionAudit;

  if (payment !== null) {
    if (payment.paidAt < authorization.decision.evaluatedAt) {
      return false;
    }
    timestamps.push(payment.paidAt);
  }
  if (evidence !== null) {
    if (payment === null || evidence.verifiedAt < payment.paidAt) {
      return false;
    }
    timestamps.push(evidence.verifiedAt);
  }
  if (basis !== null) {
    if (
      basis.authorizedAt < authorization.decision.evaluatedAt ||
      basis.requestingAgent.verifiedAt > basis.authorizedAt ||
      basis.requestingAgent.expiresAt <= basis.authorizedAt
    ) {
      return false;
    }
    timestamps.push(basis.requestingAgent.verifiedAt, basis.authorizedAt);
  }
  if (audit !== null || auditAuthority !== null) {
    if (
      basis === null ||
      audit === null ||
      auditAuthority === null ||
      audit.committedAt < basis.authorizedAt ||
      auditAuthority.verifiedAt > audit.committedAt ||
      auditAuthority.expiresAt <= audit.committedAt
    ) {
      return false;
    }
    timestamps.push(auditAuthority.verifiedAt, audit.committedAt);
  }
  if (facts.cancellationAudit !== null) {
    if (
      audit === null ||
      facts.cancellationAudit.committedAt < audit.committedAt
    ) {
      return false;
    }
    timestamps.push(facts.cancellationAudit.committedAt);
  }
  if (attempt !== null || executionAuthority !== null) {
    if (
      audit === null ||
      attempt === null ||
      executionAuthority === null ||
      attempt.createdAt < audit.committedAt ||
      executionAuthority.verifiedAt > attempt.createdAt ||
      executionAuthority.expiresAt <= attempt.createdAt
    ) {
      return false;
    }
    timestamps.push(executionAuthority.verifiedAt, attempt.createdAt);
    timestamps.push(
      ...(facts.executionApprovals ?? []).map(({ verifiedAt }) => verifiedAt),
    );
  }
  if (uncertainty !== null) {
    if (attempt === null || uncertainty.observedAt < attempt.createdAt) {
      return false;
    }
    timestamps.push(uncertainty.observedAt);
  }
  if (receipt !== null) {
    if (attempt === null || receipt.settledAt < attempt.createdAt) {
      return false;
    }
    timestamps.push(receipt.settledAt);
  }
  if (claim !== null) {
    if (receipt === null || claim.consumedAt < receipt.settledAt) {
      return false;
    }
    timestamps.push(claim.consumedAt);
  }
  if (executionAudit !== null) {
    if (receipt === null || executionAudit.committedAt < receipt.settledAt) {
      return false;
    }
    timestamps.push(executionAudit.committedAt);
  }
  return timestamps.every(
    (timestamp) => timestamp <= metadata.lastTransitionAt,
  );
}

function verifyTerminalState(
  aggregate: PaymentActionAggregate,
  facts: ParsedAggregateFacts,
): boolean {
  const terminal = aggregate.terminal;
  const previous = aggregate.metadata.previousState;
  if (terminal === null || previous === null) {
    return false;
  }
  if (aggregate.state === 'REJECTED') {
    if (terminal.eventType === 'REJECT_VERIFICATION') {
      return (
        previous === 'VERIFICATION_PAID' &&
        evidenceFactsValid(aggregate.authorization, facts, 'REJECTED') &&
        noAuthorizationFacts(facts)
      );
    }
    if (terminal.eventType === 'REJECT_POLICY_BLOCK') {
      return (
        previous === 'CLASSIFIED' &&
        aggregate.authorization.decision.route === 'BLOCK' &&
        evidenceFactsValid(aggregate.authorization, facts, 'NONE') &&
        noAuthorizationFacts(facts)
      );
    }
    if (terminal.eventType === 'REJECT_AUTHORIZATION') {
      return (
        (previous === 'AUTHORIZED' || previous === 'AUTHORIZATION_RECOVERY') &&
        validateFactsForState(previous, aggregate.authorization, facts)
      );
    }
    return (
      terminal.eventType === 'REJECT_APPROVALS' &&
      previous === 'AWAITING_APPROVALS' &&
      validateFactsForState(previous, aggregate.authorization, facts)
    );
  }
  if (aggregate.state === 'CANCELLED') {
    return (
      terminal.eventType === 'CANCEL' &&
      previous === 'AUDIT_COMMITTED' &&
      facts.cancellationAudit !== null &&
      facts.authorizationAudit !== null &&
      facts.cancellationAudit.authorizationAuditId ===
        facts.authorizationAudit.auditId &&
      facts.cancellationAudit.networkId ===
        aggregate.authorization.actionCore.settlement.networkId &&
      facts.cancellationAudit.committedAt === terminal.recordedAt &&
      validateFactsForState(previous, aggregate.authorization, facts)
    );
  }
  if (
    aggregate.state === 'RECONCILED' ||
    aggregate.state === 'RECONCILIATION_EXCEPTION'
  ) {
    return validateFactsForState('RECONCILING', aggregate.authorization, facts);
  }
  return validateFactsForState(previous, aggregate.authorization, facts);
}

export function hydratePaymentActionAggregate(
  input: unknown,
): DomainResult<PaymentActionAggregate> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, AGGREGATE_KEYS) ||
    !paymentActionStates.includes(input.state as PaymentActionState)
  ) {
    return refuse('POLICY_CORE_BINDING_MISMATCH');
  }

  try {
    const authorization = verifyAuthorizationBundle(
      input.authorization as AuthorizationBundleV1,
    );
    const state = input.state as PaymentActionState;
    const metadata = parseMetadata(input.metadata, authorization, state);
    const facts = parseAggregateFacts(input, authorization);
    if (
      metadata === null ||
      facts === null ||
      !factsBindAuthorization(authorization, facts)
    ) {
      return refuse('POLICY_CORE_BINDING_MISMATCH');
    }
    const terminal =
      input.terminal === null
        ? null
        : parseTerminalRecord(input.terminal, state, metadata);
    if (
      (input.terminal !== null && terminal === null) ||
      facts.terminal !== null
    ) {
      return refuse('POLICY_CORE_BINDING_MISMATCH');
    }
    const aggregate = Object.freeze({
      ...facts,
      authorization,
      metadata,
      state,
      terminal,
    });
    const valid = terminalStates.has(state)
      ? verifyTerminalState(aggregate, facts)
      : terminal === null &&
        facts.cancellationAudit === null &&
        validateFactsForState(state, authorization, facts);
    return valid && retainedFactChronologyValid(authorization, facts, metadata)
      ? accept(aggregate)
      : refuse('POLICY_CORE_BINDING_MISMATCH');
  } catch {
    return refuse('POLICY_CORE_BINDING_MISMATCH');
  }
}

export function createPaymentActionAggregate(
  authorizationInput: unknown,
): DomainResult<PaymentActionAggregate> {
  try {
    const authorization = verifyAuthorizationBundle(
      authorizationInput as AuthorizationBundleV1,
    );
    return accept(
      Object.freeze({
        authorization,
        authorizationAudit: null,
        authorizationBasis: null,
        auditAuthority: null,
        cancellationAudit: null,
        consumptionClaim: null,
        evidenceResult: null,
        executionAudit: null,
        executionApprovals: null,
        executionAuthority: null,
        metadata: Object.freeze({
          lastEventType: null,
          lastTransitionAt: authorization.actionCore.createdAt,
          previousState: null,
          transitionCount: 0,
          version: 1,
        }),
        settlementAttempt: null,
        settlementReceipt: null,
        settlementUncertainty: null,
        state: 'CAPTURED',
        terminal: null,
        verificationPayment: null,
      }),
    );
  } catch {
    return refuse('POLICY_CORE_BINDING_MISMATCH');
  }
}

function nextMetadata(
  aggregate: PaymentActionAggregate,
  eventType: PaymentActionEventType,
  now: string,
): PaymentAggregateMetadata {
  return Object.freeze({
    lastEventType: eventType,
    lastTransitionAt: now,
    previousState: aggregate.state,
    transitionCount: aggregate.metadata.transitionCount + 1,
    version: aggregate.metadata.version + 1,
  });
}

function atomicGroupKey(
  aggregate: PaymentActionAggregate,
  nextVersion = aggregate.metadata.version + 1,
): string {
  return `payment:${aggregate.authorization.envelope.actionDigest}:v${nextVersion}`;
}

function settlementSubmissionEventId(attempt: FrozenSettlementAttempt): string {
  return `invoiceguard:settlement:submit:v1:${attempt.actionDigest}:${attempt.attemptId}`;
}

function verificationQuoteEventId(aggregate: PaymentActionAggregate): string {
  return `invoiceguard:verification:quote:v1:${aggregate.authorization.envelope.actionDigest}:${aggregate.authorization.decision.evidencePolicy.digest}`;
}

function transitionResult(
  aggregate: PaymentActionAggregate,
  next: PaymentActionState,
  eventType: PaymentActionEventType,
  now: string,
  patch: Partial<PaymentActionAggregate> = {},
  effects: readonly PaymentDomainEffect[] = [],
  terminalEvent?: PaymentTerminalRecordCore['eventType'],
): DomainResult<PaymentActionTransition> {
  const metadata = nextMetadata(aggregate, eventType, now);
  const nextAggregate = Object.freeze({
    ...aggregate,
    ...patch,
    metadata,
    state: next,
    terminal:
      terminalEvent === undefined
        ? aggregate.terminal
        : createTerminalRecord(
            terminalEvent,
            next as PaymentTerminalRecordCore['outcome'],
            aggregate.state,
            now,
          ),
  });
  const verified = hydratePaymentActionAggregate(nextAggregate);
  if (!verified.ok) {
    return verified;
  }
  return accept(
    Object.freeze({
      aggregate: verified.value,
      atomicGroupKey: atomicGroupKey(aggregate),
      effects: Object.freeze(effects),
    }),
  );
}

function sameApprovalIdentities(
  original: readonly AdapterVerifiedApprovalFact[],
  current: readonly AdapterVerifiedApprovalFact[],
): boolean {
  const identity = (approval: AdapterVerifiedApprovalFact) => ({
    actionHumanPrincipal: approval.actionHumanPrincipal,
    adapterId: approval.adapterId,
    agentBackingRecordId: approval.agentBackingRecordId,
    agentKitChallengeId: approval.agentKitChallengeId,
    agentTenantPrincipal: approval.agentTenantPrincipal,
    approvalId: approval.approvalId,
    approvalSessionId: approval.approvalSessionId,
    consumptionClaimId: approval.consumptionClaimId,
    decisionId: approval.decisionId,
    role: approval.role,
    roleCredentialId: approval.roleCredentialId,
    signedProofDigest: approval.signedProofDigest,
    subjectId: approval.subjectId,
    worldProofId: approval.worldProofId,
  });
  const originalByApproval = new Map(
    original.map((approval) => [approval.approvalId, approval]),
  );
  if (
    current.some((approval) => {
      const previous = originalByApproval.get(approval.approvalId);
      return (
        previous === undefined ||
        approval.verifiedAt < previous.verifiedAt ||
        approval.expiresAt > previous.expiresAt
      );
    })
  ) {
    return false;
  }
  return (
    canonicalizeJson(original.map(identity).sort(sortByApprovalId)) ===
    canonicalizeJson(current.map(identity).sort(sortByApprovalId))
  );
}

function sortByApprovalId(
  left: Readonly<{ approvalId: string }>,
  right: Readonly<{ approvalId: string }>,
): number {
  return left.approvalId < right.approvalId
    ? -1
    : left.approvalId > right.approvalId
      ? 1
      : 0;
}

function validateAttempt(
  input: unknown,
  authorization: AuthorizationBundleV1,
  now: string,
  minimumCreatedAt: string,
): DomainResult<FrozenSettlementAttempt> {
  const attempt = parseFrozenSettlementAttempt(input);
  if (
    attempt === null ||
    !exactBinding(authorization, attempt) ||
    attempt.effectDigest !== deriveSettlementEffectDigest(authorization) ||
    attempt.idempotencyKey !== deriveSettlementIdempotencyKey(authorization) ||
    attempt.networkId !== authorization.actionCore.settlement.networkId ||
    attempt.expiresAt !== authorization.actionCore.expiresAt ||
    attempt.createdAt < minimumCreatedAt ||
    attempt.createdAt > now ||
    now >= attempt.expiresAt
  ) {
    return refuse('SETTLEMENT_ATTEMPT_MISMATCH');
  }
  return accept(attempt);
}

function validateReceiptAndClaim(
  receiptInput: unknown,
  claimInput: unknown,
  aggregate: PaymentActionAggregate,
  now: string,
): DomainResult<
  Readonly<{
    claim: AtomicSettlementConsumptionClaim;
    receipt: AdapterVerifiedSettlementReceipt;
  }>
> {
  const attempt = aggregate.settlementAttempt;
  const receipt = parseAdapterVerifiedSettlementReceipt(receiptInput);
  const claim = parseAtomicSettlementConsumptionClaim(claimInput);
  if (
    attempt === null ||
    receipt === null ||
    claim === null ||
    !exactBinding(aggregate.authorization, receipt) ||
    !exactBinding(aggregate.authorization, claim) ||
    receipt.adapterId !== attempt.adapterId ||
    receipt.attemptAdapterId !== attempt.adapterId ||
    receipt.attemptId !== attempt.attemptId ||
    receipt.effectDigest !== attempt.effectDigest ||
    receipt.idempotencyKey !== attempt.idempotencyKey ||
    receipt.networkId !== attempt.networkId ||
    receipt.signedBytesHash !== attempt.signedBytesHash ||
    receipt.signedTransactionBytes !== attempt.signedTransactionBytes ||
    receipt.transactionId !== attempt.transactionId ||
    receipt.settledAt < attempt.createdAt ||
    receipt.settledAt > now ||
    claim.attemptId !== attempt.attemptId ||
    claim.idempotencyKey !== attempt.idempotencyKey ||
    claim.receiptId !== receipt.receiptId ||
    claim.atomicGroupKey !== atomicGroupKey(aggregate) ||
    claim.expectedAggregateVersion !== aggregate.metadata.version ||
    claim.consumedAt < receipt.settledAt ||
    claim.consumedAt > now
  ) {
    return refuse('SETTLEMENT_TRANSACTION_MISMATCH');
  }
  return accept(Object.freeze({ claim, receipt }));
}

function reservationEffect(
  aggregate: PaymentActionAggregate,
  operation: MandateReservationWriteEffect['operation'],
  expectedLedger: MandateReservationLedger,
  nextLedger: MandateReservationLedger,
  claim: MandateReservationClaim,
): MandateReservationWriteEffect {
  return Object.freeze({
    atomicGroupKey: atomicGroupKey(aggregate),
    claim,
    expectedLedger,
    nextLedger,
    operation,
    type: 'MANDATE_RESERVATION_WRITE',
  });
}

function executionAuditRequestEffect(
  aggregate: PaymentActionAggregate,
  receipt: AdapterVerifiedSettlementReceipt,
): DomainResult<ExecutionAuditRequestEffect> {
  const authorizationAudit = aggregate.authorizationAudit;
  const attempt = aggregate.settlementAttempt;
  if (authorizationAudit === null || attempt === null) {
    return refuse('EXECUTION_AUDIT_MISMATCH');
  }
  const eventId = deriveExecutionAuditEventId(attempt);
  return accept(
    Object.freeze({
      actionDigest: attempt.actionDigest,
      atomicGroupKey: atomicGroupKey(aggregate),
      authorizationAuditId: authorizationAudit.auditId,
      eventId,
      idempotencyKey: eventId,
      attemptId: attempt.attemptId,
      networkId: attempt.networkId,
      receiptId: receipt.receiptId,
      receiptRecordDigest: receipt.recordDigest,
      settlementTransactionId: attempt.transactionId,
      signedBytesHash: attempt.signedBytesHash,
      type: 'EXECUTION_AUDIT_REQUEST',
    }),
  );
}

function validateExecutionAudit(
  input: unknown,
  aggregate: PaymentActionAggregate,
  now: string,
): DomainResult<AdapterVerifiedExecutionAudit> {
  const executionAudit = parseAdapterVerifiedExecutionAudit(input);
  const authorizationAudit = aggregate.authorizationAudit;
  const attempt = aggregate.settlementAttempt;
  const receipt = aggregate.settlementReceipt;
  if (
    executionAudit === null ||
    authorizationAudit === null ||
    attempt === null ||
    receipt === null ||
    !exactBinding(aggregate.authorization, executionAudit) ||
    executionAudit.adapterId !== authorizationAudit.adapterId ||
    executionAudit.authorizationAuditId !== authorizationAudit.auditId ||
    executionAudit.eventId !== deriveExecutionAuditEventId(attempt) ||
    executionAudit.attemptId !== attempt.attemptId ||
    executionAudit.networkId !== attempt.networkId ||
    executionAudit.receiptId !== receipt.receiptId ||
    executionAudit.receiptRecordDigest !== receipt.recordDigest ||
    executionAudit.settlementTransactionId !== attempt.transactionId ||
    executionAudit.signedBytesHash !== attempt.signedBytesHash ||
    executionAudit.writerAccountId !== authorizationAudit.writerAccountId ||
    executionAudit.writerId !== authorizationAudit.writerId ||
    executionAudit.writerKeyId !== authorizationAudit.writerKeyId ||
    executionAudit.committedAt < receipt.settledAt ||
    executionAudit.committedAt > now
  ) {
    return refuse('EXECUTION_AUDIT_MISMATCH');
  }
  return accept(executionAudit);
}

function releaseReservationForTerminal(
  aggregate: PaymentActionAggregate,
  ledgerInput: unknown,
): DomainResult<readonly PaymentDomainEffect[]> {
  const basis = aggregate.authorizationBasis;
  if (basis === null || basis.kind === 'HUMAN_APPROVAL') {
    return ledgerInput === null
      ? accept(Object.freeze([]))
      : refuse('MANDATE_RESERVATION_CONFLICT');
  }
  const released = releaseMandateReservation(
    ledgerInput,
    basis.reservationClaim,
  );
  if (!released.ok) {
    return released;
  }
  return accept(
    Object.freeze([
      reservationEffect(
        aggregate,
        'RELEASE',
        ledgerInput as MandateReservationLedger,
        released.value.ledger,
        basis.reservationClaim,
      ),
    ]),
  );
}

function validateAudit(
  input: unknown,
  authorityInput: unknown,
  aggregate: PaymentActionAggregate,
  now: string,
): DomainResult<
  Readonly<{
    audit: AdapterVerifiedAuthorizationAudit;
    authority: RequestingAgentExecutionFact;
  }>
> {
  const audit = parseAdapterVerifiedAuthorizationAudit(input);
  const basis = aggregate.authorizationBasis;
  if (
    audit === null ||
    basis === null ||
    !exactBinding(aggregate.authorization, audit) ||
    audit.authorizationBasisDigest !== basis.basisDigest ||
    audit.networkId !==
      aggregate.authorization.actionCore.settlement.networkId ||
    audit.committedAt < basis.authorizedAt ||
    audit.committedAt > now ||
    audit.committedAt >= aggregate.authorization.actionCore.expiresAt
  ) {
    return refuse('HCS_AUTHORIZATION_REQUIRED');
  }
  const authority = validateRequestingAgent(
    authorityInput,
    aggregate.authorization,
    audit.committedAt,
    basis.authorizedAt,
  );
  if (
    !authority.ok ||
    !sameRequestingAgentIdentity(
      basis.requestingAgent,
      authority.ok ? authority.value : basis.requestingAgent,
    ) ||
    (authority.ok && audit.authorityFactDigest !== authority.value.recordDigest)
  ) {
    return authority.ok ? refuse('AUDIT_CONTEXT_MISMATCH') : authority;
  }
  return accept(Object.freeze({ audit, authority: authority.value }));
}

function handleQueue(
  aggregate: PaymentActionAggregate,
  event: Record<string, unknown>,
  now: string,
): DomainResult<PaymentActionTransition> {
  if (
    !hasExactKeys(event, [
      'approvals',
      'attempt',
      'mandate',
      'requestingAgent',
      'reservationLedger',
      'type',
    ])
  ) {
    return refuse('SETTLEMENT_ATTEMPT_MISMATCH');
  }
  const evidence = validateCurrentMatchEvidence(aggregate, now);
  if (!evidence.ok) {
    return evidence;
  }
  const basis = aggregate.authorizationBasis;
  const audit = aggregate.authorizationAudit;
  if (basis === null || audit === null) {
    return refuse('AUTHORIZATION_BASIS_INVALID');
  }
  const requestingAgent = validateRequestingAgent(
    event.requestingAgent,
    aggregate.authorization,
    now,
    audit.committedAt,
  );
  if (
    !requestingAgent.ok ||
    !sameRequestingAgentIdentity(
      basis.requestingAgent,
      requestingAgent.ok ? requestingAgent.value : basis.requestingAgent,
    )
  ) {
    return requestingAgent.ok
      ? refuse('REQUESTING_AGENT_IDENTITY_CHANGED')
      : requestingAgent;
  }
  const attempt = validateAttempt(
    event.attempt,
    aggregate.authorization,
    now,
    aggregate.metadata.lastTransitionAt,
  );
  if (!attempt.ok) {
    return attempt;
  }
  if (
    requestingAgent.value.effectDigest !== attempt.value.effectDigest ||
    requestingAgent.value.verifiedAt > attempt.value.createdAt
  ) {
    return refuse('REQUESTING_AGENT_FACT_INVALID');
  }

  let executionApprovals: readonly AdapterVerifiedApprovalFact[] | null = null;
  if (basis.kind === 'HUMAN_APPROVAL') {
    if (event.mandate !== null || event.reservationLedger !== null) {
      return refuse('POLICY_ROUTE_MISMATCH');
    }
    const approvals = validateApprovalQuorum(
      approvalBinding(aggregate.authorization, audit.committedAt),
      aggregate.authorization.decision.requiredAuthority,
      event.approvals,
      attempt.value.createdAt,
    );
    if (!approvals.ok) {
      return approvals;
    }
    if (!sameApprovalIdentities(basis.approvals, approvals.value)) {
      return refuse('APPROVAL_IDENTITY_CHANGED');
    }
    executionApprovals = approvals.value;
  } else {
    if (event.approvals !== null) {
      return refuse('POLICY_ROUTE_MISMATCH');
    }
    const containment = validateMandateContainment(
      aggregate.authorization,
      event.mandate,
      now,
    );
    if (
      !containment.ok ||
      canonicalizeJson(containment.value) !==
        canonicalizeJson(basis.reservationClaim)
    ) {
      return containment.ok
        ? refuse('MANDATE_CONTAINMENT_FAILED')
        : containment;
    }
    const reservation = validateActiveMandateReservation(
      event.reservationLedger,
      basis.reservationClaim,
    );
    if (!reservation.ok) {
      return reservation;
    }
  }

  return transitionResult(
    aggregate,
    'SETTLEMENT_PENDING',
    'QUEUE_SETTLEMENT',
    now,
    {
      executionApprovals,
      executionAuthority: requestingAgent.value,
      settlementAttempt: attempt.value,
    },
    [
      Object.freeze({
        atomicGroupKey: atomicGroupKey(aggregate),
        attempt: attempt.value,
        authorityFactDigest: requestingAgent.value.recordDigest,
        authorizationBasisDigest: basis.basisDigest,
        evidenceResultDigest: evidence.value?.recordDigest ?? null,
        eventId: settlementSubmissionEventId(attempt.value),
        idempotencyKey: attempt.value.idempotencyKey,
        type: 'SETTLEMENT_SUBMISSION_REQUEST',
      }),
    ],
  );
}

function handleSettlement(
  aggregate: PaymentActionAggregate,
  event: Record<string, unknown>,
  eventType: 'RECOVER_SETTLEMENT' | 'SETTLE_CONSENSUS',
  now: string,
): DomainResult<PaymentActionTransition> {
  if (
    !hasExactKeys(event, [
      'consumptionClaim',
      'receipt',
      'reservationLedger',
      'type',
    ])
  ) {
    return refuse('SETTLEMENT_TRANSACTION_MISMATCH');
  }
  const settled = validateReceiptAndClaim(
    event.receipt,
    event.consumptionClaim,
    aggregate,
    now,
  );
  if (!settled.ok) {
    return settled;
  }
  const executionAuditEffect = executionAuditRequestEffect(
    aggregate,
    settled.value.receipt,
  );
  if (!executionAuditEffect.ok) {
    return executionAuditEffect;
  }
  const effects: PaymentDomainEffect[] = [
    Object.freeze({
      atomicGroupKey: atomicGroupKey(aggregate),
      claim: settled.value.claim,
      receipt: settled.value.receipt,
      type: 'SETTLEMENT_CONSUMPTION_WRITE',
    }),
    executionAuditEffect.value,
  ];
  const basis = aggregate.authorizationBasis;
  if (basis?.kind === 'MANDATE') {
    const reservation = settleMandateReservation(
      event.reservationLedger,
      basis.reservationClaim,
    );
    if (!reservation.ok) {
      return reservation;
    }
    effects.push(
      reservationEffect(
        aggregate,
        'SETTLE',
        event.reservationLedger as MandateReservationLedger,
        reservation.value.ledger,
        basis.reservationClaim,
      ),
    );
  } else if (event.reservationLedger !== null) {
    return refuse('MANDATE_RESERVATION_CONFLICT');
  }
  return transitionResult(
    aggregate,
    'SETTLED_AUDIT_PENDING',
    eventType,
    now,
    {
      consumptionClaim: settled.value.claim,
      settlementReceipt: settled.value.receipt,
    },
    effects,
  );
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
): DomainResult<PaymentActionTransition> {
  const aggregateResult = hydratePaymentActionAggregate(aggregateInput);
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
  const now = contextResult.value.now;
  if (now < aggregate.metadata.lastTransitionAt) {
    return refuse('ACTION_TIME_INVALID');
  }
  if (NO_PAYLOAD_EVENTS.has(eventType) && !hasExactKeys(eventInput, ['type'])) {
    return refuse('INVALID_STATE_TRANSITION');
  }
  if (
    LIVE_ACTION_EVENTS.has(eventType) &&
    now < aggregate.authorization.decision.evaluatedAt
  ) {
    return refuse('ACTION_TIME_INVALID');
  }
  if (
    LIVE_ACTION_EVENTS.has(eventType) &&
    now >= aggregate.authorization.actionCore.expiresAt
  ) {
    return refuse('ACTION_EXPIRED');
  }

  if (eventType === 'CLASSIFY') {
    return transitionResult(aggregate, next, eventType, now);
  }
  if (eventType === 'REJECT_POLICY_BLOCK') {
    if (aggregate.authorization.decision.route !== 'BLOCK') {
      return refuse('POLICY_ROUTE_MISMATCH');
    }
    return transitionResult(aggregate, next, eventType, now, {}, [], eventType);
  }
  if (eventType === 'SATISFY_EVIDENCE_NOT_REQUIRED') {
    if (
      aggregate.authorization.decision.verificationMode !== 'NOT_REQUIRED' ||
      aggregate.authorization.decision.route === 'BLOCK'
    ) {
      return refuse('VERIFICATION_MODE_MISMATCH');
    }
    return transitionResult(aggregate, next, eventType, now);
  }
  if (eventType === 'QUOTE_VERIFICATION') {
    if (aggregate.authorization.decision.verificationMode !== 'REQUIRED') {
      return refuse('VERIFICATION_REQUIRED');
    }
    const group = atomicGroupKey(aggregate);
    const eventId = verificationQuoteEventId(aggregate);
    return transitionResult(aggregate, next, eventType, now, {}, [
      Object.freeze({
        actionDigest: aggregate.authorization.envelope.actionDigest,
        atomicGroupKey: group,
        evidencePolicyDigest:
          aggregate.authorization.decision.evidencePolicy.digest,
        eventId,
        expiresAt: aggregate.authorization.actionCore.expiresAt,
        idempotencyKey: eventId,
        serviceId: aggregate.authorization.decision.evidencePolicy.serviceId,
        serviceKeyId:
          aggregate.authorization.decision.evidencePolicy.serviceKeyId,
        serviceNetworkId:
          aggregate.authorization.decision.evidencePolicy.serviceNetworkId,
        type: 'VERIFICATION_QUOTE_REQUEST',
      }),
    ]);
  }
  if (eventType === 'RECORD_VERIFICATION_PAYMENT') {
    if (!hasExactKeys(eventInput, ['payment', 'type'])) {
      return refuse('VERIFICATION_PAYMENT_INVALID');
    }
    const payment = parseAdapterVerifiedVerificationPayment(eventInput.payment);
    if (
      payment === null ||
      !exactBinding(aggregate.authorization, payment) ||
      payment.evidencePolicyDigest !==
        aggregate.authorization.decision.evidencePolicy.digest ||
      payment.serviceId !==
        aggregate.authorization.decision.evidencePolicy.serviceId ||
      payment.serviceKeyId !==
        aggregate.authorization.decision.evidencePolicy.serviceKeyId ||
      payment.serviceNetworkId !==
        aggregate.authorization.decision.evidencePolicy.serviceNetworkId ||
      payment.paymentNetworkId !==
        aggregate.authorization.decision.evidencePolicy.serviceNetworkId ||
      payment.paidAt < aggregate.metadata.lastTransitionAt ||
      payment.paidAt > now ||
      payment.paidAt >= aggregate.authorization.actionCore.expiresAt
    ) {
      return refuse('VERIFICATION_PAYMENT_INVALID');
    }
    return transitionResult(aggregate, next, eventType, now, {
      verificationPayment: payment,
    });
  }
  if (
    eventType === 'ACCEPT_VERIFICATION' ||
    eventType === 'REJECT_VERIFICATION'
  ) {
    if (!hasExactKeys(eventInput, ['type', 'verification'])) {
      return refuse('VERIFICATION_MISMATCH');
    }
    const payment = aggregate.verificationPayment;
    const evidence = parseAdapterVerifiedEvidenceResult(
      eventInput.verification,
    );
    if (
      payment === null ||
      evidence === null ||
      !exactBinding(aggregate.authorization, evidence) ||
      evidence.evidencePolicyDigest !==
        aggregate.authorization.decision.evidencePolicy.digest ||
      evidence.evidenceRoot !==
        aggregate.authorization.actionCore.evidenceRoot ||
      evidence.servicePaymentId !== payment.servicePaymentId ||
      evidence.serviceRequestDigest !== payment.serviceRequestDigest ||
      evidence.paymentAttemptId !== payment.paymentAttemptId ||
      evidence.paymentNetworkId !== payment.paymentNetworkId ||
      evidence.paymentTransactionId !== payment.paymentTransactionId ||
      evidence.quoteDigest !== payment.quoteDigest ||
      evidence.quoteId !== payment.quoteId ||
      evidence.serviceId !== payment.serviceId ||
      evidence.serviceKeyId !== payment.serviceKeyId ||
      evidence.serviceNetworkId !== payment.serviceNetworkId ||
      evidence.verifiedAt < payment.paidAt ||
      evidence.verifiedAt > now
    ) {
      return refuse('VERIFICATION_MISMATCH');
    }
    if (
      now >= evidence.expiresAt ||
      evidence.expiresAt > aggregate.authorization.actionCore.expiresAt
    ) {
      return refuse('VERIFICATION_EXPIRED');
    }
    if (eventType === 'ACCEPT_VERIFICATION') {
      if (evidence.result !== 'MATCH') {
        return evidence.result === 'UNKNOWN'
          ? refuse('VERIFICATION_UNKNOWN')
          : refuse('VERIFICATION_MISMATCH');
      }
      return transitionResult(aggregate, next, eventType, now, {
        evidenceResult: evidence,
      });
    }
    if (evidence.result === 'MATCH') {
      return refuse('VERIFICATION_MODE_MISMATCH');
    }
    return transitionResult(
      aggregate,
      next,
      eventType,
      now,
      { evidenceResult: evidence },
      [],
      eventType,
    );
  }
  if (eventType === 'AWAIT_APPROVALS') {
    return aggregate.authorization.decision.route === 'HUMAN_APPROVAL'
      ? transitionResult(aggregate, next, eventType, now)
      : refuse('POLICY_ROUTE_MISMATCH');
  }
  if (eventType === 'REJECT_APPROVALS') {
    if (aggregate.authorization.decision.route !== 'HUMAN_APPROVAL') {
      return refuse('POLICY_ROUTE_MISMATCH');
    }
    return transitionResult(aggregate, next, eventType, now, {}, [], eventType);
  }
  if (eventType === 'REJECT_AUTHORIZATION') {
    if (!hasExactKeys(eventInput, ['reservationLedger', 'type'])) {
      return refuse('INVALID_STATE_TRANSITION');
    }
    const effects = releaseReservationForTerminal(
      aggregate,
      eventInput.reservationLedger,
    );
    return effects.ok
      ? transitionResult(
          aggregate,
          next,
          eventType,
          now,
          {},
          effects.value,
          eventType,
        )
      : effects;
  }
  if (eventType === 'AUTHORIZE_APPROVALS') {
    if (
      !hasExactKeys(eventInput, ['approvals', 'requestingAgent', 'type']) ||
      aggregate.authorization.decision.route !== 'HUMAN_APPROVAL'
    ) {
      return refuse('APPROVAL_FACT_INVALID');
    }
    const evidence = validateCurrentMatchEvidence(aggregate, now);
    if (!evidence.ok) {
      return evidence;
    }
    const approvals = validateApprovalQuorum(
      approvalBinding(
        aggregate.authorization,
        aggregate.authorization.decision.evaluatedAt,
      ),
      aggregate.authorization.decision.requiredAuthority,
      eventInput.approvals,
      now,
    );
    if (!approvals.ok) {
      return approvals;
    }
    const requestingAgent = validateRequestingAgent(
      eventInput.requestingAgent,
      aggregate.authorization,
      now,
      aggregate.authorization.decision.evaluatedAt,
    );
    if (!requestingAgent.ok) {
      return requestingAgent;
    }
    return transitionResult(aggregate, next, eventType, now, {
      authorizationBasis: createHumanBasis(
        aggregate.authorization,
        approvals.value,
        requestingAgent.value,
        now,
      ),
    });
  }
  if (eventType === 'AUTHORIZE_MANDATE') {
    if (
      !hasExactKeys(eventInput, [
        'mandate',
        'requestingAgent',
        'reservationLedger',
        'type',
      ])
    ) {
      return refuse('MANDATE_CONTAINMENT_FAILED');
    }
    const evidence = validateCurrentMatchEvidence(aggregate, now);
    if (!evidence.ok) {
      return evidence;
    }
    const containment = validateMandateContainment(
      aggregate.authorization,
      eventInput.mandate,
      now,
    );
    if (!containment.ok) {
      return containment;
    }
    const requestingAgent = validateRequestingAgent(
      eventInput.requestingAgent,
      aggregate.authorization,
      now,
      aggregate.authorization.decision.evaluatedAt,
    );
    if (!requestingAgent.ok) {
      return requestingAgent;
    }
    const reserved = reserveMandateCapacity(
      eventInput.reservationLedger,
      containment.value,
    );
    if (!reserved.ok) {
      return reserved;
    }
    const basis = createMandateBasis(
      eventInput.mandate as StandingMandateAggregate,
      requestingAgent.value,
      containment.value,
      reserved.value.ledger,
      now,
    );
    return transitionResult(
      aggregate,
      next,
      eventType,
      now,
      { authorizationBasis: basis },
      [
        reservationEffect(
          aggregate,
          'RESERVE',
          eventInput.reservationLedger as MandateReservationLedger,
          reserved.value.ledger,
          containment.value,
        ),
      ],
    );
  }
  if (eventType === 'START_AUTHORIZATION_RECOVERY') {
    return transitionResult(aggregate, next, eventType, now);
  }
  if (eventType === 'COMMIT_AUDIT' || eventType === 'RECOVER_AUDIT') {
    if (
      !hasExactKeys(eventInput, [
        'authorizationAudit',
        'requestingAgent',
        'type',
      ])
    ) {
      return refuse('HCS_AUTHORIZATION_REQUIRED');
    }
    const evidence = validateCurrentMatchEvidence(aggregate, now);
    if (!evidence.ok) {
      return evidence;
    }
    const audit = validateAudit(
      eventInput.authorizationAudit,
      eventInput.requestingAgent,
      aggregate,
      now,
    );
    return audit.ok
      ? transitionResult(aggregate, next, eventType, now, {
          auditAuthority: audit.value.authority,
          authorizationAudit: audit.value.audit,
        })
      : audit;
  }
  if (eventType === 'QUEUE_SETTLEMENT') {
    return handleQueue(aggregate, eventInput, now);
  }
  if (eventType === 'SETTLE_CONSENSUS' || eventType === 'RECOVER_SETTLEMENT') {
    return handleSettlement(aggregate, eventInput, eventType, now);
  }
  if (eventType === 'START_SETTLEMENT_RECOVERY') {
    if (!hasExactKeys(eventInput, ['type', 'uncertainty'])) {
      return refuse('SETTLEMENT_TRANSACTION_MISMATCH');
    }
    const uncertainty = parseAdapterVerifiedSettlementUncertainty(
      eventInput.uncertainty,
    );
    const attempt = aggregate.settlementAttempt;
    if (
      uncertainty === null ||
      attempt === null ||
      !exactBinding(aggregate.authorization, uncertainty) ||
      !uncertaintyMatchesAttempt(uncertainty, attempt) ||
      uncertainty.observedAt > now
    ) {
      return refuse('SETTLEMENT_TRANSACTION_MISMATCH');
    }
    return transitionResult(aggregate, next, eventType, now, {
      settlementUncertainty: uncertainty,
    });
  }
  if (eventType === 'RETRY_SAME_TRANSACTION') {
    if (
      !hasExactKeys(eventInput, [
        'approvals',
        'mandate',
        'requestingAgent',
        'reservationLedger',
        'type',
      ])
    ) {
      return refuse('SETTLEMENT_TRANSACTION_MISMATCH');
    }
    const evidence = validateCurrentMatchEvidence(aggregate, now);
    if (!evidence.ok) {
      return evidence;
    }
    const basis = aggregate.authorizationBasis;
    const audit = aggregate.authorizationAudit;
    const attempt = aggregate.settlementAttempt;
    if (
      basis === null ||
      audit === null ||
      attempt === null ||
      now >= attempt.expiresAt
    ) {
      return refuse('SETTLEMENT_TRANSACTION_MISMATCH');
    }
    const requestingAgent = validateRequestingAgent(
      eventInput.requestingAgent,
      aggregate.authorization,
      now,
      audit.committedAt,
    );
    if (
      !requestingAgent.ok ||
      !sameRequestingAgentIdentity(
        basis.requestingAgent,
        requestingAgent.ok ? requestingAgent.value : basis.requestingAgent,
      )
    ) {
      return requestingAgent.ok
        ? refuse('REQUESTING_AGENT_IDENTITY_CHANGED')
        : requestingAgent;
    }
    if (basis.kind === 'HUMAN_APPROVAL') {
      if (
        eventInput.mandate !== null ||
        eventInput.reservationLedger !== null
      ) {
        return refuse('POLICY_ROUTE_MISMATCH');
      }
      const approvals = validateApprovalQuorum(
        approvalBinding(aggregate.authorization, audit.committedAt),
        aggregate.authorization.decision.requiredAuthority,
        eventInput.approvals,
        now,
      );
      if (!approvals.ok) {
        return approvals;
      }
      if (!sameApprovalIdentities(basis.approvals, approvals.value)) {
        return refuse('APPROVAL_IDENTITY_CHANGED');
      }
    } else {
      if (eventInput.approvals !== null) {
        return refuse('POLICY_ROUTE_MISMATCH');
      }
      const containment = validateMandateContainment(
        aggregate.authorization,
        eventInput.mandate,
        now,
      );
      if (
        !containment.ok ||
        canonicalizeJson(containment.value) !==
          canonicalizeJson(basis.reservationClaim)
      ) {
        return containment.ok
          ? refuse('MANDATE_CONTAINMENT_FAILED')
          : containment;
      }
      const reservation = validateActiveMandateReservation(
        eventInput.reservationLedger,
        basis.reservationClaim,
      );
      if (!reservation.ok) {
        return reservation;
      }
    }
    return transitionResult(aggregate, next, eventType, now, {}, [
      Object.freeze({
        atomicGroupKey: atomicGroupKey(aggregate),
        attempt,
        authorityFactDigest: requestingAgent.value.recordDigest,
        authorizationBasisDigest: basis.basisDigest,
        evidenceResultDigest: evidence.value?.recordDigest ?? null,
        eventId: settlementSubmissionEventId(attempt),
        idempotencyKey: attempt.idempotencyKey,
        requestingAgent: requestingAgent.value,
        type: 'SETTLEMENT_RETRY_REQUEST',
      }),
    ]);
  }
  if (
    eventType === 'CONFIRM_EXECUTION_AUDIT' ||
    eventType === 'RECOVER_EXECUTION_AUDIT'
  ) {
    if (!hasExactKeys(eventInput, ['executionAudit', 'type'])) {
      return refuse('EXECUTION_AUDIT_MISMATCH');
    }
    const executionAudit = validateExecutionAudit(
      eventInput.executionAudit,
      aggregate,
      now,
    );
    return executionAudit.ok
      ? transitionResult(aggregate, next, eventType, now, {
          executionAudit: executionAudit.value,
        })
      : executionAudit;
  }
  if (eventType === 'MARK_EXECUTION_AUDIT_DEGRADED') {
    return transitionResult(aggregate, next, eventType, now);
  }
  if (eventType === 'RETRY_EXECUTION_AUDIT') {
    const receipt = aggregate.settlementReceipt;
    if (receipt === null) {
      return refuse('EXECUTION_AUDIT_MISMATCH');
    }
    const effect = executionAuditRequestEffect(aggregate, receipt);
    return effect.ok
      ? transitionResult(aggregate, next, eventType, now, {}, [effect.value])
      : effect;
  }
  if (eventType === 'START_RECONCILIATION') {
    return transitionResult(aggregate, next, eventType, now);
  }
  if (
    eventType === 'RECONCILE_SUCCESS' ||
    eventType === 'RECONCILE_EXCEPTION'
  ) {
    return transitionResult(aggregate, next, eventType, now, {}, [], eventType);
  }
  if (eventType === 'EXPIRE' || eventType === 'SUPERSEDE') {
    if (!hasExactKeys(eventInput, ['reservationLedger', 'type'])) {
      return refuse('INVALID_STATE_TRANSITION');
    }
    if (
      eventType === 'EXPIRE' &&
      now < aggregate.authorization.actionCore.expiresAt
    ) {
      return refuse('ACTION_NOT_EXPIRED');
    }
    if (
      eventType === 'SUPERSEDE' &&
      now >= aggregate.authorization.actionCore.expiresAt
    ) {
      return refuse('ACTION_EXPIRED');
    }
    const effects = releaseReservationForTerminal(
      aggregate,
      eventInput.reservationLedger,
    );
    return effects.ok
      ? transitionResult(
          aggregate,
          next,
          eventType,
          now,
          {},
          effects.value,
          eventType,
        )
      : effects;
  }
  if (eventType === 'CANCEL') {
    if (
      !hasExactKeys(eventInput, [
        'cancellationAudit',
        'reservationLedger',
        'type',
      ])
    ) {
      return refuse('ACTION_CANCEL_TOO_LATE');
    }
    const cancellation = parseAdapterVerifiedCancellationAudit(
      eventInput.cancellationAudit,
    );
    if (
      cancellation === null ||
      aggregate.authorizationAudit === null ||
      !exactBinding(aggregate.authorization, cancellation) ||
      cancellation.authorizationAuditId !==
        aggregate.authorizationAudit.auditId ||
      cancellation.networkId !==
        aggregate.authorization.actionCore.settlement.networkId ||
      cancellation.committedAt !== now
    ) {
      return refuse('ACTION_CANCEL_TOO_LATE');
    }
    const effects = releaseReservationForTerminal(
      aggregate,
      eventInput.reservationLedger,
    );
    return effects.ok
      ? transitionResult(
          aggregate,
          next,
          eventType,
          now,
          { cancellationAudit: cancellation },
          effects.value,
          eventType,
        )
      : effects;
  }

  return refuse('INVALID_STATE_TRANSITION');
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
