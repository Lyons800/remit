import {
  createAdapterRecord,
  hasExactKeys,
  hasValidAdapterRecordDigest,
} from '../facts/adapter-record.js';
import { accept, refuse, type DomainResult } from '../result.js';
import { isCanonicalUtcInstant } from '../state/temporal.js';
import {
  isNonEmptyBoundedString,
  isRecord,
  isSha256Digest,
} from '../values/validation.js';

export type PaymentHistoryBinding = Readonly<{
  actionDigest: string;
  actionId: string;
  idempotencyKey: string;
  invoiceRevisionId: string;
  nonce: string;
  obligationId: string;
  organizationId: string;
}>;

export type PaymentHistoryProjectionCore = Readonly<
  PaymentHistoryBinding & {
    adapterId: string;
    consumedIdempotencyKeys: readonly string[];
    kind: 'PAYMENT_HISTORY_PROJECTION';
    nonTerminalActionIds: readonly string[];
    projectionId: string;
    settledActionIds: readonly string[];
    settledReceiptIds: readonly string[];
    verifiedAt: string;
  }
>;

export type PaymentHistoryFacts = Readonly<
  PaymentHistoryProjectionCore & { recordDigest: string }
>;

const BINDING_KEYS = [
  'actionDigest',
  'actionId',
  'idempotencyKey',
  'invoiceRevisionId',
  'nonce',
  'obligationId',
  'organizationId',
] as const;
const PROJECTION_KEYS = [
  ...BINDING_KEYS,
  'adapterId',
  'consumedIdempotencyKeys',
  'kind',
  'nonTerminalActionIds',
  'projectionId',
  'recordDigest',
  'settledActionIds',
  'settledReceiptIds',
  'verifiedAt',
] as const;

function parseStringSet(input: unknown): readonly string[] | null {
  if (!Array.isArray(input) || input.length > 10_000) {
    return null;
  }
  const values: string[] = [];
  for (const candidate of input) {
    if (!isNonEmptyBoundedString(candidate)) {
      return null;
    }
    const previous = values.at(-1);
    if (previous !== undefined && previous >= candidate) {
      return null;
    }
    values.push(candidate);
  }
  return Object.freeze(values);
}

function parseBinding(input: unknown): PaymentHistoryBinding | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, BINDING_KEYS) ||
    !isSha256Digest(input.actionDigest) ||
    !isNonEmptyBoundedString(input.actionId) ||
    !isNonEmptyBoundedString(input.idempotencyKey) ||
    !isNonEmptyBoundedString(input.invoiceRevisionId) ||
    !isNonEmptyBoundedString(input.nonce) ||
    !isNonEmptyBoundedString(input.obligationId) ||
    !isNonEmptyBoundedString(input.organizationId)
  ) {
    return null;
  }
  return Object.freeze({
    actionDigest: input.actionDigest,
    actionId: input.actionId,
    idempotencyKey: input.idempotencyKey,
    invoiceRevisionId: input.invoiceRevisionId,
    nonce: input.nonce,
    obligationId: input.obligationId,
    organizationId: input.organizationId,
  });
}

function parseProjectionCore(
  input: unknown,
): PaymentHistoryProjectionCore | null {
  if (
    !isRecord(input) ||
    input.kind !== 'PAYMENT_HISTORY_PROJECTION' ||
    !isSha256Digest(input.actionDigest) ||
    !isNonEmptyBoundedString(input.actionId) ||
    !isNonEmptyBoundedString(input.adapterId) ||
    !isNonEmptyBoundedString(input.idempotencyKey) ||
    !isNonEmptyBoundedString(input.invoiceRevisionId) ||
    !isNonEmptyBoundedString(input.nonce) ||
    !isNonEmptyBoundedString(input.obligationId) ||
    !isNonEmptyBoundedString(input.organizationId) ||
    !isNonEmptyBoundedString(input.projectionId) ||
    !isCanonicalUtcInstant(
      typeof input.verifiedAt === 'string' ? input.verifiedAt : '',
    )
  ) {
    return null;
  }
  const consumedIdempotencyKeys = parseStringSet(input.consumedIdempotencyKeys);
  const nonTerminalActionIds = parseStringSet(input.nonTerminalActionIds);
  const settledActionIds = parseStringSet(input.settledActionIds);
  const settledReceiptIds = parseStringSet(input.settledReceiptIds);
  if (
    consumedIdempotencyKeys === null ||
    nonTerminalActionIds === null ||
    settledActionIds === null ||
    settledReceiptIds === null ||
    settledActionIds.length !== settledReceiptIds.length
  ) {
    return null;
  }

  return Object.freeze({
    actionDigest: input.actionDigest,
    actionId: input.actionId,
    adapterId: input.adapterId,
    consumedIdempotencyKeys,
    idempotencyKey: input.idempotencyKey,
    invoiceRevisionId: input.invoiceRevisionId,
    kind: input.kind,
    nonce: input.nonce,
    nonTerminalActionIds,
    obligationId: input.obligationId,
    organizationId: input.organizationId,
    projectionId: input.projectionId,
    settledActionIds,
    settledReceiptIds,
    verifiedAt: input.verifiedAt as string,
  });
}

