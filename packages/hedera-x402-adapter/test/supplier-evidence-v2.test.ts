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
import type {
  CanonicalInvoiceV1,
  PaymentActionCoreV1,
  SupplierMasterSnapshotV1,
} from '@invoiceguard/protocol';
import {
  createAuthorizationBundle,
  createSupplierMasterSnapshot,
  hashCanonicalInvoice,
  type AuthorizationBundleV1,
} from '@invoiceguard/protocol/hashing';
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
  signSupplierEvidenceDeploymentPolicyV1,
  signSupplierEvidenceResultV2,
  supplierEvidenceMemo,
  supplierEvidenceRequestDigest,
  toX402TestnetNetwork,
  verifySupplierEvidenceQuoteV2,
  type Ed25519SignatureProvider,
  type FacilitatorPaymentAttestationBodyV2,
  type SignedFacilitatorPaymentAttestationV2,
  type SignedSupplierEvidenceDeploymentPolicyV1,
  type SupplierEvidenceBindingContextV2,
  type SupplierEvidenceDeploymentPolicyV1,
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
  deploymentAuthorityKey: TrustedEd25519Key;
  effect: VerificationQuoteRequestEffect;
  facilitatorKey: TrustedEd25519Key;
  facilitatorSigner: Ed25519SignatureProvider;
  invoice: CanonicalInvoiceV1;
  quote: SupplierEvidenceQuoteV2;
  request: SupplierEvidenceRequestV2;
  serviceKey: TrustedEd25519Key;
  serviceSigner: Ed25519SignatureProvider;
  signedDeploymentPolicy: SignedSupplierEvidenceDeploymentPolicyV1;
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

function deploymentPolicy(
  effect: VerificationQuoteRequestEffect,
  overrides: Partial<SupplierEvidenceDeploymentPolicyV1> = {},
): SupplierEvidenceDeploymentPolicyV1 {
  return {
    allowedNodeAccountIds: ['0.0.3'],
    amountTinybars: '1000',
    deploymentId: 'synthetic-testnet-deployment',
    expiresAt: '2026-07-25T11:00:00.000Z',
    facilitatorFeePayerAccountId: '0.0.3000',
    maximumTransactionFeeTinybars: '200000000',
    receiverAccountId: '0.0.4000',
    schemaVersion: 'supplier-evidence-deployment-policy.v1',
    serviceId: effect.serviceId,
    serviceKeyId: effect.serviceKeyId,
    serviceNetworkId: HEDERA_TESTNET_CAIP2,
    validFrom: '2026-07-25T09:00:00.000Z',
    ...overrides,
  };
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
  const invoice = Object.freeze({
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
  } as const satisfies CanonicalInvoiceV1);
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
  const deploymentAuthority = deterministicSignerFixture(
    'deployment-authority-key-1',
  );
  const signedDeploymentPolicy = signSupplierEvidenceDeploymentPolicyV1(
    deploymentPolicy(effect),
    deploymentAuthority.signer,
  );
  const quote = createSupplierEvidenceQuoteV2(
    request,
    signedDeploymentPolicy,
    deploymentAuthority.trusted,
    {
      challengeId: 'challenge_1234567890',
      now: new Date(QUOTE_TIME),
      quoteId: 'quote-1',
      quoteTtlSeconds: 120,
    },
  );
  const facilitator = signerFixture('facilitator-key-1');
  const service = signerFixture(effect.serviceKeyId);
  return {
    authorization,
    deploymentAuthorityKey: deploymentAuthority.trusted,
    effect,
    facilitatorKey: facilitator.trusted,
    facilitatorSigner: facilitator.signer,
    invoice,
    quote,
    request,
    serviceKey: service.trusted,
    serviceSigner: service.signer,
    signedDeploymentPolicy,
    snapshot,
  };
}

