import { describe, expect, it } from 'vitest';

import {
  auditControlTokenSnapshot,
  auditPayableTokenSnapshot,
  CONTROL_TOKEN_NAME,
  CONTROL_TOKEN_SYMBOL,
  decodeControlTokenMetadata,
  decodePayableTokenMetadata,
  DUAL_TOKEN_METADATA_BYTES,
  encodeControlTokenMetadata,
  encodePayableTokenMetadata,
  PAYABLE_TOKEN_NAME,
  PAYABLE_TOKEN_SYMBOL,
  type ControlTokenSnapshotExpectation,
  type DualTokenKeyExpectations,
  type PayableTokenSnapshotExpectation,
} from '../scripts/lib/hedera-dual-token.js';

const ACTION_DIGEST = 'a'.repeat(64);
const INVOICE_DIGEST = 'b'.repeat(64);
const AUTHORIZATION_EVIDENCE_HASH = 'c'.repeat(64);

const KEYS = {
  freeze: { key: 'freeze-public-key', type: 'ECDSA_SECP256K1' },
  kyc: { key: 'kyc-public-key', type: 'ED25519' },
  pause: { key: 'pause-public-key', type: 'ECDSA_SECP256K1' },
  supply: { key: 'supply-public-key', type: 'ED25519' },
} as const satisfies DualTokenKeyExpectations;

const PAYABLE_EXPECTED = {
  keys: KEYS,
  metadata: {
    actionDigest: ACTION_DIGEST,
    invoiceDigest: INVOICE_DIGEST,
    state: 'READY_FOR_SETTLEMENT',
  },
  nft: {
    accountId: '0.0.7001',
    phase: 'ACTIVE',
    serial: 1,
  },
  tokenId: '0.0.6001',
  totalSupply: '1',
  treasuryAccountId: '0.0.5001',
} as const satisfies PayableTokenSnapshotExpectation;

const CONTROL_EXPECTED = {
  keys: KEYS,
  metadata: {
    actionDigest: ACTION_DIGEST,
    authorizationEvidenceHash: AUTHORIZATION_EVIDENCE_HASH,
    state: 'AUTHORIZED',
  },
  nft: {
    accountId: '0.0.7002',
    phase: 'ACTIVE',
    serial: 1,
  },
  tokenId: '0.0.6002',
  totalSupply: '1',
  treasuryAccountId: '0.0.5001',
} as const satisfies ControlTokenSnapshotExpectation;

function token(
  kind: 'CONTROL' | 'PAYABLE',
  overrides: Record<string, unknown> = {},
): unknown {
  const expected = kind === 'PAYABLE' ? PAYABLE_EXPECTED : CONTROL_EXPECTED;
  return {
    admin_key: null,
    custom_fees: {
      created_timestamp: '1.000000001',
      fixed_fees: [],
      royalty_fees: [],
    },
    decimals: '0',
    deleted: false,
    fee_schedule_key: null,
    freeze_default: true,
    freeze_key: {
      _type: KEYS.freeze.type,
      key: KEYS.freeze.key,
    },
    initial_supply: '0',
    kyc_key: { _type: KEYS.kyc.type, key: KEYS.kyc.key },
    max_supply: '1000',
    metadata_key: null,
    name: kind === 'PAYABLE' ? PAYABLE_TOKEN_NAME : CONTROL_TOKEN_NAME,
    pause_key: { _type: KEYS.pause.type, key: KEYS.pause.key },
    supply_key: { _type: KEYS.supply.type, key: KEYS.supply.key },
    supply_type: 'FINITE',
    symbol: kind === 'PAYABLE' ? PAYABLE_TOKEN_SYMBOL : CONTROL_TOKEN_SYMBOL,
    token_id: expected.tokenId,
    total_supply: expected.totalSupply,
    treasury_account_id: expected.treasuryAccountId,
    type: 'NON_FUNGIBLE_UNIQUE',
    wipe_key: null,
    ...overrides,
  };
}

