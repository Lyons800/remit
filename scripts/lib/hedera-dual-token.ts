const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/u;
const CANONICAL_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export const DUAL_TOKEN_METADATA_VERSION = 1;
export const DUAL_TOKEN_METADATA_BYTES = 66;
export const DUAL_TOKEN_MAX_SUPPLY = '1000';

export const PAYABLE_TOKEN_NAME = 'Remit Synthetic Payables - TESTNET';
export const PAYABLE_TOKEN_SYMBOL = 'RMPAY';
export const CONTROL_TOKEN_NAME = 'Remit Settlement Controls - TESTNET';
export const CONTROL_TOKEN_SYMBOL = 'RMCTL';

export const PAYABLE_TOKEN_CONFIG = {
  defaultFreeze: true,
  maxSupply: 1000,
  name: PAYABLE_TOKEN_NAME,
  symbol: PAYABLE_TOKEN_SYMBOL,
} as const;

export const CONTROL_TOKEN_CONFIG = {
  defaultFreeze: true,
  maxSupply: 1000,
  name: CONTROL_TOKEN_NAME,
  symbol: CONTROL_TOKEN_SYMBOL,
} as const;

export const PAYABLE_LIFECYCLE_STATES = {
  ISSUED: 1,
  READY_FOR_SETTLEMENT: 2,
} as const;

export const CONTROL_LIFECYCLE_STATES = {
  AUTHORIZED: 1,
  MECHANICS_FIXTURE: 2,
} as const;

export type PayableLifecycleState = keyof typeof PAYABLE_LIFECYCLE_STATES;
export type ControlLifecycleState = keyof typeof CONTROL_LIFECYCLE_STATES;
export type DualTokenNftPhase = 'ACTIVE' | 'BURNED';
export type HederaKeyType = 'ECDSA_SECP256K1' | 'ED25519';

export interface PayableTokenMetadata {
  readonly actionDigest: string;
  readonly invoiceDigest: string;
  readonly state: PayableLifecycleState;
  readonly version: typeof DUAL_TOKEN_METADATA_VERSION;
}

export interface ControlTokenMetadata {
  readonly actionDigest: string;
  readonly authorizationEvidenceHash: string;
  readonly state: ControlLifecycleState;
  readonly version: typeof DUAL_TOKEN_METADATA_VERSION;
}

export interface HederaKeyExpectation {
  readonly key: string;
  readonly type: HederaKeyType;
}

export interface DualTokenKeyExpectations {
  readonly freeze: HederaKeyExpectation;
  readonly kyc: HederaKeyExpectation;
  readonly pause: HederaKeyExpectation;
  readonly supply: HederaKeyExpectation;
}

interface NftSnapshotExpectation {
  readonly accountId: string;
  readonly phase: DualTokenNftPhase;
  readonly serial: number;
}

interface TokenSnapshotExpectation {
  readonly keys: DualTokenKeyExpectations;
  readonly nft: NftSnapshotExpectation;
  readonly tokenId: string;
  readonly totalSupply: string;
  readonly treasuryAccountId: string;
}

export interface PayableTokenSnapshotExpectation extends TokenSnapshotExpectation {
  readonly metadata: Omit<PayableTokenMetadata, 'version'>;
}

export interface ControlTokenSnapshotExpectation extends TokenSnapshotExpectation {
  readonly metadata: Omit<ControlTokenMetadata, 'version'>;
}

export interface PayableTokenSnapshotAudit {
  readonly collection: 'PAYABLE';
  readonly deleted: boolean;
  readonly maxSupply: typeof DUAL_TOKEN_MAX_SUPPLY;
  readonly metadata: PayableTokenMetadata;
  readonly totalSupply: string;
}

export interface ControlTokenSnapshotAudit {
  readonly collection: 'CONTROL';
  readonly deleted: boolean;
  readonly maxSupply: typeof DUAL_TOKEN_MAX_SUPPLY;
  readonly metadata: ControlTokenMetadata;
  readonly totalSupply: string;
}

interface TokenConfiguration {
  readonly name: string;
  readonly symbol: string;
}

