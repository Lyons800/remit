import { createHash } from 'node:crypto';

export const DUAL_TOKEN_SETTLEMENT_SCHEMA =
  'hedera-dual-token-settlement-intent.v2';
export const DUAL_TOKEN_SETTLEMENT_NETWORK = 'hedera:296';
export const DUAL_TOKEN_SETTLEMENT_MANIFEST_DOMAIN =
  'remit:hedera-dual-token-settlement-manifest:v2';
export const DUAL_TOKEN_BATCH_MAX_BYTES = 6144;
export const DUAL_TOKEN_BATCH_MAX_VALIDITY_SECONDS = 120;
export const DUAL_TOKEN_BATCH_MAX_FUTURE_SKEW_SECONDS = 15;

export const DUAL_TOKEN_SETTLEMENT_OPERATIONS = [
  'CONTROL_UNFREEZE',
  'ATOMIC_TRANSFER',
  'PAYABLE_BURN',
  'CONTROL_BURN',
  'HCS_SETTLEMENT_COMMITMENT',
] as const;

export type DualTokenSettlementOperation =
  (typeof DUAL_TOKEN_SETTLEMENT_OPERATIONS)[number];

export interface DualTokenSettlementManifestV2 {
  readonly actionBeneficiaryAccountId: string;
  readonly actionDigest: string;
  readonly amountAtoms: string;
  readonly auditTopicId: string;
  readonly authorizationEvidenceHash: string;
  readonly authorizationPrecommitHash: string;
  readonly batchBytes: number;
  readonly batchKey: string;
  readonly controlHolderAccountId: string;
  readonly controlSerial: number;
  readonly controlTokenId: string;
  readonly innerTransactionIds: readonly [
    string,
    string,
    string,
    string,
    string,
  ];
  readonly invoiceDigest: string;
  readonly network: typeof DUAL_TOKEN_SETTLEMENT_NETWORK;
  readonly operations: typeof DUAL_TOKEN_SETTLEMENT_OPERATIONS;
  readonly outerTransactionId: string;
  readonly payableHolderAccountId: string;
  readonly payableSerial: number;
  readonly payableTokenId: string;
  readonly payerAccountId: string;
  readonly schemaVersion: typeof DUAL_TOKEN_SETTLEMENT_SCHEMA;
  readonly settlementAssetTokenId: string;
  readonly treasuryAccountId: string;
  readonly validDurationSeconds: number;
  readonly validStartEpochSeconds: number;
}

export interface DualTokenSettlementIntentV2 extends DualTokenSettlementManifestV2 {
  readonly manifestHash: string;
}

export interface DualTokenSettlementFreshnessOptions {
  readonly nowEpochSeconds?: number;
}

const MANIFEST_FIELDS = [
  'actionBeneficiaryAccountId',
  'actionDigest',
  'amountAtoms',
  'auditTopicId',
  'authorizationEvidenceHash',
  'authorizationPrecommitHash',
  'batchBytes',
  'batchKey',
  'controlHolderAccountId',
  'controlSerial',
  'controlTokenId',
  'innerTransactionIds',
  'invoiceDigest',
  'network',
  'operations',
  'outerTransactionId',
  'payableHolderAccountId',
  'payableSerial',
  'payableTokenId',
  'payerAccountId',
  'schemaVersion',
  'settlementAssetTokenId',
  'treasuryAccountId',
  'validDurationSeconds',
  'validStartEpochSeconds',
] as const;

const INTENT_FIELDS = [...MANIFEST_FIELDS, 'manifestHash'] as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ENTITY_ID_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/u;
const TRANSACTION_ID_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)@[1-9][0-9]*\.[0-9]{9}$/u;
const COMPRESSED_ECDSA_KEY_PATTERN = /^(?:02|03)[0-9a-f]{64}$/u;
const MAX_SIGNED_INT64 = 9_223_372_036_854_775_807n;

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function assertExactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    throw new TypeError(`${label} contains unexpected or missing fields.`);
  }
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(
      `${label} must be a lowercase, unprefixed SHA-256 digest.`,
    );
  }
}

