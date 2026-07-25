import { createHash } from 'node:crypto';

import type { VerificationQuoteRequestEffect } from '@invoiceguard/domain';

import type {
  SignedFacilitatorPaymentAttestationV2,
  SupplierEvidenceQuoteV2,
  SupplierEvidenceRequestV2,
} from './supplier-evidence-v2.js';
import {
  supplierEvidenceRequestDigest,
  verifySupplierEvidenceQuoteV2,
} from './supplier-evidence-v2.js';

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const TRANSACTION_ID_PATTERN = /^\d+\.\d+\.\d+@\d{10}\.\d{9}$/u;

export type VerificationEffectIdentity = Readonly<{
  actionDigest: string;
  atomicGroupKey: string;
  eventId: string;
}>;

/**
 * Temporary seam owned by the application/persistence integration.
 *
 * VerificationQuoteRequestEffect does not yet carry the durable event identity
 * required by the outbox contract. The Hedera adapter deliberately does not
 * invent one. A trusted caller must provide the identity issued by that
 * prerequisite workstream.
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

export type PreparedVerificationPayment = Readonly<
  Omit<ClaimedVerificationPayment, 'state'> & {
    fullySignedTransactionBase64: string;
    state: 'PREPARED';
    transactionByteHash: string;
    transactionId: string;
  }
>;

export type ConsensusVerificationPayment = Readonly<
  Omit<PreparedVerificationPayment, 'state'> & {
    attestation: SignedFacilitatorPaymentAttestationV2;
    state: 'CONSENSUS';
  }
>;

export type VerificationPaymentAttempt =
  | ClaimedVerificationPayment
  | PreparedVerificationPayment
  | ConsensusVerificationPayment;

export interface VerificationPaymentStore {
  /**
   * Claims and state advances must be durable before callers submit bytes.
   * This interface defines the adapter seam without duplicating persistence.
   */
  find(requestDigest: string): Promise<VerificationPaymentAttempt | null>;
  claim(
    claim: ClaimedVerificationPayment,
  ): Promise<
    | Readonly<{ attempt: ClaimedVerificationPayment; status: 'ACQUIRED' }>
    | Readonly<{ status: 'CONFLICT' }>
    | Readonly<{ attempt: VerificationPaymentAttempt; status: 'EXISTING' }>
  >;
  recordConsensus(
    prepared: PreparedVerificationPayment,
    attestation: SignedFacilitatorPaymentAttestationV2,
  ): Promise<ConsensusVerificationPayment>;
  recordPrepared(
    claim: ClaimedVerificationPayment,
    prepared: Pick<
      PreparedVerificationPayment,
      'fullySignedTransactionBase64' | 'transactionByteHash' | 'transactionId'
    >,
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
      attempt: ClaimedVerificationPayment;
      kind: 'RECONCILE_CLAIM';
    }>
  | Readonly<{
      attempt: PreparedVerificationPayment;
      kind: 'RECONCILE_PREPARED';
    }>
  | Readonly<{
      attempt: ConsensusVerificationPayment;
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

function assertAttemptBinding(
  attempt: VerificationPaymentAttempt,
  effect: VerificationQuoteRequestEffect,
  identity: VerificationEffectIdentity,
  request: SupplierEvidenceRequestV2,
  quote: SupplierEvidenceQuoteV2,
): void {
  if (
    attempt.actionDigest !== effect.actionDigest ||
    attempt.atomicGroupKey !== effect.atomicGroupKey ||
    attempt.eventId !== identity.eventId ||
    attempt.requestDigest !== supplierEvidenceRequestDigest(request) ||
    attempt.quoteDigest !== quote.quoteDigest ||
    attempt.quoteId !== quote.quoteId ||
    attempt.paymentAttemptId.length === 0
  ) {
    throw new TypeError(
      'Stored verification payment belongs to another AP effect or quote.',
    );
  }
  assertCanonicalInstant(
    attempt.leaseExpiresAt,
    'verification payment lease expiry',
  );
  if (attempt.state === 'PREPARED' || attempt.state === 'CONSENSUS') {
    if (
      !TRANSACTION_ID_PATTERN.test(attempt.transactionId) ||
      !SHA256_PATTERN.test(attempt.transactionByteHash) ||
      preparedTransactionByteHash(attempt.fullySignedTransactionBase64) !==
        attempt.transactionByteHash
    ) {
      throw new TypeError(
        'Stored verification payment transaction is not canonical.',
      );
    }
  }
  if (
    attempt.state === 'CONSENSUS' &&
    (attempt.attestation.body.paymentAttemptId !== attempt.paymentAttemptId ||
      attempt.attestation.body.paymentTransactionId !== attempt.transactionId ||
      attempt.attestation.body.requestDigest !== attempt.requestDigest ||
      attempt.attestation.body.quoteDigest !== attempt.quoteDigest ||
      attempt.attestation.body.quoteId !== attempt.quoteId ||
      attempt.attestation.body.actionDigest !== attempt.actionDigest)
  ) {
    throw new TypeError(
      'Consensus attestation differs from the prepared payment attempt.',
    );
  }
}

export function assertSamePreparedTransaction(
  original: PreparedVerificationPayment,
  candidate: PreparedVerificationPayment,
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
      candidate.fullySignedTransactionBase64
  ) {
    throw new TypeError(
      'Verification retry must use the original prepared transaction.',
    );
  }
}

