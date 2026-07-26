export const HEDERA_EVIDENCE_IDS = {
  hts: {
    actionDigest:
      '8dfc4f58375b0b57e4fbb296732c83e55e61f1c7ce94dea0e0994c1a290f5d1d',
    burnTransactionId: '0.0.9708355-1785041302-248047264',
    createTransactionId: '0.0.9708355-1785041294-342974356',
    mintTransactionId: '0.0.9708355-1785041298-535173099',
    tokenId: '0.0.9762937',
    treasuryAccountId: '0.0.9708355',
  },
  x402: {
    amountTinybar: 1_000_000,
    facilitatorAccountId: '0.0.9758618',
    feeCollectorAccountId: '0.0.802',
    networkFeeTinybar: 282_113,
    payerAccountId: '0.0.9708355',
    serviceAccountId: '0.0.9758583',
    transactionId: '0.0.9758618-1785026108-927419230',
  },
} as const;

const ENTITY_ID = /^\d+\.\d+\.\d+$/;
const CONSENSUS_TIMESTAMP = /^\d+\.\d{9}$/;
const TRANSACTION_HASH = /^[A-Za-z0-9+/]+={0,2}$/;

type JsonRecord = Record<string, unknown>;

export class MirrorEvidenceValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MirrorEvidenceValidationError';
  }
}

export interface ValidatedTransaction {
  readonly consensusTimestamp: string;
  readonly hashScanUrl: string;
  readonly mirrorUrl: string;
  readonly transactionHash: string;
  readonly transactionId: string;
}

export interface ValidatedHederaEvidence {
  readonly hts: {
    readonly actionDigest: '8dfc4f58375b0b57e4fbb296732c83e55e61f1c7ce94dea0e0994c1a290f5d1d';
    readonly burn: ValidatedTransaction;
    readonly create: ValidatedTransaction;
    readonly currentSupply: 0;
    readonly maxSupply: 1;
    readonly mint: ValidatedTransaction;
    readonly nftMirrorUrl: string;
    readonly name: 'Remit Payable Markers - NO VALUE';
    readonly serialNumber: 1;
    readonly supplyKeyPresent: true;
    readonly symbol: 'RMPAY';
    readonly tokenId: '0.0.9762937';
    readonly treasuryAccountId: '0.0.9708355';
    readonly type: 'NON_FUNGIBLE_UNIQUE';
  };
  readonly x402: ValidatedTransaction & {
    readonly amountTinybar: 1_000_000;
    readonly facilitatorAccountId: '0.0.9758618';
    readonly networkFeeTinybar: number;
    readonly payerAccountId: '0.0.9708355';
    readonly serviceAccountId: '0.0.9758583';
  };
}

export interface MirrorEvidencePayloads {
  readonly htsBurn: unknown;
  readonly htsCreate: unknown;
  readonly htsMint: unknown;
  readonly htsNft: unknown;
  readonly htsToken: unknown;
  readonly x402Transaction: unknown;
}

function fail(path: string, expectation: string): never {
  throw new MirrorEvidenceValidationError(
    `Unexpected Mirror response at ${path}: ${expectation}`,
  );
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'expected object');
  }
  return value as JsonRecord;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) return fail(path, 'expected array');
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') return fail(path, 'expected string');
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return fail(path, 'expected safe integer');
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail(path, 'expected boolean');
  return value;
}

function expectEqual<T>(
  value: T,
  expected: T,
  path: string,
): asserts value is T {
  if (value !== expected) fail(path, `expected ${String(expected)}`);
}

function expectNull(value: unknown, path: string): void {
  if (value !== null) fail(path, 'expected null');
}

function transactionUrl(transactionId: string): string {
  return `https://hashscan.io/testnet/transaction/${transactionId}`;
}

function mirrorTransactionUrl(transactionId: string): string {
  return `https://testnet.mirrornode.hedera.com/api/v1/transactions/${transactionId}`;
}

