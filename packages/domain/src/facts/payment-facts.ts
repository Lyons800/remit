import { createHash } from 'node:crypto';

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
  isPositiveSafeInteger,
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
    paidAt: string;
    paymentAttemptId: string;
    paymentNetworkId: string;
    paymentTransactionId: string;
    quoteDigest: string;
    quoteId: string;
    serviceId: string;
    serviceKeyId: string;
    serviceNetworkId: string;
    servicePaymentId: string;
    serviceRequestDigest: string;
    status: 'CONSENSUS';
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
    paymentAttemptId: string;
    paymentNetworkId: string;
    paymentTransactionId: string;
    quoteDigest: string;
    quoteId: string;
    result: 'MATCH' | 'MISMATCH' | 'UNKNOWN';
    serviceId: string;
    serviceKeyId: string;
    serviceNetworkId: string;
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
    agentBookRegistry: string;
    agentBookStatus: 'CURRENT' | 'CHANGED' | 'REVOKED' | 'UNVERIFIED';
    agentId: string;
    agentTenantPrincipal: string;
    audience: string;
    companyRoleStatus: 'CURRENT' | 'EXPIRED' | 'REVOKED' | 'UNVERIFIED';
    effectDigest: string;
    expiresAt: string;
    factId: string;
    grantDigest: string;
    grantId: string;
    grantStatus: 'CURRENT' | 'EXPIRED' | 'REVOKED' | 'UNVERIFIED';
    grantVersion: number;
    kind: 'REQUESTING_AGENT_EXECUTION';
    role: string;
    roleCredentialId: string;
    scope: string;
    subjectId: string;
    tenantId: string;
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
    authorityFactDigest: string;
    committedAt: string;
    kind: 'AUTHORIZATION_AUDIT';
    networkId: string;
    status: 'CONSENSUS';
    topicId: string;
    transactionId: string;
    writerAccountId: string;
    writerId: string;
    writerKeyId: string;
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
    networkId: string;
    reason: 'OPERATOR_CANCELLED';
    status: 'CONSENSUS';
    topicId: string;
    transactionId: string;
    writerAccountId: string;
    writerId: string;
    writerKeyId: string;
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
    signedTransactionBytes: string;
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
    attemptAdapterId: string;
    attemptId: string;
    effectDigest: string;
    idempotencyKey: string;
    kind: 'SETTLEMENT_UNCERTAINTY';
    networkId: string;
    observedAt: string;
    reason: 'SUBMISSION_RESULT_UNKNOWN' | 'RECEIPT_LOOKUP_INCONCLUSIVE';
    signedBytesHash: string;
    signedTransactionBytes: string;
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
    attemptAdapterId: string;
    attemptId: string;
    effectDigest: string;
    idempotencyKey: string;
    kind: 'SETTLEMENT_RECEIPT';
    networkId: string;
    receiptId: string;
    receiptSource: 'CONSENSUS_NODE' | 'MIRROR_NODE';
    settledAt: string;
    signedBytesHash: string;
    signedTransactionBytes: string;
    sourceNodeId: string;
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
    atomicGroupKey: string;
    attemptId: string;
    claimId: string;
    consumedAt: string;
    expectedAggregateVersion: number;
    idempotencyKey: string;
    kind: 'ATOMIC_SETTLEMENT_CONSUMPTION';
    receiptId: string;
    status: 'CONSUMED';
    transactionScope: 'SERIALIZABLE_PAYMENT_WRITE';
    writerId: string;
    writerVersion: number;
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
  'paidAt',
  'paymentAttemptId',
  'paymentNetworkId',
  'paymentTransactionId',
  'quoteDigest',
  'quoteId',
  'serviceId',
  'serviceKeyId',
  'serviceNetworkId',
  'servicePaymentId',
  'serviceRequestDigest',
  'status',
] as const;
const EVIDENCE_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'evidencePolicyDigest',
  'evidenceResultId',
  'evidenceRoot',
  'expiresAt',
  'kind',
  'paymentAttemptId',
  'paymentNetworkId',
  'paymentTransactionId',
  'quoteDigest',
  'quoteId',
  'result',
  'serviceId',
  'serviceKeyId',
  'serviceNetworkId',
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
  'agentBookRegistry',
  'agentBookStatus',
  'agentId',
  'agentTenantPrincipal',
  'audience',
  'companyRoleStatus',
  'effectDigest',
  'expiresAt',
  'factId',
  'grantDigest',
  'grantId',
  'grantStatus',
  'grantVersion',
  'kind',
  'role',
  'roleCredentialId',
  'scope',
  'subjectId',
  'tenantId',
  'verifiedAt',
] as const;
const AUTHORIZATION_AUDIT_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'auditId',
  'authorizationBasisDigest',
  'authorityFactDigest',
  'committedAt',
  'kind',
  'networkId',
  'status',
  'topicId',
  'transactionId',
  'writerAccountId',
  'writerId',
  'writerKeyId',
] as const;
const CANCELLATION_AUDIT_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'authorizationAuditId',
  'cancellationId',
  'committedAt',
  'effectStatus',
  'kind',
  'networkId',
  'reason',
  'status',
  'topicId',
  'transactionId',
  'writerAccountId',
  'writerId',
  'writerKeyId',
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
  'signedTransactionBytes',
  'status',
  'transactionId',
] as const;
const UNCERTAINTY_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'attemptAdapterId',
  'attemptId',
  'effectDigest',
  'idempotencyKey',
  'kind',
  'networkId',
  'observedAt',
  'reason',
  'signedBytesHash',
  'signedTransactionBytes',
  'status',
  'transactionId',
  'uncertaintyId',
] as const;
const RECEIPT_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'attemptAdapterId',
  'attemptId',
  'effectDigest',
  'idempotencyKey',
  'kind',
  'networkId',
  'receiptId',
  'receiptSource',
  'settledAt',
  'signedBytesHash',
  'signedTransactionBytes',
  'sourceNodeId',
  'status',
  'transactionId',
] as const;
const CONSUMPTION_KEYS = [
  ...ACTION_BINDING_KEYS,
  'adapterId',
  'atomicGroupKey',
  'attemptId',
  'claimId',
  'consumedAt',
  'expectedAggregateVersion',
  'idempotencyKey',
  'kind',
  'receiptId',
  'status',
  'transactionScope',
  'writerId',
  'writerVersion',
] as const;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const MAX_SIGNED_TRANSACTION_BYTES = 32_768;
const MAX_SIGNED_TRANSACTION_BASE64URL_LENGTH = Math.ceil(
  (MAX_SIGNED_TRANSACTION_BYTES * 4) / 3,
);

