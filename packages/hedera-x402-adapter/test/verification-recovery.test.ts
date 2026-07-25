import { describe, expect, it } from 'vitest';

import {
  assertSamePreparedTransaction,
  decideVerificationPaymentRecovery,
  preparedTransactionByteHash,
  type ConsensusVerificationPayment,
  type PreparedVerificationPayment,
  type VerificationEffectIdentitySource,
} from '../src/index.js';
import {
  createSupplierEvidenceQuoteV2,
  createSupplierEvidenceRequestV2,
  signFacilitatorPaymentAttestationV2,
  type Ed25519SignatureProvider,
  type FacilitatorPaymentAttestationBodyV2,
} from '../src/index.js';
import {
  createPaymentActionAggregate,
  transitionPaymentAction,
} from '@invoiceguard/domain';
import {
  createAuthorizationBundle,
  createSupplierMasterSnapshot,
  hashCanonicalInvoice,
} from '@invoiceguard/protocol/hashing';
import type { CanonicalInvoiceV1 } from '@invoiceguard/protocol';
import { generateKeyPairSync, sign } from 'node:crypto';

import {
  BENEFICIARY,
  DIGESTS,
  IDS,
  NOW,
  actionCore,
  policyEvaluationForCore,
} from '../../domain/test/fixtures/authorization.js';

function recoveryFixture() {
  const snapshot = createSupplierMasterSnapshot({
    approvedBeneficiaries: [BENEFICIARY],
    defaultAssetId: 'iso4217:EUR',
    effectiveAt: '2026-07-01T00:00:00.000Z',
    externalSupplierReference: null,
    legalIdentityHash: 'a'.repeat(64),
    organizationId: IDS.organization,
    paymentTerms: { days: 30, kind: 'NET_DAYS' },
    schemaVersion: 1,
    snapshotVersion: 1,
    sourceConnectionId: null,
    status: 'ACTIVE',
    supplierId: IDS.supplier,
  });
  const invoice = {
    createdAt: NOW,
    dueDate: '2026-08-24',
    invoiceAssetId: 'iso4217:EUR',
    invoiceId: '019f939b-fe5e-7e92-b72e-8d4531958d07',
    invoiceNumber: 'CG-2026-0718',
    invoiceRevision: 1,
    invoiceRevisionId: IDS.invoiceRevision,
    issueDate: '2026-07-25',
    lineItemsRoot: 'b'.repeat(64),
    netAmountAtoms: '2000000',
    obligationId: IDS.obligation,
    organizationId: IDS.organization,
    proposedBeneficiary: BENEFICIARY,
    purchaseOrderReferences: [],
    schemaVersion: 1,
    sourceEvidenceRoot: DIGESTS.evidenceRoot,
    supplierId: IDS.supplier,
    supplierSnapshotDigest: snapshot.snapshotDigest,
    supersedesInvoiceRevisionId: null,
    taxAmountAtoms: '500000',
    totalAmountAtoms: '2500000',
  } as const satisfies CanonicalInvoiceV1;
  const core = {
    ...actionCore,
    sourceInvoice: {
      ...actionCore.sourceInvoice,
      digest: hashCanonicalInvoice(invoice),
    },
    supplierSnapshotDigest: snapshot.snapshotDigest,
  };
  const authorization = createAuthorizationBundle(
    core,
    policyEvaluationForCore(core, {
      beneficiaryStatus: 'CHANGED',
      mandate: null,
    }),
  );
  const captured = createPaymentActionAggregate(authorization);
  if (!captured.ok) throw new Error('invalid fixture');
  const classified = transitionPaymentAction(
    captured.value,
    { type: 'CLASSIFY' },
    { now: NOW },
  );
  if (!classified.ok) throw new Error('invalid fixture');
  const quoted = transitionPaymentAction(
    classified.value.aggregate,
    { type: 'QUOTE_VERIFICATION' },
    { now: '2026-07-25T10:00:01.000Z' },
  );
  if (!quoted.ok) throw new Error('invalid fixture');
  const effect = quoted.value.effects[0];
  if (effect?.type !== 'VERIFICATION_QUOTE_REQUEST') {
    throw new Error('invalid fixture');
  }
  const request = createSupplierEvidenceRequestV2(
    authorization,
    effect,
    invoice,
    snapshot,
  );
  const quote = createSupplierEvidenceQuoteV2(request, {
    amountTinybars: '1000',
    challengeId: 'challenge_1234567890',
    feePayerAccountId: '0.0.3000',
    now: new Date('2026-07-25T10:05:00.000Z'),
    quoteId: 'quote-1',
    quoteTtlSeconds: 120,
    receiverAccountId: '0.0.4000',
  });
  const identitySource: VerificationEffectIdentitySource = {
    resolve: (candidate) => ({
      actionDigest: candidate.actionDigest,
      atomicGroupKey: candidate.atomicGroupKey,
      eventId: `test-only-event:${candidate.actionDigest}`,
    }),
  };
  return { effect, identitySource, quote, request };
}

function recoveryInput() {
  return {
    leaseExpiresAt: '2026-07-25T10:06:00.000Z',
    now: '2026-07-25T10:05:10.000Z',
    paymentAttemptId: 'verification-attempt-1',
  };
}