function payableNft(overrides: Record<string, unknown> = {}): unknown {
  return {
    account_id: PAYABLE_EXPECTED.nft.accountId,
    deleted: false,
    metadata: encodePayableTokenMetadata(PAYABLE_EXPECTED.metadata).toString(
      'base64',
    ),
    serial_number: PAYABLE_EXPECTED.nft.serial,
    token_id: PAYABLE_EXPECTED.tokenId,
    ...overrides,
  };
}

function controlNft(overrides: Record<string, unknown> = {}): unknown {
  return {
    account_id: CONTROL_EXPECTED.nft.accountId,
    deleted: false,
    metadata: encodeControlTokenMetadata(CONTROL_EXPECTED.metadata).toString(
      'base64',
    ),
    serial_number: CONTROL_EXPECTED.nft.serial,
    token_id: CONTROL_EXPECTED.tokenId,
    ...overrides,
  };
}

describe('dual-token metadata', () => {
  it('encodes and decodes the exact raw-field-free payable layout', () => {
    const encoded = encodePayableTokenMetadata(PAYABLE_EXPECTED.metadata);

    expect(encoded.byteLength).toBe(DUAL_TOKEN_METADATA_BYTES);
    expect(encoded.byteLength).toBeLessThanOrEqual(100);
    expect([...encoded.subarray(0, 2)]).toEqual([1, 2]);
    expect(encoded.subarray(2, 34).toString('hex')).toBe(INVOICE_DIGEST);
    expect(encoded.subarray(34, 66).toString('hex')).toBe(ACTION_DIGEST);
    expect(decodePayableTokenMetadata(encoded)).toEqual({
      ...PAYABLE_EXPECTED.metadata,
      version: 1,
    });
  });

  it('keeps a mechanics fixture distinguishable from real authorization', () => {
    const encoded = encodeControlTokenMetadata({
      actionDigest: ACTION_DIGEST,
      authorizationEvidenceHash: AUTHORIZATION_EVIDENCE_HASH,
      state: 'MECHANICS_FIXTURE',
    });

    expect(decodeControlTokenMetadata(encoded)).toEqual({
      actionDigest: ACTION_DIGEST,
      authorizationEvidenceHash: AUTHORIZATION_EVIDENCE_HASH,
      state: 'MECHANICS_FIXTURE',
      version: 1,
    });
    expect(encoded[1]).toBe(2);
  });

  it('encodes and decodes the exact action-bound control layout', () => {
    const encoded = encodeControlTokenMetadata(CONTROL_EXPECTED.metadata);

    expect(encoded.byteLength).toBe(DUAL_TOKEN_METADATA_BYTES);
    expect(encoded.byteLength).toBeLessThanOrEqual(100);
    expect([...encoded.subarray(0, 2)]).toEqual([1, 1]);
    expect(encoded.subarray(2, 34).toString('hex')).toBe(ACTION_DIGEST);
    expect(encoded.subarray(34, 66).toString('hex')).toBe(
      AUTHORIZATION_EVIDENCE_HASH,
    );
    expect(decodeControlTokenMetadata(encoded)).toEqual({
      ...CONTROL_EXPECTED.metadata,
      version: 1,
    });
  });

  it.each([
    ['uppercase', 'A'.repeat(64)],
    ['0x-prefixed', `0x${ACTION_DIGEST}`],
    ['short', 'a'.repeat(63)],
    ['long', 'a'.repeat(65)],
    ['non-hex', 'z'.repeat(64)],
  ])('rejects a %s digest', (_label, digest) => {
    expect(() =>
      encodePayableTokenMetadata({
        ...PAYABLE_EXPECTED.metadata,
        invoiceDigest: digest,
      }),
    ).toThrow('lowercase 64-character SHA-256 digest');
    expect(() =>
      encodeControlTokenMetadata({
        ...CONTROL_EXPECTED.metadata,
        authorizationEvidenceHash: digest,
      }),
    ).toThrow('lowercase 64-character SHA-256 digest');
  });

  it('rejects unsupported encode-time lifecycle states at runtime', () => {
    expect(() =>
      encodePayableTokenMetadata({
        ...PAYABLE_EXPECTED.metadata,
        state: 'SETTLED' as 'READY_FOR_SETTLEMENT',
      }),
    ).toThrow('not a supported lifecycle state');
    expect(() =>
      encodeControlTokenMetadata({
        ...CONTROL_EXPECTED.metadata,
        state: 'CONSUMED' as 'AUTHORIZED',
      }),
    ).toThrow('not a supported lifecycle state');
  });

  it.each([
    ['short bytes', Buffer.alloc(65)],
    ['long bytes', Buffer.alloc(67)],
    ['unknown version', Buffer.concat([Buffer.from([2, 2]), Buffer.alloc(64)])],
    [
      'unknown payable state',
      Buffer.concat([Buffer.from([1, 99]), Buffer.alloc(64)]),
    ],
  ])('rejects malformed payable metadata with %s', (_label, metadata) => {
    expect(() => decodePayableTokenMetadata(metadata)).toThrow();
  });

  it.each([
    ['short bytes', Buffer.alloc(65)],
    ['long bytes', Buffer.alloc(67)],
    ['unknown version', Buffer.concat([Buffer.from([2, 1]), Buffer.alloc(64)])],
    [
      'unknown control state',
      Buffer.concat([Buffer.from([1, 99]), Buffer.alloc(64)]),
    ],
  ])('rejects malformed control metadata with %s', (_label, metadata) => {
    expect(() => decodeControlTokenMetadata(metadata)).toThrow();
  });
});

