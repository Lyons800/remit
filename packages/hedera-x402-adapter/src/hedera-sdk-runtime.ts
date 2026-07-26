import { createRequire } from 'node:module';

type LongLike = Readonly<{
  isNegative(): boolean;
  isPositive(): boolean;
  isZero(): boolean;
  toString(): string;
}>;

type AccountIdLike = Readonly<{
  aliasKey: unknown | null;
  evmAddress: unknown | null;
  toString(): string;
}>;

type TransactionIdLike = Readonly<{
  accountId: AccountIdLike | null;
  nonce: LongLike | null;
  scheduled: boolean | null;
  toString(): string;
  validStart: unknown | null;
}>;

type HbarLike = Readonly<{
  toTinybars(): LongLike;
}>;

type TransferLike = Readonly<{
  accountId: AccountIdLike;
  amount: HbarLike;
  isApproved: boolean;
}>;

type ObjectMapLike = Readonly<{
  size: number;
}>;

type TransactionLike = Readonly<{
  getSignatures(): Readonly<{
    getFlatSignatureList(): readonly Readonly<{ size: number }>[];
  }>;
  hbarTransfersList?: readonly TransferLike[];
  isFrozen(): boolean;
  maxTransactionFee: HbarLike | null;
  nftTransfers?: ObjectMapLike;
  nodeAccountIds: readonly AccountIdLike[] | null;
  tokenTransfers?: ObjectMapLike;
  toBytesAsync(): Promise<Uint8Array>;
  transactionId: TransactionIdLike | null;
  transactionMemo: string;
}>;

type HederaSdkRuntime = Readonly<{
  AccountId: Readonly<{
    fromString(value: string): AccountIdLike;
  }>;
  Transaction: Readonly<{
    fromBytes(bytes: Uint8Array): TransactionLike;
  }>;
  TransactionId: Readonly<{
    fromString(value: string): TransactionIdLike;
  }>;
  TransferTransaction: abstract new (...args: never[]) => TransactionLike;
}>;

const require = createRequire(import.meta.url);
const sdk = require('@hiero-ledger/sdk') as HederaSdkRuntime;

export function parseCanonicalEntityId(value: string): AccountIdLike {
  return sdk.AccountId.fromString(value);
}

export function parseCanonicalTransactionId(value: string): TransactionIdLike {
  return sdk.TransactionId.fromString(value);
}

export function decodeHederaTransaction(bytes: Uint8Array): Readonly<{
  isTransfer: boolean;
  transaction: TransactionLike;
}> {
  const transaction = sdk.Transaction.fromBytes(bytes);
  return {
    isTransfer: transaction instanceof sdk.TransferTransaction,
    transaction,
  };
}
