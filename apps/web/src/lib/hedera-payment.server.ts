import 'server-only';

import {
  executeSupplierSettlement as adapterSettlement,
  type SettlementReceipt,
} from '@remit/hedera-settlement-adapter';

export type { SettlementReceipt };

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
  return adapterSettlement({
    actionDigest: input.actionDigest,
    credentials: {
      operatorId: need('HEDERA_OPERATOR_ID'),
      operatorKey: need('HEDERA_OPERATOR_KEY'),
      supplierAccountId: need('HEDERA_SERVICE_ACCOUNT_ID'),
    },
    invoiceId: input.invoiceId,
  });
}
