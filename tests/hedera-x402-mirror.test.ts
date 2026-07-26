import { describe, expect, it } from 'vitest';

import {
  auditX402MirrorPayload,
  normalizeMirrorTransactionId,
} from '../scripts/lib/hedera-x402-mirror.js';

const expectation = {
  amountTinybar: 1_000_000,
  facilitatorAccountId: '0.0.9758618',
  payerAccountId: '0.0.9708355',
  serviceAccountId: '0.0.9758583',
  transactionId: '0.0.9758618@1785026905.665197442',
} as const;

function payload() {
  return {
    transactions: [
      {
        charged_tx_fee: 282_113,
        consensus_timestamp: '1785026911.958470572',
        memo_base64: '',
        name: 'CRYPTOTRANSFER',
        result: 'SUCCESS',
        transaction_id: '0.0.9758618-1785026905-665197442',
        transfers: [
          { account: '0.0.802', amount: 282_113, is_approval: false },
          { account: '0.0.9708355', amount: -1_000_000, is_approval: false },
          { account: '0.0.9758583', amount: 1_000_000, is_approval: false },
          { account: '0.0.9758618', amount: -282_113, is_approval: false },
        ],
      },
    ],
  };
}

function transferAt(
  value: ReturnType<typeof payload>,
  index: number,
): { amount: number } {
  const transaction = value.transactions[0];
  const transfer = transaction?.transfers[index];
  if (transfer === undefined) throw new Error('invalid test fixture');
  return transfer;
}

describe('Hedera x402 Mirror audit', () => {
  it('normalizes the SDK transaction ID and verifies the exact transfer', () => {
    expect(normalizeMirrorTransactionId(expectation.transactionId)).toBe(
      '0.0.9758618-1785026905-665197442',
    );
    expect(auditX402MirrorPayload(payload(), expectation)).toEqual({
      consensusTimestamp: '1785026911.958470572',
      networkFeeTinybar: 282_113,
      transactionId: '0.0.9758618-1785026905-665197442',
    });
  });

  it('fails closed when the service amount is substituted', () => {
    const substituted = payload();
    transferAt(substituted, 2).amount = 999_999;
    expect(() => auditX402MirrorPayload(substituted, expectation)).toThrow(
      /unexpected transfer/,
    );
  });

  it('fails closed when the facilitator did not pay the recorded fee', () => {
    const substituted = payload();
    transferAt(substituted, 3).amount = -1;
    expect(() => auditX402MirrorPayload(substituted, expectation)).toThrow(
      /unexpected transfer/,
    );
  });
});
