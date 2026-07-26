import { createHash } from 'node:crypto';

import type { VerificationQuoteRequestEffect } from '@invoiceguard/domain';

import {
  decodeHederaTransaction,
  parseCanonicalTransactionId,
} from './hedera-sdk-runtime.js';
import {
  HEDERA_TESTNET_CAIP2,
  supplierEvidenceMemo,
  supplierEvidenceRequestDigest,
  verifyFacilitatorPaymentAttestationV2,
  verifySupplierEvidenceBindingContextV2,
  type SignedFacilitatorPaymentAttestationV2,
  type SupplierEvidenceBindingContextV2,
  type SupplierEvidenceQuoteV2,
  type SupplierEvidenceRequestV2,
  type TrustedEd25519Key,
} from './supplier-evidence-v2.js';

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_SIGNED_INT64 = 9_223_372_036_854_775_807n;
const INSPECTED_PREPARED = Symbol('inspected-prepared-verification-payment');
const VERIFIED_CONSENSUS = Symbol('verified-consensus-verification-payment');

export type VerificationEffectIdentity = Readonly<{
  actionDigest: string;
  atomicGroupKey: string;
  eventId: string;
}>;

/**
 * Temporary seam owned by the application/persistence integration.
 *
 * VerificationQuoteRequestEffect does not yet carry the durable event identity
 * required by the outbox contract. The adapter deliberately does not invent
 * one. A trusted caller must provide the identity issued by the prerequisite
 * persistence workstream.
 */
export interface VerificationEffectIdentitySource {
  resolve(effect: VerificationQuoteRequestEffect): VerificationEffectIdentity;
}

export type ClaimedVerificationPayment = Readonly<{
  actionDigest: string;
  atomicGroupKey: string;
  eventId: string;
  leaseExpiresAt: string;
  paymentAttemptId: string;
  quoteDigest: string;
  quoteId: string;
  requestDigest: string;
  state: 'CLAIMED';
}>;

export type AbandonedVerificationPayment = Readonly<
  Omit<ClaimedVerificationPayment, 'state'> & {
    abandonedAt: string;
    reason: 'LEASE_EXPIRED_BEFORE_PREPARED';
    replacementPaymentAttemptId: string;
    replacementQuoteDigest: string;
    replacementQuoteId: string;
    state: 'ABANDONED';
  }
>;

export type PreparedVerificationPayment = Readonly<
  Omit<ClaimedVerificationPayment, 'state'> & {
    amountTinybars: string;
    facilitatorFeePayerAccountId: string;
    fullySignedTransactionBase64: string;
    maximumTransactionFeeTinybars: string;
    memo: string;
    networkId: typeof HEDERA_TESTNET_CAIP2;
    nodeAccountId: string;
    payerAccountId: string;
    receiverAccountId: string;
    state: 'PREPARED';
    transactionByteHash: string;
    transactionId: string;
  }
>;

export type InspectedPreparedVerificationPayment =
  PreparedVerificationPayment & {
    readonly [INSPECTED_PREPARED]: true;
  };

export type ConsensusVerificationPayment = Readonly<
  Omit<PreparedVerificationPayment, 'state'> & {
    attestation: SignedFacilitatorPaymentAttestationV2;
    state: 'CONSENSUS';
  }
>;

export type VerifiedConsensusVerificationPayment =
  ConsensusVerificationPayment & {
    readonly [VERIFIED_CONSENSUS]: true;
  };

/**
 * The facilitator trust anchor is supplied by application composition. It is
 * never selected from the persisted attestation's self-asserted key ID.
 */
export type VerificationPaymentRecoveryContextV2 =
  SupplierEvidenceBindingContextV2 &
    Readonly<{
      trustedFacilitator: TrustedEd25519Key;
    }>;

export type VerificationPaymentAttempt =
  | ClaimedVerificationPayment
  | PreparedVerificationPayment
  | ConsensusVerificationPayment;

