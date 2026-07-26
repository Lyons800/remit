import { generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';

import {
  createPaymentActionAggregate,
  transitionPaymentAction,
} from '@invoiceguard/domain';
import type { CanonicalInvoiceV1 } from '@invoiceguard/protocol';
import {
  createAuthorizationBundle,
  createSupplierMasterSnapshot,
  hashCanonicalInvoice,
} from '@invoiceguard/protocol/hashing';
import { describe, expect, it } from 'vitest';

import {
  assertSamePreparedTransaction,
  createSupplierEvidenceQuoteV2,
  createSupplierEvidenceRequestV2,
  decideVerificationPaymentRecovery,
  inspectPreparedVerificationTransaction,
  signFacilitatorPaymentAttestationV2,
  signSupplierEvidenceDeploymentPolicyV1,
  supplierEvidenceMemo,
  type ClaimedVerificationPayment,
  type ConsensusVerificationPayment,
  type Ed25519SignatureProvider,
  type FacilitatorPaymentAttestationBodyV2,
  type SupplierEvidenceQuoteV2,
  type TrustedEd25519Key,
  type VerificationEffectIdentitySource,
  type VerificationPaymentRecoveryContextV2,
  type VerificationPaymentStore,
} from '../src/index.js';
import {
  BENEFICIARY,
  DIGESTS,
  IDS,
  NOW,
  actionCore,
  policyEvaluationForCore,
} from '../../domain/test/fixtures/authorization.js';

type TestPrivateKey = Readonly<Record<string, never>>;
interface TestTransaction {
  addHbarTransfer(accountId: string, amount: unknown): TestTransaction;
  freeze(): TestTransaction;
  setMaxTransactionFee(amount: unknown): TestTransaction;
  setNodeAccountIds(accountIds: readonly unknown[]): TestTransaction;
  setTransactionId(transactionId: unknown): TestTransaction;
  setTransactionMemo(memo: string): TestTransaction;
  sign(privateKey: TestPrivateKey): Promise<TestTransaction>;
  toBytesAsync(): Promise<Uint8Array>;
}
type TestHederaSdk = Readonly<{
  AccountId: Readonly<{ fromString(value: string): unknown }>;
  Hbar: Readonly<{ fromTinybars(value: string | number): unknown }>;
  PrivateKey: Readonly<{ generateED25519(): TestPrivateKey }>;
  TransactionId: Readonly<{ fromString(value: string): unknown }>;
  TransferTransaction: new () => TestTransaction;
}>;

const require = createRequire(import.meta.url);
const testHederaSdk = require('@hiero-ledger/sdk') as TestHederaSdk;

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
  const deploymentAuthority = signerFixture('deployment-authority-key-1');
  const signedDeploymentPolicy = signSupplierEvidenceDeploymentPolicyV1(
    {
      allowedNodeAccountIds: ['0.0.3'],
      amountTinybars: '1000',
      deploymentId: 'synthetic-testnet-deployment',
      expiresAt: '2026-07-25T12:00:00.000Z',
      facilitatorFeePayerAccountId: '0.0.3000',
      maximumTransactionFeeTinybars: '200000000',
      receiverAccountId: '0.0.4000',
      schemaVersion: 'supplier-evidence-deployment-policy.v1',
      serviceId: effect.serviceId,
      serviceKeyId: effect.serviceKeyId,
      serviceNetworkId: 'hedera:296',
      validFrom: '2026-07-25T09:00:00.000Z',
    },
    deploymentAuthority.signer,
  );
  const quote = createSupplierEvidenceQuoteV2(
    request,
    signedDeploymentPolicy,
    deploymentAuthority.trusted,
    {
      challengeId: 'challenge_1234567890',
      now: new Date('2026-07-25T10:05:00.000Z'),
      quoteId: 'quote-1',
      quoteTtlSeconds: 120,
    },
  );
  const facilitator = signerFixture('facilitator-key-1');
  const context: VerificationPaymentRecoveryContextV2 = {
    authorization,
    effect,
    invoice,
    quote,
    request,
    signedDeploymentPolicy,
    supplierSnapshot: snapshot,
    trustedDeploymentAuthority: deploymentAuthority.trusted,
    trustedFacilitator: facilitator.trusted,
  };
  const identitySource: VerificationEffectIdentitySource = {
    resolve: (candidate) => ({
      actionDigest: candidate.actionDigest,
      atomicGroupKey: candidate.atomicGroupKey,
      eventId: `test-only-event:${candidate.actionDigest}`,
    }),
  };
  return {
    context,
    deploymentAuthority,
    facilitator,
    identitySource,
  };
}

