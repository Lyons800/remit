import {
  verifyAuthorizationBundle,
  type AuthorizationBundleV1,
} from '@invoiceguard/protocol/hashing';

import {
  createAdapterRecord,
  hasExactKeys,
  hasValidAdapterRecordDigest,
  hashAdapterRecord,
} from './adapter-record.js';
import { isCanonicalUtcInstant } from '../state/temporal.js';
import {
  isNonEmptyBoundedString,
  isRecord,
  isSha256Digest,
} from '../values/validation.js';

export type ActionFactBinding = Readonly<{
  actionDigest: string;
  actionId: string;
  invoiceRevisionId: string;
  nonce: string;
  obligationId: string;
  organizationId: string;
}>;

export type AdapterVerifiedVerificationPaymentCore = Readonly<
  ActionFactBinding & {
    adapterId: string;
    evidencePolicyDigest: string;
    kind: 'VERIFICATION_PAYMENT';
    networkId: string;
    paidAt: string;
    servicePaymentId: string;
    serviceRequestDigest: string;
    status: 'CONSENSUS';
    transactionId: string;
  }
>;
export type AdapterVerifiedVerificationPayment = Readonly<
  AdapterVerifiedVerificationPaymentCore & { recordDigest: string }
>;

export type AdapterVerifiedEvidenceResultCore = Readonly<
  ActionFactBinding & {
    adapterId: string;
    evidencePolicyDigest: string;
    evidenceResultId: string;
    evidenceRoot: string;
    expiresAt: string;
    kind: 'VERIFICATION_EVIDENCE';
    result: 'MATCH' | 'MISMATCH' | 'UNKNOWN';
    servicePaymentId: string;
    serviceRequestDigest: string;
    status: 'VERIFIED';
    verifiedAt: string;
  }
>;
export type AdapterVerifiedEvidenceResult = Readonly<
  AdapterVerifiedEvidenceResultCore & { recordDigest: string }
>;

export type RequestingAgentExecutionFactCore = Readonly<
  ActionFactBinding & {
    actionHumanPrincipal: string;
    adapterId: string;
    agentBackingRecordId: string;
    agentBookStatus: 'CURRENT' | 'CHANGED' | 'REVOKED' | 'UNVERIFIED';
    agentId: string;
    agentTenantPrincipal: string;
    companyRoleStatus: 'CURRENT' | 'EXPIRED' | 'REVOKED' | 'UNVERIFIED';
    effectDigest: string;
    expiresAt: string;
    factId: string;
    kind: 'REQUESTING_AGENT_EXECUTION';
    role: string;
    roleCredentialId: string;
    verifiedAt: string;
  }
>;
export type RequestingAgentExecutionFact = Readonly<
  RequestingAgentExecutionFactCore & { recordDigest: string }
>;

export type AdapterVerifiedAuthorizationAuditCore = Readonly<
  ActionFactBinding & {
    adapterId: string;
    auditId: string;
    authorizationBasisDigest: string;
    committedAt: string;
    kind: 'AUTHORIZATION_AUDIT';
    status: 'CONSENSUS';
    topicId: string;
    transactionId: string;
  }
>;
export type AdapterVerifiedAuthorizationAudit = Readonly<
  AdapterVerifiedAuthorizationAuditCore & { recordDigest: string }
>;

export type AdapterVerifiedCancellationAuditCore = Readonly<
  ActionFactBinding & {
    adapterId: string;
    authorizationAuditId: string;
    cancellationId: string;
    committedAt: string;
    effectStatus: 'NOT_SIGNED';
    kind: 'CANCELLATION_AUDIT';
    reason: 'OPERATOR_CANCELLED';
    status: 'CONSENSUS';
    topicId: string;
    transactionId: string;
  }
>;
export type AdapterVerifiedCancellationAudit = Readonly<
  AdapterVerifiedCancellationAuditCore & { recordDigest: string }
>;