export interface VerificationPaymentStore {
  find(requestDigest: string): Promise<VerificationPaymentAttempt | null>;
  claim(
    claim: ClaimedVerificationPayment,
  ): Promise<
    | Readonly<{ attempt: ClaimedVerificationPayment; status: 'ACQUIRED' }>
    | Readonly<{ status: 'CONFLICT' }>
    | Readonly<{ attempt: VerificationPaymentAttempt; status: 'EXISTING' }>
  >;
  /**
   * Atomically writes the abandonment history and replacement claim only when
   * `expected` is still the current CLAIMED row. Exactly one racing caller may
   * receive TAKEN; a conflict must reload durable state.
   */
  takeoverExpiredClaim(
    input: Readonly<{
      abandonment: AbandonedVerificationPayment;
      expected: ClaimedVerificationPayment;
      replacement: ClaimedVerificationPayment;
    }>,
  ): Promise<
    | Readonly<{
        abandonment: AbandonedVerificationPayment;
        attempt: ClaimedVerificationPayment;
        status: 'TAKEN';
      }>
    | Readonly<{ status: 'CONFLICT' }>
  >;
  recordConsensus(
    prepared: PreparedVerificationPayment,
    attestation: SignedFacilitatorPaymentAttestationV2,
  ): Promise<ConsensusVerificationPayment>;
  /**
   * Only the result of inspectPreparedVerificationTransaction is admitted.
   * The store persists its serializable fields and advances CLAIMED to
   * PREPARED atomically; it must not accept caller-described transaction data.
   */
  recordPrepared(
    claim: ClaimedVerificationPayment,
    prepared: InspectedPreparedVerificationPayment,
  ): Promise<PreparedVerificationPayment>;
}

export type VerificationRecoveryDecision =
  | Readonly<{
      claim: ClaimedVerificationPayment;
      kind: 'CLAIM_NEW';
    }>
  | Readonly<{
      attempt: ClaimedVerificationPayment;
      kind: 'WAIT_FOR_LEASE';
    }>
  | Readonly<{
      abandonment: AbandonedVerificationPayment;
      claim: ClaimedVerificationPayment;
      expected: ClaimedVerificationPayment;
      kind: 'TAKEOVER_EXPIRED_CLAIM';
    }>
  | Readonly<{
      attempt: PreparedVerificationPayment;
      kind: 'RECONCILE_PREPARED';
    }>
  | Readonly<{
      attempt: VerifiedConsensusVerificationPayment;
      kind: 'RETURN_CONSENSUS';
    }>;

function assertCanonicalInstant(value: string, label: string): void {
  if (
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError(`${label} must be a canonical UTC instant.`);
  }
}

function assertIdentity(
  effect: VerificationQuoteRequestEffect,
  source: VerificationEffectIdentitySource,
): VerificationEffectIdentity {
  const identity = source.resolve(effect);
  if (
    identity.actionDigest !== effect.actionDigest ||
    identity.atomicGroupKey !== effect.atomicGroupKey ||
    identity.eventId.length === 0
  ) {
    throw new TypeError(
      'Verification effect identity does not bind the AP effect.',
    );
  }
  return Object.freeze({ ...identity });
}

