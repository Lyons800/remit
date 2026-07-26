import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  assertDualTokenSettlementIntent,
  computeDualTokenSettlementManifestHash,
  createDualTokenSettlementIntent,
  DUAL_TOKEN_SETTLEMENT_MANIFEST_DOMAIN,
  DUAL_TOKEN_SETTLEMENT_OPERATIONS,
  type DualTokenSettlementIntentV2,
  type DualTokenSettlementManifestV2,
} from '../scripts/lib/hedera-dual-token-guard.js';

const NOW = 2_000_000_000;
const DIGESTS = {
  actionDigest: 'a'.repeat(64),
  authorizationEvidenceHash: 'b'.repeat(64),
  authorizationPrecommitHash: 'c'.repeat(64),
  invoiceDigest: 'd'.repeat(64),
} as const;

function transactionIds(): [string, string, string, string, string] {
  return [
    '0.0.5001@1999999990.000000001',
    '0.0.5001@1999999990.000000002',
    '0.0.5001@1999999990.000000003',
    '0.0.5001@1999999990.000000004',
    '0.0.5001@1999999990.000000005',
  ];
}

function manifest(
  overrides: Record<string, unknown> = {},
): DualTokenSettlementManifestV2 {
  return {
    actionBeneficiaryAccountId: '0.0.7001',
    actionDigest: DIGESTS.actionDigest,
    amountAtoms: '25000000',
    auditTopicId: '0.0.8001',
    authorizationEvidenceHash: DIGESTS.authorizationEvidenceHash,
    authorizationPrecommitHash: DIGESTS.authorizationPrecommitHash,
    batchBytes: 4096,
    batchKey: `02${'e'.repeat(64)}`,
    controlHolderAccountId: '0.0.7002',
    controlSerial: 2,
    controlTokenId: '0.0.6002',
    innerTransactionIds: transactionIds(),
    invoiceDigest: DIGESTS.invoiceDigest,
    network: 'hedera:296',
    operations: DUAL_TOKEN_SETTLEMENT_OPERATIONS,
    outerTransactionId: '0.0.5001@1999999990.000000006',
    payableHolderAccountId: '0.0.7001',
    payableSerial: 1,
    payableTokenId: '0.0.6001',
    payerAccountId: '0.0.5002',
    schemaVersion: 'hedera-dual-token-settlement-intent.v2',
    settlementAssetTokenId: '0.0.0',
    treasuryAccountId: '0.0.5001',
    validDurationSeconds: 120,
    validStartEpochSeconds: NOW - 10,
    ...overrides,
  } as DualTokenSettlementManifestV2;
}

function intent(
  overrides: Record<string, unknown> = {},
): DualTokenSettlementIntentV2 {
  return {
    ...createDualTokenSettlementIntent(manifest()),
    ...overrides,
  } as DualTokenSettlementIntentV2;
}

function recompute(
  overrides: Record<string, unknown>,
): DualTokenSettlementIntentV2 {
  return createDualTokenSettlementIntent(manifest(overrides));
}

