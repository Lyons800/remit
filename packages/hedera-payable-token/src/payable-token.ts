/**
 * HTS payable token — the tokenized invoice authorization.
 *
 * IGEUR (hedera-settlement-adapter) is the money. This is the complementary
 * asset: the approved payable itself, minted as an HTS NFT whose on-ledger
 * metadata is the payment-action digest, and burned at consumption. After the
 * burn, replaying a fully valid authorization is not rejected by a database —
 * the token that authorized payment no longer exists on the ledger.
 *
 * CUSTODY MODEL — the payable never leaves gateway treasury. TokenBurn only
 * burns treasury-held tokens; destroying an NFT anywhere else requires a wipe
 * key, i.e. an issuer-confiscation key we refuse to hold. Treasury custody is
 * also conceptually right: this is a control object, not a collectible. The
 * money (IGEUR / HBAR) moves at settlement; the payable does not.
 *
 *   authorization complete -> mint(metadata = action digest)  [treasury]
 *   settlement             -> money moves; payable unchanged  [treasury]
 *   consumption            -> burn (irreversible)             [treasury]
 *
 * Same plan→evidence discipline as the synthetic-EUR spike: pure planning and
 * validation here, live transactions in the operator-gated tooling, and mint
 * evidence must show the MIRROR-READ metadata equal to the digest — what our
 * own client claims it wrote is not evidence.
 *
 * Digest format: this package accepts the repository's canonical
 * `sha256:<64 hex>` payment-action digests (73 ASCII bytes, under the 100-byte
 * HTS metadata cap).
 */

export const HEDERA_TESTNET_NETWORK = 'hedera:testnet';
export const PAYABLE_COLLECTION_NAME = 'InvoiceGuard Payables - NO VALUE';
export const PAYABLE_COLLECTION_SYMBOL = 'IGPAY';
export const PAYABLE_METADATA_MAX_BYTES = 100;

/**
 * Collection key policy: SUPPLY KEY ONLY.
 *
 * - no admin key    -> token configuration is immutable forever, and absent
 *                      keys can never be added later (define-a-token rule);
 * - no wipe key     -> nobody can destroy or confiscate a held token;
 * - no metadata key -> NFT metadata is immutable after mint (HIP-657);
 * - no freeze/kyc/pause keys -> no issuer control over holders.
 *
 * The only lifecycle operations that can ever exist are mint and
 * treasury-held burn. Judges can verify all of this from the token info.
 */
export const PAYABLE_COLLECTION_KEY_POLICY = Object.freeze({
  adminKey: false,
  freezeKey: false,
  kycKey: false,
  metadataKey: false,
  pauseKey: false,
  supplyKey: true,
  wipeKey: false,
} as const);

const ENTITY_ID_PATTERN = /^\d+\.\d+\.\d+$/u;
const TRANSACTION_ID_PATTERN = /^\d+\.\d+\.\d+@\d{10}\.\d{9}$/u;
const ACTION_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const CONSENSUS_TIMESTAMP_PATTERN = /^\d{10}\.\d{9}$/u;

export class PayableTokenError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = 'PayableTokenError';
    this.field = field;
  }
}

export type PayableMintPlan = Readonly<{
  collectionName: typeof PAYABLE_COLLECTION_NAME;
  collectionSymbol: typeof PAYABLE_COLLECTION_SYMBOL;
  /** Byte-for-byte the NFT metadata. */
  metadata: string;
  network: typeof HEDERA_TESTNET_NETWORK;
  schemaVersion: 'payable-mint-plan.v1';
}>;

export function buildPayableMintPlan(actionDigest: string): PayableMintPlan {
  if (!ACTION_DIGEST_PATTERN.test(actionDigest)) {
    throw new PayableTokenError(
      `not a canonical payment-action digest: ${actionDigest}`,
      'actionDigest',
    );
  }

  if (Buffer.byteLength(actionDigest, 'ascii') > PAYABLE_METADATA_MAX_BYTES) {
    throw new PayableTokenError(
      'digest exceeds the HTS NFT metadata limit',
      'actionDigest',
    );
  }

  return {
    collectionName: PAYABLE_COLLECTION_NAME,
    collectionSymbol: PAYABLE_COLLECTION_SYMBOL,
    metadata: actionDigest,
    network: HEDERA_TESTNET_NETWORK,
    schemaVersion: 'payable-mint-plan.v1',
  };
}