export type FrozenSettlementAttemptCore = Readonly<
  ActionFactBinding & {
    adapterId: string;
    attemptId: string;
    createdAt: string;
    effectDigest: string;
    expiresAt: string;
    idempotencyKey: string;
    kind: 'FROZEN_SETTLEMENT_ATTEMPT';
    networkId: string;
    signedBytesHash: string;
    status: 'FROZEN';
    transactionId: string;
  }
>;
export type FrozenSettlementAttempt = Readonly<
  FrozenSettlementAttemptCore & { recordDigest: string }
>;

export type AdapterVerifiedSettlementUncertaintyCore = Readonly<
  ActionFactBinding & {
    adapterId: string;
    attemptId: string;
    effectDigest: string;
    idempotencyKey: string;
    kind: 'SETTLEMENT_UNCERTAINTY';
    networkId: string;
    observedAt: string;
    reason: 'SUBMISSION_RESULT_UNKNOWN' | 'RECEIPT_LOOKUP_INCONCLUSIVE';
    signedBytesHash: string;
    status: 'UNKNOWN';
    transactionId: string;
    uncertaintyId: string;
  }
>;
export type AdapterVerifiedSettlementUncertainty = Readonly<
  AdapterVerifiedSettlementUncertaintyCore & { recordDigest: string }
>;

export type AdapterVerifiedSettlementReceiptCore = Readonly<
  ActionFactBinding & {
    adapterId: string;
    attemptId: string;
    effectDigest: string;
    idempotencyKey: string;
    kind: 'SETTLEMENT_RECEIPT';
    networkId: string;
    receiptId: string;
    settledAt: string;
    signedBytesHash: string;
    status: 'SUCCESS';
    transactionId: string;
  }
>;
export type AdapterVerifiedSettlementReceipt = Readonly<
  AdapterVerifiedSettlementReceiptCore & { recordDigest: string }
>;

export type AtomicSettlementConsumptionClaimCore = Readonly<
  ActionFactBinding & {
    adapterId: string;
    attemptId: string;
    claimId: string;
    consumedAt: string;
    idempotencyKey: string;
    kind: 'ATOMIC_SETTLEMENT_CONSUMPTION';
    receiptId: string;
    status: 'CONSUMED';
  }
>;
export type AtomicSettlementConsumptionClaim = Readonly<
  AtomicSettlementConsumptionClaimCore & { recordDigest: string }
>;

const ACTION_BINDING_KEYS = [
  'actionDigest',
  'actionId',
  'invoiceRevisionId',
  'nonce',
  'obligationId',
  'organizationId',
] as const;
const VERIFICATION_PAYMENT_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'evidencePolicyDigest',
  'kind',
  'networkId',
  'paidAt',
  'servicePaymentId',
  'serviceRequestDigest',
  'status',
  'transactionId',
] as const;
const EVIDENCE_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'evidencePolicyDigest',
  'evidenceResultId',
  'evidenceRoot',
  'expiresAt',
  'kind',
  'result',
  'servicePaymentId',
  'serviceRequestDigest',
  'status',
  'verifiedAt',
] as const;
const REQUESTING_AGENT_KEYS = [
  ...ACTION_BINDING_KEYS,
  'actionHumanPrincipal',
  'adapterId',
  'agentBackingRecordId',
  'agentBookStatus',
  'agentId',
  'agentTenantPrincipal',
  'companyRoleStatus',
  'effectDigest',
  'expiresAt',
  'factId',
  'kind',
  'role',
  'roleCredentialId',
  'verifiedAt',
] as const;
const AUTHORIZATION_AUDIT_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'auditId',
  'authorizationBasisDigest',
  'committedAt',
  'kind',
  'status',
  'topicId',
  'transactionId',
] as const;
const CANCELLATION_AUDIT_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'authorizationAuditId',
  'cancellationId',
  'committedAt',
  'effectStatus',
  'kind',
  'reason',
  'status',
  'topicId',
  'transactionId',
] as const;
const ATTEMPT_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'attemptId',
  'createdAt',
  'effectDigest',
  'expiresAt',
  'idempotencyKey',
  'kind',
  'networkId',
  'signedBytesHash',
  'status',
  'transactionId',
] as const;
const UNCERTAINTY_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'attemptId',
  'effectDigest',
  'idempotencyKey',
  'kind',
  'networkId',
  'observedAt',
  'reason',
  'signedBytesHash',
  'status',
  'transactionId',
  'uncertaintyId',
] as const;
const RECEIPT_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'attemptId',
  'effectDigest',
  'idempotencyKey',
  'kind',
  'networkId',
  'receiptId',
  'settledAt',
  'signedBytesHash',
  'status',
  'transactionId',
] as const;
const CONSUMPTION_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'attemptId',
  'claimId',
  'consumedAt',
  'idempotencyKey',
  'kind',
  'receiptId',
  'status',
] as const;