function readTransaction(
  payload: unknown,
  expectedId: string,
  expectedName: string,
): JsonRecord & ValidatedTransaction {
  const root = record(payload, 'response');
  const transactions = array(root['transactions'], 'response.transactions');
  if (transactions.length !== 1) {
    fail('response.transactions', 'expected exactly one transaction');
  }

  const transaction = record(transactions[0], 'response.transactions[0]');
  const transactionId = string(
    transaction['transaction_id'],
    'transaction.transaction_id',
  );
  expectEqual(transactionId, expectedId, 'transaction.transaction_id');
  const name = string(transaction['name'], 'transaction.name');
  expectEqual(name, expectedName, 'transaction.name');
  const result = string(transaction['result'], 'transaction.result');
  expectEqual(result, 'SUCCESS', 'transaction.result');

  const consensusTimestamp = string(
    transaction['consensus_timestamp'],
    'transaction.consensus_timestamp',
  );
  if (!CONSENSUS_TIMESTAMP.test(consensusTimestamp)) {
    fail('transaction.consensus_timestamp', 'expected canonical timestamp');
  }

  const transactionHash = string(
    transaction['transaction_hash'],
    'transaction.transaction_hash',
  );
  if (!TRANSACTION_HASH.test(transactionHash)) {
    fail('transaction.transaction_hash', 'expected base64 transaction hash');
  }

  return {
    ...transaction,
    consensusTimestamp,
    hashScanUrl: transactionUrl(transactionId),
    mirrorUrl: mirrorTransactionUrl(transactionId),
    transactionHash,
    transactionId,
  };
}

interface Transfer {
  readonly account: string;
  readonly amount: number;
  readonly isApproval: false;
}

function readTransfers(transaction: JsonRecord): readonly Transfer[] {
  const values = array(transaction['transfers'], 'transaction.transfers');
  return values.map((value, index) => {
    const transfer = record(value, `transaction.transfers[${index}]`);
    const account = string(
      transfer['account'],
      `transaction.transfers[${index}].account`,
    );
    if (!ENTITY_ID.test(account)) {
      fail(
        `transaction.transfers[${index}].account`,
        'expected canonical Hedera entity ID',
      );
    }
    const isApproval = boolean(
      transfer['is_approval'],
      `transaction.transfers[${index}].is_approval`,
    );
    expectEqual(
      isApproval,
      false,
      `transaction.transfers[${index}].is_approval`,
    );
    return {
      account,
      amount: integer(
        transfer['amount'],
        `transaction.transfers[${index}].amount`,
      ),
      isApproval: false,
    };
  });
}

function uniqueTransferMap(
  transfers: readonly Transfer[],
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const transfer of transfers) {
    if (result.has(transfer.account)) {
      fail('transaction.transfers', 'expected one transfer per account');
    }
    result.set(transfer.account, transfer.amount);
  }
  return result;
}

function validateX402(payload: unknown): ValidatedHederaEvidence['x402'] {
  const expected = HEDERA_EVIDENCE_IDS.x402;
  const transaction = readTransaction(
    payload,
    expected.transactionId,
    'CRYPTOTRANSFER',
  );
  const chargedFee = integer(
    transaction['charged_tx_fee'],
    'transaction.charged_tx_fee',
  );
  if (chargedFee <= 0) {
    fail('transaction.charged_tx_fee', 'expected a positive fee');
  }
  expectEqual(
    chargedFee,
    expected.networkFeeTinybar,
    'transaction.charged_tx_fee',
  );
  expectEqual(
    string(transaction['memo_base64'], 'transaction.memo_base64'),
    '',
    'transaction.memo_base64',
  );

  const transfers = readTransfers(transaction);
  if (transfers.length !== 4) {
    fail('transaction.transfers', 'expected exactly four account transfers');
  }
  const byAccount = uniqueTransferMap(transfers);
  expectEqual(
    byAccount.get(expected.payerAccountId),
    -expected.amountTinybar,
    'transaction.transfers[payer]',
  );
  expectEqual(
    byAccount.get(expected.serviceAccountId),
    expected.amountTinybar,
    'transaction.transfers[service]',
  );
  expectEqual(
    byAccount.get(expected.facilitatorAccountId),
    -chargedFee,
    'transaction.transfers[facilitator]',
  );

  expectEqual(
    byAccount.get(expected.feeCollectorAccountId),
    chargedFee,
    'transaction.transfers[fee_collector]',
  );
  if (transfers.reduce((sum, transfer) => sum + transfer.amount, 0) !== 0) {
    fail('transaction.transfers', 'expected a balanced transfer list');
  }

  return {
    amountTinybar: expected.amountTinybar,
    consensusTimestamp: transaction.consensusTimestamp,
    facilitatorAccountId: expected.facilitatorAccountId,
    hashScanUrl: transaction.hashScanUrl,
    mirrorUrl: transaction.mirrorUrl,
    networkFeeTinybar: chargedFee,
    payerAccountId: expected.payerAccountId,
    serviceAccountId: expected.serviceAccountId,
    transactionHash: transaction.transactionHash,
    transactionId: transaction.transactionId,
  };
}

