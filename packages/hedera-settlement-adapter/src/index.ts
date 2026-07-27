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
 * A real HBAR transfer from the operator to the supplier account, memo-bound
 * to the approved action digest so the on-ledger record points back at
 * exactly what was authorized. The amount is a fixed demo sum in tinybars;
 * the invoice's fiat amount is the payable's face value, not what moves.
 */

const DEMO_TRANSFER_TINYBARS = 100_000;

export interface SettlementReceipt {
  readonly consensusStatus: string;
  readonly hashscanUrl: string;
  readonly transactionId: string;
}

export interface SettlementCredentials {
  readonly operatorId: string;
  readonly operatorKey: string;
  readonly supplierAccountId: string;
}

export async function executeSupplierSettlement(input: {
  readonly actionDigest: string;
  readonly invoiceId: string;
  readonly credentials: SettlementCredentials;
}): Promise<SettlementReceipt> {
  const { operatorId, operatorKey, supplierAccountId } = input.credentials;
  const key = PrivateKey.fromStringECDSA(operatorKey.replace(/^0x/u, ''));

  const client = Client.forTestnet().setOperator(operatorId, key);
  try {
    const response = await new TransferTransaction()
      .addHbarTransfer(
        AccountId.fromString(operatorId),
        Hbar.fromTinybars(-DEMO_TRANSFER_TINYBARS),
      )
      .addHbarTransfer(
        AccountId.fromString(supplierAccountId),
        Hbar.fromTinybars(DEMO_TRANSFER_TINYBARS),
      )
      // 100-byte memo limit; the digest prefix is enough to correlate.
      .setTransactionMemo(
        `remit:${input.invoiceId.slice(0, 24)}:${input.actionDigest.slice(0, 32)}`,
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