function isActionBinding(input: Record<string, unknown>): boolean {
  return (
    isSha256Digest(input.actionDigest) &&
    isNonEmptyBoundedString(input.actionId) &&
    isNonEmptyBoundedString(input.invoiceRevisionId) &&
    isNonEmptyBoundedString(input.nonce) &&
    isNonEmptyBoundedString(input.obligationId) &&
    isNonEmptyBoundedString(input.organizationId)
  );
}

function parseCore<T extends Readonly<Record<string, unknown>>>(
  input: unknown,
  keys: readonly string[],
  validate: (value: Record<string, unknown>) => boolean,
): T | null {
  if (!isRecord(input) || !hasExactKeys(input, keys) || !validate(input)) {
    return null;
  }
  return Object.freeze({ ...input }) as T;
}

function parseFact<
  TCore extends Readonly<Record<string, unknown>>,
  TFact extends Readonly<TCore & { recordDigest: string }>,
>(
  input: unknown,
  kind: string,
  coreKeys: readonly string[],
  validate: (value: Record<string, unknown>) => boolean,
): TFact | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [...coreKeys, 'recordDigest']) ||
    !hasValidAdapterRecordDigest(input, kind)
  ) {
    return null;
  }
  const { recordDigest, ...candidateCore } = input;
  const core = parseCore<TCore>(candidateCore, coreKeys, validate);
  return core === null
    ? null
    : (Object.freeze({
        ...core,
        recordDigest: recordDigest as string,
      }) as TFact);
}

function createFact<
  TCore extends Readonly<Record<string, unknown>>,
  TFact extends Readonly<TCore & { recordDigest: string }>,
>(
  input: TCore,
  kind: string,
  keys: readonly string[],
  validate: (value: Record<string, unknown>) => boolean,
): TFact {
  const core = parseCore<TCore>(input, keys, validate);
  if (core === null) {
    throw new Error(`Invalid ${kind} core.`);
  }
  return createAdapterRecord(kind, core) as TFact;
}

function validStringFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.every((field) => isNonEmptyBoundedString(value[field]));
}

function validInstant(value: unknown): boolean {
  return isCanonicalUtcInstant(typeof value === 'string' ? value : '');
}

const validateVerificationPaymentCore = (
  value: Record<string, unknown>,
): boolean =>
  isActionBinding(value) &&
  value.kind === 'VERIFICATION_PAYMENT' &&
  value.status === 'CONSENSUS' &&
  isSha256Digest(value.evidencePolicyDigest) &&
  isSha256Digest(value.serviceRequestDigest) &&
  validInstant(value.paidAt) &&
  validStringFields(value, [
    'adapterId',
    'networkId',
    'servicePaymentId',
    'transactionId',
  ]);

const validateEvidenceCore = (value: Record<string, unknown>): boolean =>
  isActionBinding(value) &&
  value.kind === 'VERIFICATION_EVIDENCE' &&
  value.status === 'VERIFIED' &&
  (value.result === 'MATCH' ||
    value.result === 'MISMATCH' ||
    value.result === 'UNKNOWN') &&
  isSha256Digest(value.evidencePolicyDigest) &&
  isSha256Digest(value.evidenceRoot) &&
  isSha256Digest(value.serviceRequestDigest) &&
  validInstant(value.verifiedAt) &&
  validInstant(value.expiresAt) &&
  (value.verifiedAt as string) < (value.expiresAt as string) &&
  validStringFields(value, [
    'adapterId',
    'evidenceResultId',
    'servicePaymentId',
  ]);