function validateToken(payload: unknown): void {
  const expected = HEDERA_EVIDENCE_IDS.hts;
  const token = record(payload, 'token');
  expectEqual(
    string(token['token_id'], 'token.token_id'),
    expected.tokenId,
    'token.token_id',
  );
  expectEqual(
    string(token['name'], 'token.name'),
    'Remit Payable Markers - NO VALUE',
    'token.name',
  );
  expectEqual(string(token['symbol'], 'token.symbol'), 'RMPAY', 'token.symbol');
  expectEqual(
    string(token['type'], 'token.type'),
    'NON_FUNGIBLE_UNIQUE',
    'token.type',
  );
  expectEqual(
    string(token['decimals'], 'token.decimals'),
    '0',
    'token.decimals',
  );
  expectEqual(
    string(token['treasury_account_id'], 'token.treasury_account_id'),
    expected.treasuryAccountId,
    'token.treasury_account_id',
  );
  expectEqual(
    string(token['initial_supply'], 'token.initial_supply'),
    '0',
    'token.initial_supply',
  );
  expectEqual(
    string(token['total_supply'], 'token.total_supply'),
    '0',
    'token.total_supply',
  );
  expectEqual(
    string(token['max_supply'], 'token.max_supply'),
    '1',
    'token.max_supply',
  );
  expectEqual(
    string(token['supply_type'], 'token.supply_type'),
    'FINITE',
    'token.supply_type',
  );
  expectEqual(
    boolean(token['deleted'], 'token.deleted'),
    false,
    'token.deleted',
  );
  expectEqual(
    boolean(token['freeze_default'], 'token.freeze_default'),
    false,
    'token.freeze_default',
  );

  for (const key of [
    'admin_key',
    'fee_schedule_key',
    'freeze_key',
    'kyc_key',
    'metadata_key',
    'pause_key',
    'wipe_key',
  ] as const) {
    expectNull(token[key], `token.${key}`);
  }

  const customFees = record(token['custom_fees'], 'token.custom_fees');
  if (
    array(customFees['fixed_fees'], 'token.custom_fees.fixed_fees').length !==
      0 ||
    array(customFees['royalty_fees'], 'token.custom_fees.royalty_fees')
      .length !== 0
  ) {
    fail('token.custom_fees', 'expected no custom fees');
  }

  const supplyKey = record(token['supply_key'], 'token.supply_key');
  expectEqual(
    string(supplyKey['_type'], 'token.supply_key._type'),
    'ECDSA_SECP256K1',
    'token.supply_key._type',
  );
  const supplyKeyValue = string(supplyKey['key'], 'token.supply_key.key');
  if (!/^[0-9a-f]+$/i.test(supplyKeyValue) || supplyKeyValue.length < 64) {
    fail('token.supply_key.key', 'expected a public supply key');
  }
}

interface ValidatedNftRecord {
  readonly createdTimestamp: string;
  readonly modifiedTimestamp: string;
  readonly mirrorUrl: string;
}

function validateNftRecord(payload: unknown): ValidatedNftRecord {
  const expected = HEDERA_EVIDENCE_IDS.hts;
  const nft = record(payload, 'nft');
  expectEqual(
    string(nft['token_id'], 'nft.token_id'),
    expected.tokenId,
    'nft.token_id',
  );
  expectEqual(
    integer(nft['serial_number'], 'nft.serial_number'),
    1,
    'nft.serial_number',
  );
  expectEqual(boolean(nft['deleted'], 'nft.deleted'), true, 'nft.deleted');
  expectNull(nft['account_id'], 'nft.account_id');
  expectNull(nft['delegating_spender'], 'nft.delegating_spender');
  expectNull(nft['spender'], 'nft.spender');

  const metadata = string(nft['metadata'], 'nft.metadata');
  const expectedMetadata =
    'OGRmYzRmNTgzNzViMGI1N2U0ZmJiMjk2NzMyYzgzZTU1ZTYxZjFjN2NlOTRkZWEwZTA5OTRjMWEyOTBmNWQxZA==';
  expectEqual(metadata, expectedMetadata, 'nft.metadata');

  const createdTimestamp = string(
    nft['created_timestamp'],
    'nft.created_timestamp',
  );
  const modifiedTimestamp = string(
    nft['modified_timestamp'],
    'nft.modified_timestamp',
  );
  if (
    !CONSENSUS_TIMESTAMP.test(createdTimestamp) ||
    !CONSENSUS_TIMESTAMP.test(modifiedTimestamp)
  ) {
    fail('nft timestamps', 'expected canonical consensus timestamps');
  }

  return {
    createdTimestamp,
    mirrorUrl: `https://testnet.mirrornode.hedera.com/api/v1/tokens/${expected.tokenId}/nfts/1`,
    modifiedTimestamp,
  };
}