export function createPaymentHistoryProjection(
  coreInput: PaymentHistoryProjectionCore,
): PaymentHistoryFacts {
  const core = parseProjectionCore(coreInput);
  if (core === null) {
    throw new Error('Invalid payment-history projection core.');
  }
  return createAdapterRecord('PAYMENT_HISTORY_PROJECTION', core);
}

function parseProjection(input: unknown): PaymentHistoryFacts | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, PROJECTION_KEYS) ||
    !hasValidAdapterRecordDigest(input, 'PAYMENT_HISTORY_PROJECTION')
  ) {
    return null;
  }
  const { recordDigest, ...candidateCore } = input;
  const core = parseProjectionCore(candidateCore);
  return core === null
    ? null
    : Object.freeze({ ...core, recordDigest: recordDigest as string });
}

function sameBinding(
  expected: PaymentHistoryBinding,
  actual: PaymentHistoryBinding,
): boolean {
  return (
    expected.actionDigest === actual.actionDigest &&
    expected.actionId === actual.actionId &&
    expected.idempotencyKey === actual.idempotencyKey &&
    expected.invoiceRevisionId === actual.invoiceRevisionId &&
    expected.nonce === actual.nonce &&
    expected.obligationId === actual.obligationId &&
    expected.organizationId === actual.organizationId
  );
}

export function validatePaymentHistory(
  bindingInput: unknown,
  factsInput: unknown,
): DomainResult<PaymentHistoryFacts> {
  const binding = parseBinding(bindingInput);
  const facts = parseProjection(factsInput);
  if (binding === null || facts === null) {
    return refuse('PAYMENT_HISTORY_INVALID');
  }
  if (!sameBinding(binding, facts)) {
    return refuse('PAYMENT_HISTORY_BINDING_MISMATCH');
  }
  if (facts.nonTerminalActionIds.length > 1) {
    return refuse('OBLIGATION_ACTION_CONFLICT');
  }
  if (facts.settledActionIds.length > 1) {
    return refuse('OBLIGATION_ALREADY_SETTLED');
  }
  if (
    facts.settledActionIds.filter((id) => id === binding.actionId).length > 1 ||
    facts.consumedIdempotencyKeys.filter(
      (key) => key === binding.idempotencyKey,
    ).length > 1
  ) {
    return refuse('ACTION_ALREADY_CONSUMED');
  }
  return accept(facts);
}

export function validateNewPaymentActionEligibility(
  bindingInput: unknown,
  factsInput: unknown,
): DomainResult<PaymentHistoryFacts> {
  const history = validatePaymentHistory(bindingInput, factsInput);
  if (!history.ok) {
    return history;
  }
  if (history.value.settledActionIds.length !== 0) {
    return refuse('OBLIGATION_ALREADY_SETTLED');
  }
  if (history.value.nonTerminalActionIds.length !== 0) {
    return refuse('OBLIGATION_ACTION_CONFLICT');
  }
  return history;
}

export function validateSettlementClaim(
  bindingInput: unknown,
  factsInput: unknown,
): DomainResult<PaymentHistoryFacts> {
  const binding = parseBinding(bindingInput);
  const history = validatePaymentHistory(bindingInput, factsInput);
  if (binding === null || !history.ok) {
    return binding === null ? refuse('PAYMENT_HISTORY_INVALID') : history;
  }
  if (history.value.settledActionIds.includes(binding.actionId)) {
    return refuse('ACTION_ALREADY_CONSUMED');
  }
  if (history.value.settledActionIds.length !== 0) {
    return refuse('OBLIGATION_ALREADY_SETTLED');
  }
  if (history.value.consumedIdempotencyKeys.includes(binding.idempotencyKey)) {
    return refuse('ACTION_ALREADY_CONSUMED');
  }
  return history;
}

export type DigestBinding = Readonly<{
  actionDigest: string;
  source: string;
}>;

export function validateDigestBindings(
  expectedActionDigest: string,
  bindings: readonly DigestBinding[],
): DomainResult<readonly DigestBinding[]> {
  return bindings.every(
    ({ actionDigest }) => actionDigest === expectedActionDigest,
  )
    ? accept(bindings)
    : refuse('ACTION_DIGEST_MISMATCH');
}