const validateRequestingAgentCore = (value: Record<string, unknown>): boolean =>
  isActionBinding(value) &&
  value.kind === 'REQUESTING_AGENT_EXECUTION' &&
  value.companyRoleStatus !== undefined &&
  (value.companyRoleStatus === 'CURRENT' ||
    value.companyRoleStatus === 'EXPIRED' ||
    value.companyRoleStatus === 'REVOKED' ||
    value.companyRoleStatus === 'UNVERIFIED') &&
  (value.agentBookStatus === 'CURRENT' ||
    value.agentBookStatus === 'CHANGED' ||
    value.agentBookStatus === 'REVOKED' ||
    value.agentBookStatus === 'UNVERIFIED') &&
  isSha256Digest(value.effectDigest) &&
  validInstant(value.verifiedAt) &&
  validInstant(value.expiresAt) &&
  (value.verifiedAt as string) < (value.expiresAt as string) &&
  validStringFields(value, [
    'actionHumanPrincipal',
    'adapterId',
    'agentBackingRecordId',
    'agentId',
    'agentTenantPrincipal',
    'factId',
    'role',
    'roleCredentialId',
  ]);

const validateAuthorizationAuditCore = (
  value: Record<string, unknown>,
): boolean =>
  isActionBinding(value) &&
  value.kind === 'AUTHORIZATION_AUDIT' &&
  value.status === 'CONSENSUS' &&
  isSha256Digest(value.authorizationBasisDigest) &&
  validInstant(value.committedAt) &&
  validStringFields(value, [
    'adapterId',
    'auditId',
    'topicId',
    'transactionId',
  ]);

const validateCancellationAuditCore = (
  value: Record<string, unknown>,
): boolean =>
  isActionBinding(value) &&
  value.kind === 'CANCELLATION_AUDIT' &&
  value.status === 'CONSENSUS' &&
  value.effectStatus === 'NOT_SIGNED' &&
  value.reason === 'OPERATOR_CANCELLED' &&
  validInstant(value.committedAt) &&
  validStringFields(value, [
    'adapterId',
    'authorizationAuditId',
    'cancellationId',
    'topicId',
    'transactionId',
  ]);

const validateAttemptCore = (value: Record<string, unknown>): boolean =>
  isActionBinding(value) &&
  value.kind === 'FROZEN_SETTLEMENT_ATTEMPT' &&
  value.status === 'FROZEN' &&
  isSha256Digest(value.effectDigest) &&
  isSha256Digest(value.signedBytesHash) &&
  validInstant(value.createdAt) &&
  validInstant(value.expiresAt) &&
  (value.createdAt as string) < (value.expiresAt as string) &&
  validStringFields(value, [
    'adapterId',
    'attemptId',
    'idempotencyKey',
    'networkId',
    'transactionId',
  ]);

const validateUncertaintyCore = (value: Record<string, unknown>): boolean =>
  isActionBinding(value) &&
  value.kind === 'SETTLEMENT_UNCERTAINTY' &&
  value.status === 'UNKNOWN' &&
  (value.reason === 'SUBMISSION_RESULT_UNKNOWN' ||
    value.reason === 'RECEIPT_LOOKUP_INCONCLUSIVE') &&
  isSha256Digest(value.effectDigest) &&
  isSha256Digest(value.signedBytesHash) &&
  validInstant(value.observedAt) &&
  validStringFields(value, [
    'adapterId',
    'attemptId',
    'idempotencyKey',
    'networkId',
    'transactionId',
    'uncertaintyId',
  ]);

const validateReceiptCore = (value: Record<string, unknown>): boolean =>
  isActionBinding(value) &&
  value.kind === 'SETTLEMENT_RECEIPT' &&
  value.status === 'SUCCESS' &&
  isSha256Digest(value.effectDigest) &&
  isSha256Digest(value.signedBytesHash) &&
  validInstant(value.settledAt) &&
  validStringFields(value, [
    'adapterId',
    'attemptId',
    'idempotencyKey',
    'networkId',
    'receiptId',
    'transactionId',
  ]);

