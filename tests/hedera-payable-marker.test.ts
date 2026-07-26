import { describe, expect, it } from 'vitest';

import {
  auditPayableMarkerSnapshot,
  payableMarkerMetadata,
  PAYABLE_MARKER_NAME,
  PAYABLE_MARKER_SYMBOL,
  type PayableMarkerExpectation,
} from '../scripts/lib/hedera-payable-marker.js';

const DIGEST = 'a'.repeat(64);
const EXPECTED = {
  actionDigest: DIGEST,
  phase: 'MINTED',
  serial: 1,
  supplyKey: 'public-key',
  tokenId: '0.0.1234',
  treasuryAccountId: '0.0.5678',
} as const satisfies PayableMarkerExpectation;

function token(overrides: Record<string, unknown> = {}): unknown {
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
    freeze_default: false,
    freeze_key: null,
    initial_supply: '0',
    kyc_key: null,
    max_supply: '1',
    metadata_key: null,
    name: PAYABLE_MARKER_NAME,
    pause_key: null,
    supply_key: { _type: 'ECDSA_SECP256K1', key: 'public-key' },
    supply_type: 'FINITE',
    symbol: PAYABLE_MARKER_SYMBOL,
    token_id: EXPECTED.tokenId,
    total_supply: '1',
    treasury_account_id: EXPECTED.treasuryAccountId,
    type: 'NON_FUNGIBLE_UNIQUE',
    wipe_key: null,
    ...overrides,
  };
}

function nft(overrides: Record<string, unknown> = {}): unknown {
  return {
    account_id: EXPECTED.treasuryAccountId,
    deleted: false,
    metadata: Buffer.from(DIGEST, 'ascii').toString('base64'),
    serial_number: EXPECTED.serial,
    token_id: EXPECTED.tokenId,
    ...overrides,
  };
}

describe('Hedera payable marker', () => {
  it('encodes only the canonical action digest within the HTS limit', () => {
    const metadata = payableMarkerMetadata(DIGEST);

    expect(metadata.toString('ascii')).toBe(DIGEST);
    expect(metadata.byteLength).toBe(64);
  });

  it.each(['A'.repeat(64), `0x${DIGEST}`, `sha256:${DIGEST}`, 'invoice-123'])(
    'rejects non-canonical public metadata: %s',
    (candidate) => {
      expect(() => payableMarkerMetadata(candidate)).toThrow(
        'lowercase SHA-256 action digest',
      );
    },
  );

  it('admits a sealed, treasury-held marker after mint', () => {
    expect(auditPayableMarkerSnapshot(token(), nft(), EXPECTED)).toEqual({
      deleted: false,
      maxSupply: '1',
      metadata: DIGEST,
      totalSupply: '1',
    });
  });

  it('admits retained metadata and zero supply after burn', () => {
    const expected = { ...EXPECTED, phase: 'BURNED' } as const;

    expect(
      auditPayableMarkerSnapshot(
        token({ total_supply: '0' }),
        nft({ account_id: null, deleted: true }),
        expected,
      ),
    ).toEqual({
      deleted: true,
      maxSupply: '1',
      metadata: DIGEST,
      totalSupply: '0',
    });
  });

  it.each([
    ['an admin key', { admin_key: { key: 'admin' } }],
    [
      'a different supply key',
      {
        supply_key: {
          _type: 'ECDSA_SECP256K1',
          key: 'different-public-key',
        },
      },
    ],
    ['a wipe key', { wipe_key: { key: 'wipe' } }],
    ['an infinite supply', { max_supply: '0', supply_type: 'INFINITE' }],
    [
      'a royalty fee',
      {
        custom_fees: {
          created_timestamp: '1.000000001',
          fixed_fees: [],
          royalty_fees: [{ amount: { denominator: 10, numerator: 1 } }],
        },
      },
    ],
  ])('refuses a marker configured with %s', (_label, override) => {
    expect(() =>
      auditPayableMarkerSnapshot(token(override), nft(), EXPECTED),
    ).toThrow('unsafe payable marker');
  });

  it('refuses metadata for a different payment action', () => {
    expect(() =>
      auditPayableMarkerSnapshot(
        token(),
        nft({ metadata: Buffer.from('b'.repeat(64)).toString('base64') }),
        EXPECTED,
      ),
    ).toThrow('NFT metadata');
  });
});
