import { proto } from '@hiero-ledger/proto';
import { PublicKey } from '@hiero-ledger/sdk';

import {
  assertDualTokenSettlementIntent,
  type DualTokenSettlementIntentV2,
} from './hedera-dual-token-guard.js';

export const DUAL_TOKEN_COMMITMENT_AUTHORITY_MODE = 'MECHANICS_FIXTURE';
export const DUAL_TOKEN_COMMITMENT_EVENT = 'mechanics-settlement-commitment.v2';

export type DualTokenCommitmentOutcome = 'ROLLBACK_PROBE' | 'SETTLEMENT';

export interface DualTokenWireTrustedSigners {
  readonly controlFreezeKey: string;
  readonly controlHolderKey: string;
  readonly controlSupplyKey: string;
  readonly operatorKey: string;
  readonly payableHolderKey: string;
  readonly payableSupplyKey: string;
  readonly topicSubmitKey: string;
}

export interface VerifyDualTokenWireBatchInput {
  readonly bytes: Uint8Array;
  readonly commitmentOutcome: DualTokenCommitmentOutcome;
  readonly intent: DualTokenSettlementIntentV2;
  readonly nowEpochSeconds?: number;
  readonly trustedSigners: DualTokenWireTrustedSigners;
}

export interface DualTokenWireBatchAudit {
  readonly batchBytes: number;
  readonly commitmentMessage: string;
  readonly innerTransactionIds: readonly string[];
  readonly manifestHash: string;
  readonly outerCandidates: number;
  readonly outerTransactionId: string;
}

interface LongLike {
  readonly toString: () => string;
}

interface NumericId {
  readonly shardNum?: LongLike | number | string | null;
  readonly realmNum?: LongLike | number | string | null;
}

const RAW_ED25519_KEY = /^[0-9a-f]{64}$/u;
const RAW_ECDSA_KEY = /^(?:02|03)[0-9a-f]{64}$/u;

function fail(message: string): never {
  throw new Error(`unsafe dual-token wire batch: ${message}`);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function canonicalBytes<T>(
  value: T,
  encode: (value: T) => { finish: () => Uint8Array },
): Uint8Array {
  return encode(value).finish();
}

function assertCanonicalEncoding<T>(
  original: Uint8Array,
  value: T,
  encode: (value: T) => { finish: () => Uint8Array },
  label: string,
): void {
  if (!bytesEqual(original, canonicalBytes(value, encode))) {
    fail(`${label} is not canonical protobuf or contains unknown fields`);
  }
}

function integerString(value: unknown, label: string): string {
  const rendered =
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'string'
      ? String(value)
      : typeof value === 'object' &&
          value !== null &&
          'toString' in value &&
          typeof value.toString === 'function'
        ? value.toString()
        : '';
  if (!/^-?(?:0|[1-9][0-9]*)$/u.test(rendered)) {
    fail(`${label} is not a canonical integer`);
  }
  return rendered;
}

function idPart(value: unknown, label: string): string {
  const rendered = integerString(value ?? 0, label);
  if (rendered.startsWith('-')) fail(`${label} must not be negative`);
  return rendered;
}

function numericEntityId(
  value: (NumericId & Record<string, unknown>) | null | undefined,
  numberField: 'accountNum' | 'tokenNum' | 'topicNum',
  label: string,
): string {
  if (value === null || value === undefined) {
    fail(`${label} is missing`);
  }
  if (
    numberField === 'accountNum' &&
    'account' in value &&
    value.account !== undefined &&
    value.account !== 'accountNum'
  ) {
    fail(`${label} must use a numeric account ID`);
  }
  const number = value[numberField];
  if (number === null || number === undefined) {
    fail(`${label} has no numeric entity number`);
  }
  return (
    `${idPart(value.shardNum, `${label}.shard`)}` +
    `.${idPart(value.realmNum, `${label}.realm`)}` +
    `.${idPart(number, `${label}.num`)}`
  );
}

function accountId(
  value: proto.IAccountID | null | undefined,
  label: string,
): string {
  return numericEntityId(
    value as (NumericId & Record<string, unknown>) | null | undefined,
    'accountNum',
    label,
  );
}

function tokenId(
  value: proto.ITokenID | null | undefined,
  label: string,
): string {
  return numericEntityId(
    value as (NumericId & Record<string, unknown>) | null | undefined,
    'tokenNum',
    label,
  );
}

function topicId(
  value: proto.ITopicID | null | undefined,
  label: string,
): string {
  return numericEntityId(
    value as (NumericId & Record<string, unknown>) | null | undefined,
    'topicNum',
    label,
  );
}

function transactionId(
  value: proto.ITransactionID | null | undefined,
  label: string,
): string {
  if (
    value === null ||
    value === undefined ||
    value.transactionValidStart === null ||
    value.transactionValidStart === undefined
  ) {
    fail(`${label} is missing`);
  }
  if (value.scheduled === true || Number(value.nonce ?? 0) !== 0) {
    fail(`${label} must not be scheduled or use a nonce`);
  }
  const seconds = idPart(
    value.transactionValidStart.seconds,
    `${label}.seconds`,
  );
  const nanos = Number(value.transactionValidStart.nanos ?? 0);
  if (!Number.isInteger(nanos) || nanos < 0 || nanos > 999_999_999) {
    fail(`${label}.nanos is outside the canonical range`);
  }
  return `${accountId(value.accountID, `${label}.account`)}@${seconds}.${String(
    nanos,
  ).padStart(9, '0')}`;
}

function transactionIdAccount(id: string): string {
  const separator = id.indexOf('@');
  return separator < 0 ? '' : id.slice(0, separator);
}

function validStartSeconds(id: string): number {
  const match = /@([1-9][0-9]*)\./u.exec(id);
  if (match?.[1] === undefined)
    fail('transaction ID has no valid-start seconds');
  const seconds = Number(match[1]);
  if (!Number.isSafeInteger(seconds)) {
    fail('transaction valid-start seconds exceed safe integer range');
  }
  return seconds;
}

function durationSeconds(
  value: proto.IDuration | null | undefined,
  label: string,
): number {
  if (value === null || value === undefined) fail(`${label} is missing`);
  const rendered = integerString(value.seconds ?? 0, label);
  const duration = Number(rendered);
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    fail(`${label} must be a positive safe integer`);
  }
  return duration;
}

