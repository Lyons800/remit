import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from 'node:crypto';

import {
  createPaymentActionAggregate,
  transitionPaymentAction,
  type PaymentActionTransition,
  type VerificationQuoteRequestEffect,
} from '@invoiceguard/domain';
import {
  createAuthorizationBundle,
  createSupplierMasterSnapshot,
  hashCanonicalInvoice,
  type AuthorizationBundleV1,
} from '@invoiceguard/protocol/hashing';
import type {
  CanonicalInvoiceV1,
  PaymentActionCoreV1,
  SupplierMasterSnapshotV1,
} from '@invoiceguard/protocol';
import { describe, expect, it } from 'vitest';

import {
  HEDERA_EVIDENCE_ADAPTER_ID,
  HEDERA_TESTNET_CAIP2,
  HEDERA_X402_ADAPTER_ID,
  HEDERA_X402_TESTNET_NETWORK,
  createEvidenceResultFact,
  createSupplierEvidenceQuoteV2,
  createSupplierEvidenceRequestV2,
  createVerificationPaymentFact,
  hederaAccountFromCaip10,
  parseSupplierEvidenceRequestV2,
  signFacilitatorPaymentAttestationV2,
  signSupplierEvidenceResultV2,
  supplierEvidenceMemo,
  supplierEvidenceRequestDigest,
  toX402TestnetNetwork,
  verifySupplierEvidenceQuoteV2,
  type Ed25519SignatureProvider,
  type FacilitatorPaymentAttestationBodyV2,
  type SignedFacilitatorPaymentAttestationV2,
  type SupplierEvidenceQuoteV2,
  type SupplierEvidenceRequestV2,
  type SupplierEvidenceResultBodyV2,
  type TrustedEd25519Key,
} from '../src/index.js';
import {
  BENEFICIARY,
  DIGESTS,
  IDS,
  NOW,
  actionCore,
  policyEvaluationForCore,
} from '../../domain/test/fixtures/authorization.js';

const PROPOSED_BENEFICIARY = {
  accountId: 'hedera:296:0.0.2000',
  kind: 'CAIP_10',
} as const;
const QUOTE_TIME = '2026-07-25T10:05:00.000Z';
const PAID_AT = '2026-07-25T10:05:30.000Z';
const RESULT_AT = '2026-07-25T10:05:31.000Z';
const RESULT_EXPIRES_AT = '2026-07-25T10:20:00.000Z';

type TestFixture = Readonly<{
  authorization: AuthorizationBundleV1;
  effect: VerificationQuoteRequestEffect;
  facilitatorKey: TrustedEd25519Key;
  facilitatorSigner: Ed25519SignatureProvider;
  invoice: CanonicalInvoiceV1;
  quote: SupplierEvidenceQuoteV2;
  request: SupplierEvidenceRequestV2;
  serviceKey: TrustedEd25519Key;
  serviceSigner: Ed25519SignatureProvider;
  snapshot: SupplierMasterSnapshotV1;
}>;

function unwrap<T>(
  result: Readonly<{ ok: false; error: unknown } | { ok: true; value: T }>,
): T {
  if (!result.ok) {
    throw new Error(
      `Fixture transition failed: ${JSON.stringify(result.error)}`,
    );
  }
  return result.value;
}

function signerFixture(keyId: string): Readonly<{
  signer: Ed25519SignatureProvider;
  trusted: TrustedEd25519Key;
}> {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    signer: {
      keyId,
      sign: (payload) =>
        sign(null, Buffer.from(payload), privateKey).toString('base64'),
    },
    trusted: { keyId, publicKey },
  };
}

function deterministicSignerFixture(keyId: string): Readonly<{
  signer: Ed25519SignatureProvider;
  trusted: TrustedEd25519Key;
}> {
  const privateKey = createPrivateKey({
    format: 'der',
    key: Buffer.from(
      '302e020100300506032b657004220420' +
        '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
      'hex',
    ),
    type: 'pkcs8',
  });
  const publicKey = createPublicKey({
    format: 'der',
    key: Buffer.from(
      '302a300506032b6570032100' +
        'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
      'hex',
    ),
    type: 'spki',
  });
  return {
    signer: {
      keyId,
      sign: (payload) =>
        sign(null, Buffer.from(payload), privateKey).toString('base64'),
    },
    trusted: { keyId, publicKey },
  };
}

