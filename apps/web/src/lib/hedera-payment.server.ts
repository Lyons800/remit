import 'server-only';

import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TransferTransaction,
} from '@hiero-ledger/sdk';

/**
 * Execute one supplier settlement on Hedera Testnet.
 *
 * This is the demo's settlement leg: a real HBAR transfer from the operator to
 * the supplier account, memo-bound to the approved action digest so the
 * on-ledger record points back at exactly what the human approved. It is
 * deliberately a direct SDK call — `packages/hedera-settlement-adapter` is
 * still an empty stub, and pretending otherwise would misdescribe the build.
 *
 * The amount is a fixed demo sum in tinybars, matching `pnpm demo` Act 1. The
 * invoice's EUR amount is narrative; no claim is made that EUR moved.
 */

const DEMO_TRANSFER_TINYBARS = 100_000;

export interface SettlementReceipt {
  readonly consensusStatus: string;
  readonly hashscanUrl: string;
  readonly transactionId: string;
}

function need(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`${key} is not configured`);
  }
  return value;
}

export function isHederaPaymentConfigured(): boolean {
  return [
    'HEDERA_OPERATOR_ID',
    'HEDERA_OPERATOR_KEY',
    'HEDERA_SERVICE_ACCOUNT_ID',
  ]
    .map((key) => process.env[key])
    .every((value) => value !== undefined && value !== '');
}

export async function executeSupplierSettlement(input: {
  readonly actionDigest: string;
  readonly invoiceId: string;
}): Promise<SettlementReceipt> {
  const operatorId = need('HEDERA_OPERATOR_ID');
  const operatorKey = PrivateKey.fromStringECDSA(
    need('HEDERA_OPERATOR_KEY').replace(/^0x/, ''),
  );
  const supplierId = need('HEDERA_SERVICE_ACCOUNT_ID');

  const client = Client.forTestnet().setOperator(operatorId, operatorKey);
  try {
    const response = await new TransferTransaction()
      .addHbarTransfer(
        AccountId.fromString(operatorId),
        Hbar.fromTinybars(-DEMO_TRANSFER_TINYBARS),
      )
      .addHbarTransfer(
        AccountId.fromString(supplierId),
        Hbar.fromTinybars(DEMO_TRANSFER_TINYBARS),
      )
      // 100-byte memo limit; the digest prefix is enough to correlate.
      .setTransactionMemo(
        `remit:${input.invoiceId}:${input.actionDigest.slice(0, 32)}`,
      )
      .execute(client);
    const receipt = await response.getReceipt(client);

    const transactionId = response.transactionId.toString();
    // HashScan uses shard.realm.num-seconds-nanos rather than the SDK's
    // shard.realm.num@seconds.nanos form.
    const [account, timestamp] = transactionId.split('@');
    const hashscanUrl = `https://hashscan.io/testnet/transaction/${account ?? ''}-${(timestamp ?? '').replace('.', '-')}`;

    return {
      consensusStatus: receipt.status.toString(),
      hashscanUrl,
      transactionId,
    };
  } finally {
    client.close();
  }
}
