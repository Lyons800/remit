const ENTITY_ID = /^\d+\.\d+\.\d+$/u;
const MIRROR_TRANSACTION_ID = /^(\d+\.\d+\.\d+)-(\d+)-(\d{9})$/u;
const SDK_TRANSACTION_ID = /^(\d+\.\d+\.\d+)@(\d+)\.(\d{9})$/u;

type JsonRecord = Record<string, unknown>;

export type X402MirrorExpectation = Readonly<{
  amountTinybar: number;
  facilitatorAccountId: string;
  payerAccountId: string;
  serviceAccountId: string;
  transactionId: string;
}>;

export type AuditedX402Settlement = Readonly<{
  consensusTimestamp: string;
  networkFeeTinybar: number;
  transactionId: string;
}>;

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${path} must be a safe integer`);
  }
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`);
  return value;
}

function exactTransfer(
  transfers: ReadonlyMap<string, number>,
  accountId: string,
  amount: number,
): void {
  if (transfers.get(accountId) !== amount) {
    throw new Error(`unexpected transfer for ${accountId}`);
  }
}

export function normalizeMirrorTransactionId(transactionId: string): string {
  if (MIRROR_TRANSACTION_ID.test(transactionId)) return transactionId;
  const sdk = SDK_TRANSACTION_ID.exec(transactionId);
  if (sdk === null) throw new Error('invalid Hedera transaction ID');
  return `${sdk[1]}-${sdk[2]}-${sdk[3]}`;
}

export function auditX402MirrorPayload(
  payload: unknown,
  expectation: X402MirrorExpectation,
): AuditedX402Settlement {
  for (const accountId of [
    expectation.facilitatorAccountId,
    expectation.payerAccountId,
    expectation.serviceAccountId,
  ]) {
    if (!ENTITY_ID.test(accountId))
      throw new Error('invalid Hedera account ID');
  }
  if (
    !Number.isSafeInteger(expectation.amountTinybar) ||
    expectation.amountTinybar <= 0
  ) {
    throw new Error('amountTinybar must be a positive safe integer');
  }

  const root = record(payload, 'response');
  const transactions = root['transactions'];
  if (!Array.isArray(transactions) || transactions.length !== 1) {
    throw new Error('Mirror must return exactly one transaction');
  }
  const transaction = record(transactions[0], 'transaction');
  const transactionId = normalizeMirrorTransactionId(expectation.transactionId);

  if (
    string(transaction['transaction_id'], 'transaction_id') !== transactionId
  ) {
    throw new Error('Mirror returned a different transaction');
  }
  if (string(transaction['name'], 'name') !== 'CRYPTOTRANSFER') {
    throw new Error('Mirror transaction is not a crypto transfer');
  }
  if (string(transaction['result'], 'result') !== 'SUCCESS') {
    throw new Error('Mirror transaction did not reach SUCCESS');
  }
  if (string(transaction['memo_base64'], 'memo_base64') !== '') {
    throw new Error('direct x402 spike must retain its documented empty memo');
  }

  const networkFeeTinybar = integer(
    transaction['charged_tx_fee'],
    'charged_tx_fee',
  );
  if (networkFeeTinybar <= 0) throw new Error('network fee must be positive');

  const transferValues = transaction['transfers'];
  if (!Array.isArray(transferValues) || transferValues.length !== 4) {
    throw new Error('expected the exact four-party transfer list');
  }
  const transfers = new Map<string, number>();
  for (const [index, value] of transferValues.entries()) {
    const transfer = record(value, `transfers[${String(index)}]`);
    const account = string(transfer['account'], 'transfer.account');
    if (transfers.has(account)) throw new Error('duplicate transfer account');
    if (transfer['is_approval'] !== false) {
      throw new Error('unexpected approved transfer');
    }
    transfers.set(account, integer(transfer['amount'], 'transfer.amount'));
  }

  exactTransfer(
    transfers,
    expectation.payerAccountId,
    -expectation.amountTinybar,
  );
  exactTransfer(
    transfers,
    expectation.serviceAccountId,
    expectation.amountTinybar,
  );
  exactTransfer(
    transfers,
    expectation.facilitatorAccountId,
    -networkFeeTinybar,
  );

  const total = [...transfers.values()].reduce((sum, value) => sum + value, 0);
  if (total !== 0) throw new Error('transfer list is not balanced');
  const feeCollectors = [...transfers.entries()].filter(
    ([account]) =>
      account !== expectation.payerAccountId &&
      account !== expectation.serviceAccountId &&
      account !== expectation.facilitatorAccountId,
  );
  if (
    feeCollectors.length !== 1 ||
    feeCollectors[0]?.[1] !== networkFeeTinybar
  ) {
    throw new Error(
      'network fee collector transfer does not match charged fee',
    );
  }

  return {
    consensusTimestamp: string(
      transaction['consensus_timestamp'],
      'consensus_timestamp',
    ),
    networkFeeTinybar,
    transactionId,
  };
}

export async function readX402MirrorSettlement(
  expectation: X402MirrorExpectation,
  timeoutMs = 30_000,
): Promise<AuditedX402Settlement> {
  const transactionId = normalizeMirrorTransactionId(expectation.transactionId);
  const url = `https://testnet.mirrornode.hedera.com/api/v1/transactions/${transactionId}`;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return auditX402MirrorPayload(await response.json(), expectation);
      }
      lastError = new Error(`Mirror returned HTTP ${String(response.status)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500));
  }

  throw new Error(
    `Mirror did not confirm x402 settlement: ${
      lastError instanceof Error ? lastError.message : 'unknown error'
    }`,
  );
}