function assertEntityId(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || !ENTITY_ID_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a canonical Hedera entity ID.`);
  }
}

function assertPositiveSafeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
}

function assertAmountAtoms(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !POSITIVE_INTEGER_PATTERN.test(value) ||
    BigInt(value) > MAX_SIGNED_INT64
  ) {
    throw new TypeError(
      `${label} must be positive canonical atoms within signed int64.`,
    );
  }
}

function assertBatchKey(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || !COMPRESSED_ECDSA_KEY_PATTERN.test(value)) {
    throw new TypeError(
      `${label} must be a lowercase compressed ECDSA secp256k1 public key.`,
    );
  }
}

function assertOperations(
  value: unknown,
): asserts value is typeof DUAL_TOKEN_SETTLEMENT_OPERATIONS {
  if (
    !Array.isArray(value) ||
    value.length !== DUAL_TOKEN_SETTLEMENT_OPERATIONS.length ||
    value.some(
      (operation, index) =>
        operation !== DUAL_TOKEN_SETTLEMENT_OPERATIONS[index],
    )
  ) {
    throw new TypeError(
      'operations must be the exact ordered dual-token settlement sequence.',
    );
  }
}

function assertInnerTransactionIds(
  value: unknown,
): asserts value is DualTokenSettlementManifestV2['innerTransactionIds'] {
  if (
    !Array.isArray(value) ||
    value.length !== DUAL_TOKEN_SETTLEMENT_OPERATIONS.length
  ) {
    throw new TypeError(
      'innerTransactionIds must contain exactly one ID per operation.',
    );
  }

  for (const [index, transactionId] of value.entries()) {
    if (
      typeof transactionId !== 'string' ||
      !TRANSACTION_ID_PATTERN.test(transactionId)
    ) {
      throw new TypeError(
        `innerTransactionIds[${String(index)}] must be a canonical Hedera transaction ID.`,
      );
    }
  }
  if (new Set(value).size !== value.length) {
    throw new TypeError('innerTransactionIds must be unique.');
  }
}

function parseManifest(
  value: unknown,
  label: string,
): DualTokenSettlementManifestV2 {
  assertRecord(value, label);
  assertExactFields(value, MANIFEST_FIELDS, label);

  if (value.schemaVersion !== DUAL_TOKEN_SETTLEMENT_SCHEMA) {
    throw new TypeError(
      `schemaVersion must be ${DUAL_TOKEN_SETTLEMENT_SCHEMA}.`,
    );
  }
  if (value.network !== DUAL_TOKEN_SETTLEMENT_NETWORK) {
    throw new TypeError(`network must be ${DUAL_TOKEN_SETTLEMENT_NETWORK}.`);
  }

  assertDigest(value.actionDigest, 'actionDigest');
  assertDigest(value.invoiceDigest, 'invoiceDigest');
  assertDigest(value.authorizationEvidenceHash, 'authorizationEvidenceHash');
  assertDigest(value.authorizationPrecommitHash, 'authorizationPrecommitHash');

  assertEntityId(value.auditTopicId, 'auditTopicId');
  assertEntityId(value.payerAccountId, 'payerAccountId');
  assertEntityId(value.treasuryAccountId, 'treasuryAccountId');
  assertEntityId(
    value.actionBeneficiaryAccountId,
    'actionBeneficiaryAccountId',
  );
  assertEntityId(value.payableHolderAccountId, 'payableHolderAccountId');
  assertEntityId(value.controlHolderAccountId, 'controlHolderAccountId');
  assertEntityId(value.settlementAssetTokenId, 'settlementAssetTokenId');
  assertEntityId(value.payableTokenId, 'payableTokenId');
  assertEntityId(value.controlTokenId, 'controlTokenId');

  if (value.payableHolderAccountId !== value.actionBeneficiaryAccountId) {
    throw new TypeError(
      'payableHolderAccountId must equal the snapshotted action beneficiary.',
    );
  }

  assertAmountAtoms(value.amountAtoms, 'amountAtoms');
  assertPositiveSafeInteger(value.payableSerial, 'payableSerial');
  assertPositiveSafeInteger(value.controlSerial, 'controlSerial');
  assertOperations(value.operations);
  assertInnerTransactionIds(value.innerTransactionIds);
  if (
    typeof value.outerTransactionId !== 'string' ||
    !TRANSACTION_ID_PATTERN.test(value.outerTransactionId)
  ) {
    throw new TypeError(
      'outerTransactionId must be a canonical Hedera transaction ID.',
    );
  }
  if (value.innerTransactionIds.includes(value.outerTransactionId)) {
    throw new TypeError(
      'outerTransactionId must be unique from every inner transaction ID.',
    );
  }
  assertBatchKey(value.batchKey, 'batchKey');

  assertPositiveSafeInteger(value.batchBytes, 'batchBytes');
  if (value.batchBytes > DUAL_TOKEN_BATCH_MAX_BYTES) {
    throw new TypeError(
      `batchBytes must not exceed ${String(DUAL_TOKEN_BATCH_MAX_BYTES)}.`,
    );
  }

  assertPositiveSafeInteger(
    value.validStartEpochSeconds,
    'validStartEpochSeconds',
  );
  assertPositiveSafeInteger(value.validDurationSeconds, 'validDurationSeconds');
  if (value.validDurationSeconds > DUAL_TOKEN_BATCH_MAX_VALIDITY_SECONDS) {
    throw new TypeError(
      `validDurationSeconds must not exceed ${String(
        DUAL_TOKEN_BATCH_MAX_VALIDITY_SECONDS,
      )}.`,
    );
  }

  return {
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
    operations: DUAL_TOKEN_SETTLEMENT_OPERATIONS,
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
  };
}

function canonicalManifestJson(
  manifest: DualTokenSettlementManifestV2,
): string {
  return JSON.stringify({
    actionBeneficiaryAccountId: manifest.actionBeneficiaryAccountId,
    actionDigest: manifest.actionDigest,
    amountAtoms: manifest.amountAtoms,
    auditTopicId: manifest.auditTopicId,
    authorizationEvidenceHash: manifest.authorizationEvidenceHash,
    authorizationPrecommitHash: manifest.authorizationPrecommitHash,
    batchBytes: manifest.batchBytes,
    batchKey: manifest.batchKey,
    controlHolderAccountId: manifest.controlHolderAccountId,
    controlSerial: manifest.controlSerial,
    controlTokenId: manifest.controlTokenId,
    innerTransactionIds: manifest.innerTransactionIds,
    invoiceDigest: manifest.invoiceDigest,
    network: manifest.network,
    operations: manifest.operations,
    outerTransactionId: manifest.outerTransactionId,
    payableHolderAccountId: manifest.payableHolderAccountId,
    payableSerial: manifest.payableSerial,
    payableTokenId: manifest.payableTokenId,
    payerAccountId: manifest.payerAccountId,
    schemaVersion: manifest.schemaVersion,
    settlementAssetTokenId: manifest.settlementAssetTokenId,
    treasuryAccountId: manifest.treasuryAccountId,
    validDurationSeconds: manifest.validDurationSeconds,
    validStartEpochSeconds: manifest.validStartEpochSeconds,
  });
}

export function computeDualTokenSettlementManifestHash(value: unknown): string {
  const manifest = parseManifest(value, 'dual-token settlement manifest');
  const hash = createHash('sha256');
  hash.update(DUAL_TOKEN_SETTLEMENT_MANIFEST_DOMAIN, 'ascii');
  hash.update(Uint8Array.of(0));
  hash.update(canonicalManifestJson(manifest), 'utf8');
  return hash.digest('hex');
}

export function createDualTokenSettlementIntent(
  value: unknown,
): DualTokenSettlementIntentV2 {
  const manifest = parseManifest(value, 'dual-token settlement manifest');
  return {
    ...manifest,
    manifestHash: computeDualTokenSettlementManifestHash(manifest),
  };
}

function assertNowEpochSeconds(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('nowEpochSeconds must be a positive safe integer.');
  }
}

export function assertDualTokenSettlementIntent(
  value: unknown,
  options: DualTokenSettlementFreshnessOptions = {},
): asserts value is DualTokenSettlementIntentV2 {
  assertRecord(value, 'dual-token settlement intent');
  assertExactFields(value, INTENT_FIELDS, 'dual-token settlement intent');
  assertDigest(value.manifestHash, 'manifestHash');

  const { manifestHash, ...rawManifest } = value;
  const manifest = parseManifest(rawManifest, 'dual-token settlement manifest');
  const expectedHash = computeDualTokenSettlementManifestHash(manifest);
  if (manifestHash !== expectedHash) {
    throw new TypeError('manifestHash does not bind the canonical manifest.');
  }

  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  assertNowEpochSeconds(nowEpochSeconds);
  if (
    manifest.validStartEpochSeconds >
    nowEpochSeconds + DUAL_TOKEN_BATCH_MAX_FUTURE_SKEW_SECONDS
  ) {
    throw new TypeError('dual-token settlement intent starts too far ahead.');
  }
  if (
    manifest.validStartEpochSeconds + manifest.validDurationSeconds <=
    nowEpochSeconds
  ) {
    throw new TypeError('dual-token settlement intent is stale.');
  }
}
