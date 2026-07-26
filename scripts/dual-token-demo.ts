/**
 * Experimental Hedera Testnet proof for ADR 0011.
 *
 * This is deliberately separate from the conservative `pnpm demo` path:
 *
 * - RMPAY is a synthetic Testnet claim artifact, not an invoice or legal
 *   assignment of a receivable.
 * - RMCTL is a no-value execution-control artifact, not payment authority.
 * - a sealed no-value HTS token represents synthetic EUR cents; HBAR is used
 *   only for network fees.
 * - deterministic authorization remains authoritative. Token ownership never
 *   authorizes or redirects a payment.
 * - the in-batch HCS message is a settlement commitment. The receipt-bound
 *   execution event is necessarily submitted after consensus.
 *
 * Usage:
 *   pnpm demo:dual-token -- --offline
 *   pnpm demo:dual-token
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { digestCanonicalValue, digestDomains } from '@remit/protocol/hashing';
import { paymentActionCoreV1Schema } from '@remit/protocol';
import {
  AccountBalanceQuery,
  AccountId,
  BatchTransaction,
  Client,
  NftId,
  PrivateKey,
  ReceiptStatusError,
  Status,
  TokenAssociateTransaction,
  TokenBurnTransaction,
  TokenCreateTransaction,
  TokenFreezeTransaction,
  TokenGrantKycTransaction,
  TokenId,
  TokenMintTransaction,
  TokenSupplyType,
  TokenType,
  TokenUnfreezeTransaction,
  TokenUpdateNftsTransaction,
  TopicCreateTransaction,
  TopicInfoQuery,
  TopicMessageSubmitTransaction,
  TransactionId,
  TransactionReceiptQuery,
  TransferTransaction,
  type Transaction,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';

import {
  auditControlTokenSnapshot,
  auditPayableTokenSnapshot,
  CONTROL_TOKEN_CONFIG,
  encodeControlMetadata,
  encodePayableMetadata,
  PAYABLE_TOKEN_CONFIG,
  type ControlTokenSnapshotExpectation,
  type DualTokenKeyExpectations,
  type PayableTokenSnapshotExpectation,
} from './lib/hedera-dual-token.js';
import {
  assertDualTokenSettlementIntent,
  createDualTokenSettlementIntent,
  DUAL_TOKEN_SETTLEMENT_OPERATIONS,
  type DualTokenSettlementIntentV2,
} from './lib/hedera-dual-token-guard.js';
import {
  dualTokenCommitmentMessage,
  DUAL_TOKEN_COMMITMENT_AUTHORITY_MODE,
  DUAL_TOKEN_COMMITMENT_EVENT,
  verifyDualTokenWireBatch,
} from './lib/hedera-dual-token-wire-verifier.js';
import { routineAction } from './lib/demo-fixture.js';

const OFFLINE = process.argv.includes('--offline');
const MIRROR_POLL_MS = 1_500;
const MIRROR_TIMEOUT_MS = 45_000;
const BATCH_SIZE_LIMIT = 6_144;
const SETTLEMENT_AMOUNT_ATOMS = 48_000;
const SETTLEMENT_DECIMALS = 2;
const SETTLEMENT_TOKEN_NAME = 'Remit Synthetic EUR - TESTNET NO VALUE';
const SETTLEMENT_TOKEN_SYMBOL = 'RMEURT';
const AUTHORITY_MODE = DUAL_TOKEN_COMMITMENT_AUTHORITY_MODE;
const COMMITMENT_EVENT = DUAL_TOKEN_COMMITMENT_EVENT;
const EXECUTION_EVENT = 'mechanics-execution.v2';

const C = {
  bold: (value: string) => `[1m${value}[0m`,
  cyan: (value: string) => `[36m${value}[0m`,
  dim: (value: string) => `[2m${value}[0m`,
  green: (value: string) => `[32m${value}[0m`,
  red: (value: string) => `[31m${value}[0m`,
  yellow: (value: string) => `[33m${value}[0m`,
};

const step = (value: string): void => console.log(`  ${value}`);
const pass = (value: string): void => console.log(`  ${C.green('✓')} ${value}`);
const heading = (value: string): void =>
  console.log(`\n${C.bold(`── ${value}`)}\n`);

interface Environment {
  readonly claimantAccountId: string;
  readonly claimantKey: PrivateKey;
  readonly controlAccountId: string;
  readonly controlKey: PrivateKey;
  readonly mirrorApi: string;
  readonly operatorAccountId: string;
  readonly operatorKey: PrivateKey;
}

interface RoleKeys {
  readonly freeze: PrivateKey;
  readonly kyc: PrivateKey;
  readonly pause: PrivateKey;
  readonly supply: PrivateKey;
}

interface Collection {
  readonly id: string;
  readonly keys: RoleKeys;
  readonly serial: number;
}

interface NetworkResponse {
  readonly receipt: TransactionReceipt;
  readonly response: TransactionResponse;
}

interface MirrorMessage {
  readonly consensus_timestamp?: string;
  readonly message?: string;
  readonly sequence_number?: number;
}

interface MirrorMessagesPage {
  readonly messages?: MirrorMessage[];
}

interface MirrorTransaction {
  readonly consensus_timestamp?: string;
  readonly name?: string;
  readonly parent_consensus_timestamp?: string | null;
  readonly result?: string;
  readonly transaction_id?: string;
}

interface MirrorTransactionsPage {
  readonly transactions?: MirrorTransaction[];
}

interface BuiltBatch {
  readonly batch: BatchTransaction;
  readonly bytes: Uint8Array;
  readonly intent: DualTokenSettlementIntentV2;
  readonly innerTransactionIds: readonly string[];
  readonly manifestHash: string;
  readonly outerTransactionId: string;
  readonly wireBytes: number;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalEvent(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function hashscan(transactionId: string): string {
  return `https://hashscan.io/testnet/transaction/${transactionId
    .replace('@', '-')
    .replace(/\.(\d{9})$/u, '-$1')}`;
}

function mirrorTransactionId(transactionId: string): string {
  return transactionId.replace('@', '-').replace(/\.(\d{9})$/u, '-$1');
}

function uuidV7(): string {
  const timestamp = BigInt(Date.now());
  const random = randomBytes(10);
  const timeHex = timestamp.toString(16).padStart(12, '0').slice(-12);
  random[0] = ((random[0] ?? 0) & 0x0f) | 0x70;
  random[2] = ((random[2] ?? 0) & 0x3f) | 0x80;
  const randomHex = random.toString('hex');
  return `${timeHex.slice(0, 8)}-${timeHex.slice(8)}-${randomHex.slice(
    0,
    4,
  )}-${randomHex.slice(4, 8)}-${randomHex.slice(8, 20)}`;
}

function parseEnvFile(): Record<string, string> {
  const path = resolve(
    process.env.REMIT_ENV_FILE ?? resolve(process.cwd(), '.env.local'),
  );
  try {
    const values: Record<string, string> = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator > 0) {
        values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
      }
    }
    return values;
  } catch {
    return {};
  }
}

function privateKey(value: string): PrivateKey {
  const normalized = value.replace(/^0x/u, '');
  if (/^[0-9a-fA-F]{64}$/u.test(normalized)) {
    return PrivateKey.fromStringECDSA(normalized);
  }
  try {
    return PrivateKey.fromStringDer(normalized);
  } catch {
    throw new Error(
      'a configured Hedera private key is neither raw ECDSA nor DER',
    );
  }
}

function environment(): Environment {
  const file = parseEnvFile();
  const need = (key: string): string => {
    const value = process.env[key] ?? file[key];
    if (value === undefined || value === '') {
      throw new Error(`missing ${key}`);
    }
    return value;
  };
  const mirrorBase =
    process.env.HEDERA_MIRROR_BASE_URL ??
    file.HEDERA_MIRROR_BASE_URL ??
    'https://testnet.mirrornode.hedera.com';
  return {
    claimantAccountId: need('HEDERA_SERVICE_ACCOUNT_ID'),
    claimantKey: privateKey(need('HEDERA_SERVICE_ACCOUNT_KEY')),
    controlAccountId: need('HEDERA_FACILITATOR_ACCOUNT_ID'),
    controlKey: privateKey(need('HEDERA_FACILITATOR_KEY')),
    mirrorApi: `${mirrorBase.replace(/\/+$/u, '')}/api/v1`,
    operatorAccountId: need('HEDERA_OPERATOR_ID'),
    operatorKey: privateKey(need('HEDERA_OPERATOR_KEY')),
  };
}

function createAction(
  claimantAccountId: string,
  settlementTokenId: string,
  authorizationEvidenceHash: string,
): ReturnType<typeof paymentActionCoreV1Schema.parse> {
  const base = routineAction();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 15 * 60 * 1_000);
  const beneficiary = `hedera:296:${claimantAccountId}`;
  const assetId = `hedera:296/hts:${settlementTokenId}`;
  const mappingPolicyHash = sha256(
    canonicalEvent({
      assetId,
      rule: 'one synthetic Testnet token cent per source EUR cent',
      version: 1,
    }),
  );
  return paymentActionCoreV1Schema.parse({
    ...base,
    actionId: uuidV7(),
    beneficiary: {
      approved: { accountId: beneficiary, kind: 'CAIP_10' },
      proposed: { accountId: beneficiary, kind: 'CAIP_10' },
    },
    createdAt: createdAt.toISOString(),
    evidenceRoot: authorizationEvidenceHash,
    expiresAt: expiresAt.toISOString(),
    nonce: randomBytes(16).toString('hex'),
    settlement: {
      amountAtoms: String(SETTLEMENT_AMOUNT_ATOMS),
      assetId,
      beneficiary,
      mappingPolicyHash,
      networkId: 'hedera:296',
    },
  });
}

function roleKeys(): RoleKeys {
  return {
    freeze: PrivateKey.generateECDSA(),
    kyc: PrivateKey.generateECDSA(),
    pause: PrivateKey.generateECDSA(),
    supply: PrivateKey.generateECDSA(),
  };
}

function mirrorKeys(keys: RoleKeys): DualTokenKeyExpectations {
  const expected = (key: PrivateKey) => ({
    key: key.publicKey.toStringRaw(),
    type: 'ECDSA_SECP256K1' as const,
  });
  return {
    freeze: expected(keys.freeze),
    kyc: expected(keys.kyc),
    pause: expected(keys.pause),
    supply: expected(keys.supply),
  };
}

async function submit(
  client: Client,
  operatorKey: PrivateKey,
  transaction: Transaction,
  additionalKeys: readonly PrivateKey[] = [],
): Promise<NetworkResponse> {
  let signed = transaction.freezeWith(client);
  signed = await signed.sign(operatorKey);
  for (const key of additionalKeys) {
    signed = await signed.sign(key);
  }
  const response = await signed.execute(client);
  const receipt = await response.getReceipt(client);
  if (receipt.status.toString() !== 'SUCCESS') {
    throw new Error(`transaction failed: ${receipt.status.toString()}`);
  }
  return { receipt, response };
}

async function createTopic(
  client: Client,
  env: Environment,
  submitKey: PrivateKey,
): Promise<string> {
  const result = await submit(
    client,
    env.operatorKey,
    new TopicCreateTransaction()
      .setTopicMemo('Remit dual-token Testnet audit v2')
      .setSubmitKey(submitKey.publicKey),
  );
  const topicId = result.receipt.topicId?.toString();
  if (topicId === undefined) throw new Error('topic creation returned no ID');
  return topicId;
}

async function createSettlementToken(
  client: Client,
  env: Environment,
): Promise<string> {
  const result = await submit(
    client,
    env.operatorKey,
    new TokenCreateTransaction()
      .setTokenName(SETTLEMENT_TOKEN_NAME)
      .setTokenSymbol(SETTLEMENT_TOKEN_SYMBOL)
      .setTokenMemo('NO VALUE - synthetic Testnet EUR cents')
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(SETTLEMENT_DECIMALS)
      .setInitialSupply(SETTLEMENT_AMOUNT_ATOMS)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(SETTLEMENT_AMOUNT_ATOMS)
      .setTreasuryAccountId(env.operatorAccountId),
  );
  const tokenId = result.receipt.tokenId?.toString();
  if (tokenId === undefined) throw new Error('settlement token returned no ID');
  return tokenId;
}

async function createCollection(
  client: Client,
  env: Environment,
  configuration: typeof PAYABLE_TOKEN_CONFIG | typeof CONTROL_TOKEN_CONFIG,
  keys: RoleKeys,
): Promise<string> {
  const result = await submit(
    client,
    env.operatorKey,
    new TokenCreateTransaction()
      .setTokenName(configuration.name)
      .setTokenSymbol(configuration.symbol)
      .setTokenMemo('EXPERIMENTAL TESTNET - NO LEGAL OR PAYMENT AUTHORITY')
      .setTokenType(TokenType.NonFungibleUnique)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(configuration.maxSupply)
      .setTreasuryAccountId(env.operatorAccountId)
      .setSupplyKey(keys.supply.publicKey)
      .setKycKey(keys.kyc.publicKey)
      .setFreezeKey(keys.freeze.publicKey)
      .setPauseKey(keys.pause.publicKey)
      .setFreezeDefault(configuration.defaultFreeze),
  );
  const tokenId = result.receipt.tokenId?.toString();
  if (tokenId === undefined) throw new Error('NFT collection returned no ID');
  return tokenId;
}

async function mint(
  client: Client,
  env: Environment,
  tokenId: string,
  supplyKey: PrivateKey,
  metadata: Uint8Array,
): Promise<{ readonly serial: number; readonly serialLong: object }> {
  const result = await submit(
    client,
    env.operatorKey,
    new TokenMintTransaction().setTokenId(tokenId).addMetadata(metadata),
    [supplyKey],
  );
  const serialLong = result.receipt.serials[0];
  if (serialLong === undefined) throw new Error('mint returned no serial');
  return { serial: Number(serialLong), serialLong };
}

async function updatePayableMetadata(
  client: Client,
  env: Environment,
  collection: Collection,
  serialLong: object,
  metadata: Uint8Array,
): Promise<void> {
  await submit(
    client,
    env.operatorKey,
    new TokenUpdateNftsTransaction()
      .setTokenId(collection.id)
      .setSerialNumbers([
        serialLong as Parameters<
          TokenUpdateNftsTransaction['setSerialNumbers']
        >[0][number],
      ])
      .setMetadata(metadata),
    [collection.keys.supply],
  );
}

async function associate(
  client: Client,
  env: Environment,
  accountId: string,
  accountKey: PrivateKey,
  tokenIds: readonly string[],
): Promise<void> {
  await submit(
    client,
    env.operatorKey,
    new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds([...tokenIds]),
    [accountKey],
  );
}

async function grantKyc(
  client: Client,
  env: Environment,
  tokenId: string,
  accountId: string,
  key: PrivateKey,
): Promise<void> {
  await submit(
    client,
    env.operatorKey,
    new TokenGrantKycTransaction().setTokenId(tokenId).setAccountId(accountId),
    [key],
  );
}

async function setFrozen(
  client: Client,
  env: Environment,
  tokenId: string,
  accountId: string,
  key: PrivateKey,
  frozen: boolean,
): Promise<void> {
  const transaction = frozen
    ? new TokenFreezeTransaction().setTokenId(tokenId).setAccountId(accountId)
    : new TokenUnfreezeTransaction()
        .setTokenId(tokenId)
        .setAccountId(accountId);
  await submit(client, env.operatorKey, transaction, [key]);
}

async function transferNft(
  client: Client,
  env: Environment,
  tokenId: string,
  serial: number,
  receiver: string,
): Promise<void> {
  await submit(
    client,
    env.operatorKey,
    new TransferTransaction().addNftTransfer(
      tokenId,
      serial,
      env.operatorAccountId,
      receiver,
    ),
  );
}

async function submitHcs(
  client: Client,
  env: Environment,
  topicId: string,
  topicKey: PrivateKey,
  event: Record<string, unknown>,
): Promise<NetworkResponse & { readonly message: string }> {
  const message = canonicalEvent(event);
  if (Buffer.byteLength(message, 'utf8') > 1_024) {
    throw new Error('HCS audit event must fit in one unchunked message');
  }
  const result = await submit(
    client,
    env.operatorKey,
    new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message),
    [topicKey],
  );
  return { ...result, message };
}

async function mirrorJson(mirrorApi: string, path: string): Promise<unknown> {
  const response = await fetch(`${mirrorApi}${path}`);
  if (!response.ok) {
    throw new Error(`Mirror ${path} returned HTTP ${String(response.status)}`);
  }
  return await response.json();
}

async function waitFor<T>(
  label: string,
  check: () => Promise<T>,
  timeoutMs = MIRROR_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await check();
    } catch (error: unknown) {
      lastError = error;
      await new Promise((resolveWait) =>
        setTimeout(resolveWait, MIRROR_POLL_MS),
      );
    }
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`${label} did not reach Mirror Node${detail}`);
}

async function readPayable(
  env: Environment,
  collection: Collection,
  actionDigest: string,
  invoiceDigest: string,
  phase: 'ACTIVE' | 'BURNED',
): Promise<void> {
  await waitFor('payable NFT', async () => {
    const [token, nft] = await Promise.all([
      mirrorJson(env.mirrorApi, `/tokens/${collection.id}`),
      mirrorJson(
        env.mirrorApi,
        `/tokens/${collection.id}/nfts/${String(collection.serial)}`,
      ),
    ]);
    const expectation: PayableTokenSnapshotExpectation = {
      keys: mirrorKeys(collection.keys),
      metadata: {
        actionDigest,
        invoiceDigest,
        state: 'READY_FOR_SETTLEMENT',
      },
      nft: {
        accountId:
          phase === 'ACTIVE' ? env.claimantAccountId : env.operatorAccountId,
        phase,
        serial: collection.serial,
      },
      tokenId: collection.id,
      totalSupply: phase === 'ACTIVE' ? '1' : '0',
      treasuryAccountId: env.operatorAccountId,
    };
    auditPayableTokenSnapshot(token, nft, expectation);
  });
}

async function readSettlementToken(
  env: Environment,
  tokenId: string,
): Promise<void> {
  await waitFor('sealed settlement token', async () => {
    const value = (await mirrorJson(
      env.mirrorApi,
      `/tokens/${tokenId}`,
    )) as Record<string, unknown>;
    const expected: Readonly<Record<string, unknown>> = {
      admin_key: null,
      decimals: String(SETTLEMENT_DECIMALS),
      fee_schedule_key: null,
      freeze_default: false,
      freeze_key: null,
      initial_supply: String(SETTLEMENT_AMOUNT_ATOMS),
      kyc_key: null,
      max_supply: String(SETTLEMENT_AMOUNT_ATOMS),
      memo: 'NO VALUE - synthetic Testnet EUR cents',
      metadata_key: null,
      name: SETTLEMENT_TOKEN_NAME,
      pause_key: null,
      supply_key: null,
      supply_type: 'FINITE',
      symbol: SETTLEMENT_TOKEN_SYMBOL,
      token_id: tokenId,
      total_supply: String(SETTLEMENT_AMOUNT_ATOMS),
      treasury_account_id: env.operatorAccountId,
      type: 'FUNGIBLE_COMMON',
      wipe_key: null,
    };
    for (const [field, wanted] of Object.entries(expected)) {
      if (value[field] !== wanted) {
        throw new Error(
          `${field} must be ${String(wanted)}, got ${String(value[field])}`,
        );
      }
    }
    const customFees = value.custom_fees as
      | {
          readonly fixed_fees?: unknown[];
          readonly fractional_fees?: unknown[];
        }
      | undefined;
    if (
      customFees === undefined ||
      customFees.fixed_fees?.length !== 0 ||
      customFees.fractional_fees?.length !== 0
    ) {
      throw new Error('settlement token must have no custom fees');
    }
  });
}

async function readControl(
  env: Environment,
  collection: Collection,
  actionDigest: string,
  authorizationEvidenceHash: string,
  phase: 'ACTIVE' | 'BURNED',
): Promise<void> {
  await waitFor('control NFT', async () => {
    const [token, nft] = await Promise.all([
      mirrorJson(env.mirrorApi, `/tokens/${collection.id}`),
      mirrorJson(
        env.mirrorApi,
        `/tokens/${collection.id}/nfts/${String(collection.serial)}`,
      ),
    ]);
    const expectation: ControlTokenSnapshotExpectation = {
      keys: mirrorKeys(collection.keys),
      metadata: {
        actionDigest,
        authorizationEvidenceHash,
        state: 'MECHANICS_FIXTURE',
      },
      nft: {
        accountId:
          phase === 'ACTIVE' ? env.controlAccountId : env.operatorAccountId,
        phase,
        serial: collection.serial,
      },
      tokenId: collection.id,
      totalSupply: phase === 'ACTIVE' ? '1' : '0',
      treasuryAccountId: env.operatorAccountId,
    };
    auditControlTokenSnapshot(token, nft, expectation);
  });
}

async function waitForRelationship(
  env: Environment,
  accountId: string,
  tokenId: string,
  expected: {
    readonly freeze_status: 'FROZEN' | 'UNFROZEN';
    readonly kyc_status: 'GRANTED';
  },
): Promise<void> {
  await waitFor(`relationship ${accountId}/${tokenId}`, async () => {
    const value = (await mirrorJson(
      env.mirrorApi,
      `/accounts/${accountId}/tokens?token.id=${tokenId}&limit=1`,
    )) as { readonly tokens?: Record<string, unknown>[] };
    const relationship = value.tokens?.[0];
    if (
      relationship?.freeze_status !== expected.freeze_status ||
      relationship.kyc_status !== expected.kyc_status
    ) {
      throw new Error('relationship status has not converged');
    }
  });
}

async function tokenBalance(
  client: Client,
  accountId: string,
  tokenId: string,
): Promise<string> {
  const balance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(client);
  return balance.tokens.get(TokenId.fromString(tokenId))?.toString() ?? '0';
}

async function topicSequence(client: Client, topicId: string): Promise<string> {
  const info = await new TopicInfoQuery().setTopicId(topicId).execute(client);
  return info.sequenceNumber.toString();
}

function plannedInnerIds(operatorAccountId: string): readonly TransactionId[] {
  return Array.from({ length: 5 }, () =>
    TransactionId.generate(AccountId.fromString(operatorAccountId)),
  );
}

async function buildBatch(input: {
  readonly actionDigest: string;
  readonly authorizationEvidenceHash: string;
  readonly authorizationPrecommitHash: string;
  readonly client: Client;
  readonly control: Collection;
  readonly env: Environment;
  readonly invoiceDigest: string;
  readonly invalidControlBurn: boolean;
  readonly payable: Collection;
  readonly settlementTokenId: string;
  readonly topicId: string;
  readonly topicKey: PrivateKey;
}): Promise<BuiltBatch> {
  const batchKey = PrivateKey.generateECDSA();
  const transactionIds = plannedInnerIds(input.env.operatorAccountId);
  const transactionIdStrings = transactionIds.map((id) => id.toString());
  const outerTransactionId = TransactionId.generate(
    AccountId.fromString(input.env.operatorAccountId),
  );
  const outerTransactionIdString = outerTransactionId.toString();
  if (
    transactionIdStrings.length !== 5 ||
    new Set([...transactionIdStrings, outerTransactionIdString]).size !== 6
  ) {
    throw new Error('the outer and five inner transaction IDs must be unique');
  }
  const firstValidStart = transactionIds[0]?.validStart;
  if (firstValidStart === null || firstValidStart === undefined) {
    throw new Error('planned transaction ID has no valid start');
  }

  const assemble = async (
    declaredBatchBytes: number,
  ): Promise<{
    readonly batch: BatchTransaction;
    readonly bytes: Uint8Array;
    readonly intent: DualTokenSettlementIntentV2;
    readonly wireBytes: number;
  }> => {
    const intent = createDualTokenSettlementIntent({
      actionBeneficiaryAccountId: input.env.claimantAccountId,
      actionDigest: input.actionDigest,
      amountAtoms: String(SETTLEMENT_AMOUNT_ATOMS),
      auditTopicId: input.topicId,
      authorizationEvidenceHash: input.authorizationEvidenceHash,
      authorizationPrecommitHash: input.authorizationPrecommitHash,
      batchBytes: declaredBatchBytes,
      batchKey: batchKey.publicKey.toStringRaw(),
      controlHolderAccountId: input.env.controlAccountId,
      controlSerial: input.control.serial,
      controlTokenId: input.control.id,
      innerTransactionIds: transactionIdStrings,
      invoiceDigest: input.invoiceDigest,
      network: 'hedera:296',
      operations: DUAL_TOKEN_SETTLEMENT_OPERATIONS,
      outerTransactionId: outerTransactionIdString,
      payableHolderAccountId: input.env.claimantAccountId,
      payableSerial: input.payable.serial,
      payableTokenId: input.payable.id,
      payerAccountId: input.env.operatorAccountId,
      schemaVersion: 'hedera-dual-token-settlement-intent.v2',
      settlementAssetTokenId: input.settlementTokenId,
      treasuryAccountId: input.env.operatorAccountId,
      validDurationSeconds: 120,
      validStartEpochSeconds: firstValidStart.seconds.toNumber(),
    });
    const commitment = dualTokenCommitmentMessage(
      intent,
      input.invalidControlBurn ? 'ROLLBACK_PROBE' : 'SETTLEMENT',
    );
    if (Buffer.byteLength(commitment, 'utf8') > 1_024) {
      throw new Error('atomic commitment must be an unchunked HCS message');
    }

    let unfreeze = await new TokenUnfreezeTransaction()
      .setTokenId(input.control.id)
      .setAccountId(input.env.controlAccountId)
      .setTransactionValidDuration(120)
      .setTransactionId(transactionIds[0] as TransactionId)
      .batchify(input.client, batchKey.publicKey);
    unfreeze = await unfreeze.sign(input.control.keys.freeze);

    let transfer = await new TransferTransaction()
      .addTokenTransfer(
        input.settlementTokenId,
        input.env.operatorAccountId,
        -SETTLEMENT_AMOUNT_ATOMS,
      )
      .addTokenTransfer(
        input.settlementTokenId,
        input.env.claimantAccountId,
        SETTLEMENT_AMOUNT_ATOMS,
      )
      .addNftTransfer(
        new NftId(TokenId.fromString(input.payable.id), input.payable.serial),
        input.env.claimantAccountId,
        input.env.operatorAccountId,
      )
      .addNftTransfer(
        new NftId(TokenId.fromString(input.control.id), input.control.serial),
        input.env.controlAccountId,
        input.env.operatorAccountId,
      )
      .setTransactionValidDuration(120)
      .setTransactionId(transactionIds[1] as TransactionId)
      .batchify(input.client, batchKey.publicKey);
    transfer = await transfer.sign(input.env.claimantKey);
    transfer = await transfer.sign(input.env.controlKey);

    let payableBurn = await new TokenBurnTransaction()
      .setTokenId(input.payable.id)
      .setSerials([input.payable.serial])
      .setTransactionValidDuration(120)
      .setTransactionId(transactionIds[2] as TransactionId)
      .batchify(input.client, batchKey.publicKey);
    payableBurn = await payableBurn.sign(input.payable.keys.supply);

    let controlBurn = await new TokenBurnTransaction()
      .setTokenId(input.control.id)
      .setSerials([
        input.invalidControlBurn
          ? input.control.serial + 999_999
          : input.control.serial,
      ])
      .setTransactionValidDuration(120)
      .setTransactionId(transactionIds[3] as TransactionId)
      .batchify(input.client, batchKey.publicKey);
    controlBurn = await controlBurn.sign(input.control.keys.supply);

    let hcs = await new TopicMessageSubmitTransaction()
      .setTopicId(input.topicId)
      .setMessage(commitment)
      .setMaxChunks(1)
      .setTransactionValidDuration(120)
      .setTransactionId(transactionIds[4] as TransactionId)
      .batchify(input.client, batchKey.publicKey);
    hcs = await hcs.sign(input.topicKey);

    const inner: Transaction[] = [
      unfreeze,
      transfer,
      payableBurn,
      controlBurn,
      hcs,
    ];
    let batch = new BatchTransaction()
      .setInnerTransactions(inner)
      .setTransactionId(outerTransactionId)
      .setTransactionValidDuration(120)
      .freezeWith(input.client);
    batch = await batch.sign(batchKey);
    batch = await batch.sign(input.env.operatorKey);
    const bytes = batch.toBytes();
    const wireBytes = await batch.size;
    return { batch, bytes, intent, wireBytes };
  };

  let declaredBatchBytes = 1;
  let assembled = await assemble(declaredBatchBytes);
  for (let passIndex = 0; passIndex < 3; passIndex += 1) {
    if (assembled.wireBytes === declaredBatchBytes) break;
    declaredBatchBytes = assembled.wireBytes;
    assembled = await assemble(declaredBatchBytes);
  }
  if (assembled.wireBytes !== declaredBatchBytes) {
    throw new Error('atomic batch size did not converge');
  }
  if (assembled.wireBytes > BATCH_SIZE_LIMIT) {
    throw new Error(
      `atomic batch is ${String(
        assembled.wireBytes,
      )} bytes; limit is ${String(BATCH_SIZE_LIMIT)}`,
    );
  }
  assertDualTokenSettlementIntent(assembled.intent);
  const actualIds = assembled.batch.innerTransactionIds.map(
    (id) => id?.toString() ?? '',
  );
  if (
    actualIds.length !== transactionIds.length ||
    actualIds.some((id, index) => id !== transactionIds[index]?.toString())
  ) {
    throw new Error('SDK changed an explicitly planned inner transaction ID');
  }
  if (assembled.batch.transactionId?.toString() !== outerTransactionIdString) {
    throw new Error('SDK changed the explicitly planned outer transaction ID');
  }
  const verifyWire = (): void => {
    verifyDualTokenWireBatch({
      bytes: assembled.bytes,
      commitmentOutcome: input.invalidControlBurn
        ? 'ROLLBACK_PROBE'
        : 'SETTLEMENT',
      intent: assembled.intent,
      trustedSigners: {
        controlFreezeKey: input.control.keys.freeze.publicKey.toStringRaw(),
        controlHolderKey: input.env.controlKey.publicKey.toStringRaw(),
        controlSupplyKey: input.control.keys.supply.publicKey.toStringRaw(),
        operatorKey: input.env.operatorKey.publicKey.toStringRaw(),
        payableHolderKey: input.env.claimantKey.publicKey.toStringRaw(),
        payableSupplyKey: input.payable.keys.supply.publicKey.toStringRaw(),
        topicSubmitKey: input.topicKey.publicKey.toStringRaw(),
      },
    });
  };
  if (input.invalidControlBurn) {
    try {
      verifyWire();
      throw new Error(
        'wire verifier unexpectedly admitted the malformed rollback probe',
      );
    } catch (error: unknown) {
      if (
        !(error instanceof Error) ||
        !error.message.includes('CONTROL_BURN token or serial does not match')
      ) {
        throw error;
      }
    }
  } else {
    verifyWire();
  }
  return {
    batch: assembled.batch,
    bytes: assembled.bytes,
    innerTransactionIds: actualIds,
    intent: assembled.intent,
    manifestHash: assembled.intent.manifestHash,
    outerTransactionId: outerTransactionIdString,
    wireBytes: assembled.wireBytes,
  };
}

async function expectFailedBatch(
  env: Environment,
  client: Client,
  built: BuiltBatch,
): Promise<string> {
  const response = await built.batch.execute(client);
  if (response.transactionId.toString() !== built.outerTransactionId) {
    throw new Error(
      'rollback response changed the planned outer transaction ID',
    );
  }
  try {
    const receipt = await response.getReceipt(client);
    throw new Error(
      `rollback probe unexpectedly returned ${receipt.status.toString()}`,
    );
  } catch (error: unknown) {
    if (
      !(error instanceof ReceiptStatusError) ||
      error.status !== Status.InnerTransactionFailed
    ) {
      throw error;
    }
  }

  const reconciledReceipt = await new TransactionReceiptQuery()
    .setTransactionId(TransactionId.fromString(built.outerTransactionId))
    .setValidateStatus(false)
    .execute(client);
  if (reconciledReceipt.status !== Status.InnerTransactionFailed) {
    throw new Error(
      'rollback receipt reconciliation changed the failure status',
    );
  }

  await waitFor('failed atomic batch', async () => {
    const page = (await mirrorJson(
      env.mirrorApi,
      `/transactions/${mirrorTransactionId(built.outerTransactionId)}`,
    )) as MirrorTransactionsPage;
    const transactions = page.transactions ?? [];
    const outer = transactions.find(
      (transaction) =>
        transaction.name === 'ATOMICBATCH' &&
        transaction.transaction_id ===
          mirrorTransactionId(built.outerTransactionId),
    );
    if (
      outer?.result !== 'INNER_TRANSACTION_FAILED' ||
      outer.consensus_timestamp === undefined
    ) {
      throw new Error('outer batch failure is not indexed');
    }
    const children = transactions
      .filter(
        (transaction) =>
          transaction.parent_consensus_timestamp === outer.consensus_timestamp,
      )
      .sort((left, right) =>
        String(left.consensus_timestamp).localeCompare(
          String(right.consensus_timestamp),
        ),
      );
    const expected = [
      ['TOKENUNFREEZE', 'REVERTED_SUCCESS'],
      ['CRYPTOTRANSFER', 'REVERTED_SUCCESS'],
      ['TOKENBURN', 'REVERTED_SUCCESS'],
      ['TOKENBURN', 'INVALID_NFT_ID'],
    ] as const;
    if (
      children.length !== expected.length ||
      children.some(
        (child, index) =>
          child.name !== expected[index]?.[0] ||
          child.result !== expected[index]?.[1],
      )
    ) {
      throw new Error('failed batch children do not prove atomic rollback');
    }
  });
  return reconciledReceipt.status.toString();
}

async function waitForHcsEvent(
  env: Environment,
  topicId: string,
  eventName: string,
  manifest: string,
): Promise<MirrorMessage> {
  return await waitFor(`HCS ${eventName}`, async () => {
    const page = (await mirrorJson(
      env.mirrorApi,
      `/topics/${topicId}/messages?limit=100&order=desc`,
    )) as MirrorMessagesPage;
    for (const message of page.messages ?? []) {
      if (message.message === undefined) continue;
      try {
        const decoded = JSON.parse(
          Buffer.from(message.message, 'base64').toString('utf8'),
        ) as {
          readonly authorityMode?: string;
          readonly event?: string;
          readonly manifestHash?: string;
        };
        if (
          decoded.authorityMode === AUTHORITY_MODE &&
          decoded.event === eventName &&
          decoded.manifestHash === manifest
        ) {
          return message;
        }
      } catch {
        // Ignore unrelated topic messages.
      }
    }
    throw new Error('event not indexed yet');
  });
}

function assertActionBinding(
  action: ReturnType<typeof paymentActionCoreV1Schema.parse>,
  env: Environment,
  settlementTokenId: string,
): void {
  const expectedBeneficiary = `hedera:296:${env.claimantAccountId}`;
  const approved = action.beneficiary.approved;
  const proposed = action.beneficiary.proposed;
  if (
    action.settlement.amountAtoms !== String(SETTLEMENT_AMOUNT_ATOMS) ||
    action.settlement.assetId !== `hedera:296/hts:${settlementTokenId}` ||
    action.settlement.beneficiary !== expectedBeneficiary ||
    approved?.kind !== 'CAIP_10' ||
    approved.accountId !== expectedBeneficiary ||
    proposed.kind !== 'CAIP_10' ||
    proposed.accountId !== expectedBeneficiary
  ) {
    throw new Error(
      'action does not bind the exact asset, amount and snapshotted holder',
    );
  }
  if (Date.parse(action.expiresAt) <= Date.now()) {
    throw new Error('action expired before settlement signing');
  }
}

async function runOffline(): Promise<void> {
  heading('DUAL-TOKEN SETTLEMENT — OFFLINE CONTRACT');
  const authorizationEvidenceHash = sha256(
    'remit:experimental-authorization-evidence:v2:offline',
  );
  const action = createAction(
    '0.0.7001',
    '0.0.6000',
    authorizationEvidenceHash,
  );
  const actionDigest = digestCanonicalValue(
    digestDomains.paymentActionCore,
    paymentActionCoreV1Schema,
    action,
  );
  const invoiceDigest = action.sourceInvoice.digest;
  const invoiceNftCommitment = sha256(
    `remit:invoice-nft-commitment:v2:offline:${invoiceDigest}`,
  );
  const payable = encodePayableMetadata({
    actionDigest,
    invoiceDigest: invoiceNftCommitment,
    state: 'READY_FOR_SETTLEMENT',
  });
  const control = encodeControlMetadata({
    actionDigest,
    authorizationEvidenceHash,
    state: 'MECHANICS_FIXTURE',
  });
  pass(`canonical action binds claimant, amount and synthetic HTS asset`);
  pass(`Payable metadata ${String(payable.byteLength)} bytes`);
  pass(`Control metadata ${String(control.byteLength)} bytes`);
  step(
    C.dim(
      'live path adds KYC/freeze, rollback probe, HIP-551 settlement, dual burn and HCS audit',
    ),
  );
}

async function runLive(): Promise<void> {
  const env = environment();
  const client = Client.forTestnet().setOperator(
    env.operatorAccountId,
    env.operatorKey,
  );
  const topicKey = PrivateKey.generateECDSA();
  const payableKeys = roleKeys();
  const controlKeys = roleKeys();

  try {
    heading('CREATE THE AUDIT AND SETTLEMENT RAIL');
    const [topicId, settlementTokenId] = await Promise.all([
      createTopic(client, env, topicKey),
      createSettlementToken(client, env),
    ]);
    pass(`immutable HCS audit topic ${topicId}`);
    pass(
      `sealed ${SETTLEMENT_TOKEN_SYMBOL} settlement asset ${settlementTokenId} (${String(
        SETTLEMENT_AMOUNT_ATOMS,
      )} atoms, no value)`,
    );
    await readSettlementToken(env, settlementTokenId);
    pass('Mirror confirms exact sealed settlement-token configuration');

    const authorizationEvidenceHash = sha256(
      canonicalEvent({
        claim:
          'EXPERIMENTAL MECHANISM FIXTURE ONLY - NOT WORLD OR X402 AUTHORIZATION',
        runId: randomUUID(),
        version: 2,
      }),
    );
    const action = createAction(
      env.claimantAccountId,
      settlementTokenId,
      authorizationEvidenceHash,
    );
    const actionDigest = digestCanonicalValue(
      digestDomains.paymentActionCore,
      paymentActionCoreV1Schema,
      action,
    );
    const invoiceDigest = action.sourceInvoice.digest;
    const invoiceNftCommitment = sha256(
      `remit:invoice-nft-commitment:v2:${randomBytes(32).toString(
        'hex',
      )}:${invoiceDigest}`,
    );
    assertActionBinding(action, env, settlementTokenId);
    step(`action digest  ${C.cyan(actionDigest)}`);
    step(
      C.dim(
        `exact effect   ${String(SETTLEMENT_AMOUNT_ATOMS)} ${SETTLEMENT_TOKEN_SYMBOL} atoms → ${env.claimantAccountId}`,
      ),
    );

    heading('CREATE AND COMMIT THE TWO NFT LIFECYCLES');
    const [payableId, controlId] = await Promise.all([
      createCollection(client, env, PAYABLE_TOKEN_CONFIG, payableKeys),
      createCollection(client, env, CONTROL_TOKEN_CONFIG, controlKeys),
    ]);
    const payableMint = await mint(
      client,
      env,
      payableId,
      payableKeys.supply,
      encodePayableMetadata({
        actionDigest,
        invoiceDigest: invoiceNftCommitment,
        state: 'ISSUED',
      }),
    );
    const controlMint = await mint(
      client,
      env,
      controlId,
      controlKeys.supply,
      encodeControlMetadata({
        actionDigest,
        authorizationEvidenceHash,
        state: 'MECHANICS_FIXTURE',
      }),
    );
    const payable: Collection = {
      id: payableId,
      keys: payableKeys,
      serial: payableMint.serial,
    };
    const control: Collection = {
      id: controlId,
      keys: controlKeys,
      serial: controlMint.serial,
    };
    await updatePayableMetadata(
      client,
      env,
      payable,
      payableMint.serialLong,
      encodePayableMetadata({
        actionDigest,
        invoiceDigest: invoiceNftCommitment,
        state: 'READY_FOR_SETTLEMENT',
      }),
    );
    pass(
      `Payable ${payable.id}#${String(payable.serial)} finalized in treasury`,
    );
    pass(
      `Control ${control.id}#${String(control.serial)} minted for this action`,
    );

    const holderCommitment = sha256(
      `remit:dual-token-holders:v2:${env.claimantAccountId}:${env.controlAccountId}`,
    );
    const settlementPlanHash = sha256(
      `remit:dual-token-settlement-plan:v2:${canonicalEvent({
        actionDigest,
        amountAtoms: String(SETTLEMENT_AMOUNT_ATOMS),
        auditTopicId: topicId,
        control: `${control.id}/${String(control.serial)}`,
        controlHolderAccountId: env.controlAccountId,
        network: 'hedera:296',
        operations: DUAL_TOKEN_SETTLEMENT_OPERATIONS,
        payable: `${payable.id}/${String(payable.serial)}`,
        payableHolderAccountId: env.claimantAccountId,
        payerAccountId: env.operatorAccountId,
        settlementAssetTokenId: settlementTokenId,
        treasuryAccountId: env.operatorAccountId,
      })}`,
    );
    const authorization = await submitHcs(client, env, topicId, topicKey, {
      actionDigest,
      authorityMode: AUTHORITY_MODE,
      authorizationEvidenceHash,
      control: `${control.id}/${String(control.serial)}`,
      event: 'authorization-fixture.v2',
      holderCommitment,
      payable: `${payable.id}/${String(payable.serial)}`,
      settlementPlanHash,
    });
    const authorizationSequence =
      authorization.receipt.topicSequenceNumber?.toString();
    const authorizationRunningHash =
      authorization.receipt.topicRunningHash === null
        ? undefined
        : Buffer.from(authorization.receipt.topicRunningHash).toString('hex');
    if (
      authorizationSequence === undefined ||
      authorizationRunningHash === undefined
    ) {
      throw new Error('authorization precommit returned no HCS proof');
    }
    const authorizationPrecommitHash = sha256(
      canonicalEvent({
        domain: 'remit:hcs-authorization-precommit:v2',
        messageHash: sha256(authorization.message),
        runningHash: authorizationRunningHash,
        sequenceNumber: authorizationSequence,
        submitKey: topicKey.publicKey.toStringRaw(),
        submitterAccountId: env.operatorAccountId,
        topicId,
        transactionId: authorization.response.transactionId.toString(),
      }),
    );
    pass(
      `HCS experimental fixture precommit sequence ${authorizationSequence} confirmed`,
    );

    await Promise.all([
      associate(client, env, env.claimantAccountId, env.claimantKey, [
        settlementTokenId,
        payable.id,
      ]),
      associate(client, env, env.controlAccountId, env.controlKey, [
        control.id,
      ]),
    ]);
    await Promise.all([
      setFrozen(
        client,
        env,
        payable.id,
        env.claimantAccountId,
        payable.keys.freeze,
        false,
      ),
      setFrozen(
        client,
        env,
        control.id,
        env.controlAccountId,
        control.keys.freeze,
        false,
      ),
    ]);
    await Promise.all([
      grantKyc(
        client,
        env,
        payable.id,
        env.claimantAccountId,
        payable.keys.kyc,
      ),
      grantKyc(client, env, control.id, env.controlAccountId, control.keys.kyc),
    ]);
    await Promise.all([
      transferNft(
        client,
        env,
        payable.id,
        payable.serial,
        env.claimantAccountId,
      ),
      transferNft(
        client,
        env,
        control.id,
        control.serial,
        env.controlAccountId,
      ),
    ]);
    await setFrozen(
      client,
      env,
      control.id,
      env.controlAccountId,
      control.keys.freeze,
      true,
    );
    await Promise.all([
      readPayable(env, payable, actionDigest, invoiceNftCommitment, 'ACTIVE'),
      readControl(
        env,
        control,
        actionDigest,
        authorizationEvidenceHash,
        'ACTIVE',
      ),
      waitForRelationship(env, env.claimantAccountId, payable.id, {
        freeze_status: 'UNFROZEN',
        kyc_status: 'GRANTED',
      }),
      waitForRelationship(env, env.controlAccountId, control.id, {
        freeze_status: 'FROZEN',
        kyc_status: 'GRANTED',
      }),
    ]);
    pass('Mirror confirms exact keys, metadata, owners, KYC and freeze state');

    heading('PROVE HIP-551 ROLLBACK');
    assertActionBinding(action, env, settlementTokenId);
    const claimantBefore = await tokenBalance(
      client,
      env.claimantAccountId,
      settlementTokenId,
    );
    const sequenceBefore = await topicSequence(client, topicId);
    const failed = await buildBatch({
      actionDigest,
      authorizationEvidenceHash,
      authorizationPrecommitHash,
      client,
      control,
      env,
      invoiceDigest,
      invalidControlBurn: true,
      payable,
      settlementTokenId,
      topicId,
      topicKey,
    });
    step(
      `rollback batch ${String(failed.wireBytes)} bytes; manifest ${C.dim(
        failed.manifestHash,
      )}`,
    );
    const failureStatus = await expectFailedBatch(env, client, failed);
    const [claimantAfterFailure, sequenceAfterFailure] = await Promise.all([
      tokenBalance(client, env.claimantAccountId, settlementTokenId),
      topicSequence(client, topicId),
    ]);
    await Promise.all([
      readPayable(env, payable, actionDigest, invoiceNftCommitment, 'ACTIVE'),
      readControl(
        env,
        control,
        actionDigest,
        authorizationEvidenceHash,
        'ACTIVE',
      ),
      waitForRelationship(env, env.controlAccountId, control.id, {
        freeze_status: 'FROZEN',
        kyc_status: 'GRANTED',
      }),
    ]);
    if (
      claimantAfterFailure !== claimantBefore ||
      sequenceAfterFailure !== sequenceBefore
    ) {
      throw new Error('failed batch changed claimant balance or HCS sequence');
    }
    pass(
      `${failureStatus}: payment, both NFT lifecycles and HCS commitment rolled back`,
    );
    step(hashscan(failed.outerTransactionId));
    step(C.dim('processed batch fees remain chargeable to the operator'));

    heading('SETTLE ATOMICALLY');
    assertActionBinding(action, env, settlementTokenId);
    const successful = await buildBatch({
      actionDigest,
      authorizationEvidenceHash,
      authorizationPrecommitHash,
      client,
      control,
      env,
      invoiceDigest,
      invalidControlBurn: false,
      payable,
      settlementTokenId,
      topicId,
      topicKey,
    });
    step(
      `signed batch   ${String(successful.wireBytes)} / ${String(
        BATCH_SIZE_LIMIT,
      )} bytes`,
    );
    const batchResponse = await successful.batch.execute(client);
    const batchReceipt = await batchResponse.getReceipt(client);
    if (batchReceipt.status.toString() !== 'SUCCESS') {
      throw new Error(`batch settlement ${batchReceipt.status.toString()}`);
    }
    const batchRecord = await batchResponse.getRecord(client);
    const batchTransactionId = batchResponse.transactionId.toString();
    if (batchTransactionId !== successful.outerTransactionId) {
      throw new Error('submitted batch ID does not match the signed manifest');
    }
    const networkTransactionHash = Buffer.from(
      batchResponse.transactionHash,
    ).toString('hex');
    const recordTransactionHash = Buffer.from(
      batchRecord.transactionHash,
    ).toString('hex');
    if (networkTransactionHash !== recordTransactionHash) {
      throw new Error('response and record transaction hashes do not match');
    }
    const serializedTransactionListHash = sha256(successful.bytes);
    pass(
      'settlement token transfer, both returns, both burns and HCS committed',
    );
    step(hashscan(batchTransactionId));

    const execution = await submitHcs(client, env, topicId, topicKey, {
      authorityMode: AUTHORITY_MODE,
      batchTransactionId,
      consensusTimestamp: batchRecord.consensusTimestamp.toString(),
      event: EXECUTION_EVENT,
      manifestHash: successful.manifestHash,
      networkTransactionHash,
      receiptStatus: batchReceipt.status.toString(),
      serializedTransactionListHash,
    });
    const claimantAfterSuccess = await tokenBalance(
      client,
      env.claimantAccountId,
      settlementTokenId,
    );
    const expectedClaimantBalance = (
      BigInt(claimantBefore) + BigInt(SETTLEMENT_AMOUNT_ATOMS)
    ).toString();
    if (claimantAfterSuccess !== expectedClaimantBalance) {
      throw new Error(
        `claimant settlement balance must be ${expectedClaimantBalance}, got ${claimantAfterSuccess}`,
      );
    }
    await Promise.all([
      readPayable(env, payable, actionDigest, invoiceNftCommitment, 'BURNED'),
      readControl(
        env,
        control,
        actionDigest,
        authorizationEvidenceHash,
        'BURNED',
      ),
    ]);
    const [commitmentMessage, executionMessage] = await Promise.all([
      waitForHcsEvent(env, topicId, COMMITMENT_EVENT, successful.manifestHash),
      waitForHcsEvent(env, topicId, EXECUTION_EVENT, successful.manifestHash),
    ]);
    if (
      commitmentMessage.sequence_number === undefined ||
      executionMessage.sequence_number === undefined ||
      commitmentMessage.sequence_number >= executionMessage.sequence_number
    ) {
      throw new Error('HCS commitment must precede the execution event');
    }
    pass(
      `Mirror confirms claimant +${String(
        SETTLEMENT_AMOUNT_ATOMS,
      )} atoms, both serials deleted and both HCS events`,
    );

    heading('PUBLIC TESTNET EVIDENCE');
    step(`action       ${actionDigest}`);
    step(`settlement   ${settlementTokenId}`);
    step(`payable      ${payable.id}/${String(payable.serial)}`);
    step(`control      ${control.id}/${String(control.serial)}`);
    step(`topic        ${topicId}`);
    step(`rollback     ${failed.outerTransactionId}`);
    step(`batch        ${batchTransactionId}`);
    step(`manifest     ${successful.manifestHash}`);
    step(`execution    ${execution.response.transactionId.toString()}`);
    step(
      C.yellow(
        'experimental only: synthetic assets, no legal assignment, no production authority',
      ),
    );
  } finally {
    client.close();
  }
}

async function main(): Promise<void> {
  console.log(`\n${C.bold('REMIT · EXPERIMENTAL DUAL-TOKEN SETTLEMENT')}\n`);
  if (OFFLINE) {
    await runOffline();
    return;
  }
  await runLive();
}

main().catch((error: unknown) => {
  console.error(
    `\n${C.red('dual-token demo failed')}: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