function validateTokenLifecycleTransaction(
  payload: unknown,
  expectedId: string,
  expectedName: 'TOKENBURN' | 'TOKENCREATION' | 'TOKENMINT',
): ValidatedTransaction {
  const expected = HEDERA_EVIDENCE_IDS.hts;
  const transaction = readTransaction(payload, expectedId, expectedName);
  expectEqual(
    string(transaction['entity_id'], 'transaction.entity_id'),
    expected.tokenId,
    'transaction.entity_id',
  );

  if (expectedName !== 'TOKENCREATION') {
    const nftTransfers = array(
      transaction['nft_transfers'],
      'transaction.nft_transfers',
    );
    if (nftTransfers.length !== 1) {
      fail('transaction.nft_transfers', 'expected exactly one NFT transfer');
    }
    const nftTransfer = record(nftTransfers[0], 'transaction.nft_transfers[0]');
    expectEqual(
      string(nftTransfer['token_id'], 'nft_transfer.token_id'),
      expected.tokenId,
      'nft_transfer.token_id',
    );
    expectEqual(
      integer(nftTransfer['serial_number'], 'nft_transfer.serial_number'),
      1,
      'nft_transfer.serial_number',
    );
    expectEqual(
      boolean(nftTransfer['is_approval'], 'nft_transfer.is_approval'),
      false,
      'nft_transfer.is_approval',
    );

    if (expectedName === 'TOKENMINT') {
      expectNull(nftTransfer['sender_account_id'], 'nft_transfer.sender');
      expectEqual(
        string(nftTransfer['receiver_account_id'], 'nft_transfer.receiver'),
        expected.treasuryAccountId,
        'nft_transfer.receiver',
      );
    } else {
      expectEqual(
        string(nftTransfer['sender_account_id'], 'nft_transfer.sender'),
        expected.treasuryAccountId,
        'nft_transfer.sender',
      );
      expectNull(nftTransfer['receiver_account_id'], 'nft_transfer.receiver');
    }
  }

  return {
    consensusTimestamp: transaction.consensusTimestamp,
    hashScanUrl: transaction.hashScanUrl,
    mirrorUrl: transaction.mirrorUrl,
    transactionHash: transaction.transactionHash,
    transactionId: transaction.transactionId,
  };
}

export function validateHederaMirrorEvidence(
  payloads: MirrorEvidencePayloads,
): ValidatedHederaEvidence {
  validateToken(payloads.htsToken);
  const nft = validateNftRecord(payloads.htsNft);
  const expected = HEDERA_EVIDENCE_IDS.hts;
  const create = validateTokenLifecycleTransaction(
    payloads.htsCreate,
    expected.createTransactionId,
    'TOKENCREATION',
  );
  const mint = validateTokenLifecycleTransaction(
    payloads.htsMint,
    expected.mintTransactionId,
    'TOKENMINT',
  );
  const burn = validateTokenLifecycleTransaction(
    payloads.htsBurn,
    expected.burnTransactionId,
    'TOKENBURN',
  );
  expectEqual(
    nft.createdTimestamp,
    mint.consensusTimestamp,
    'nft.created_timestamp',
  );
  expectEqual(
    nft.modifiedTimestamp,
    burn.consensusTimestamp,
    'nft.modified_timestamp',
  );

  return {
    hts: {
      actionDigest: expected.actionDigest,
      burn,
      create,
      currentSupply: 0,
      maxSupply: 1,
      mint,
      nftMirrorUrl: nft.mirrorUrl,
      name: 'Remit Payable Markers - NO VALUE',
      serialNumber: 1,
      supplyKeyPresent: true,
      symbol: 'RMPAY',
      tokenId: expected.tokenId,
      treasuryAccountId: expected.treasuryAccountId,
      type: 'NON_FUNGIBLE_UNIQUE',
    },
    x402: validateX402(payloads.x402Transaction),
  };
}