function withQuote(
  test: ReturnType<typeof recoveryFixture>,
  quote: SupplierEvidenceQuoteV2,
): VerificationPaymentRecoveryContextV2 {
  return { ...test.context, quote };
}

function recoveryInput() {
  return {
    leaseExpiresAt: '2026-07-25T10:06:00.000Z',
    now: '2026-07-25T10:05:10.000Z',
    paymentAttemptId: 'verification-attempt-1',
  };
}

async function preparedTransactionBytes(
  context: VerificationPaymentRecoveryContextV2,
  overrides: Readonly<{
    amountTinybars?: string;
    feePayerAccountId?: string;
    maximumTransactionFeeTinybars?: string;
    memo?: string;
    nodeAccountId?: string;
    receiverAccountId?: string;
    signatures?: number;
  }> = {},
): Promise<string> {
  const amount = overrides.amountTinybars ?? context.quote.requirements.amount;
  const receiver =
    overrides.receiverAccountId ?? context.quote.requirements.payTo;
  const feePayer =
    overrides.feePayerAccountId ?? context.quote.facilitatorFeePayerAccountId;
  let transaction = new testHederaSdk.TransferTransaction()
    .addHbarTransfer('0.0.5000', testHederaSdk.Hbar.fromTinybars(`-${amount}`))
    .addHbarTransfer(receiver, testHederaSdk.Hbar.fromTinybars(amount))
    .setTransactionId(
      testHederaSdk.TransactionId.fromString(
        `${feePayer}@1753437930.000000001`,
      ),
    )
    .setNodeAccountIds([
      testHederaSdk.AccountId.fromString(overrides.nodeAccountId ?? '0.0.3'),
    ])
    .setTransactionMemo(
      overrides.memo ?? supplierEvidenceMemo(context.quote.requestDigest),
    )
    .setMaxTransactionFee(
      testHederaSdk.Hbar.fromTinybars(
        overrides.maximumTransactionFeeTinybars ?? '100000000',
      ),
    )
    .freeze();
  for (let index = 0; index < (overrides.signatures ?? 2); index += 1) {
    transaction = await transaction.sign(
      testHederaSdk.PrivateKey.generateED25519(),
    );
  }
  return Buffer.from(await transaction.toBytesAsync()).toString('base64');
}

async function firstClaim(test: ReturnType<typeof recoveryFixture>) {
  const decision = await decideVerificationPaymentRecovery(
    test.context,
    test.identitySource,
    null,
    recoveryInput(),
  );
  if (decision.kind !== 'CLAIM_NEW') {
    throw new Error('invalid fixture');
  }
  return decision.claim;
}

async function consensusAttempt(
  test: ReturnType<typeof recoveryFixture>,
): Promise<ConsensusVerificationPayment> {
  const claim = await firstClaim(test);
  const prepared = await inspectPreparedVerificationTransaction(
    test.context,
    claim,
    await preparedTransactionBytes(test.context),
  );
  const body: FacilitatorPaymentAttestationBodyV2 = {
    actionDigest: prepared.actionDigest,
    amountTinybars: prepared.amountTinybars,
    asset: '0.0.0',
    challengeId: test.context.quote.challengeId,
    paidAt: '2026-07-25T10:05:30.000Z',
    payerAccountId: prepared.payerAccountId,
    paymentAttemptId: prepared.paymentAttemptId,
    paymentTransactionId: prepared.transactionId,
    quoteDigest: prepared.quoteDigest,
    quoteId: prepared.quoteId,
    receiptStatus: 'SUCCESS',
    receiverAccountId: prepared.receiverAccountId,
    requestDigest: prepared.requestDigest,
    resourceUrl: test.context.quote.resourceUrl,
    schemaVersion: 'facilitator-payment-attestation.v2',
    serviceId: test.context.quote.serviceId,
    x402Network: 'hedera:testnet',
  };
  return {
    ...prepared,
    attestation: signFacilitatorPaymentAttestationV2(
      body,
      test.facilitator.signer,
    ),
    state: 'CONSENSUS',
  };
}

function withResignedConsensusBody(
  test: ReturnType<typeof recoveryFixture>,
  consensus: ConsensusVerificationPayment,
  overrides: Partial<FacilitatorPaymentAttestationBodyV2>,
): ConsensusVerificationPayment {
  return {
    ...consensus,
    attestation: signFacilitatorPaymentAttestationV2(
      {
        ...consensus.attestation.body,
        ...overrides,
      },
      test.facilitator.signer,
    ),
  };
}

