import { describe, expect, it } from 'vitest';

import {
  HEDERA_EVIDENCE_IDS,
  MirrorEvidenceValidationError,
  validateHederaMirrorEvidence,
  type MirrorEvidencePayloads,
} from './mirror-evidence.js';

const { hts, x402 } = HEDERA_EVIDENCE_IDS;

function transaction(
  transactionId: string,
  name: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    charged_tx_fee: 1,
    consensus_timestamp: '1785026114.100875266',
    entity_id: null,
    memo_base64: '',
    name,
    nft_transfers: [],
    result: 'SUCCESS',
    transaction_hash:
      'MQQKkfmwg4rN5dNVVpifEqws0Zoea0K3Po17qk2nxebb+8gifvgH01DbuY7oVege',
    transaction_id: transactionId,
    transfers: [],
    ...overrides,
  };
}

function response(value: Record<string, unknown>): Record<string, unknown> {
  return { transactions: [value] };
}

function validPayloads(): MirrorEvidencePayloads {
  const x402Fee = 282_113;
  return {
    htsBurn: response(
      transaction(hts.burnTransactionId, 'TOKENBURN', {
        charged_tx_fee: 1_410_568,
        entity_id: hts.tokenId,
        nft_transfers: [
          {
            is_approval: false,
            receiver_account_id: null,
            sender_account_id: hts.treasuryAccountId,
            serial_number: 1,
            token_id: hts.tokenId,
          },
        ],
      }),
    ),
    htsCreate: response(
      transaction(hts.createTransactionId, 'TOKENCREATION', {
        charged_tx_fee: 1_410_569_869,
        entity_id: hts.tokenId,
      }),
    ),
    htsMint: response(
      transaction(hts.mintTransactionId, 'TOKENMINT', {
        charged_tx_fee: 28_211_396,
        entity_id: hts.tokenId,
        nft_transfers: [
          {
            is_approval: false,
            receiver_account_id: hts.treasuryAccountId,
            sender_account_id: null,
            serial_number: 1,
            token_id: hts.tokenId,
          },
        ],
      }),
    ),
    htsNft: {
      account_id: null,
      created_timestamp: '1785026114.100875266',
      delegating_spender: null,
      deleted: true,
      metadata:
        'MHg1Y2U0ZjNjYWI3Nzk1YzA5Yzg4NGRhNTFlNjkzNjYxODEwYjExY2M0YTAzZDY2MGMxYTc3YTQ0M2QwMTdkZTg5',
      modified_timestamp: '1785026114.100875266',
      serial_number: 1,
      spender: null,
      token_id: hts.tokenId,
    },
    htsToken: {
      admin_key: null,
      decimals: '0',
      deleted: false,
      fee_schedule_key: null,
      freeze_default: false,
      freeze_key: null,
      initial_supply: '0',
      kyc_key: null,
      max_supply: '0',
      metadata_key: null,
      name: 'Remit Payables - NO VALUE',
      pause_key: null,
      supply_key: {
        _type: 'ECDSA_SECP256K1',
        key: '027218920d5eb73809c105ff98c4246a026f518b445b8a2cfebd8c8977d71ec860',
      },
      supply_type: 'INFINITE',
      symbol: 'IGPAY',
      token_id: hts.tokenId,
      total_supply: '0',
      treasury_account_id: hts.treasuryAccountId,
      type: 'NON_FUNGIBLE_UNIQUE',
      wipe_key: null,
    },
    x402Transaction: response(
      transaction(x402.transactionId, 'CRYPTOTRANSFER', {
        charged_tx_fee: x402Fee,
        transfers: [
          { account: '0.0.802', amount: x402Fee, is_approval: false },
          {
            account: x402.payerAccountId,
            amount: -x402.amountTinybar,
            is_approval: false,
          },
          {
            account: x402.serviceAccountId,
            amount: x402.amountTinybar,
            is_approval: false,
          },
          {
            account: x402.facilitatorAccountId,
            amount: -x402Fee,
            is_approval: false,
          },
        ],
      }),
    ),
  };
}

interface MutableMirrorPayloads {
  htsBurn: Record<string, unknown>;
  htsCreate: Record<string, unknown>;
  htsMint: Record<string, unknown>;
  htsNft: Record<string, unknown>;
  htsToken: Record<string, unknown>;
  x402Transaction: Record<string, unknown>;
}

function mutablePayloads(): MutableMirrorPayloads {
  return structuredClone(validPayloads()) as MutableMirrorPayloads;
}

function onlyTransaction(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const transactions = payload['transactions'];
  if (!Array.isArray(transactions) || transactions.length !== 1) {
    throw new Error('Invalid test fixture');
  }
  return transactions[0] as Record<string, unknown>;
}