describe('dual-token Mirror snapshot audit', () => {
  it('admits an exact active Payable NFT collection and snapshot', () => {
    expect(
      auditPayableTokenSnapshot(
        token('PAYABLE'),
        payableNft(),
        PAYABLE_EXPECTED,
      ),
    ).toEqual({
      collection: 'PAYABLE',
      deleted: false,
      maxSupply: '1000',
      metadata: { ...PAYABLE_EXPECTED.metadata, version: 1 },
      totalSupply: '1',
    });
  });

  it('admits an exact active Control NFT collection and snapshot', () => {
    expect(
      auditControlTokenSnapshot(
        token('CONTROL'),
        controlNft(),
        CONTROL_EXPECTED,
      ),
    ).toEqual({
      collection: 'CONTROL',
      deleted: false,
      maxSupply: '1000',
      metadata: { ...CONTROL_EXPECTED.metadata, version: 1 },
      totalSupply: '1',
    });
  });

  it('admits burned snapshots only with null ownership and exact supply', () => {
    const payableExpected = {
      ...PAYABLE_EXPECTED,
      nft: { ...PAYABLE_EXPECTED.nft, phase: 'BURNED' },
      totalSupply: '0',
    } as const satisfies PayableTokenSnapshotExpectation;
    const controlExpected = {
      ...CONTROL_EXPECTED,
      nft: { ...CONTROL_EXPECTED.nft, phase: 'BURNED' },
      totalSupply: '0',
    } as const satisfies ControlTokenSnapshotExpectation;

    expect(
      auditPayableTokenSnapshot(
        token('PAYABLE', { total_supply: '0' }),
        payableNft({ account_id: null, deleted: true }),
        payableExpected,
      ).deleted,
    ).toBe(true);
    expect(
      auditControlTokenSnapshot(
        token('CONTROL', { total_supply: '0' }),
        controlNft({ account_id: null, deleted: true }),
        controlExpected,
      ).deleted,
    ).toBe(true);
  });

  it.each([
    ['wrong name', { name: 'Payable' }],
    ['wrong symbol', { symbol: 'PAY' }],
    ['fungible type', { type: 'FUNGIBLE_COMMON' }],
    ['infinite supply', { max_supply: '0', supply_type: 'INFINITE' }],
    ['wrong max supply', { max_supply: '999' }],
    ['wrong treasury', { treasury_account_id: '0.0.9999' }],
    ['default unfrozen', { freeze_default: false }],
    ['admin key', { admin_key: { key: 'admin' } }],
    ['wipe key', { wipe_key: { key: 'wipe' } }],
    ['fee schedule key', { fee_schedule_key: { key: 'fees' } }],
    ['metadata key', { metadata_key: { key: 'metadata' } }],
    ['missing supply key', { supply_key: null }],
    [
      'wrong supply key type',
      { supply_key: { _type: 'ECDSA_SECP256K1', key: KEYS.supply.key } },
    ],
    [
      'wrong freeze key',
      { freeze_key: { _type: KEYS.freeze.type, key: 'other' } },
    ],
    ['missing KYC key', { kyc_key: null }],
    ['missing pause key', { pause_key: null }],
    [
      'fixed fee',
      {
        custom_fees: {
          fixed_fees: [{ amount: 1 }],
          royalty_fees: [],
        },
      },
    ],
    [
      'fractional fee',
      {
        custom_fees: {
          fixed_fees: [],
          fractional_fees: [{ amount: 1 }],
          royalty_fees: [],
        },
      },
    ],
    [
      'royalty fee',
      {
        custom_fees: {
          fixed_fees: [],
          royalty_fees: [{ numerator: 1 }],
        },
      },
    ],
  ])('rejects unsafe exact token configuration: %s', (_label, override) => {
    expect(() =>
      auditPayableTokenSnapshot(
        token('PAYABLE', override),
        payableNft(),
        PAYABLE_EXPECTED,
      ),
    ).toThrow('unsafe payable token');
  });

  it.each([
    ['wrong token', { token_id: '0.0.9999' }],
    ['wrong serial', { serial_number: 2 }],
    ['wrong holder', { account_id: '0.0.9999' }],
    ['premature deletion', { account_id: null, deleted: true }],
    ['missing metadata', { metadata: null }],
    ['non-canonical base64', { metadata: '====' }],
    [
      'wrong action digest',
      {
        metadata: encodeControlTokenMetadata({
          ...CONTROL_EXPECTED.metadata,
          actionDigest: 'd'.repeat(64),
        }).toString('base64'),
      },
    ],
    [
      'wrong evidence hash',
      {
        metadata: encodeControlTokenMetadata({
          ...CONTROL_EXPECTED.metadata,
          authorizationEvidenceHash: 'd'.repeat(64),
        }).toString('base64'),
      },
    ],
  ])('rejects an unsafe Control NFT snapshot: %s', (_label, override) => {
    expect(() =>
      auditControlTokenSnapshot(
        token('CONTROL'),
        controlNft(override),
        CONTROL_EXPECTED,
      ),
    ).toThrow('unsafe control token');
  });

  it('rejects a Payable NFT bound to a different invoice', () => {
    expect(() =>
      auditPayableTokenSnapshot(
        token('PAYABLE'),
        payableNft({
          metadata: encodePayableTokenMetadata({
            ...PAYABLE_EXPECTED.metadata,
            invoiceDigest: 'd'.repeat(64),
          }).toString('base64'),
        }),
        PAYABLE_EXPECTED,
      ),
    ).toThrow('NFT invoiceDigest');
  });

  it('rejects a burned phase whose NFT still has an owner', () => {
    const expected = {
      ...CONTROL_EXPECTED,
      nft: { ...CONTROL_EXPECTED.nft, phase: 'BURNED' },
      totalSupply: '0',
    } as const satisfies ControlTokenSnapshotExpectation;

    expect(() =>
      auditControlTokenSnapshot(
        token('CONTROL', { total_supply: '0' }),
        controlNft({ deleted: true }),
        expected,
      ),
    ).toThrow('NFT account_id');
  });

  it.each([
    [
      'serial',
      { ...PAYABLE_EXPECTED, nft: { ...PAYABLE_EXPECTED.nft, serial: 0 } },
    ],
    ['supply', { ...PAYABLE_EXPECTED, totalSupply: '01' }],
  ])(
    'rejects an invalid expected %s before trusting Mirror data',
    (_label, expected) => {
      expect(() =>
        auditPayableTokenSnapshot(
          token('PAYABLE'),
          payableNft(),
          expected as PayableTokenSnapshotExpectation,
        ),
      ).toThrow();
    },
  );
});
