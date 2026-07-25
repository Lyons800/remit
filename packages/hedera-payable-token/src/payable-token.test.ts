import { describe, expect, it } from 'vitest';

import {
  buildPayableMintPlan,
  consumePayable,
  hashscanTransactionUrl,
  PayableTokenError,
  validatePayableMintEvidence,
  type PayableBurnEvidence,
  type PayableMintEvidence,
} from './payable-token.js';

const DIGEST = `sha256:${'a1'.repeat(32)}`;
const OTHER_DIGEST = `sha256:${'b2'.repeat(32)}`;

const plan = buildPayableMintPlan(DIGEST);

const mint: PayableMintEvidence = {
  consensusTimestamp: '1785012001.000000001',
  metadataOnLedger: DIGEST,
  receiptStatus: 'SUCCESS',
  serial: 7,
  tokenId: '0.0.4991234',
  transactionId: '0.0.1234567@1785012000.123456789',
};

const burn: PayableBurnEvidence = {
  consensusTimestamp: '1785012601.000000001',
  receiptStatus: 'SUCCESS',
  serial: 7,
  tokenId: '0.0.4991234',
  transactionId: '0.0.1234567@1785012600.987654321',
};

describe('mint plan', () => {
  it('carries the digest as the exact metadata, under the HTS cap', () => {
    expect(plan.metadata).toBe(DIGEST);
    expect(Buffer.byteLength(plan.metadata, 'ascii')).toBeLessThanOrEqual(100);
  });

  it('refuses non-canonical digests', () => {
    expect(() => buildPayableMintPlan('sha256:short')).toThrow(
      PayableTokenError,
    );
    expect(() => buildPayableMintPlan(`0x${'a1'.repeat(32)}`)).toThrow(
      PayableTokenError,
    );
  });
});

describe('mint evidence', () => {
  it('accepts matching mirror-read evidence', () => {
    expect(() => validatePayableMintEvidence(plan, mint)).not.toThrow();
  });

  it('refuses ledger metadata that differs from the digest', () => {
    expect(() =>
      validatePayableMintEvidence(plan, {
        ...mint,
        metadataOnLedger: OTHER_DIGEST,
      }),
    ).toThrow(/does not match the action digest/u);
  });

  it('refuses malformed identifiers and failed receipts', () => {
    expect(() =>
      validatePayableMintEvidence(plan, { ...mint, tokenId: 'nope' }),
    ).toThrow(PayableTokenError);
    expect(() =>
      validatePayableMintEvidence(plan, { ...mint, serial: 0 }),
    ).toThrow(PayableTokenError);
  });
});

describe('consumption', () => {
  it('SETTLED + valid burn -> CONSUMED', () => {
    expect(consumePayable('SETTLED', mint, burn)).toBe('CONSUMED');
  });

  it('refuses burn evidence for a different serial', () => {
    expect(() =>
      consumePayable('SETTLED', mint, { ...burn, serial: 8 }),
    ).toThrow(/different payable/u);
  });

  it('refuses reusing the mint transaction as the burn', () => {
    expect(() =>
      consumePayable('SETTLED', mint, {
        ...burn,
        transactionId: mint.transactionId,
      }),
    ).toThrow(/cannot reuse the mint transaction/u);
  });

  it('refuses consumption from any non-settled state', () => {
    expect(() => consumePayable('CAPTURED', mint, burn)).toThrow(
      /only settled payables burn/u,
    );
  });
});

describe('demo links', () => {
  it('encodes hashscan transaction urls', () => {
    expect(hashscanTransactionUrl('0.0.1234567@1785012000.123456789')).toBe(
      'https://hashscan.io/testnet/transaction/0.0.1234567-1785012000-123456789',
    );
  });
});