function decodeCanonicalBase64(value: string): Buffer {
  if (!BASE64_PATTERN.test(value)) {
    throw new TypeError('Prepared transaction bytes are not canonical Base64.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0 || bytes.toString('base64') !== value) {
    throw new TypeError('Prepared transaction bytes are invalid.');
  }
  return bytes;
}

export function preparedTransactionByteHash(
  fullySignedTransactionBase64: string,
): string {
  return createHash('sha256')
    .update(decodeCanonicalBase64(fullySignedTransactionBase64))
    .digest('hex');
}

function assertPositiveInt64(value: string, label: string): void {
  if (!/^[1-9]\d{0,18}$/u.test(value) || BigInt(value) > MAX_SIGNED_INT64) {
    throw new TypeError(`${label} must fit a positive signed int64.`);
  }
}

function assertClaimBase(
  attempt: VerificationPaymentAttempt,
  effect: VerificationQuoteRequestEffect,
  identity: VerificationEffectIdentity,
  request: SupplierEvidenceRequestV2,
): void {
  if (
    attempt.actionDigest !== effect.actionDigest ||
    attempt.atomicGroupKey !== effect.atomicGroupKey ||
    attempt.eventId !== identity.eventId ||
    attempt.requestDigest !== supplierEvidenceRequestDigest(request) ||
    attempt.paymentAttemptId.length === 0
  ) {
    throw new TypeError(
      'Stored verification payment belongs to another AP effect or request.',
    );
  }
  assertCanonicalInstant(
    attempt.leaseExpiresAt,
    'verification payment lease expiry',
  );
}

function assertQuoteAttemptBinding(
  attempt: VerificationPaymentAttempt,
  quote: SupplierEvidenceQuoteV2,
): void {
  if (
    attempt.quoteDigest !== quote.quoteDigest ||
    attempt.quoteId !== quote.quoteId
  ) {
    throw new TypeError(
      'Stored verification payment belongs to another quote.',
    );
  }
}

function assertNewPaymentWindow(
  effect: VerificationQuoteRequestEffect,
  quote: SupplierEvidenceQuoteV2,
  input: Readonly<{
    leaseExpiresAt: string;
    now: string;
    paymentAttemptId: string;
  }>,
): void {
  if (
    input.now < quote.issuedAt ||
    input.now >= effect.expiresAt ||
    input.now >= quote.expiresAt ||
    input.leaseExpiresAt <= input.now ||
    input.leaseExpiresAt > quote.expiresAt ||
    input.paymentAttemptId.length === 0
  ) {
    throw new TypeError(
      'A new verification payment cannot begin outside its live window.',
    );
  }
}

function makeClaim(
  effect: VerificationQuoteRequestEffect,
  identity: VerificationEffectIdentity,
  request: SupplierEvidenceRequestV2,
  quote: SupplierEvidenceQuoteV2,
  input: Readonly<{
    leaseExpiresAt: string;
    paymentAttemptId: string;
  }>,
): ClaimedVerificationPayment {
  return Object.freeze({
    actionDigest: effect.actionDigest,
    atomicGroupKey: effect.atomicGroupKey,
    eventId: identity.eventId,
    leaseExpiresAt: input.leaseExpiresAt,
    paymentAttemptId: input.paymentAttemptId,
    quoteDigest: quote.quoteDigest,
    quoteId: quote.quoteId,
    requestDigest: supplierEvidenceRequestDigest(request),
    state: 'CLAIMED',
  });
}

export async function inspectPreparedVerificationTransaction(
  context: SupplierEvidenceBindingContextV2,
  claim: ClaimedVerificationPayment,
  fullySignedTransactionBase64: string,
): Promise<InspectedPreparedVerificationPayment> {
  const { deployment, quote, request } =
    verifySupplierEvidenceBindingContextV2(context);
  if (
    claim.actionDigest !== request.actionDigest ||
    claim.requestDigest !== supplierEvidenceRequestDigest(request) ||
    claim.quoteDigest !== quote.quoteDigest ||
    claim.quoteId !== quote.quoteId
  ) {
    throw new TypeError(
      'Prepared transaction claim does not bind the AP quote.',
    );
  }
  const bytes = decodeCanonicalBase64(fullySignedTransactionBase64);
  const decoded = decodeHederaTransaction(bytes);
  const transaction = decoded.transaction;
  let reserialized: Uint8Array;
  try {
    reserialized = await transaction.toBytesAsync();
  } catch {
    throw new TypeError('Prepared Hedera transaction cannot be serialized.');
  }
  const transactionId = transaction.transactionId;
  const nodeAccountIds = transaction.nodeAccountIds;
  const transfers = transaction.hbarTransfersList;
  const maximumFeeTinybars =
    transaction.maxTransactionFee?.toTinybars().toString() ?? '';
  const flatSignatures = transaction.getSignatures().getFlatSignatureList();
  if (
    !decoded.isTransfer ||
    !transaction.isFrozen() ||
    !Buffer.from(reserialized).equals(bytes) ||
    transactionId === null ||
    transactionId.accountId === null ||
    transactionId.validStart === null ||
    transactionId.scheduled === true ||
    (transactionId.nonce !== null && !transactionId.nonce.isZero()) ||
    nodeAccountIds === null ||
    nodeAccountIds.length !== 1 ||
    transfers === undefined ||
    transfers.length !== 2 ||
    transaction.tokenTransfers?.size !== 0 ||
    transaction.nftTransfers?.size !== 0 ||
    flatSignatures.length !== 1 ||
    flatSignatures[0]?.size === undefined ||
    flatSignatures[0].size < 2
  ) {
    throw new TypeError(
      'Prepared bytes are not one fully signed HBAR transfer.',
    );
  }
  const transactionIdText = transactionId.toString();
  const feePayerAccountId = transactionId.accountId.toString();
  const nodeAccountId = nodeAccountIds[0]?.toString() ?? '';
  const negative = transfers.find((transfer) =>
    transfer.amount.toTinybars().isNegative(),
  );
  const positive = transfers.find((transfer) =>
    transfer.amount.toTinybars().isPositive(),
  );
  const amountTinybars = positive?.amount.toTinybars().toString() ?? '';
  const debitTinybars = negative?.amount.toTinybars().toString() ?? '';
  assertPositiveInt64(amountTinybars, 'prepared transfer amount');
  assertPositiveInt64(maximumFeeTinybars, 'prepared transaction fee cap');
  if (
    parseCanonicalTransactionId(transactionIdText).toString() !==
      transactionIdText ||
    feePayerAccountId !== quote.facilitatorFeePayerAccountId ||
    !deployment.body.allowedNodeAccountIds.includes(nodeAccountId) ||
    transaction.transactionMemo !== supplierEvidenceMemo(claim.requestDigest) ||
    negative === undefined ||
    positive === undefined ||
    negative.isApproved ||
    positive.isApproved ||
    debitTinybars !== `-${quote.requirements.amount}` ||
    amountTinybars !== quote.requirements.amount ||
    negative.accountId.toString() === positive.accountId.toString() ||
    positive.accountId.toString() !== quote.requirements.payTo ||
    BigInt(maximumFeeTinybars) > BigInt(quote.maximumTransactionFeeTinybars)
  ) {
    throw new TypeError(
      'Prepared Hedera transaction differs from the authorized quote.',
    );
  }
  return Object.freeze({
    ...claim,
    [INSPECTED_PREPARED]: true as const,
    amountTinybars,
    facilitatorFeePayerAccountId: feePayerAccountId,
    fullySignedTransactionBase64,
    maximumTransactionFeeTinybars: maximumFeeTinybars,
    memo: transaction.transactionMemo,
    networkId: HEDERA_TESTNET_CAIP2,
    nodeAccountId,
    payerAccountId: negative.accountId.toString(),
    receiverAccountId: positive.accountId.toString(),
    state: 'PREPARED' as const,
    transactionByteHash: preparedTransactionByteHash(
      fullySignedTransactionBase64,
    ),
    transactionId: transactionIdText,
  });
}

async function assertStoredPrepared(
  context: SupplierEvidenceBindingContextV2,
  attempt: PreparedVerificationPayment | ConsensusVerificationPayment,
): Promise<void> {
  if (
    !SHA256_PATTERN.test(attempt.transactionByteHash) ||
    preparedTransactionByteHash(attempt.fullySignedTransactionBase64) !==
      attempt.transactionByteHash
  ) {
    throw new TypeError(
      'Stored verification payment transaction is not canonical.',
    );
  }
  const inspected = await inspectPreparedVerificationTransaction(
    context,
    {
      actionDigest: attempt.actionDigest,
      atomicGroupKey: attempt.atomicGroupKey,
      eventId: attempt.eventId,
      leaseExpiresAt: attempt.leaseExpiresAt,
      paymentAttemptId: attempt.paymentAttemptId,
      quoteDigest: attempt.quoteDigest,
      quoteId: attempt.quoteId,
      requestDigest: attempt.requestDigest,
      state: 'CLAIMED',
    },
    attempt.fullySignedTransactionBase64,
  );
  assertSamePreparedTransaction(attempt, inspected);
}

async function verifyStoredConsensus(
  context: VerificationPaymentRecoveryContextV2,
  attempt: ConsensusVerificationPayment,
): Promise<VerifiedConsensusVerificationPayment> {
  await assertStoredPrepared(context, attempt);
  const body = verifyFacilitatorPaymentAttestationV2(
    context,
    attempt.attestation,
    context.trustedFacilitator,
  );
  if (
    body.actionDigest !== attempt.actionDigest ||
    body.amountTinybars !== attempt.amountTinybars ||
    body.payerAccountId !== attempt.payerAccountId ||
    body.paymentAttemptId !== attempt.paymentAttemptId ||
    body.paymentTransactionId !== attempt.transactionId ||
    body.quoteDigest !== attempt.quoteDigest ||
    body.quoteId !== attempt.quoteId ||
    body.receiverAccountId !== attempt.receiverAccountId ||
    body.requestDigest !== attempt.requestDigest
  ) {
    throw new TypeError(
      'Consensus attestation differs from the prepared payment attempt.',
    );
  }
  return Object.freeze({
    ...attempt,
    [VERIFIED_CONSENSUS]: true as const,
    attestation: Object.freeze({
      ...attempt.attestation,
      body,
    }),
  });
}

export function assertSamePreparedTransaction(
  original: Omit<PreparedVerificationPayment, 'state'>,
  candidate: Omit<PreparedVerificationPayment, 'state'>,
): void {
  if (
    original.actionDigest !== candidate.actionDigest ||
    original.atomicGroupKey !== candidate.atomicGroupKey ||
    original.eventId !== candidate.eventId ||
    original.paymentAttemptId !== candidate.paymentAttemptId ||
    original.requestDigest !== candidate.requestDigest ||
    original.quoteDigest !== candidate.quoteDigest ||
    original.quoteId !== candidate.quoteId ||
    original.transactionId !== candidate.transactionId ||
    original.transactionByteHash !== candidate.transactionByteHash ||
    original.fullySignedTransactionBase64 !==
      candidate.fullySignedTransactionBase64 ||
    original.amountTinybars !== candidate.amountTinybars ||
    original.facilitatorFeePayerAccountId !==
      candidate.facilitatorFeePayerAccountId ||
    original.maximumTransactionFeeTinybars !==
      candidate.maximumTransactionFeeTinybars ||
    original.memo !== candidate.memo ||
    original.networkId !== candidate.networkId ||
    original.nodeAccountId !== candidate.nodeAccountId ||
    original.payerAccountId !== candidate.payerAccountId ||
    original.receiverAccountId !== candidate.receiverAccountId
  ) {
    throw new TypeError(
      'Verification retry must use the original prepared transaction.',
    );
  }
}

export async function decideVerificationPaymentRecovery(
  context: VerificationPaymentRecoveryContextV2,
  identitySource: VerificationEffectIdentitySource,
  stored: VerificationPaymentAttempt | null,
  input: Readonly<{
    leaseExpiresAt: string;
    now: string;
    paymentAttemptId: string;
  }>,
): Promise<VerificationRecoveryDecision> {
  const { quote, request } = verifySupplierEvidenceBindingContextV2(context);
  const effect = context.effect;
  const identity = assertIdentity(effect, identitySource);
  assertCanonicalInstant(input.now, 'verification recovery time');
  assertCanonicalInstant(
    input.leaseExpiresAt,
    'verification recovery lease expiry',
  );
  if (stored === null) {
    assertNewPaymentWindow(effect, quote, input);
    return Object.freeze({
      claim: makeClaim(effect, identity, request, quote, input),
      kind: 'CLAIM_NEW',
    });
  }
  assertClaimBase(stored, effect, identity, request);
  if (stored.state === 'CONSENSUS') {
    assertQuoteAttemptBinding(stored, quote);
    const verified = await verifyStoredConsensus(context, stored);
    return Object.freeze({
      attempt: verified,
      kind: 'RETURN_CONSENSUS',
    });
  }
  if (stored.state === 'PREPARED') {
    assertQuoteAttemptBinding(stored, quote);
    await assertStoredPrepared(context, stored);
    return Object.freeze({
      attempt: stored,
      kind: 'RECONCILE_PREPARED',
    });
  }
  if (stored.leaseExpiresAt > input.now) {
    return Object.freeze({ attempt: stored, kind: 'WAIT_FOR_LEASE' });
  }
  assertNewPaymentWindow(effect, quote, input);
  if (
    quote.issuedAt <= stored.leaseExpiresAt ||
    quote.quoteDigest === stored.quoteDigest ||
    quote.quoteId === stored.quoteId ||
    input.paymentAttemptId === stored.paymentAttemptId
  ) {
    throw new TypeError(
      'Expired unprepared claims require a fresh quote and attempt.',
    );
  }
  const replacement = makeClaim(effect, identity, request, quote, input);
  return Object.freeze({
    abandonment: Object.freeze({
      ...stored,
      abandonedAt: input.now,
      reason: 'LEASE_EXPIRED_BEFORE_PREPARED',
      replacementPaymentAttemptId: replacement.paymentAttemptId,
      replacementQuoteDigest: replacement.quoteDigest,
      replacementQuoteId: replacement.quoteId,
      state: 'ABANDONED',
    }),
    claim: replacement,
    expected: stored,
    kind: 'TAKEOVER_EXPIRED_CLAIM',
  });
}
