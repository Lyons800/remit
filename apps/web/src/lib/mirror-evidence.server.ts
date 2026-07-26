import 'server-only';

import {
  HEDERA_EVIDENCE_IDS,
  validateHederaMirrorEvidence,
  type ValidatedHederaEvidence,
} from './mirror-evidence';

const MIRROR_BASE_URL = 'https://testnet.mirrornode.hedera.com/api/v1';
const FETCH_TIMEOUT_MS = 5_000;

export type HederaEvidenceResult =
  | {
      readonly checkedAt: string;
      readonly evidence: ValidatedHederaEvidence;
      readonly status: 'verified';
    }
  | {
      readonly checkedAt: string;
      readonly status: 'mismatch';
    }
  | {
      readonly checkedAt: string;
      readonly status: 'unavailable';
    };

async function fetchMirrorJson(path: string): Promise<unknown> {
  const response = await fetch(`${MIRROR_BASE_URL}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('Mirror request failed');
  const contentType = response.headers.get('content-type');
  if (contentType === null || !contentType.includes('application/json')) {
    throw new Error('Mirror returned an unexpected content type');
  }
  return response.json() as Promise<unknown>;
}

export async function loadHederaEvidence(): Promise<HederaEvidenceResult> {
  const checkedAt = new Date().toISOString();
  const { hts, x402 } = HEDERA_EVIDENCE_IDS;

  let payloads: readonly [unknown, unknown, unknown, unknown, unknown, unknown];
  try {
    payloads = await Promise.all([
      fetchMirrorJson(`/transactions/${x402.transactionId}`),
      fetchMirrorJson(`/tokens/${hts.tokenId}`),
      fetchMirrorJson(`/tokens/${hts.tokenId}/nfts/1`),
      fetchMirrorJson(`/transactions/${hts.createTransactionId}`),
      fetchMirrorJson(`/transactions/${hts.mintTransactionId}`),
      fetchMirrorJson(`/transactions/${hts.burnTransactionId}`),
    ] as const);
  } catch {
    return { checkedAt, status: 'unavailable' };
  }

  const [x402Transaction, htsToken, htsNft, htsCreate, htsMint, htsBurn] =
    payloads;
  try {
    return {
      checkedAt,
      evidence: validateHederaMirrorEvidence({
        htsBurn,
        htsCreate,
        htsMint,
        htsNft,
        htsToken,
        x402Transaction,
      }),
      status: 'verified',
    };
  } catch {
    return { checkedAt, status: 'mismatch' };
  }
}