function recordAt(
  values: readonly Record<string, unknown>[],
  index: number,
): Record<string, unknown> {
  const value = values[index];
  if (value === undefined) throw new Error('Invalid test fixture');
  return value;
}

describe('validateHederaMirrorEvidence', () => {
  it('accepts only the expected public x402 and HTS facts', () => {
    const result = validateHederaMirrorEvidence(validPayloads());

    expect(result.x402).toMatchObject({
      amountTinybar: 1_000_000,
      facilitatorAccountId: '0.0.9758618',
      networkFeeTinybar: 282_113,
      payerAccountId: '0.0.9708355',
      serviceAccountId: '0.0.9758583',
      transactionId: '0.0.9758618-1785026108-927419230',
    });
    expect(result.hts).toMatchObject({
      currentSupply: 0,
      serialNumber: 1,
      tokenId: '0.0.9757606',
      treasuryAccountId: '0.0.9708355',
      type: 'NON_FUNGIBLE_UNIQUE',
    });
    expect(result.x402.hashScanUrl).toBe(
      `https://hashscan.io/testnet/transaction/${x402.transactionId}`,
    );
  });

  it('fails closed when the service receives a substituted amount', () => {
    const payloads = mutablePayloads();
    const transactionValue = onlyTransaction(payloads.x402Transaction);
    const transfers = transactionValue['transfers'] as Record<
      string,
      unknown
    >[];
    recordAt(transfers, 2)['amount'] = 999_999;

    expect(() => validateHederaMirrorEvidence(payloads)).toThrow(
      MirrorEvidenceValidationError,
    );
  });

  it('fails closed when the facilitator fee is not the charged fee', () => {
    const payloads = mutablePayloads();
    const transactionValue = onlyTransaction(payloads.x402Transaction);
    const transfers = transactionValue['transfers'] as Record<
      string,
      unknown
    >[];
    recordAt(transfers, 3)['amount'] = -1;

    expect(() => validateHederaMirrorEvidence(payloads)).toThrow(/facilitator/);
  });

  it('fails closed on a non-successful consensus result', () => {
    const payloads = mutablePayloads();
    onlyTransaction(payloads.x402Transaction)['result'] = 'INVALID_SIGNATURE';

    expect(() => validateHederaMirrorEvidence(payloads)).toThrow(
      /expected SUCCESS/,
    );
  });

  it('fails closed when the x402 transaction memo is not empty', () => {
    const payloads = mutablePayloads();
    onlyTransaction(payloads.x402Transaction)['memo_base64'] =
      'c3Vic3RpdHV0ZQ==';

    expect(() => validateHederaMirrorEvidence(payloads)).toThrow(
      /transaction.memo_base64/,
    );
  });

  it('fails closed when the token is not in its expected zero-supply state', () => {
    const payloads = mutablePayloads();
    payloads.htsToken['total_supply'] = '1';

    expect(() => validateHederaMirrorEvidence(payloads)).toThrow(
      /token.total_supply/,
    );
  });

  it('fails closed when the token supply-key type is substituted', () => {
    const payloads = mutablePayloads();
    const supplyKey = payloads.htsToken['supply_key'] as Record<
      string,
      unknown
    >;
    supplyKey['_type'] = 'ED25519';

    expect(() => validateHederaMirrorEvidence(payloads)).toThrow(
      /token.supply_key._type/,
    );
  });

  it('fails closed when the burned serial did not leave treasury custody', () => {
    const payloads = mutablePayloads();
    const transactionValue = onlyTransaction(payloads.htsBurn);
    const transfers = transactionValue['nft_transfers'] as Record<
      string,
      unknown
    >[];
    recordAt(transfers, 0)['sender_account_id'] = '0.0.1234';

    expect(() => validateHederaMirrorEvidence(payloads)).toThrow(
      /nft_transfer.sender/,
    );
  });

  it('fails closed when the marker metadata digest is substituted', () => {
    const payloads = mutablePayloads();
    payloads.htsNft['metadata'] = 'c3Vic3RpdHV0ZWQ=';

    expect(() => validateHederaMirrorEvidence(payloads)).toThrow(
      /nft.metadata/,
    );
  });

  it('fails closed when Mirror returns an ambiguous transaction set', () => {
    const payloads = mutablePayloads();
    payloads.htsMint['transactions'] = [
      onlyTransaction(payloads.htsMint),
      onlyTransaction(payloads.htsMint),
    ];

    expect(() => validateHederaMirrorEvidence(payloads)).toThrow(
      /exactly one transaction/,
    );
  });
});