function decodeCanonicalSignedTransactionBytes(value: unknown): Buffer | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_SIGNED_TRANSACTION_BASE64URL_LENGTH ||
    !BASE64URL_PATTERN.test(value)
  ) {
    return null;
  }

  const decoded = Buffer.from(value, 'base64url');
  return decoded.length > 0 &&
    decoded.length <= MAX_SIGNED_TRANSACTION_BYTES &&
    decoded.toString('base64url') === value
    ? decoded
    : null;
}

export function encodeCanonicalSignedTransactionBytes(
  bytes: Uint8Array,
): string {
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_SIGNED_TRANSACTION_BYTES
  ) {
    throw new Error('Signed transaction bytes are outside the allowed bounds.');
  }
  return Buffer.from(bytes).toString('base64url');
}

export function hashSignedTransactionBytes(input: unknown): string | null {
  const bytes = decodeCanonicalSignedTransactionBytes(input);
  return bytes === null
    ? null
    : createHash('sha256').update(bytes).digest('hex');
}

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
  isSha256Digest(value.quoteDigest) &&
  isSha256Digest(value.serviceRequestDigest) &&
  validInstant(value.paidAt) &&
  validStringFields(value, [
    'adapterId',
    'paymentAttemptId',
    'paymentNetworkId',
    'paymentTransactionId',
    'quoteId',
    'serviceId',
    'serviceKeyId',
    'serviceNetworkId',
    'servicePaymentId',
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
  isSha256Digest(value.quoteDigest) &&
  isSha256Digest(value.serviceRequestDigest) &&
  validInstant(value.verifiedAt) &&
  validInstant(value.expiresAt) &&
  (value.verifiedAt as string) < (value.expiresAt as string) &&
  validStringFields(value, [
    'adapterId',
    'evidenceResultId',
    'paymentAttemptId',
    'paymentNetworkId',
    'paymentTransactionId',
    'quoteId',
    'serviceId',
    'serviceKeyId',
    'serviceNetworkId',
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
  (value.grantStatus === 'CURRENT' ||
    value.grantStatus === 'EXPIRED' ||
    value.grantStatus === 'REVOKED' ||
    value.grantStatus === 'UNVERIFIED') &&
  isSha256Digest(value.effectDigest) &&
  isSha256Digest(value.grantDigest) &&
  isPositiveSafeInteger(value.grantVersion) &&
  validInstant(value.verifiedAt) &&
  validInstant(value.expiresAt) &&
  (value.verifiedAt as string) < (value.expiresAt as string) &&
  validStringFields(value, [
    'actionHumanPrincipal',
    'adapterId',
    'agentBackingRecordId',
    'agentBookRegistry',
    'agentId',
    'agentTenantPrincipal',
    'audience',
    'factId',
    'grantId',
    'role',
    'roleCredentialId',
    'scope',
    'subjectId',
    'tenantId',
  ]);

const validateAuthorizationAuditCore = (
  value: Record<string, unknown>,
): boolean =>
  isActionBinding(value) &&
  value.kind === 'AUTHORIZATION_AUDIT' &&
  value.status === 'CONSENSUS' &&
  isSha256Digest(value.authorizationBasisDigest) &&
  isSha256Digest(value.authorityFactDigest) &&
  validInstant(value.committedAt) &&
  validStringFields(value, [
    'adapterId',
    'auditId',
    'networkId',
    'topicId',
    'transactionId',
    'writerAccountId',
    'writerId',
    'writerKeyId',
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
    'networkId',
    'topicId',
    'transactionId',
    'writerAccountId',
    'writerId',
    'writerKeyId',
  ]);

const validateAttemptCore = (value: Record<string, unknown>): boolean =>
  isActionBinding(value) &&
  value.kind === 'FROZEN_SETTLEMENT_ATTEMPT' &&
  value.status === 'FROZEN' &&
  isSha256Digest(value.effectDigest) &&
  isSha256Digest(value.signedBytesHash) &&
  hashSignedTransactionBytes(value.signedTransactionBytes) ===
    value.signedBytesHash &&
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
  hashSignedTransactionBytes(value.signedTransactionBytes) ===
    value.signedBytesHash &&
  validInstant(value.observedAt) &&
  validStringFields(value, [
    'adapterId',
    'attemptAdapterId',
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
  (value.receiptSource === 'CONSENSUS_NODE' ||
    value.receiptSource === 'MIRROR_NODE') &&
  isSha256Digest(value.effectDigest) &&
  isSha256Digest(value.signedBytesHash) &&
  hashSignedTransactionBytes(value.signedTransactionBytes) ===
    value.signedBytesHash &&
  validInstant(value.settledAt) &&
  validStringFields(value, [
    'adapterId',
    'attemptAdapterId',
    'attemptId',
    'idempotencyKey',
    'networkId',
    'receiptId',
    'sourceNodeId',
    'transactionId',
  ]);

const validateConsumptionCore = (value: Record<string, unknown>): boolean =>
  isActionBinding(value) &&
  value.kind === 'ATOMIC_SETTLEMENT_CONSUMPTION' &&
  value.status === 'CONSUMED' &&
  value.transactionScope === 'SERIALIZABLE_PAYMENT_WRITE' &&
  isPositiveSafeInteger(value.expectedAggregateVersion) &&
  isPositiveSafeInteger(value.writerVersion) &&
  validInstant(value.consumedAt) &&
  validStringFields(value, [
    'adapterId',
    'atomicGroupKey',
    'attemptId',
    'claimId',
    'idempotencyKey',
    'receiptId',
    'writerId',
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
    | keyof ActionFactBinding
    | 'evidencePolicyDigest'
    | 'kind'
    | 'serviceId'
    | 'serviceKeyId'
    | 'serviceNetworkId'
    | 'status'
  >,
): AdapterVerifiedVerificationPayment {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      evidencePolicyDigest: authorization.decision.evidencePolicy.digest,
      kind: 'VERIFICATION_PAYMENT',
      serviceId: authorization.decision.evidencePolicy.serviceId,
      serviceKeyId: authorization.decision.evidencePolicy.serviceKeyId,
      serviceNetworkId: authorization.decision.evidencePolicy.serviceNetworkId,
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
    | 'paymentAttemptId'
    | 'paymentNetworkId'
    | 'paymentTransactionId'
    | 'quoteDigest'
    | 'quoteId'
    | 'serviceId'
    | 'serviceKeyId'
    | 'serviceNetworkId'
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
      paymentAttemptId: payment.paymentAttemptId,
      paymentNetworkId: payment.paymentNetworkId,
      paymentTransactionId: payment.paymentTransactionId,
      quoteDigest: payment.quoteDigest,
      quoteId: payment.quoteId,
      serviceId: payment.serviceId,
      serviceKeyId: payment.serviceKeyId,
      serviceNetworkId: payment.serviceNetworkId,
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
  authority: RequestingAgentExecutionFact,
  details: Omit<
    AdapterVerifiedAuthorizationAuditCore,
    | keyof ActionFactBinding
    | 'authorizationBasisDigest'
    | 'authorityFactDigest'
    | 'kind'
    | 'status'
  >,
): AdapterVerifiedAuthorizationAudit {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      authorizationBasisDigest,
      authorityFactDigest: authority.recordDigest,
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
    | 'signedBytesHash'
    | 'status'
  >,
): FrozenSettlementAttempt {
  const signedBytesHash = hashSignedTransactionBytes(
    details.signedTransactionBytes,
  );
  if (signedBytesHash === null) {
    throw new Error('Invalid signed transaction bytes.');
  }

  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      effectDigest: deriveSettlementEffectDigest(authorization),
      idempotencyKey: deriveSettlementIdempotencyKey(authorization),
      kind: 'FROZEN_SETTLEMENT_ATTEMPT',
      networkId: authorization.actionCore.settlement.networkId,
      signedBytesHash,
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
    | 'attemptAdapterId'
    | 'attemptId'
    | 'effectDigest'
    | 'idempotencyKey'
    | 'kind'
    | 'networkId'
    | 'signedBytesHash'
    | 'signedTransactionBytes'
    | 'status'
    | 'transactionId'
  >,
): AdapterVerifiedSettlementUncertainty {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      attemptAdapterId: attempt.adapterId,
      attemptId: attempt.attemptId,
      effectDigest: attempt.effectDigest,
      idempotencyKey: attempt.idempotencyKey,
      kind: 'SETTLEMENT_UNCERTAINTY',
      networkId: attempt.networkId,
      signedBytesHash: attempt.signedBytesHash,
      signedTransactionBytes: attempt.signedTransactionBytes,
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
    | 'attemptAdapterId'
    | 'attemptId'
    | 'effectDigest'
    | 'idempotencyKey'
    | 'kind'
    | 'networkId'
    | 'signedBytesHash'
    | 'signedTransactionBytes'
    | 'status'
    | 'transactionId'
  >,
): AdapterVerifiedSettlementReceipt {
  return createFact(
    {
      ...actionFactBinding(authorization),
      ...details,
      attemptAdapterId: attempt.adapterId,
      attemptId: attempt.attemptId,
      effectDigest: attempt.effectDigest,
      idempotencyKey: attempt.idempotencyKey,
      kind: 'SETTLEMENT_RECEIPT',
      networkId: attempt.networkId,
      signedBytesHash: attempt.signedBytesHash,
      signedTransactionBytes: attempt.signedTransactionBytes,
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
    | 'transactionScope'
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
      transactionScope: 'SERIALIZABLE_PAYMENT_WRITE',
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