const validateConsumptionCore = (value: Record<string, unknown>): boolean =>
  isActionBinding(value) &&
  value.kind === 'ATOMIC_SETTLEMENT_CONSUMPTION' &&
  value.status === 'CONSUMED' &&
  validInstant(value.consumedAt) &&
  validStringFields(value, [
    'adapterId',
    'attemptId',
    'claimId',
    'idempotencyKey',
    'receiptId',
  ]);

export function actionFactBinding(
  authorizationInput: unknown,
): ActionFactBinding {
  const authorization = verifyAuthorizationBundle(
    authorizationInput as AuthorizationBundleV1,
  );
  return Object.freeze({
    actionDigest: authorization.envelope.actionDigest,
    actionId: authorization.actionCore.actionId,
    invoiceRevisionId: authorization.actionCore.sourceInvoice.invoiceRevisionId,
    nonce: authorization.actionCore.nonce,
    obligationId: authorization.actionCore.sourceInvoice.obligationId,
    organizationId: authorization.actionCore.organizationId,
  });
}

export function deriveSettlementEffectDigest(
  authorizationInput: unknown,
): string {
  const authorization = verifyAuthorizationBundle(
    authorizationInput as AuthorizationBundleV1,
  );
  return hashAdapterRecord(
    'SETTLEMENT_EFFECT',
    Object.freeze({
      ...actionFactBinding(authorization),
      beneficiary: authorization.actionCore.beneficiary,
      settlement: authorization.actionCore.settlement,
      sourceInvoice: authorization.actionCore.sourceInvoice,
      supplierId: authorization.actionCore.supplierId,
      supplierSnapshotDigest: authorization.actionCore.supplierSnapshotDigest,
    }),
  );
}

export function deriveSettlementIdempotencyKey(
  authorizationInput: unknown,
): string {
  return `invoiceguard:settlement:v1:${actionFactBinding(authorizationInput).actionDigest}`;
}

export function createAdapterVerifiedVerificationPayment(
  authorization: AuthorizationBundleV1,
  details: Omit<
    AdapterVerifiedVerificationPaymentCore,
    keyof ActionFactBinding | 'evidencePolicyDigest' | 'kind' | 'status'
  >,
): AdapterVerifiedVerificationPayment {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      evidencePolicyDigest: authorization.decision.evidencePolicy.digest,
      kind: 'VERIFICATION_PAYMENT',
      status: 'CONSENSUS',
    },
    'VERIFICATION_PAYMENT',
    VERIFICATION_PAYMENT_KEYS,
    validateVerificationPaymentCore,
  );
}

export function parseAdapterVerifiedVerificationPayment(
  input: unknown,
): AdapterVerifiedVerificationPayment | null {
  return parseFact(
    input,
    'VERIFICATION_PAYMENT',
    VERIFICATION_PAYMENT_KEYS,
    validateVerificationPaymentCore,
  );
}

export function createAdapterVerifiedEvidenceResult(
  authorization: AuthorizationBundleV1,
  payment: AdapterVerifiedVerificationPayment,
  details: Omit<
    AdapterVerifiedEvidenceResultCore,
    | keyof ActionFactBinding
    | 'evidencePolicyDigest'
    | 'kind'
    | 'servicePaymentId'
    | 'serviceRequestDigest'
    | 'status'
  >,
): AdapterVerifiedEvidenceResult {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      evidencePolicyDigest: authorization.decision.evidencePolicy.digest,
      kind: 'VERIFICATION_EVIDENCE',
      servicePaymentId: payment.servicePaymentId,
      serviceRequestDigest: payment.serviceRequestDigest,
      status: 'VERIFIED',
    },
    'VERIFICATION_EVIDENCE',
    EVIDENCE_KEYS,
    validateEvidenceCore,
  );
}

export function parseAdapterVerifiedEvidenceResult(
  input: unknown,
): AdapterVerifiedEvidenceResult | null {
  return parseFact(
    input,
    'VERIFICATION_EVIDENCE',
    EVIDENCE_KEYS,
    validateEvidenceCore,
  );
}