export type PayableMintEvidence = Readonly<{
  consensusTimestamp: string;
  /** Metadata read back from a Mirror Node, never from our own submit path. */
  metadataOnLedger: string;
  receiptStatus: 'SUCCESS';
  serial: number;
  tokenId: string;
  transactionId: string;
}>;

export function validatePayableMintEvidence(
  plan: PayableMintPlan,
  evidence: PayableMintEvidence,
): void {
  if (!ENTITY_ID_PATTERN.test(evidence.tokenId)) {
    throw new PayableTokenError(
      `malformed tokenId: ${evidence.tokenId}`,
      'tokenId',
    );
  }

  if (!Number.isInteger(evidence.serial) || evidence.serial <= 0) {
    throw new PayableTokenError(
      `malformed serial: ${String(evidence.serial)}`,
      'serial',
    );
  }

  if (!TRANSACTION_ID_PATTERN.test(evidence.transactionId)) {
    throw new PayableTokenError(
      `malformed transactionId: ${evidence.transactionId}`,
      'transactionId',
    );
  }

  if (!CONSENSUS_TIMESTAMP_PATTERN.test(evidence.consensusTimestamp)) {
    throw new PayableTokenError(
      `malformed consensusTimestamp: ${evidence.consensusTimestamp}`,
      'consensusTimestamp',
    );
  }

  if (evidence.receiptStatus !== 'SUCCESS') {
    throw new PayableTokenError('mint receipt is not SUCCESS', 'receiptStatus');
  }

  if (evidence.metadataOnLedger !== plan.metadata) {
    throw new PayableTokenError(
      'ledger metadata does not match the action digest; refusing the payable',
      'metadataOnLedger',
    );
  }
}

export type PayableBurnEvidence = Readonly<{
  consensusTimestamp: string;
  receiptStatus: 'SUCCESS';
  serial: number;
  tokenId: string;
  transactionId: string;
}>;

export function validatePayableBurnEvidence(
  mint: PayableMintEvidence,
  burn: PayableBurnEvidence,
): void {
  if (burn.tokenId !== mint.tokenId || burn.serial !== mint.serial) {
    throw new PayableTokenError(
      'burn evidence refers to a different payable than the mint',
      'serial',
    );
  }

  if (!TRANSACTION_ID_PATTERN.test(burn.transactionId)) {
    throw new PayableTokenError(
      `malformed transactionId: ${burn.transactionId}`,
      'transactionId',
    );
  }

  if (burn.transactionId === mint.transactionId) {
    throw new PayableTokenError(
      'burn cannot reuse the mint transaction',
      'transactionId',
    );
  }

  if (!CONSENSUS_TIMESTAMP_PATTERN.test(burn.consensusTimestamp)) {
    throw new PayableTokenError(
      `malformed consensusTimestamp: ${burn.consensusTimestamp}`,
      'consensusTimestamp',
    );
  }

  if (burn.receiptStatus !== 'SUCCESS') {
    throw new PayableTokenError('burn receipt is not SUCCESS', 'receiptStatus');
  }
}

/**
 * The gateway may declare a payment consumed only from the settled state and
 * only with valid burn evidence in hand. This upgrades consumption from a
 * database flag to a ledger fact.
 */
export function consumePayable(
  currentState: 'SETTLED' | (string & {}),
  mint: PayableMintEvidence,
  burn: PayableBurnEvidence,
): 'CONSUMED' {
  if (currentState !== 'SETTLED') {
    throw new PayableTokenError(
      `cannot consume from ${currentState}; only settled payables burn`,
      'state',
    );
  }

  validatePayableBurnEvidence(mint, burn);
  return 'CONSUMED';
}

export function hashscanTransactionUrl(transactionId: string): string {
  const encoded = transactionId
    .replace('@', '-')
    .replace(/\.(\d{9})$/u, '-$1');
  return `https://hashscan.io/testnet/transaction/${encoded}`;
}

export function mirrorNftUrl(tokenId: string, serial: number): string {
  return `https://testnet.mirrornode.hedera.com/api/v1/tokens/${tokenId}/nfts/${String(serial)}`;
}