const SIGNED_CONSENSUS_MUTATIONS: readonly (readonly [
  string,
  Partial<FacilitatorPaymentAttestationBodyV2>,
])[] = [
  ['action', { actionDigest: 'f'.repeat(64) }],
  ['amount', { amountTinybars: '1001' }],
  ['challenge', { challengeId: 'challenge_wrong_1234' }],
  ['facilitator fee payer', { paymentTransactionId: '0.0.3001@1.000000001' }],
  ['paidAt before quote', { paidAt: '2026-07-25T10:04:59.999Z' }],
  ['paidAt at quote expiry', { paidAt: '2026-07-25T10:07:00.000Z' }],
  ['payer', { payerAccountId: '0.0.5001' }],
  ['payment attempt', { paymentAttemptId: 'verification-attempt-substitute' }],
  ['payment transaction', { paymentTransactionId: '0.0.3000@1.000000001' }],
  ['quote digest', { quoteDigest: 'e'.repeat(64) }],
  ['quote ID', { quoteId: 'quote-substitute' }],
  ['receiver', { receiverAccountId: '0.0.4001' }],
  ['request digest', { requestDigest: 'd'.repeat(64) }],
  ['resource', { resourceUrl: '/v2/supplier-evidence-checks/substitute' }],
  ['service', { serviceId: 'supplier-evidence-substitute' }],
];