const FORBIDDEN_MANAGEMENT_KEYS = [
  'admin_key',
  'fee_schedule_key',
  'metadata_key',
  'wipe_key',
] as const;

const REQUIRED_MANAGEMENT_KEYS = {
  freeze_key: 'freeze',
  kyc_key: 'kyc',
  pause_key: 'pause',
  supply_key: 'supply',
} as const;

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

function expectDigest(value: string, label: string): void {
  if (!SHA256_HEX_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase 64-character SHA-256 digest`);
  }
}

function lifecycleCode<T extends string>(
  states: Readonly<Record<T, number>>,
  state: T,
  label: string,
): number {
  const code: unknown = states[state];
  if (typeof code !== 'number') {
    throw new Error(`${label} is not a supported lifecycle state`);
  }
  return code;
}

function lifecycleState<T extends string>(
  states: Readonly<Record<T, number>>,
  code: number,
  label: string,
): T {
  const match = Object.entries(states).find(([, value]) => value === code);
  if (match === undefined) {
    throw new Error(`${label} lifecycle state byte is unsupported`);
  }
  return match[0] as T;
}

function encodeMetadata(
  state: number,
  firstDigest: string,
  secondDigest: string,
): Buffer {
  const metadata = Buffer.concat([
    Buffer.from([DUAL_TOKEN_METADATA_VERSION, state]),
    Buffer.from(firstDigest, 'hex'),
    Buffer.from(secondDigest, 'hex'),
  ]);
  if (metadata.byteLength !== DUAL_TOKEN_METADATA_BYTES) {
    throw new Error('dual-token metadata has an invalid encoded length');
  }
  if (metadata.byteLength > 100) {
    throw new Error('dual-token metadata exceeds the HTS 100-byte limit');
  }
  return metadata;
}

function readMetadata(metadata: Uint8Array, label: string): Buffer {
  const value = Buffer.from(metadata);
  if (value.byteLength !== DUAL_TOKEN_METADATA_BYTES) {
    throw new Error(
      `${label} metadata must be exactly ${DUAL_TOKEN_METADATA_BYTES} bytes`,
    );
  }
  if (value[0] !== DUAL_TOKEN_METADATA_VERSION) {
    throw new Error(`${label} metadata version byte is unsupported`);
  }
  return value;
}

export function encodePayableTokenMetadata(
  metadata: Omit<PayableTokenMetadata, 'version'>,
): Buffer {
  expectDigest(metadata.invoiceDigest, 'invoiceDigest');
  expectDigest(metadata.actionDigest, 'actionDigest');
  return encodeMetadata(
    lifecycleCode(PAYABLE_LIFECYCLE_STATES, metadata.state, 'payable token'),
    metadata.invoiceDigest,
    metadata.actionDigest,
  );
}

export function decodePayableTokenMetadata(
  metadata: Uint8Array,
): PayableTokenMetadata {
  const value = readMetadata(metadata, 'payable token');
  return {
    version: DUAL_TOKEN_METADATA_VERSION,
    state: lifecycleState(
      PAYABLE_LIFECYCLE_STATES,
      value[1] ?? -1,
      'payable token',
    ),
    invoiceDigest: value.subarray(2, 34).toString('hex'),
    actionDigest: value.subarray(34, 66).toString('hex'),
  };
}

export function encodeControlTokenMetadata(
  metadata: Omit<ControlTokenMetadata, 'version'>,
): Buffer {
  expectDigest(metadata.actionDigest, 'actionDigest');
  expectDigest(metadata.authorizationEvidenceHash, 'authorizationEvidenceHash');
  return encodeMetadata(
    lifecycleCode(CONTROL_LIFECYCLE_STATES, metadata.state, 'control token'),
    metadata.actionDigest,
    metadata.authorizationEvidenceHash,
  );
}

export function decodeControlTokenMetadata(
  metadata: Uint8Array,
): ControlTokenMetadata {
  const value = readMetadata(metadata, 'control token');
  return {
    version: DUAL_TOKEN_METADATA_VERSION,
    state: lifecycleState(
      CONTROL_LIFECYCLE_STATES,
      value[1] ?? -1,
      'control token',
    ),
    actionDigest: value.subarray(2, 34).toString('hex'),
    authorizationEvidenceHash: value.subarray(34, 66).toString('hex'),
  };
}

export const encodePayableMetadata = encodePayableTokenMetadata;
export const decodePayableMetadata = decodePayableTokenMetadata;
export const encodeControlMetadata = encodeControlTokenMetadata;
export const decodeControlMetadata = decodeControlTokenMetadata;

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

function expectManagementKeys(
  errors: string[],
  rawToken: Record<string, unknown>,
  expected: DualTokenKeyExpectations,
): void {
  for (const [mirrorField, expectedField] of Object.entries(
    REQUIRED_MANAGEMENT_KEYS,
  )) {
    const key = field(rawToken, mirrorField);
    if (!isRecord(key)) {
      errors.push(`${mirrorField} must be present`);
      continue;
    }

    const expectedKey = expected[expectedField];
    expectEqual(
      errors,
      field(key, '_type'),
      expectedKey.type,
      `${mirrorField} type`,
    );
    expectEqual(errors, field(key, 'key'), expectedKey.key, mirrorField);
  }

  for (const key of FORBIDDEN_MANAGEMENT_KEYS) {
    if (field(rawToken, key) !== null) {
      errors.push(`${key} must be absent`);
    }
  }
}

function decodeMirrorMetadata(
  errors: string[],
  value: unknown,
): Buffer | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    !CANONICAL_BASE64_PATTERN.test(value)
  ) {
    errors.push('NFT metadata must be canonical base64');
    return undefined;
  }

  const metadata = Buffer.from(value, 'base64');
  if (metadata.toString('base64') !== value) {
    errors.push('NFT metadata must be canonical base64');
    return undefined;
  }
  return metadata;
}

function auditTokenConfiguration(
  rawToken: unknown,
  expected: TokenSnapshotExpectation,
  configuration: TokenConfiguration,
): { readonly errors: string[]; readonly token: Record<string, unknown> } {
  if (!isRecord(rawToken)) {
    throw new Error('Mirror token response must be an object');
  }

  const errors: string[] = [];
  expectEqual(
    errors,
    field(rawToken, 'token_id'),
    expected.tokenId,
    'token_id',
  );
  expectEqual(errors, field(rawToken, 'name'), configuration.name, 'name');
  expectEqual(
    errors,
    field(rawToken, 'symbol'),
    configuration.symbol,
    'symbol',
  );
  expectEqual(errors, field(rawToken, 'type'), 'NON_FUNGIBLE_UNIQUE', 'type');
  expectEqual(errors, field(rawToken, 'decimals'), '0', 'decimals');
  expectEqual(errors, field(rawToken, 'initial_supply'), '0', 'initial_supply');
  expectEqual(errors, field(rawToken, 'supply_type'), 'FINITE', 'supply_type');
  expectEqual(
    errors,
    field(rawToken, 'max_supply'),
    DUAL_TOKEN_MAX_SUPPLY,
    'max_supply',
  );
  expectEqual(
    errors,
    field(rawToken, 'total_supply'),
    expected.totalSupply,
    'total_supply',
  );
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
    true,
    'freeze_default',
  );
  expectManagementKeys(errors, rawToken, expected.keys);
  expectNoCustomFees(errors, field(rawToken, 'custom_fees'));

  return { errors, token: rawToken };
}

function auditNftSnapshot(
  rawNft: unknown,
  expected: TokenSnapshotExpectation,
  errors: string[],
): Buffer | undefined {
  if (!isRecord(rawNft)) {
    throw new Error('Mirror NFT response must be an object');
  }

  const burned = expected.nft.phase === 'BURNED';
  expectEqual(
    errors,
    field(rawNft, 'token_id'),
    expected.tokenId,
    'NFT token_id',
  );
  expectEqual(
    errors,
    field(rawNft, 'serial_number'),
    expected.nft.serial,
    'NFT serial_number',
  );
  expectEqual(errors, field(rawNft, 'deleted'), burned, 'NFT deleted');
  expectEqual(
    errors,
    field(rawNft, 'account_id'),
    burned ? null : expected.nft.accountId,
    'NFT account_id',
  );
  return decodeMirrorMetadata(errors, field(rawNft, 'metadata'));
}

function expectExpectedSnapshot(expected: TokenSnapshotExpectation): void {
  if (!Number.isSafeInteger(expected.nft.serial) || expected.nft.serial <= 0) {
    throw new Error('expected NFT serial must be a positive safe integer');
  }
  if (!NON_NEGATIVE_INTEGER_PATTERN.test(expected.totalSupply)) {
    throw new Error('expected totalSupply must be a canonical integer string');
  }
}

function throwUnsafe(collection: string, errors: readonly string[]): void {
  if (errors.length > 0) {
    throw new Error(`unsafe ${collection} token: ${errors.join('; ')}`);
  }
}

export function auditPayableTokenSnapshot(
  rawToken: unknown,
  rawNft: unknown,
  expected: PayableTokenSnapshotExpectation,
): PayableTokenSnapshotAudit {
  expectExpectedSnapshot(expected);
  const { errors } = auditTokenConfiguration(rawToken, expected, {
    name: PAYABLE_TOKEN_NAME,
    symbol: PAYABLE_TOKEN_SYMBOL,
  });
  const encodedMetadata = auditNftSnapshot(rawNft, expected, errors);
  let metadata: PayableTokenMetadata | undefined;
  if (encodedMetadata !== undefined) {
    try {
      metadata = decodePayableTokenMetadata(encodedMetadata);
      expectEqual(
        errors,
        metadata.invoiceDigest,
        expected.metadata.invoiceDigest,
        'NFT invoiceDigest',
      );
      expectEqual(
        errors,
        metadata.actionDigest,
        expected.metadata.actionDigest,
        'NFT actionDigest',
      );
      expectEqual(
        errors,
        metadata.state,
        expected.metadata.state,
        'NFT lifecycle state',
      );
    } catch (error) {
      errors.push(
        `NFT metadata is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  throwUnsafe('payable', errors);
  if (metadata === undefined) {
    throw new Error('unsafe payable token: NFT metadata is unavailable');
  }
  return {
    collection: 'PAYABLE',
    deleted: expected.nft.phase === 'BURNED',
    maxSupply: DUAL_TOKEN_MAX_SUPPLY,
    metadata,
    totalSupply: expected.totalSupply,
  };
}

export function auditControlTokenSnapshot(
  rawToken: unknown,
  rawNft: unknown,
  expected: ControlTokenSnapshotExpectation,
): ControlTokenSnapshotAudit {
  expectExpectedSnapshot(expected);
  const { errors } = auditTokenConfiguration(rawToken, expected, {
    name: CONTROL_TOKEN_NAME,
    symbol: CONTROL_TOKEN_SYMBOL,
  });
  const encodedMetadata = auditNftSnapshot(rawNft, expected, errors);
  let metadata: ControlTokenMetadata | undefined;
  if (encodedMetadata !== undefined) {
    try {
      metadata = decodeControlTokenMetadata(encodedMetadata);
      expectEqual(
        errors,
        metadata.actionDigest,
        expected.metadata.actionDigest,
        'NFT actionDigest',
      );
      expectEqual(
        errors,
        metadata.authorizationEvidenceHash,
        expected.metadata.authorizationEvidenceHash,
        'NFT authorizationEvidenceHash',
      );
      expectEqual(
        errors,
        metadata.state,
        expected.metadata.state,
        'NFT lifecycle state',
      );
    } catch (error) {
      errors.push(
        `NFT metadata is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  throwUnsafe('control', errors);
  if (metadata === undefined) {
    throw new Error('unsafe control token: NFT metadata is unavailable');
  }
  return {
    collection: 'CONTROL',
    deleted: expected.nft.phase === 'BURNED',
    maxSupply: DUAL_TOKEN_MAX_SUPPLY,
    metadata,
    totalSupply: expected.totalSupply,
  };
}