function effectFor(
  authorization: AuthorizationBundleV1,
): VerificationQuoteRequestEffect {
  const captured = unwrap(createPaymentActionAggregate(authorization));
  const classified = unwrap<PaymentActionTransition>(
    transitionPaymentAction(captured, { type: 'CLASSIFY' }, { now: NOW }),
  );
  const quoted = unwrap<PaymentActionTransition>(
    transitionPaymentAction(
      classified.aggregate,
      { type: 'QUOTE_VERIFICATION' },
      { now: '2026-07-25T10:00:01.000Z' },
    ),
  );
  const effect = quoted.effects[0];
  if (effect?.type !== 'VERIFICATION_QUOTE_REQUEST') {
    throw new Error('Fixture did not emit a verification quote effect.');
  }
  return effect;
}

function fixture(): TestFixture {
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
  const invoiceCore = {
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
    proposedBeneficiary: PROPOSED_BENEFICIARY,
    purchaseOrderReferences: ['PO-2026-0718'],
    schemaVersion: 1,
    sourceEvidenceRoot: DIGESTS.evidenceRoot,
    supplierId: IDS.supplier,
    supplierSnapshotDigest: snapshot.snapshotDigest,
    supersedesInvoiceRevisionId: null,
    taxAmountAtoms: '500000',
    totalAmountAtoms: '2500000',
  } as const satisfies CanonicalInvoiceV1;
  const invoice = Object.freeze(invoiceCore);
  const core = {
    ...actionCore,
    beneficiary: {
      approved: BENEFICIARY,
      proposed: PROPOSED_BENEFICIARY,
    },
    settlement: {
      ...actionCore.settlement,
      beneficiary: PROPOSED_BENEFICIARY.accountId,
    },
    sourceInvoice: {
      ...actionCore.sourceInvoice,
      digest: hashCanonicalInvoice(invoice),
    },
    supplierSnapshotDigest: snapshot.snapshotDigest,
  } as const satisfies PaymentActionCoreV1;
  const authorization = createAuthorizationBundle(
    core,
    policyEvaluationForCore(core, {
      beneficiaryStatus: 'CHANGED',
      mandate: null,
    }),
  );
  const effect = effectFor(authorization);
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
    now: new Date(QUOTE_TIME),
    quoteId: 'quote-1',
    quoteTtlSeconds: 120,
    receiverAccountId: '0.0.4000',
  });
  const facilitator = signerFixture('facilitator-key-1');
  const service = signerFixture(effect.serviceKeyId);
  return {
    authorization,
    effect,
    facilitatorKey: facilitator.trusted,
    facilitatorSigner: facilitator.signer,
    invoice,
    quote,
    request,
    serviceKey: service.trusted,
    serviceSigner: service.signer,
    snapshot,
  };
}

function paymentBody(
  test: TestFixture,
  overrides: Partial<FacilitatorPaymentAttestationBodyV2> = {},
): FacilitatorPaymentAttestationBodyV2 {
  return {
    actionDigest: test.request.actionDigest,
    amountTinybars: test.quote.requirements.amount,
    asset: '0.0.0',
    challengeId: test.quote.challengeId,
    paidAt: PAID_AT,
    payerAccountId: '0.0.5000',
    paymentAttemptId: 'verification-payment-attempt-1',
    paymentTransactionId: '0.0.5000@1753437930.000000001',
    quoteDigest: test.quote.quoteDigest,
    quoteId: test.quote.quoteId,
    receiptStatus: 'SUCCESS',
    receiverAccountId: test.quote.requirements.payTo,
    requestDigest: test.quote.requestDigest,
    resourceUrl: test.quote.resourceUrl,
    schemaVersion: 'facilitator-payment-attestation.v2',
    serviceId: test.quote.serviceId,
    x402Network: HEDERA_X402_TESTNET_NETWORK,
    ...overrides,
  };
}

function signedPayment(
  test: TestFixture,
  overrides: Partial<FacilitatorPaymentAttestationBodyV2> = {},
): SignedFacilitatorPaymentAttestationV2 {
  return signFacilitatorPaymentAttestationV2(
    paymentBody(test, overrides),
    test.facilitatorSigner,
  );
}