function context(
  test: TestFixture,
  overrides: Partial<SupplierEvidenceBindingContextV2> = {},
): SupplierEvidenceBindingContextV2 {
  return {
    authorization: test.authorization,
    effect: test.effect,
    invoice: test.invoice,
    quote: test.quote,
    request: test.request,
    signedDeploymentPolicy: test.signedDeploymentPolicy,
    supplierSnapshot: test.snapshot,
    trustedDeploymentAuthority: test.deploymentAuthorityKey,
    ...overrides,
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
    paymentTransactionId: '0.0.3000@1753437930.000000001',
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

function resultBody(
  test: TestFixture,
  payment: ReturnType<typeof createVerificationPaymentFact>,
  overrides: Partial<SupplierEvidenceResultBodyV2> = {},
): SupplierEvidenceResultBodyV2 {
  return {
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
    ...overrides,
  };
}

describe('AP-bound Hedera x402 evidence v2', () => {
  it('derives raw request and authority-bound quote records', () => {
    const test = fixture();
    const requestDigest = supplierEvidenceRequestDigest(test.request);

    expect(requestDigest).toBe(
      '5a320d30641f15e969632ce9cbb81ab3e56516d227292340a19c8cd9838910ac',
    );
    expect(test.signedDeploymentPolicy.signature).toBe(
      '9ttIaSkHU5Ag5QT5XSHxn1WNTC0X35uf0e7Vj3wFrfjB8QrJRvyph/XEM4avonm8EKhCv8TMsi9xBZqC7DHQCg==',
    );
    expect(test.quote.deploymentPolicyDigest).toBe(
      'cb4f1bbbed5c05f02b808c344cdcb0382062678af373a9f3b59120eb9418d526',
    );
    expect(test.quote.quoteDigest).toBe(
      '1118e0156124fcc4808a7c71b89fbcf818eb3a5e3b4bb93e237522ee24a17411',
    );
    expect(test.quote).toMatchObject({
      facilitatorFeePayerAccountId: '0.0.3000',
      maximumTransactionFeeTinybars: '200000000',
      serviceNetworkId: HEDERA_TESTNET_CAIP2,
    });
    expect(test.quote.requirements).toMatchObject({
      amount: '1000',
      asset: '0.0.0',
      network: HEDERA_X402_TESTNET_NETWORK,
      payTo: '0.0.4000',
      scheme: 'exact',
    });
    expect(supplierEvidenceMemo(requestDigest)).toBe(
      `invoiceguard:x402:v2:${requestDigest}`,
    );
  });

  it('matches the fixed Ed25519 payment-envelope vector', () => {
    const test = fixture();
    const deterministic = deterministicSignerFixture('facilitator-key-1');
    const signed = signFacilitatorPaymentAttestationV2(
      paymentBody(test),
      deterministic.signer,
    );

    expect(signed.signature).toBe(
      'wTSzAWIzwd7XKuyVI/CMj7tjyYAE/E+2GtzeAFY+tj/W4WuI56mmyODDC3dVw2hjmrq4j7uIoZH8h5ewJs48DA==',
    );
    expect(() =>
      createVerificationPaymentFact(
        context(test),
        signed,
        deterministic.trusted,
      ),
    ).not.toThrow();
  });

  it('authenticates deployment policy before constructing a quote', () => {
    const test = fixture();
    const substituted = {
      ...test.signedDeploymentPolicy,
      body: {
        ...test.signedDeploymentPolicy.body,
        receiverAccountId: '0.0.4999',
      },
    };

    expect(() =>
      createSupplierEvidenceQuoteV2(
        test.request,
        substituted,
        test.deploymentAuthorityKey,
        {
          challengeId: 'challenge_1234567890',
          now: new Date(QUOTE_TIME),
          quoteId: 'quote-substituted',
          quoteTtlSeconds: 120,
        },
      ),
    ).toThrow(/not trusted/u);
  });

  it('maps a trusted payment and result into AP facts', () => {
    const test = fixture();
    const payment = createVerificationPaymentFact(
      context(test),
      signedPayment(test),
      test.facilitatorKey,
    );
    const result = createEvidenceResultFact(
      context(test),
      payment,
      signSupplierEvidenceResultV2(
        resultBody(test, payment),
        test.serviceSigner,
      ),
      test.serviceKey,
    );

    expect(payment).toMatchObject({
      adapterId: HEDERA_X402_ADAPTER_ID,
      evidencePolicyDigest: test.request.evidencePolicyDigest,
      paymentNetworkId: HEDERA_TESTNET_CAIP2,
      status: 'CONSENSUS',
    });
    expect(result).toMatchObject({
      adapterId: HEDERA_EVIDENCE_ADAPTER_ID,
      evidenceRoot: test.request.evidenceRoot,
      result: 'MATCH',
      status: 'VERIFIED',
    });
  });

  it.each([
    ['identity', { legalIdentityHash: 'c'.repeat(64) }],
    ['beneficiary', { proposedBeneficiaryFingerprint: 'd'.repeat(64) }],
    ['policy', { evidencePolicyDigest: 'e'.repeat(64) }],
  ] as const)(
    're-derives and rejects a self-consistent substituted %s request',
    (_label, mutation) => {
      const test = fixture();
      const request = { ...test.request, ...mutation };
      const quote = createSupplierEvidenceQuoteV2(
        request,
        test.signedDeploymentPolicy,
        test.deploymentAuthorityKey,
        {
          challengeId: 'challenge_substitute_1',
          now: new Date(QUOTE_TIME),
          quoteId: 'substituted-quote',
          quoteTtlSeconds: 120,
        },
      );
      const substituted = { ...test, quote, request };
      const attestation = signedPayment(substituted);

      expect(() =>
        createVerificationPaymentFact(
          context(substituted),
          attestation,
          test.facilitatorKey,
        ),
      ).toThrow(/not derived from the current AP inputs/u);
    },
  );

  it('re-derives the complete request again at the result boundary', () => {
    const test = fixture();
    const payment = createVerificationPaymentFact(
      context(test),
      signedPayment(test),
      test.facilitatorKey,
    );
    const request = {
      ...test.request,
      legalIdentityHash: 'c'.repeat(64),
    };
    const quote = createSupplierEvidenceQuoteV2(
      request,
      test.signedDeploymentPolicy,
      test.deploymentAuthorityKey,
      {
        challengeId: 'challenge_substitute_2',
        now: new Date(QUOTE_TIME),
        quoteId: 'substituted-result-quote',
        quoteTtlSeconds: 120,
      },
    );

    expect(() =>
      createEvidenceResultFact(
        context(test, { quote, request }),
        payment,
        signSupplierEvidenceResultV2(
          resultBody(test, payment),
          test.serviceSigner,
        ),
        test.serviceKey,
      ),
    ).toThrow(/not derived from the current AP inputs/u);
  });

  it('revalidates a persisted payment record at result construction', () => {
    const test = fixture();
    const payment = createVerificationPaymentFact(
      context(test),
      signedPayment(test),
      test.facilitatorKey,
    );
    const mutated = {
      ...payment,
      serviceRequestDigest: 'f'.repeat(64),
    };

    expect(() =>
      createEvidenceResultFact(
        context(test),
        mutated,
        signSupplierEvidenceResultV2(
          resultBody(test, payment),
          test.serviceSigner,
        ),
        test.serviceKey,
      ),
    ).toThrow(/not current/u);
  });

  it.each([
    ['amount', { amountTinybars: '1001' }],
    ['receiver', { receiverAccountId: '0.0.4999' }],
    ['request', { requestDigest: 'd'.repeat(64) }],
    ['quote', { quoteDigest: 'e'.repeat(64) }],
    ['action', { actionDigest: 'f'.repeat(64) }],
    ['service', { serviceId: 'other-service' }],
  ] as const)(
    'rejects a cryptographically valid %s payment substitution',
    (_label, override) => {
      const test = fixture();

      expect(() =>
        createVerificationPaymentFact(
          context(test),
          signedPayment(test, override),
          test.facilitatorKey,
        ),
      ).toThrow(/does not bind/u);
    },
  );

  it('enforces canonical Base64 Ed25519 signatures', () => {
    const test = fixture();
    const signed = signedPayment(test);
    const nonCanonical = {
      ...signed,
      signature: `${signed.signature}\n`,
    };

    expect(() =>
      createVerificationPaymentFact(
        context(test),
        nonCanonical,
        test.facilitatorKey,
      ),
    ).toThrow(/not trusted/u);
  });

  it('enforces signed-int64 tinybars and canonical Hedera IDs', () => {
    const test = fixture();

    expect(() =>
      signSupplierEvidenceDeploymentPolicyV1(
        deploymentPolicy(test.effect, {
          amountTinybars: '9223372036854775808',
        }),
        deterministicSignerFixture('deployment-authority-key-1').signer,
      ),
    ).toThrow(/signed int64/u);
    expect(() =>
      signFacilitatorPaymentAttestationV2(
        paymentBody(test, { payerAccountId: '0.0.05000' }),
        test.facilitatorSigner,
      ),
    ).toThrow(/round-trip/u);
    expect(() =>
      signFacilitatorPaymentAttestationV2(
        paymentBody(test, {
          paymentTransactionId: '0.0.03000@1753437930.000000001',
        }),
        test.facilitatorSigner,
      ),
    ).toThrow(/round-trip/u);
  });

  it('rejects prefixed digests, extra fields, and non-Testnet IDs', () => {
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

    expect(() =>
      parseSupplierEvidenceRequestV2({
        ...test.request,
        actionDigest: `sha256:${test.request.actionDigest}`,
      }),
    ).toThrow(/unprefixed/u);
    expect(() =>
      verifySupplierEvidenceQuoteV2(
        test.request,
        quoteWithExtra,
        test.signedDeploymentPolicy,
        test.deploymentAuthorityKey,
      ),
    ).toThrow(/unexpected or missing fields/u);
    expect(() => toX402TestnetNetwork('hedera:295')).toThrow(
      /Only Hedera Testnet/u,
    );
    expect(() => hederaAccountFromCaip10('hedera:295:0.0.1000')).toThrow(
      /not on Hedera Testnet/u,
    );
  });

  it('rejects an untrusted facilitator and service-result substitution', () => {
    const test = fixture();
    const other = signerFixture('facilitator-key-1');

    expect(() =>
      createVerificationPaymentFact(
        context(test),
        signedPayment(test),
        other.trusted,
      ),
    ).toThrow(/not trusted/u);

    const payment = createVerificationPaymentFact(
      context(test),
      signedPayment(test),
      test.facilitatorKey,
    );
    expect(() =>
      createEvidenceResultFact(
        context(test),
        payment,
        signSupplierEvidenceResultV2(
          resultBody(test, payment, {
            evidenceRoot: 'f'.repeat(64),
            reasonCodes: ['EVIDENCE_ROOT_MISMATCH'],
            result: 'MISMATCH',
          }),
          test.serviceSigner,
        ),
        test.serviceKey,
      ),
    ).toThrow(/does not bind/u);
  });
});