describe('verification payment recovery seam', () => {
  it('requires the trusted prerequisite identity and returns one claim', () => {
    const test = recoveryFixture();
    const decision = decideVerificationPaymentRecovery(
      test.effect,
      test.identitySource,
      test.request,
      test.quote,
      null,
      recoveryInput(),
    );

    expect(decision).toMatchObject({
      claim: {
        actionDigest: test.effect.actionDigest,
        eventId: `test-only-event:${test.effect.actionDigest}`,
        state: 'CLAIMED',
      },
      kind: 'CLAIM_NEW',
    });
  });

  it('rejects an identity that is not bound to the AP effect', () => {
    const test = recoveryFixture();
    const substituted: VerificationEffectIdentitySource = {
      resolve: () => ({
        actionDigest: 'f'.repeat(64),
        atomicGroupKey: test.effect.atomicGroupKey,
        eventId: 'wrong-event',
      }),
    };

    expect(() =>
      decideVerificationPaymentRecovery(
        test.effect,
        substituted,
        test.request,
        test.quote,
        null,
        recoveryInput(),
      ),
    ).toThrow(/does not bind/u);
  });

  it('rejects a request or quote substituted across AP effects', () => {
    const test = recoveryFixture();

    expect(() =>
      decideVerificationPaymentRecovery(
        test.effect,
        test.identitySource,
        { ...test.request, actionDigest: 'f'.repeat(64) },
        test.quote,
        null,
        recoveryInput(),
      ),
    ).toThrow();
    expect(() =>
      decideVerificationPaymentRecovery(
        test.effect,
        test.identitySource,
        test.request,
        { ...test.quote, quoteId: 'substituted-quote' },
        null,
        recoveryInput(),
      ),
    ).toThrow(/not bound/u);
  });

  it('reconciles prepared bytes and never constructs a replacement', () => {
    const test = recoveryFixture();
    const first = decideVerificationPaymentRecovery(
      test.effect,
      test.identitySource,
      test.request,
      test.quote,
      null,
      recoveryInput(),
    );
    if (first.kind !== 'CLAIM_NEW') throw new Error('invalid fixture');
    const bytes = Buffer.from('exact signed transaction').toString('base64');
    const prepared: PreparedVerificationPayment = {
      ...first.claim,
      fullySignedTransactionBase64: bytes,
      state: 'PREPARED',
      transactionByteHash: preparedTransactionByteHash(bytes),
      transactionId: '0.0.5000@1753437930.000000001',
    };
    const decision = decideVerificationPaymentRecovery(
      test.effect,
      test.identitySource,
      test.request,
      test.quote,
      prepared,
      recoveryInput(),
    );

    expect(decision).toEqual({
      attempt: prepared,
      kind: 'RECONCILE_PREPARED',
    });
    expect(() =>
      assertSamePreparedTransaction(prepared, {
        ...prepared,
        fullySignedTransactionBase64: Buffer.from(
          'replacement transaction',
        ).toString('base64'),
      }),
    ).toThrow(/original prepared transaction/u);
  });

  it('loads durable consensus before applying expired live windows', () => {
    const test = recoveryFixture();
    const first = decideVerificationPaymentRecovery(
      test.effect,
      test.identitySource,
      test.request,
      test.quote,
      null,
      recoveryInput(),
    );
    if (first.kind !== 'CLAIM_NEW') throw new Error('invalid fixture');
    const bytes = Buffer.from('exact signed transaction').toString('base64');
    const prepared: PreparedVerificationPayment = {
      ...first.claim,
      fullySignedTransactionBase64: bytes,
      state: 'PREPARED',
      transactionByteHash: preparedTransactionByteHash(bytes),
      transactionId: '0.0.5000@1753437930.000000001',
    };
    const { privateKey } = generateKeyPairSync('ed25519');
    const signer: Ed25519SignatureProvider = {
      keyId: 'facilitator-key-1',
      sign: (payload) =>
        sign(null, Buffer.from(payload), privateKey).toString('base64'),
    };
    const body: FacilitatorPaymentAttestationBodyV2 = {
      actionDigest: prepared.actionDigest,
      amountTinybars: test.quote.requirements.amount,
      asset: '0.0.0',
      challengeId: test.quote.challengeId,
      paidAt: '2026-07-25T10:05:30.000Z',
      payerAccountId: '0.0.5000',
      paymentAttemptId: prepared.paymentAttemptId,
      paymentTransactionId: prepared.transactionId,
      quoteDigest: prepared.quoteDigest,
      quoteId: prepared.quoteId,
      receiptStatus: 'SUCCESS',
      receiverAccountId: test.quote.requirements.payTo,
      requestDigest: prepared.requestDigest,
      resourceUrl: test.quote.resourceUrl,
      schemaVersion: 'facilitator-payment-attestation.v2',
      serviceId: test.quote.serviceId,
      x402Network: 'hedera:testnet',
    };
    const consensus: ConsensusVerificationPayment = {
      ...prepared,
      attestation: signFacilitatorPaymentAttestationV2(body, signer),
      state: 'CONSENSUS',
    };
    const decision = decideVerificationPaymentRecovery(
      test.effect,
      test.identitySource,
      test.request,
      test.quote,
      consensus,
      {
        ...recoveryInput(),
        leaseExpiresAt: '2026-07-25T11:01:00.000Z',
        now: '2026-07-25T11:00:30.000Z',
      },
    );

    expect(decision).toEqual({
      attempt: consensus,
      kind: 'RETURN_CONSENSUS',
    });
  });

  it('refuses a new payment after the quote expires', () => {
    const test = recoveryFixture();

    expect(() =>
      decideVerificationPaymentRecovery(
        test.effect,
        test.identitySource,
        test.request,
        test.quote,
        null,
        {
          ...recoveryInput(),
          leaseExpiresAt: '2026-07-25T10:08:00.000Z',
          now: '2026-07-25T10:07:30.000Z',
        },
      ),
    ).toThrow(/outside its live window/u);
  });
});