describe('AP-bound Hedera x402 evidence v2', () => {
  it('derives raw-digest request and quote records from the AP contracts', () => {
    const test = fixture();
    const digest = supplierEvidenceRequestDigest(test.request);

    expect(digest).toBe(
      '5a320d30641f15e969632ce9cbb81ab3e56516d227292340a19c8cd9838910ac',
    );
    expect(test.quote.quoteDigest).toBe(
      '6b4911488fca9c623c28254517fed5859295866813d0d79822758e10e6d0cf79',
    );
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(digest).not.toContain('sha256:');
    expect(test.request).toMatchObject({
      actionDigest: test.authorization.envelope.actionDigest,
      evidencePolicyDigest: test.authorization.decision.evidencePolicy.digest,
      invoiceRevisionDigest: test.authorization.actionCore.sourceInvoice.digest,
      legalIdentityHash: test.snapshot.legalIdentityHash,
      schemaVersion: 'supplier-evidence-request.v2',
      serviceNetworkId: HEDERA_TESTNET_CAIP2,
      supplierSnapshotDigest: test.snapshot.snapshotDigest,
    });
    expect(test.quote.requirements).toMatchObject({
      asset: '0.0.0',
      network: HEDERA_X402_TESTNET_NETWORK,
      payTo: '0.0.4000',
      scheme: 'exact',
    });
    expect(supplierEvidenceMemo(digest)).toBe(`invoiceguard:x402:v2:${digest}`);
  });

  it('matches the fixed Ed25519 payment-envelope vector', () => {
    const test = fixture();
    const deterministic = deterministicSignerFixture('facilitator-key-1');
    const signed = signFacilitatorPaymentAttestationV2(
      paymentBody(test),
      deterministic.signer,
    );

    expect(signed.signature).toBe(
      'rOKJYURyc4lTiursgHtELtVkMDA8MgONAboo3ptsj50GKl4bTrAvS/S5cGpkfHZDFv4XlELg/cGoDu8JIkRPCA==',
    );
    expect(() =>
      createVerificationPaymentFact(
        test.authorization,
        test.effect,
        test.request,
        test.quote,
        signed,
        deterministic.trusted,
      ),
    ).not.toThrow();
  });

  it('maps a trusted consensus attestation and service result into AP facts', () => {
    const test = fixture();
    const payment = createVerificationPaymentFact(
      test.authorization,
      test.effect,
      test.request,
      test.quote,
      signedPayment(test),
      test.facilitatorKey,
    );
    const resultBody: SupplierEvidenceResultBodyV2 = {
      actionDigest: test.request.actionDigest,
      evidenceRoot: test.request.evidenceRoot,
      expiresAt: RESULT_EXPIRES_AT,
      issuedAt: RESULT_AT,
      paymentAttemptId: payment.paymentAttemptId,
      paymentTransactionId: payment.paymentTransactionId,
      quoteDigest: payment.quoteDigest,
      quoteId: payment.quoteId,
      reasonCodes: [],
      requestDigest: payment.serviceRequestDigest,
      result: 'MATCH',
      schemaVersion: 'supplier-evidence-result.v2',
      serviceId: payment.serviceId,
      servicePaymentId: payment.servicePaymentId,
    };
    const result = createEvidenceResultFact(
      test.authorization,
      test.effect,
      payment,
      signSupplierEvidenceResultV2(resultBody, test.serviceSigner),
      test.serviceKey,
    );

    expect(payment).toMatchObject({
      adapterId: HEDERA_X402_ADAPTER_ID,
      evidencePolicyDigest: test.request.evidencePolicyDigest,
      paymentNetworkId: HEDERA_TESTNET_CAIP2,
      serviceKeyId: test.effect.serviceKeyId,
      status: 'CONSENSUS',
    });
    expect(result).toMatchObject({
      adapterId: HEDERA_EVIDENCE_ADAPTER_ID,
      evidenceRoot: test.request.evidenceRoot,
      result: 'MATCH',
      servicePaymentId: payment.servicePaymentId,
      status: 'VERIFIED',
    });
    expect(payment.recordDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.recordDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rejects prefixed digests and non-Testnet identifier substitutions', () => {
    const test = fixture();

    expect(() =>
      parseSupplierEvidenceRequestV2({
        ...test.request,
        actionDigest: `sha256:${test.request.actionDigest}`,
      }),
    ).toThrow(/unprefixed/u);
    expect(() => toX402TestnetNetwork('hedera:295')).toThrow(
      /Only Hedera Testnet/u,
    );
    expect(() => hederaAccountFromCaip10('hedera:295:0.0.1000')).toThrow(
      /not on Hedera Testnet/u,
    );
    expect(hederaAccountFromCaip10('hedera:296:0.0.1000')).toBe('0.0.1000');
  });

  it('rejects unrecognized fields at signed protocol boundaries', () => {
    const test = fixture();
    const quoteWithExtra = {
      ...test.quote,
      requirements: {
        ...test.quote.requirements,
        extra: {
          ...test.quote.requirements.extra,
          unrecognized: 'must-not-be-ignored',
        },
      },
    } as unknown as SupplierEvidenceQuoteV2;
    const paymentWithExtra = {
      ...paymentBody(test),
      unrecognized: 'must-not-be-signed',
    } as unknown as FacilitatorPaymentAttestationBodyV2;

    expect(() =>
      verifySupplierEvidenceQuoteV2(test.request, quoteWithExtra),
    ).toThrow(/unexpected or missing fields/u);
    expect(() =>
      signFacilitatorPaymentAttestationV2(
        paymentWithExtra,
        test.facilitatorSigner,
      ),
    ).toThrow(/unexpected or missing fields/u);
  });

  it('rejects action, invoice, snapshot, and effect substitution', () => {
    const test = fixture();

    expect(() =>
      createSupplierEvidenceRequestV2(
        test.authorization,
        { ...test.effect, serviceId: 'other-service' },
        test.invoice,
        test.snapshot,
      ),
    ).toThrow(/does not bind/u);
    expect(() =>
      createSupplierEvidenceRequestV2(
        test.authorization,
        test.effect,
        { ...test.invoice, invoiceNumber: 'ALTERED' },
        test.snapshot,
      ),
    ).toThrow(/differs/u);
    expect(() =>
      createSupplierEvidenceRequestV2(
        test.authorization,
        test.effect,
        test.invoice,
        { ...test.snapshot, legalIdentityHash: 'c'.repeat(64) },
      ),
    ).toThrow();
  });

  it.each([
    ['amount', { amountTinybars: '1001' }],
    ['receiver', { receiverAccountId: '0.0.4999' }],
    ['request', { requestDigest: 'd'.repeat(64) }],
    ['quote', { quoteDigest: 'e'.repeat(64) }],
    ['action', { actionDigest: 'f'.repeat(64) }],
    ['service', { serviceId: 'other-service' }],
  ] as const)(
    'rejects a cryptographically valid %s substitution',
    (_label, override) => {
      const test = fixture();
      const attestation = signedPayment(test, override);

      expect(() =>
        createVerificationPaymentFact(
          test.authorization,
          test.effect,
          test.request,
          test.quote,
          attestation,
          test.facilitatorKey,
        ),
      ).toThrow(/does not bind/u);
    },
  );

  it('rejects an untrusted facilitator signature', () => {
    const test = fixture();
    const other = signerFixture('facilitator-key-1');

    expect(() =>
      createVerificationPaymentFact(
        test.authorization,
        test.effect,
        test.request,
        test.quote,
        signedPayment(test),
        other.trusted,
      ),
    ).toThrow(/not trusted/u);
  });

  it('rejects service-result substitution after a valid payment', () => {
    const test = fixture();
    const payment = createVerificationPaymentFact(
      test.authorization,
      test.effect,
      test.request,
      test.quote,
      signedPayment(test),
      test.facilitatorKey,
    );
    const body: SupplierEvidenceResultBodyV2 = {
      actionDigest: test.request.actionDigest,
      evidenceRoot: 'f'.repeat(64),
      expiresAt: RESULT_EXPIRES_AT,
      issuedAt: RESULT_AT,
      paymentAttemptId: payment.paymentAttemptId,
      paymentTransactionId: payment.paymentTransactionId,
      quoteDigest: payment.quoteDigest,
      quoteId: payment.quoteId,
      reasonCodes: ['EVIDENCE_ROOT_MISMATCH'],
      requestDigest: payment.serviceRequestDigest,
      result: 'MISMATCH',
      schemaVersion: 'supplier-evidence-result.v2',
      serviceId: payment.serviceId,
      servicePaymentId: payment.servicePaymentId,
    };

    expect(() =>
      createEvidenceResultFact(
        test.authorization,
        test.effect,
        payment,
        signSupplierEvidenceResultV2(body, test.serviceSigner),
        test.serviceKey,
      ),
    ).toThrow(/does not bind/u);
  });
});