export function createRequestingAgentExecutionFact(
  authorization: AuthorizationBundleV1,
  details: Omit<
    RequestingAgentExecutionFactCore,
    keyof ActionFactBinding | 'effectDigest' | 'kind'
  >,
): RequestingAgentExecutionFact {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      effectDigest: deriveSettlementEffectDigest(authorization),
      kind: 'REQUESTING_AGENT_EXECUTION',
    },
    'REQUESTING_AGENT_EXECUTION',
    REQUESTING_AGENT_KEYS,
    validateRequestingAgentCore,
  );
}

export function parseRequestingAgentExecutionFact(
  input: unknown,
): RequestingAgentExecutionFact | null {
  return parseFact(
    input,
    'REQUESTING_AGENT_EXECUTION',
    REQUESTING_AGENT_KEYS,
    validateRequestingAgentCore,
  );
}

export function createAdapterVerifiedAuthorizationAudit(
  authorization: AuthorizationBundleV1,
  authorizationBasisDigest: string,
  details: Omit<
    AdapterVerifiedAuthorizationAuditCore,
    keyof ActionFactBinding | 'authorizationBasisDigest' | 'kind' | 'status'
  >,
): AdapterVerifiedAuthorizationAudit {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      authorizationBasisDigest,
      kind: 'AUTHORIZATION_AUDIT',
      status: 'CONSENSUS',
    },
    'AUTHORIZATION_AUDIT',
    AUTHORIZATION_AUDIT_KEYS,
    validateAuthorizationAuditCore,
  );
}

export function parseAdapterVerifiedAuthorizationAudit(
  input: unknown,
): AdapterVerifiedAuthorizationAudit | null {
  return parseFact(
    input,
    'AUTHORIZATION_AUDIT',
    AUTHORIZATION_AUDIT_KEYS,
    validateAuthorizationAuditCore,
  );
}

export function createAdapterVerifiedCancellationAudit(
  authorization: AuthorizationBundleV1,
  authorizationAudit: AdapterVerifiedAuthorizationAudit,
  details: Omit<
    AdapterVerifiedCancellationAuditCore,
    | keyof ActionFactBinding
    | 'authorizationAuditId'
    | 'effectStatus'
    | 'kind'
    | 'reason'
    | 'status'
  >,
): AdapterVerifiedCancellationAudit {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      authorizationAuditId: authorizationAudit.auditId,
      effectStatus: 'NOT_SIGNED',
      kind: 'CANCELLATION_AUDIT',
      reason: 'OPERATOR_CANCELLED',
      status: 'CONSENSUS',
    },
    'CANCELLATION_AUDIT',
    CANCELLATION_AUDIT_KEYS,
    validateCancellationAuditCore,
  );
}

export function parseAdapterVerifiedCancellationAudit(
  input: unknown,
): AdapterVerifiedCancellationAudit | null {
  return parseFact(
    input,
    'CANCELLATION_AUDIT',
    CANCELLATION_AUDIT_KEYS,
    validateCancellationAuditCore,
  );
}

export function createFrozenSettlementAttempt(
  authorization: AuthorizationBundleV1,
  details: Omit<
    FrozenSettlementAttemptCore,
    | keyof ActionFactBinding
    | 'effectDigest'
    | 'idempotencyKey'
    | 'kind'
    | 'networkId'
    | 'status'
  >,
): FrozenSettlementAttempt {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      effectDigest: deriveSettlementEffectDigest(authorization),
      idempotencyKey: deriveSettlementIdempotencyKey(authorization),
      kind: 'FROZEN_SETTLEMENT_ATTEMPT',
      networkId: authorization.actionCore.settlement.networkId,
      status: 'FROZEN',
    },
    'FROZEN_SETTLEMENT_ATTEMPT',
    ATTEMPT_KEYS,
    validateAttemptCore,
  );
}

export function parseFrozenSettlementAttempt(
  input: unknown,
): FrozenSettlementAttempt | null {
  return parseFact(
    input,
    'FROZEN_SETTLEMENT_ATTEMPT',
    ATTEMPT_KEYS,
    validateAttemptCore,
  );
}