export function decideVerificationPaymentRecovery(
  effect: VerificationQuoteRequestEffect,
  identitySource: VerificationEffectIdentitySource,
  request: SupplierEvidenceRequestV2,
  quote: SupplierEvidenceQuoteV2,
  stored: VerificationPaymentAttempt | null,
  input: Readonly<{
    leaseExpiresAt: string;
    now: string;
    paymentAttemptId: string;
  }>,
): VerificationRecoveryDecision {
  const identity = assertIdentity(effect, identitySource);
  assertCanonicalInstant(input.now, 'verification recovery time');
  assertCanonicalInstant(
    input.leaseExpiresAt,
    'verification recovery lease expiry',
  );
  verifySupplierEvidenceQuoteV2(request, quote);
  if (
    request.actionDigest !== effect.actionDigest ||
    request.actionExpiresAt !== effect.expiresAt ||
    request.evidencePolicyDigest !== effect.evidencePolicyDigest ||
    request.serviceId !== effect.serviceId ||
    request.serviceKeyId !== effect.serviceKeyId ||
    request.serviceNetworkId !== effect.serviceNetworkId
  ) {
    throw new TypeError(
      'Verification request does not bind the AP quote effect.',
    );
  }
  if (stored !== null) {
    assertAttemptBinding(stored, effect, identity, request, quote);
    if (stored.state === 'CONSENSUS') {
      return Object.freeze({
        attempt: stored,
        kind: 'RETURN_CONSENSUS',
      });
    }
    if (stored.state === 'PREPARED') {
      return Object.freeze({
        attempt: stored,
        kind: 'RECONCILE_PREPARED',
      });
    }
    return stored.leaseExpiresAt > input.now
      ? Object.freeze({ attempt: stored, kind: 'WAIT_FOR_LEASE' })
      : Object.freeze({ attempt: stored, kind: 'RECONCILE_CLAIM' });
  }
  if (
    input.now >= effect.expiresAt ||
    input.now >= quote.expiresAt ||
    input.leaseExpiresAt <= input.now ||
    input.paymentAttemptId.length === 0
  ) {
    throw new TypeError(
      'A new verification payment cannot begin outside its live window.',
    );
  }
  return Object.freeze({
    claim: Object.freeze({
      actionDigest: effect.actionDigest,
      atomicGroupKey: effect.atomicGroupKey,
      eventId: identity.eventId,
      leaseExpiresAt: input.leaseExpiresAt,
      paymentAttemptId: input.paymentAttemptId,
      quoteDigest: quote.quoteDigest,
      quoteId: quote.quoteId,
      requestDigest: supplierEvidenceRequestDigest(request),
      state: 'CLAIMED',
    }),
    kind: 'CLAIM_NEW',
  });
}