describe('experimental v2 dual-token settlement manifest', () => {
  it('creates and admits an exact, fresh, action-bound intent', () => {
    const value = createDualTokenSettlementIntent(manifest());

    expect(() =>
      assertDualTokenSettlementIntent(value, { nowEpochSeconds: NOW }),
    ).not.toThrow();
    expect(value.manifestHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(value.operations).toEqual([
      'CONTROL_UNFREEZE',
      'ATOMIC_TRANSFER',
      'PAYABLE_BURN',
      'CONTROL_BURN',
      'HCS_SETTLEMENT_COMMITMENT',
    ]);
  });

  it('hashes the exact canonical manifest with explicit domain separation', () => {
    const value = manifest();
    const expected = createHash('sha256')
      .update(DUAL_TOKEN_SETTLEMENT_MANIFEST_DOMAIN, 'ascii')
      .update(Uint8Array.of(0))
      .update(
        JSON.stringify({
          actionBeneficiaryAccountId: value.actionBeneficiaryAccountId,
          actionDigest: value.actionDigest,
          amountAtoms: value.amountAtoms,
          auditTopicId: value.auditTopicId,
          authorizationEvidenceHash: value.authorizationEvidenceHash,
          authorizationPrecommitHash: value.authorizationPrecommitHash,
          batchBytes: value.batchBytes,
          batchKey: value.batchKey,
          controlHolderAccountId: value.controlHolderAccountId,
          controlSerial: value.controlSerial,
          controlTokenId: value.controlTokenId,
          innerTransactionIds: value.innerTransactionIds,
          invoiceDigest: value.invoiceDigest,
          network: value.network,
          operations: value.operations,
          outerTransactionId: value.outerTransactionId,
          payableHolderAccountId: value.payableHolderAccountId,
          payableSerial: value.payableSerial,
          payableTokenId: value.payableTokenId,
          payerAccountId: value.payerAccountId,
          schemaVersion: value.schemaVersion,
          settlementAssetTokenId: value.settlementAssetTokenId,
          treasuryAccountId: value.treasuryAccountId,
          validDurationSeconds: value.validDurationSeconds,
          validStartEpochSeconds: value.validStartEpochSeconds,
        }),
        'utf8',
      )
      .digest('hex');

    expect(computeDualTokenSettlementManifestHash(value)).toBe(expected);
    const reverseInsertionOrder = Object.fromEntries(
      Object.entries(value).reverse(),
    );
    expect(computeDualTokenSettlementManifestHash(reverseInsertionOrder)).toBe(
      expected,
    );
  });

  it.each([
    ['schemaVersion', { schemaVersion: 'v1' }],
    ['network', { network: 'hedera:295' }],
    ['actionDigest', { actionDigest: 'A'.repeat(64) }],
    ['invoiceDigest', { invoiceDigest: 'invoice' }],
    ['auditTopicId', { auditTopicId: 'topic:8001' }],
    [
      'authorizationEvidenceHash',
      { authorizationEvidenceHash: `0x${DIGESTS.authorizationEvidenceHash}` },
    ],
    [
      'authorizationPrecommitHash',
      { authorizationPrecommitHash: 'c'.repeat(63) },
    ],
    ['payerAccountId', { payerAccountId: '00.0.5002' }],
    ['treasuryAccountId', { treasuryAccountId: 'treasury' }],
    ['actionBeneficiaryAccountId', { actionBeneficiaryAccountId: '0.0.7003' }],
    ['payableHolderAccountId', { payableHolderAccountId: '0.0.7003' }],
    ['controlHolderAccountId', { controlHolderAccountId: '0x7002' }],
    ['settlementAssetTokenId', { settlementAssetTokenId: 'HBAR' }],
    ['zero amountAtoms', { amountAtoms: '0' }],
    ['noncanonical amountAtoms', { amountAtoms: '025000000' }],
    ['overflowing amountAtoms', { amountAtoms: '9223372036854775808' }],
    ['payableTokenId', { payableTokenId: '0.0.-1' }],
    ['payableSerial', { payableSerial: 0 }],
    ['controlTokenId', { controlTokenId: '0.0.06002' }],
    ['controlSerial', { controlSerial: 1.5 }],
    ['outerTransactionId', { outerTransactionId: '0.0.5001@1.2' }],
    ['batchKey', { batchKey: `04${'e'.repeat(64)}` }],
    ['zero batchBytes', { batchBytes: 0 }],
    ['validStartEpochSeconds', { validStartEpochSeconds: 0 }],
    ['zero validDurationSeconds', { validDurationSeconds: 0 }],
  ])('fails closed for invalid %s', (_field, override) => {
    expect(() => createDualTokenSettlementIntent(manifest(override))).toThrow();
  });

  it('rejects any payable-holder/action-beneficiary mismatch', () => {
    expect(() =>
      createDualTokenSettlementIntent(
        manifest({ payableHolderAccountId: '0.0.7999' }),
      ),
    ).toThrow('snapshotted action beneficiary');
  });

  it.each([
    [
      'reordered',
      [
        'ATOMIC_TRANSFER',
        'CONTROL_UNFREEZE',
        'PAYABLE_BURN',
        'CONTROL_BURN',
        'HCS_SETTLEMENT_COMMITMENT',
      ],
    ],
    [
      'missing',
      ['CONTROL_UNFREEZE', 'ATOMIC_TRANSFER', 'PAYABLE_BURN', 'CONTROL_BURN'],
    ],
    [
      'extra',
      [...DUAL_TOKEN_SETTLEMENT_OPERATIONS, 'SECOND_SETTLEMENT_COMMITMENT'],
    ],
  ])('rejects a %s operation sequence', (_label, operations) => {
    expect(() =>
      createDualTokenSettlementIntent(manifest({ operations })),
    ).toThrow('exact ordered');
  });

  it('rejects duplicate inner transaction IDs', () => {
    const ids = transactionIds();
    ids[4] = ids[0];

    expect(() =>
      createDualTokenSettlementIntent(manifest({ innerTransactionIds: ids })),
    ).toThrow('unique');
  });

  it('rejects an outer transaction ID duplicated by an inner operation', () => {
    expect(() =>
      createDualTokenSettlementIntent(
        manifest({ outerTransactionId: transactionIds()[0] }),
      ),
    ).toThrow('unique from every inner');
  });

  it.each([
    ['missing ID', transactionIds().slice(0, 4)],
    ['extra ID', [...transactionIds(), '0.0.5001@1999999990.000000006']],
    [
      'noncanonical ID',
      [...transactionIds().slice(0, 4), '0.0.5001@1999999990.5'],
    ],
  ])('rejects an inner transaction list with %s', (_label, ids) => {
    expect(() =>
      createDualTokenSettlementIntent(manifest({ innerTransactionIds: ids })),
    ).toThrow();
  });

  it('rejects an oversized batch', () => {
    expect(() =>
      createDualTokenSettlementIntent(manifest({ batchBytes: 6145 })),
    ).toThrow('must not exceed 6144');
  });

  it('rejects a validity window over 120 seconds', () => {
    expect(() =>
      createDualTokenSettlementIntent(manifest({ validDurationSeconds: 121 })),
    ).toThrow('must not exceed 120');
  });

  it('rejects a stale intent even when its manifest hash is valid', () => {
    const value = recompute({
      validDurationSeconds: 120,
      validStartEpochSeconds: NOW - 120,
    });

    expect(() =>
      assertDualTokenSettlementIntent(value, { nowEpochSeconds: NOW }),
    ).toThrow('stale');
  });

  it('rejects an intent starting beyond the bounded clock skew', () => {
    const value = recompute({ validStartEpochSeconds: NOW + 16 });

    expect(() =>
      assertDualTokenSettlementIntent(value, { nowEpochSeconds: NOW }),
    ).toThrow('starts too far ahead');
  });

  it.each([
    ['uppercase', 'A'.repeat(64)],
    ['wrong digest', 'f'.repeat(64)],
    ['prefixed', `0x${'f'.repeat(64)}`],
  ])('rejects a %s manifestHash', (_label, manifestHash) => {
    expect(() =>
      assertDualTokenSettlementIntent(intent({ manifestHash }), {
        nowEpochSeconds: NOW,
      }),
    ).toThrow();
  });

  it.each([
    ['actionDigest', { actionDigest: 'e'.repeat(64) }],
    ['invoiceDigest', { invoiceDigest: 'e'.repeat(64) }],
    ['auditTopicId', { auditTopicId: '0.0.8002' }],
    [
      'authorizationEvidenceHash',
      { authorizationEvidenceHash: 'e'.repeat(64) },
    ],
    [
      'authorizationPrecommitHash',
      { authorizationPrecommitHash: 'e'.repeat(64) },
    ],
    ['payerAccountId', { payerAccountId: '0.0.5999' }],
    ['treasuryAccountId', { treasuryAccountId: '0.0.5998' }],
    ['controlHolderAccountId', { controlHolderAccountId: '0.0.7997' }],
    ['settlementAssetTokenId', { settlementAssetTokenId: '0.0.8001' }],
    ['amountAtoms', { amountAtoms: '25000001' }],
    ['payableTokenId', { payableTokenId: '0.0.6991' }],
    ['payableSerial', { payableSerial: 9 }],
    ['controlTokenId', { controlTokenId: '0.0.6992' }],
    ['controlSerial', { controlSerial: 10 }],
    [
      'outerTransactionId',
      { outerTransactionId: '0.0.5001@1999999990.000000007' },
    ],
    ['batchKey', { batchKey: `03${'e'.repeat(64)}` }],
    ['batchBytes', { batchBytes: 4097 }],
    ['validStartEpochSeconds', { validStartEpochSeconds: NOW - 9 }],
    ['validDurationSeconds', { validDurationSeconds: 119 }],
    [
      'innerTransactionIds',
      {
        innerTransactionIds: [
          '0.0.5001@1999999991.000000001',
          ...transactionIds().slice(1),
        ],
      },
    ],
  ])('detects a post-hash mutation of %s', (_field, override) => {
    expect(() =>
      assertDualTokenSettlementIntent(intent(override), {
        nowEpochSeconds: NOW,
      }),
    ).toThrow('does not bind');
  });

  it('rejects all extra or missing top-level fields', () => {
    const withExtra = { ...intent(), memo: 'not-bound' };
    const missing: Record<string, unknown> = { ...intent() };
    delete missing.controlSerial;
    const missingAuditTopic: Record<string, unknown> = { ...intent() };
    delete missingAuditTopic.auditTopicId;

    expect(() =>
      assertDualTokenSettlementIntent(withExtra, { nowEpochSeconds: NOW }),
    ).toThrow('unexpected or missing fields');
    expect(() =>
      assertDualTokenSettlementIntent(missing, { nowEpochSeconds: NOW }),
    ).toThrow('unexpected or missing fields');
    expect(() =>
      assertDualTokenSettlementIntent(missingAuditTopic, {
        nowEpochSeconds: NOW,
      }),
    ).toThrow('unexpected or missing fields');
    expect(() =>
      computeDualTokenSettlementManifestHash({ ...manifest(), memo: 'x' }),
    ).toThrow('unexpected or missing fields');
  });

  it('hashes both the audit topic and outer transaction ID', () => {
    const originalHash = computeDualTokenSettlementManifestHash(manifest());

    expect(
      computeDualTokenSettlementManifestHash(
        manifest({ auditTopicId: '0.0.8002' }),
      ),
    ).not.toBe(originalHash);
    expect(
      computeDualTokenSettlementManifestHash(
        manifest({
          outerTransactionId: '0.0.5001@1999999990.000000007',
        }),
      ),
    ).not.toBe(originalHash);
  });

  it('rejects non-plain manifest and intent objects', () => {
    expect(() =>
      createDualTokenSettlementIntent(Object.create(manifest())),
    ).toThrow('plain object');
    expect(() =>
      assertDualTokenSettlementIntent([], { nowEpochSeconds: NOW }),
    ).toThrow('plain object');
  });
});