function rawPublicKey(value: string, label: string): PublicKey {
  try {
    if (RAW_ECDSA_KEY.test(value)) return PublicKey.fromStringECDSA(value);
    if (RAW_ED25519_KEY.test(value)) return PublicKey.fromStringED25519(value);
  } catch {
    // The stable error below deliberately hides parser implementation detail.
  }
  fail(`${label} is not a canonical raw Hedera public key`);
}

function batchKey(body: proto.ITransactionBody, label: string): string {
  const key = body.batchKey;
  if (
    key === null ||
    key === undefined ||
    (key as proto.Key).key !== 'ECDSASecp256k1' ||
    key.ECDSASecp256k1 === null ||
    key.ECDSASecp256k1 === undefined
  ) {
    fail(`${label} must use the manifest ECDSA batch key`);
  }
  return Buffer.from(key.ECDSASecp256k1).toString('hex');
}

function assertExactSignatures(
  signed: proto.ISignedTransaction,
  expectedRawKeys: readonly string[],
  label: string,
): void {
  const pairs = signed.sigMap?.sigPair ?? [];
  const expected = [...new Set(expectedRawKeys)].sort();
  if (expected.length !== expectedRawKeys.length) {
    fail(`${label} trusted signer roles must use distinct keys`);
  }
  if (pairs.length !== expected.length) {
    fail(`${label} signature set has the wrong cardinality`);
  }

  const actual: string[] = [];
  for (const [index, pair] of pairs.entries()) {
    const decodedPair = pair as proto.SignaturePair;
    const raw = Buffer.from(pair.pubKeyPrefix ?? []).toString('hex');
    const publicKey = rawPublicKey(raw, `${label} signature ${String(index)}`);
    let signature: Uint8Array | null | undefined;
    if (decodedPair.signature === 'ECDSASecp256k1' && RAW_ECDSA_KEY.test(raw)) {
      signature = pair.ECDSASecp256k1;
    } else if (
      decodedPair.signature === 'ed25519' &&
      RAW_ED25519_KEY.test(raw)
    ) {
      signature = pair.ed25519;
    } else {
      fail(`${label} signature ${String(index)} has a mismatched algorithm`);
    }
    if (
      signature === null ||
      signature === undefined ||
      signature.byteLength !== 64 ||
      signed.bodyBytes === null ||
      signed.bodyBytes === undefined ||
      !publicKey.verify(signed.bodyBytes, signature)
    ) {
      fail(`${label} signature ${String(index)} is invalid`);
    }
    actual.push(raw);
  }
  actual.sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} signature set does not equal the trusted signer set`);
  }
}

function decodeSignedTransaction(
  bytes: Uint8Array,
  expectedRawKeys: readonly string[],
  label: string,
): {
  readonly body: proto.TransactionBody;
  readonly bodyBytes: Uint8Array;
  readonly signed: proto.SignedTransaction;
} {
  let signed: proto.SignedTransaction;
  try {
    signed = proto.SignedTransaction.decode(bytes);
  } catch {
    fail(`${label} SignedTransaction cannot be decoded`);
  }
  assertCanonicalEncoding(
    bytes,
    signed,
    proto.SignedTransaction.encode,
    `${label} SignedTransaction`,
  );
  if (
    signed.bodyBytes.byteLength === 0 ||
    signed.useSerializedTxMessageHashAlgorithm
  ) {
    fail(`${label} must contain canonical body bytes and standard hashing`);
  }
  let body: proto.TransactionBody;
  try {
    body = proto.TransactionBody.decode(signed.bodyBytes);
  } catch {
    fail(`${label} TransactionBody cannot be decoded`);
  }
  assertCanonicalEncoding(
    signed.bodyBytes,
    body,
    proto.TransactionBody.encode,
    `${label} TransactionBody`,
  );
  assertExactSignatures(signed, expectedRawKeys, label);
  return { body, bodyBytes: signed.bodyBytes, signed };
}

function assertCommonBody(
  body: proto.TransactionBody,
  intent: DualTokenSettlementIntentV2,
  expectedId: string,
  expectedData: proto.TransactionBody['data'],
  label: string,
  inner: boolean,
): void {
  const actualId = transactionId(body.transactionID, `${label} ID`);
  if (actualId !== expectedId) fail(`${label} transaction ID does not match`);
  if (transactionIdAccount(actualId) !== intent.payerAccountId) {
    fail(`${label} transaction ID payer does not match`);
  }
  if (
    durationSeconds(body.transactionValidDuration, `${label} duration`) !==
    intent.validDurationSeconds
  ) {
    fail(`${label} valid duration does not match`);
  }
  if (body.data !== expectedData)
    fail(`${label} operation type does not match`);
  if (
    body.memo !== '' ||
    body.generateRecord ||
    body.highVolume ||
    (body.maxCustomFees?.length ?? 0) !== 0
  ) {
    fail(`${label} contains an unsupported memo, flag, or custom-fee limit`);
  }
  const node = accountId(body.nodeAccountID, `${label} node`);
  if (inner) {
    if (node !== '0.0.0') fail(`${label} inner node must be 0.0.0`);
    if (batchKey(body, label) !== intent.batchKey) {
      fail(`${label} batch key does not match`);
    }
  } else if (body.batchKey !== null && body.batchKey !== undefined) {
    fail(`${label} outer transaction must not itself carry a batch key`);
  }
}

function assertUnfreeze(
  body: proto.TransactionBody,
  intent: DualTokenSettlementIntentV2,
): void {
  const operation = body.tokenUnfreeze;
  if (
    tokenId(operation?.token, 'control unfreeze token') !==
      intent.controlTokenId ||
    accountId(operation?.account, 'control unfreeze account') !==
      intent.controlHolderAccountId
  ) {
    fail('CONTROL_UNFREEZE does not match the control token and holder');
  }
}

function assertNoTransferHooksOrAllowance(
  transfer: proto.IAccountAmount | proto.INftTransfer,
  label: string,
): void {
  const value = transfer as Record<string, unknown>;
  if (
    transfer.isApproval === true ||
    value.hookCall !== undefined ||
    value.senderAllowanceHookCall !== undefined ||
    value.receiverAllowanceHookCall !== undefined
  ) {
    fail(`${label} uses an allowance or hook`);
  }
}

function expectedFungibleTransfers(
  intent: DualTokenSettlementIntentV2,
): readonly string[] {
  return [
    `${intent.payerAccountId}:${(-BigInt(intent.amountAtoms)).toString()}`,
    `${intent.payableHolderAccountId}:${intent.amountAtoms}`,
  ].sort();
}

function assertTransfer(
  body: proto.TransactionBody,
  intent: DualTokenSettlementIntentV2,
): void {
  const transfer = body.cryptoTransfer;
  if (transfer === null || transfer === undefined) {
    fail('ATOMIC_TRANSFER body is missing');
  }
  const hbar = transfer.transfers?.accountAmounts ?? [];
  const tokenLists = transfer.tokenTransfers ?? [];
  const settlementIsHbar = intent.settlementAssetTokenId === '0.0.0';
  const expectedListCount = settlementIsHbar ? 2 : 3;
  if (tokenLists.length !== expectedListCount) {
    fail('ATOMIC_TRANSFER has an unexpected token transfer list');
  }

  let settlementTransfers: readonly proto.IAccountAmount[];
  if (settlementIsHbar) {
    settlementTransfers = hbar;
  } else {
    if (hbar.length !== 0) fail('ATOMIC_TRANSFER contains unexpected HBAR');
    const settlement = tokenLists.filter(
      (list) =>
        tokenId(list.token, 'settlement transfer token') ===
        intent.settlementAssetTokenId,
    );
    if (
      settlement.length !== 1 ||
      (settlement[0]?.nftTransfers?.length ?? 0) !== 0 ||
      (settlement[0]?.expectedDecimals !== undefined &&
        settlement[0]?.expectedDecimals !== null)
    ) {
      fail('ATOMIC_TRANSFER settlement token list is not exact');
    }
    settlementTransfers = settlement[0]?.transfers ?? [];
  }
  if (settlementTransfers.length !== 2) {
    fail('ATOMIC_TRANSFER settlement leg must have exactly two entries');
  }
  const actualFungible = settlementTransfers
    .map((entry, index) => {
      assertNoTransferHooksOrAllowance(
        entry,
        `settlement transfer ${String(index)}`,
      );
      return `${accountId(entry.accountID, 'settlement account')}:${integerString(
        entry.amount,
        'settlement amount',
      )}`;
    })
    .sort();
  const expectedFungible = expectedFungibleTransfers(intent);
  if (
    actualFungible.some((entry, index) => entry !== expectedFungible[index])
  ) {
    fail('ATOMIC_TRANSFER settlement amount or accounts do not match');
  }

  const nftLists = tokenLists.filter(
    (list) =>
      tokenId(list.token, 'NFT transfer token') === intent.payableTokenId ||
      tokenId(list.token, 'NFT transfer token') === intent.controlTokenId,
  );
  if (nftLists.length !== 2) {
    fail('ATOMIC_TRANSFER must contain exactly the Payable and Control NFTs');
  }
  const expectedNfts = [
    `${intent.payableTokenId}/${String(intent.payableSerial)}:${intent.payableHolderAccountId}->${intent.treasuryAccountId}`,
    `${intent.controlTokenId}/${String(intent.controlSerial)}:${intent.controlHolderAccountId}->${intent.treasuryAccountId}`,
  ].sort();
  const actualNfts = nftLists
    .flatMap((list) => {
      const fungibleTransfers = list.transfers ?? [];
      const nftTransfers = list.nftTransfers ?? [];
      if (
        fungibleTransfers.length !== 0 ||
        nftTransfers.length !== 1 ||
        (list.expectedDecimals !== undefined && list.expectedDecimals !== null)
      ) {
        fail('ATOMIC_TRANSFER NFT list contains extra transfer semantics');
      }
      const nft = nftTransfers[0];
      if (nft === undefined) fail('ATOMIC_TRANSFER NFT entry is missing');
      assertNoTransferHooksOrAllowance(nft, 'NFT transfer');
      return [
        `${tokenId(list.token, 'NFT token')}/${integerString(
          nft.serialNumber,
          'NFT serial',
        )}:${accountId(nft.senderAccountID, 'NFT sender')}->${accountId(
          nft.receiverAccountID,
          'NFT receiver',
        )}`,
      ];
    })
    .sort();
  if (actualNfts.some((entry, index) => entry !== expectedNfts[index])) {
    fail('ATOMIC_TRANSFER NFT IDs, serials, or accounts do not match');
  }
}

function assertBurn(
  body: proto.TransactionBody,
  expectedTokenId: string,
  expectedSerial: number,
  label: string,
): void {
  const burn = body.tokenBurn;
  const serialNumbers = burn?.serialNumbers ?? [];
  if (
    burn === null ||
    burn === undefined ||
    tokenId(burn.token, `${label} token`) !== expectedTokenId ||
    integerString(burn.amount ?? 0, `${label} amount`) !== '0' ||
    serialNumbers.length !== 1 ||
    integerString(serialNumbers[0], `${label} serial`) !==
      String(expectedSerial)
  ) {
    fail(`${label} token or serial does not match`);
  }
}

export function dualTokenCommitmentMessage(
  intent: DualTokenSettlementIntentV2,
  outcome: DualTokenCommitmentOutcome,
): string {
  return JSON.stringify({
    actionDigest: intent.actionDigest,
    authorityMode: DUAL_TOKEN_COMMITMENT_AUTHORITY_MODE,
    event: DUAL_TOKEN_COMMITMENT_EVENT,
    manifestHash: intent.manifestHash,
    outcome,
  });
}

function assertHcs(
  body: proto.TransactionBody,
  intent: DualTokenSettlementIntentV2,
  outcome: DualTokenCommitmentOutcome,
): string {
  const hcs = body.consensusSubmitMessage;
  const expected = dualTokenCommitmentMessage(intent, outcome);
  if (hcs === null || hcs === undefined) {
    fail('HCS_SETTLEMENT_COMMITMENT body is missing');
  }
  if (topicId(hcs.topicID, 'HCS topic') !== intent.auditTopicId) {
    fail('HCS_SETTLEMENT_COMMITMENT topic does not match');
  }
  if (
    hcs.chunkInfo !== null &&
    hcs.chunkInfo !== undefined &&
    (hcs.chunkInfo.total !== 1 ||
      hcs.chunkInfo.number !== 1 ||
      transactionId(
        hcs.chunkInfo.initialTransactionID,
        'HCS initial transaction ID',
      ) !== intent.innerTransactionIds[4])
  ) {
    fail('HCS_SETTLEMENT_COMMITMENT chunk declaration is not exact');
  }
  if (Buffer.from(hcs.message ?? []).toString('utf8') !== expected) {
    fail('HCS_SETTLEMENT_COMMITMENT message does not match');
  }
  return expected;
}

function signedTransactionBytesOnly(
  transaction: proto.ITransaction,
  label: string,
): Uint8Array {
  const signedBytes = transaction.signedTransactionBytes;
  if (
    signedBytes === null ||
    signedBytes === undefined ||
    signedBytes.byteLength === 0 ||
    (transaction.body !== null && transaction.body !== undefined) ||
    (transaction.sigs !== null && transaction.sigs !== undefined) ||
    (transaction.sigMap !== null && transaction.sigMap !== undefined) ||
    (transaction.bodyBytes?.byteLength ?? 0) !== 0
  ) {
    fail(`${label} must use only signedTransactionBytes`);
  }
  return signedBytes;
}

export function verifyDualTokenWireBatch(
  input: VerifyDualTokenWireBatchInput,
): DualTokenWireBatchAudit {
  assertDualTokenSettlementIntent(input.intent, {
    ...(input.nowEpochSeconds === undefined
      ? {}
      : { nowEpochSeconds: input.nowEpochSeconds }),
  });
  const trusted = input.trustedSigners;
  const allTrusted = [
    input.intent.batchKey,
    trusted.operatorKey,
    trusted.controlFreezeKey,
    trusted.payableHolderKey,
    trusted.controlHolderKey,
    trusted.payableSupplyKey,
    trusted.controlSupplyKey,
    trusted.topicSubmitKey,
  ];
  for (const [index, key] of allTrusted.entries()) {
    rawPublicKey(key, `trusted signer ${String(index)}`);
  }
  if (new Set(allTrusted).size !== allTrusted.length) {
    fail('all trusted signer roles and the batch key must be distinct');
  }

  let list: proto.TransactionList;
  try {
    list = proto.TransactionList.decode(input.bytes);
  } catch {
    fail('TransactionList cannot be decoded');
  }
  assertCanonicalEncoding(
    input.bytes,
    list,
    proto.TransactionList.encode,
    'TransactionList',
  );
  if (list.transactionList.length === 0) {
    fail('TransactionList has no outer candidate');
  }

  let referenceInnerBytes: readonly Uint8Array[] | undefined;
  let referenceFee: string | undefined;
  const nodes = new Set<string>();
  let commitmentMessage = '';

  for (const [candidateIndex, transaction] of list.transactionList.entries()) {
    const label = `outer candidate ${String(candidateIndex)}`;
    const candidateBytes = proto.Transaction.encode(transaction).finish();
    if (
      candidateBytes.byteLength !== input.intent.batchBytes ||
      candidateBytes.byteLength > 6_144
    ) {
      fail(`${label} byte length does not equal bounded manifest batchBytes`);
    }
    const signedBytes = signedTransactionBytesOnly(transaction, label);
    assertCanonicalEncoding(
      signedBytes,
      proto.SignedTransaction.decode(signedBytes),
      proto.SignedTransaction.encode,
      `${label} envelope`,
    );
    const { body } = decodeSignedTransaction(
      signedBytes,
      [input.intent.batchKey, trusted.operatorKey],
      label,
    );
    assertCommonBody(
      body,
      input.intent,
      input.intent.outerTransactionId,
      'atomicBatch',
      label,
      false,
    );
    const node = accountId(body.nodeAccountID, `${label} node`);
    if (nodes.has(node)) fail('outer candidates repeat a node account');
    nodes.add(node);
    const fee = integerString(body.transactionFee ?? 0, `${label} fee`);
    if (referenceFee !== undefined && fee !== referenceFee) {
      fail('outer candidate transaction fees differ');
    }
    referenceFee = fee;
    const innerBytes = body.atomicBatch?.transactions ?? [];
    if (innerBytes.length !== 5) {
      fail(`${label} must contain exactly five inner transactions`);
    }
    if (
      referenceInnerBytes !== undefined &&
      innerBytes.some(
        (bytes, index) =>
          referenceInnerBytes?.[index] === undefined ||
          !bytesEqual(bytes, referenceInnerBytes[index] as Uint8Array),
      )
    ) {
      fail('outer candidates do not contain identical signed inner bytes');
    }
    referenceInnerBytes ??= innerBytes;

    if (candidateIndex === 0) {
      const signerSets = [
        [trusted.operatorKey, trusted.controlFreezeKey],
        [
          trusted.operatorKey,
          trusted.payableHolderKey,
          trusted.controlHolderKey,
        ],
        [trusted.operatorKey, trusted.payableSupplyKey],
        [trusted.operatorKey, trusted.controlSupplyKey],
        [trusted.operatorKey, trusted.topicSubmitKey],
      ] as const;
      const dataCases = [
        'tokenUnfreeze',
        'cryptoTransfer',
        'tokenBurn',
        'tokenBurn',
        'consensusSubmitMessage',
      ] as const;
      const bodies = innerBytes.map((bytes, index) => {
        const decoded = decodeSignedTransaction(
          bytes,
          signerSets[index] ?? [],
          `inner ${String(index)}`,
        );
        assertCommonBody(
          decoded.body,
          input.intent,
          input.intent.innerTransactionIds[index] ?? '',
          dataCases[index],
          `inner ${String(index)}`,
          true,
        );
        return decoded.body;
      });
      if (
        validStartSeconds(input.intent.innerTransactionIds[0] ?? '') !==
        input.intent.validStartEpochSeconds
      ) {
        fail(
          'manifest validStartEpochSeconds does not match the first inner ID',
        );
      }
      const [unfreeze, transfer, payableBurn, controlBurn, hcs] = bodies;
      if (
        unfreeze === undefined ||
        transfer === undefined ||
        payableBurn === undefined ||
        controlBurn === undefined ||
        hcs === undefined
      ) {
        fail('one or more required inner bodies are missing');
      }
      assertUnfreeze(unfreeze, input.intent);
      assertTransfer(transfer, input.intent);
      assertBurn(
        payableBurn,
        input.intent.payableTokenId,
        input.intent.payableSerial,
        'PAYABLE_BURN',
      );
      assertBurn(
        controlBurn,
        input.intent.controlTokenId,
        input.intent.controlSerial,
        'CONTROL_BURN',
      );
      commitmentMessage = assertHcs(hcs, input.intent, input.commitmentOutcome);
    }
  }

  return {
    batchBytes: input.intent.batchBytes,
    commitmentMessage,
    innerTransactionIds: input.intent.innerTransactionIds,
    manifestHash: input.intent.manifestHash,
    outerCandidates: list.transactionList.length,
    outerTransactionId: input.intent.outerTransactionId,
  };
}