describe('verification payment recovery seam', () => {
  it('requires trusted prerequisite identity and returns one claim', async () => {
    const test = recoveryFixture();
    const decision = await decideVerificationPaymentRecovery(
      test.context,
      test.identitySource,
      null,
      recoveryInput(),
    );

    expect(decision).toMatchObject({
      claim: {
        actionDigest: test.context.effect.actionDigest,
        eventId: `test-only-event:${test.context.effect.actionDigest}`,
        state: 'CLAIMED',
      },
      kind: 'CLAIM_NEW',
    });
  });

  it('rejects identity and request substitution', async () => {
    const test = recoveryFixture();
    const substituted: VerificationEffectIdentitySource = {
      resolve: () => ({
        actionDigest: 'f'.repeat(64),
        atomicGroupKey: test.context.effect.atomicGroupKey,
        eventId: 'wrong-event',
      }),
    };

    await expect(
      decideVerificationPaymentRecovery(
        test.context,
        substituted,
        null,
        recoveryInput(),
      ),
    ).rejects.toThrow(/does not bind/u);
    await expect(
      decideVerificationPaymentRecovery(
        {
          ...test.context,
          request: {
            ...test.context.request,
            legalIdentityHash: 'f'.repeat(64),
          },
        },
        test.identitySource,
        null,
        recoveryInput(),
      ),
    ).rejects.toThrow(/not derived/u);
  });

  it('inspects a real pinned-SDK transaction before PREPARED', async () => {
    const test = recoveryFixture();
    const claim = await firstClaim(test);
    const bytes = await preparedTransactionBytes(test.context);
    const prepared = await inspectPreparedVerificationTransaction(
      test.context,
      claim,
      bytes,
    );
    const decision = await decideVerificationPaymentRecovery(
      test.context,
      test.identitySource,
      prepared,
      recoveryInput(),
    );

    expect(prepared).toMatchObject({
      amountTinybars: '1000',
      facilitatorFeePayerAccountId: '0.0.3000',
      maximumTransactionFeeTinybars: '100000000',
      memo: supplierEvidenceMemo(claim.requestDigest),
      networkId: 'hedera:296',
      nodeAccountId: '0.0.3',
      payerAccountId: '0.0.5000',
      receiverAccountId: '0.0.4000',
      state: 'PREPARED',
      transactionId: '0.0.3000@1753437930.000000001',
    });
    expect(decision).toEqual({
      attempt: prepared,
      kind: 'RECONCILE_PREPARED',
    });
    expect(() =>
      assertSamePreparedTransaction(prepared, {
        ...prepared,
        transactionId: '0.0.3000@1753437930.000000002',
      }),
    ).toThrow(/original prepared transaction/u);
  });

  it.each([
    ['amount', { amountTinybars: '1001' }],
    ['receiver', { receiverAccountId: '0.0.4999' }],
    ['memo', { memo: 'wrong-memo' }],
    ['node/network context', { nodeAccountId: '0.0.4' }],
    ['fee payer', { feePayerAccountId: '0.0.3001' }],
    ['fee cap', { maximumTransactionFeeTinybars: '200000001' }],
    ['missing signature', { signatures: 1 }],
  ] as const)(
    'rejects real prepared bytes with substituted %s semantics',
    async (_label, overrides) => {
      const test = recoveryFixture();
      const claim = await firstClaim(test);
      const bytes = await preparedTransactionBytes(test.context, overrides);

      await expect(
        inspectPreparedVerificationTransaction(test.context, claim, bytes),
      ).rejects.toThrow();
    },
  );

  it('loads durable consensus before applying expired live windows', async () => {
    const test = recoveryFixture();
    const consensus = await consensusAttempt(test);
    const decision = await decideVerificationPaymentRecovery(
      test.context,
      test.identitySource,
      consensus,
      {
        ...recoveryInput(),
        leaseExpiresAt: '2026-07-25T11:01:00.000Z',
        now: '2026-07-25T11:00:30.000Z',
      },
    );

    expect(decision.kind).toBe('RETURN_CONSENSUS');
    if (decision.kind !== 'RETURN_CONSENSUS') {
      throw new Error('invalid fixture');
    }
    expect(decision.attempt).toMatchObject(consensus);
    expect(decision.attempt).not.toBe(consensus);
    expect(Object.isFrozen(decision.attempt)).toBe(true);
    expect(Object.isFrozen(decision.attempt.attestation.body)).toBe(true);
  });

  it('rejects a stored consensus envelope with a substituted signature or trust anchor', async () => {
    const test = recoveryFixture();
    const consensus = await consensusAttempt(test);
    const signature = consensus.attestation.signature;
    const mutatedSignature = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    const wrongFacilitator = signerFixture('facilitator-key-1');

    await expect(
      decideVerificationPaymentRecovery(
        test.context,
        test.identitySource,
        {
          ...consensus,
          attestation: {
            ...consensus.attestation,
            signature: mutatedSignature,
          },
        },
        recoveryInput(),
      ),
    ).rejects.toThrow(/not trusted/u);
    await expect(
      decideVerificationPaymentRecovery(
        {
          ...test.context,
          trustedFacilitator: wrongFacilitator.trusted,
        },
        test.identitySource,
        consensus,
        recoveryInput(),
      ),
    ).rejects.toThrow(/not trusted/u);
  });

  it.each([
    ['receipt status', { receiptStatus: 'FAILED' }],
    ['network', { x402Network: 'hedera:mainnet' }],
    ['asset', { asset: '0.0.1' }],
  ] as const)(
    'rejects a strict stored consensus body with substituted %s',
    async (_label, invalidFields) => {
      const test = recoveryFixture();
      const consensus = await consensusAttempt(test);
      const body = {
        ...consensus.attestation.body,
        ...invalidFields,
      } as unknown as FacilitatorPaymentAttestationBodyV2;

      await expect(
        decideVerificationPaymentRecovery(
          test.context,
          test.identitySource,
          {
            ...consensus,
            attestation: {
              ...consensus.attestation,
              body,
            },
          },
          recoveryInput(),
        ),
      ).rejects.toThrow(/invalid/u);
    },
  );

  it('rejects unexpected fields in the stored consensus envelope and body', async () => {
    const test = recoveryFixture();
    const consensus = await consensusAttempt(test);

    await expect(
      decideVerificationPaymentRecovery(
        test.context,
        test.identitySource,
        {
          ...consensus,
          attestation: {
            ...consensus.attestation,
            unexpected: true,
          } as typeof consensus.attestation,
        },
        recoveryInput(),
      ),
    ).rejects.toThrow(/unexpected or missing fields/u);
    await expect(
      decideVerificationPaymentRecovery(
        test.context,
        test.identitySource,
        {
          ...consensus,
          attestation: {
            ...consensus.attestation,
            body: {
              ...consensus.attestation.body,
              unexpected: true,
            } as FacilitatorPaymentAttestationBodyV2,
          },
        },
        recoveryInput(),
      ),
    ).rejects.toThrow(/unexpected or missing fields/u);
  });

  it.each(SIGNED_CONSENSUS_MUTATIONS)(
    'rejects a validly signed stored consensus with substituted %s binding',
    async (_label, overrides) => {
      const test = recoveryFixture();
      const consensus = await consensusAttempt(test);

      await expect(
        decideVerificationPaymentRecovery(
          test.context,
          test.identitySource,
          withResignedConsensusBody(test, consensus, overrides),
          recoveryInput(),
        ),
      ).rejects.toThrow();
    },
  );

  it.each([
    ['amount', { amountTinybars: '1001' }],
    ['payer', { payerAccountId: '0.0.5001' }],
    ['payment attempt', { paymentAttemptId: 'persisted-attempt-substitute' }],
    ['receiver', { receiverAccountId: '0.0.4001' }],
  ] as const)(
    'rejects a signed attestation against substituted persisted %s consensus fields',
    async (_label, persistedOverrides) => {
      const test = recoveryFixture();
      const consensus = await consensusAttempt(test);

      await expect(
        decideVerificationPaymentRecovery(
          test.context,
          test.identitySource,
          {
            ...consensus,
            ...persistedOverrides,
          },
          recoveryInput(),
        ),
      ).rejects.toThrow();
    },
  );

  it('atomically abandons an expired CLAIMED row for a fresh quote', async () => {
    const test = recoveryFixture();
    const stale = await firstClaim(test);
    const freshQuote = createSupplierEvidenceQuoteV2(
      test.context.request,
      test.context.signedDeploymentPolicy,
      test.context.trustedDeploymentAuthority,
      {
        challengeId: 'challenge_fresh_12345',
        now: new Date('2026-07-25T10:06:01.000Z'),
        quoteId: 'quote-2',
        quoteTtlSeconds: 120,
      },
    );
    const freshContext = withQuote(test, freshQuote);
    const decision = await decideVerificationPaymentRecovery(
      freshContext,
      test.identitySource,
      stale,
      {
        leaseExpiresAt: '2026-07-25T10:07:00.000Z',
        now: '2026-07-25T10:06:10.000Z',
        paymentAttemptId: 'verification-attempt-2',
      },
    );

    expect(decision).toMatchObject({
      abandonment: {
        paymentAttemptId: 'verification-attempt-1',
        reason: 'LEASE_EXPIRED_BEFORE_PREPARED',
        replacementPaymentAttemptId: 'verification-attempt-2',
        state: 'ABANDONED',
      },
      claim: {
        paymentAttemptId: 'verification-attempt-2',
        quoteId: 'quote-2',
        state: 'CLAIMED',
      },
      kind: 'TAKEOVER_EXPIRED_CLAIM',
    });
    if (decision.kind !== 'TAKEOVER_EXPIRED_CLAIM') {
      throw new Error('invalid fixture');
    }
    let current: ClaimedVerificationPayment = stale;
    const history: string[] = [];
    const store: Pick<VerificationPaymentStore, 'takeoverExpiredClaim'> = {
      takeoverExpiredClaim: async (input) => {
        await Promise.resolve();
        if (current !== input.expected) {
          return { status: 'CONFLICT' };
        }
        current = input.replacement;
        history.push(input.abandonment.paymentAttemptId);
        return {
          abandonment: input.abandonment,
          attempt: input.replacement,
          status: 'TAKEN',
        };
      },
    };
    const takeoverInput = {
      abandonment: decision.abandonment,
      expected: decision.expected,
      replacement: decision.claim,
    };
    const outcomes = await Promise.all([
      store.takeoverExpiredClaim(takeoverInput),
      store.takeoverExpiredClaim(takeoverInput),
    ]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      'CONFLICT',
      'TAKEN',
    ]);
    expect(history).toEqual(['verification-attempt-1']);
  });

  it('never reuses an expired claim with its stale quote or attempt', async () => {
    const test = recoveryFixture();
    const stale = await firstClaim(test);

    await expect(
      decideVerificationPaymentRecovery(
        test.context,
        test.identitySource,
        stale,
        {
          leaseExpiresAt: '2026-07-25T10:06:30.000Z',
          now: '2026-07-25T10:06:10.000Z',
          paymentAttemptId: stale.paymentAttemptId,
        },
      ),
    ).rejects.toThrow(/fresh quote and attempt/u);

    const quoteIssuedAtLeaseExpiry = createSupplierEvidenceQuoteV2(
      test.context.request,
      test.context.signedDeploymentPolicy,
      test.context.trustedDeploymentAuthority,
      {
        challengeId: 'challenge_equal_12345',
        now: new Date(stale.leaseExpiresAt),
        quoteId: 'quote-issued-at-expiry',
        quoteTtlSeconds: 120,
      },
    );
    await expect(
      decideVerificationPaymentRecovery(
        withQuote(test, quoteIssuedAtLeaseExpiry),
        test.identitySource,
        stale,
        {
          leaseExpiresAt: '2026-07-25T10:07:00.000Z',
          now: '2026-07-25T10:06:10.000Z',
          paymentAttemptId: 'verification-attempt-2',
        },
      ),
    ).rejects.toThrow(/fresh quote and attempt/u);
  });

  it('refuses a new payment after the quote expires', async () => {
    const test = recoveryFixture();

    await expect(
      decideVerificationPaymentRecovery(
        test.context,
        test.identitySource,
        null,
        {
          ...recoveryInput(),
          leaseExpiresAt: '2026-07-25T10:08:00.000Z',
          now: '2026-07-25T10:07:30.000Z',
        },
      ),
    ).rejects.toThrow(/outside its live window/u);
  });
});