export function createAdapterVerifiedSettlementUncertainty(
  authorization: AuthorizationBundleV1,
  attempt: FrozenSettlementAttempt,
  details: Omit<
    AdapterVerifiedSettlementUncertaintyCore,
    | keyof ActionFactBinding
    | 'attemptId'
    | 'effectDigest'
    | 'idempotencyKey'
    | 'kind'
    | 'networkId'
    | 'signedBytesHash'
    | 'status'
    | 'transactionId'
  >,
): AdapterVerifiedSettlementUncertainty {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      attemptId: attempt.attemptId,
      effectDigest: attempt.effectDigest,
      idempotencyKey: attempt.idempotencyKey,
      kind: 'SETTLEMENT_UNCERTAINTY',
      networkId: attempt.networkId,
      signedBytesHash: attempt.signedBytesHash,
      status: 'UNKNOWN',
      transactionId: attempt.transactionId,
    },
    'SETTLEMENT_UNCERTAINTY',
    UNCERTAINTY_KEYS,
    validateUncertaintyCore,
  );
}

export function parseAdapterVerifiedSettlementUncertainty(
  input: unknown,
): AdapterVerifiedSettlementUncertainty | null {
  return parseFact(
    input,
    'SETTLEMENT_UNCERTAINTY',
    UNCERTAINTY_KEYS,
    validateUncertaintyCore,
  );
}

export function createAdapterVerifiedSettlementReceipt(
  authorization: AuthorizationBundleV1,
  attempt: FrozenSettlementAttempt,
  details: Omit<
    AdapterVerifiedSettlementReceiptCore,
    | keyof ActionFactBinding
    | 'attemptId'
    | 'effectDigest'
    | 'idempotencyKey'
    | 'kind'
    | 'networkId'
    | 'signedBytesHash'
    | 'status'
    | 'transactionId'
  >,
): AdapterVerifiedSettlementReceipt {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      attemptId: attempt.attemptId,
      effectDigest: attempt.effectDigest,
      idempotencyKey: attempt.idempotencyKey,
      kind: 'SETTLEMENT_RECEIPT',
      networkId: attempt.networkId,
      signedBytesHash: attempt.signedBytesHash,
      status: 'SUCCESS',
      transactionId: attempt.transactionId,
    },
    'SETTLEMENT_RECEIPT',
    RECEIPT_KEYS,
    validateReceiptCore,
  );
}

export function parseAdapterVerifiedSettlementReceipt(
  input: unknown,
): AdapterVerifiedSettlementReceipt | null {
  return parseFact(
    input,
    'SETTLEMENT_RECEIPT',
    RECEIPT_KEYS,
    validateReceiptCore,
  );
}

export function createAtomicSettlementConsumptionClaim(
  authorization: AuthorizationBundleV1,
  attempt: FrozenSettlementAttempt,
  receipt: AdapterVerifiedSettlementReceipt,
  details: Omit<
    AtomicSettlementConsumptionClaimCore,
    | keyof ActionFactBinding
    | 'attemptId'
    | 'idempotencyKey'
    | 'kind'
    | 'receiptId'
    | 'status'
  >,
): AtomicSettlementConsumptionClaim {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      attemptId: attempt.attemptId,
      idempotencyKey: attempt.idempotencyKey,
      kind: 'ATOMIC_SETTLEMENT_CONSUMPTION',
      receiptId: receipt.receiptId,
      status: 'CONSUMED',
    },
    'ATOMIC_SETTLEMENT_CONSUMPTION',
    CONSUMPTION_KEYS,
    validateConsumptionCore,
  );
}

export function parseAtomicSettlementConsumptionClaim(
  input: unknown,
): AtomicSettlementConsumptionClaim | null {
  return parseFact(
    input,
    'ATOMIC_SETTLEMENT_CONSUMPTION',
    CONSUMPTION_KEYS,
    validateConsumptionCore,
  );
}

export function sameActionFactBinding(
  expected: ActionFactBinding,
  actual: ActionFactBinding,
): boolean {
  return ACTION_BINDING_KEYS.every((key) => expected[key] === actual[key]);
}
