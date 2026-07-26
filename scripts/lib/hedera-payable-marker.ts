const ACTION_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

export const PAYABLE_MARKER_NAME = 'Remit Payable Markers - NO VALUE';
export const PAYABLE_MARKER_SYMBOL = 'RMPAY';

const MANAGEMENT_KEYS = [
  'admin_key',
  'fee_schedule_key',
  'freeze_key',
  'kyc_key',
  'metadata_key',
  'pause_key',
  'wipe_key',
] as const;

type MarkerPhase = 'BURNED' | 'MINTED';

export interface PayableMarkerExpectation {
  readonly actionDigest: string;
  readonly phase: MarkerPhase;
  readonly serial: number;
  readonly supplyKey: string;
  readonly tokenId: string;
  readonly treasuryAccountId: string;
}

export interface PayableMarkerAudit {
  readonly deleted: boolean;
  readonly maxSupply: string;
  readonly metadata: string;
  readonly totalSupply: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}

function expectEqual(
  errors: string[],
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (actual !== expected) {
    errors.push(`${label} must be ${String(expected)}, got ${String(actual)}`);
  }
}

function expectNoCustomFees(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push('custom_fees must be present in the Mirror response');
    return;
  }

  for (const key of ['fixed_fees', 'royalty_fees']) {
    const fees = field(value, key);
    if (!Array.isArray(fees) || fees.length !== 0) {
      errors.push(`${key} must be empty`);
    }
  }
  const fractionalFees = field(value, 'fractional_fees');
  if (
    fractionalFees !== undefined &&
    (!Array.isArray(fractionalFees) || fractionalFees.length !== 0)
  ) {
    errors.push('fractional_fees must be empty');
  }
}

export function payableMarkerMetadata(actionDigest: string): Buffer {
  if (!ACTION_DIGEST_PATTERN.test(actionDigest)) {
    throw new Error(
      'payable marker metadata must be a lowercase SHA-256 action digest',
    );
  }

  const metadata = Buffer.from(actionDigest, 'ascii');
  if (metadata.byteLength > 100) {
    throw new Error('payable marker metadata exceeds the HTS 100-byte limit');
  }
  return metadata;
}

export function auditPayableMarkerSnapshot(
  rawToken: unknown,
  rawNft: unknown,
  expected: PayableMarkerExpectation,
): PayableMarkerAudit {
  const errors: string[] = [];
  if (!isRecord(rawToken)) {
    throw new Error('Mirror token response must be an object');
  }
  if (!isRecord(rawNft)) {
    throw new Error('Mirror NFT response must be an object');
  }

  expectEqual(
    errors,
    field(rawToken, 'token_id'),
    expected.tokenId,
    'token_id',
  );
  expectEqual(errors, field(rawToken, 'name'), PAYABLE_MARKER_NAME, 'name');
  expectEqual(
    errors,
    field(rawToken, 'symbol'),
    PAYABLE_MARKER_SYMBOL,
    'symbol',
  );
  expectEqual(errors, field(rawToken, 'type'), 'NON_FUNGIBLE_UNIQUE', 'type');
  expectEqual(errors, field(rawToken, 'decimals'), '0', 'decimals');
  expectEqual(errors, field(rawToken, 'initial_supply'), '0', 'initial_supply');
  expectEqual(errors, field(rawToken, 'supply_type'), 'FINITE', 'supply_type');
  expectEqual(errors, field(rawToken, 'max_supply'), '1', 'max_supply');
  expectEqual(
    errors,
    field(rawToken, 'treasury_account_id'),
    expected.treasuryAccountId,
    'treasury_account_id',
  );
  expectEqual(errors, field(rawToken, 'deleted'), false, 'token deleted');
  expectEqual(
    errors,
    field(rawToken, 'freeze_default'),
    false,
    'freeze_default',
  );

  const supplyKey = field(rawToken, 'supply_key');
  if (!isRecord(supplyKey)) {
    errors.push('supply_key must be present');
  } else {
    expectEqual(
      errors,
      field(supplyKey, '_type'),
      'ECDSA_SECP256K1',
      'supply_key type',
    );
    expectEqual(
      errors,
      field(supplyKey, 'key'),
      expected.supplyKey,
      'supply_key',
    );
  }
  for (const key of MANAGEMENT_KEYS) {
    if (field(rawToken, key) !== null) {
      errors.push(`${key} must be absent`);
    }
  }
  expectNoCustomFees(errors, field(rawToken, 'custom_fees'));

  const burned = expected.phase === 'BURNED';
  const expectedSupply = burned ? '0' : '1';
  expectEqual(
    errors,
    field(rawToken, 'total_supply'),
    expectedSupply,
    'total_supply',
  );
  expectEqual(
    errors,
    field(rawNft, 'token_id'),
    expected.tokenId,
    'NFT token_id',
  );
  expectEqual(
    errors,
    field(rawNft, 'serial_number'),
    expected.serial,
    'serial_number',
  );
  expectEqual(errors, field(rawNft, 'deleted'), burned, 'NFT deleted');
  expectEqual(
    errors,
    field(rawNft, 'account_id'),
    burned ? null : expected.treasuryAccountId,
    'NFT account_id',
  );

  const encodedMetadata = field(rawNft, 'metadata');
  const metadata =
    typeof encodedMetadata === 'string'
      ? Buffer.from(encodedMetadata, 'base64').toString('ascii')
      : '';
  expectEqual(errors, metadata, expected.actionDigest, 'NFT metadata');

  if (errors.length > 0) {
    throw new Error(`unsafe payable marker: ${errors.join('; ')}`);
  }

  return {
    deleted: burned,
    maxSupply: '1',
    metadata,
    totalSupply: expectedSupply,
  };
}
