# ADR 0011: Experiment with dual-token atomic settlement

- Status: accepted for an experimental Testnet demonstrator; production NO-GO
- Date: 2026-07-26

## Context

ADR 0010 deliberately limits the existing HTS NFT to a treasury-held, no-value
audit marker. It does not model a transferable claim, payment authority,
settlement, or replay protection. That is the honest production default, but it
leaves Hedera's native compliance controls and HIP-551 atomic batches largely
unexplored.

The Lisbon Tokenization prize specifically favours invoice tokenization with
meaningful compliance or lifecycle management. Hedera also supports atomic
batches in which all inner transaction effects commit or roll back together.
Each inner transaction remains independently authorized and charged, and the
whole batch is limited to 50 transactions, 6 KB and the normal transaction
validity window.

An NFT burn can only burn a serial owned by the token treasury. Consequently, a
delivery-versus-payment settlement must return each serial to treasury in the
same batch before burning it.

## Decision

Add a separate, explicitly experimental `dual-token-settlement` Testnet path. It
does not replace ADR 0006's production-oriented `execution.v1` path or ADR
0010's conservative marker.

The live runner creates two finite, state-bearing HTS NFT collections per run
and mints one serial in each:

1. **Payable NFT (`RMPAY`)** — an invoice-commitment-bound synthetic operational
   claim artifact. One serial binds a randomly salted, domain-separated invoice
   commitment and the canonical payment-action digest. The runner preconfigures
   a synthetic claimant and issues the matching Payable to that account; it does
   not demonstrate that a pre-existing holder or financing transfer becomes a
   newly authorized beneficiary.
2. **Control NFT (`RMCTL`)** — a no-value, one-use execution artifact bound to
   the same action digest and to the authorization-evidence hash. In the
   mechanics runner its state is explicitly `MECHANICS_FIXTURE`, not
   `AUTHORIZED`, and its account is frozen until the rollback or settlement
   attempt.

Both collections are finite with maximum supply 1,000 and have supply, HTS
KYC-flag, freeze and pause keys. The runner exercises Hedera's issuer-controlled
KYC flag; it performs no legal or real-world customer due diligence. The
collections deliberately omit admin, wipe, fee-schedule and metadata keys and
custom fees. Separate Testnet role keys are used for the two collections.
Production key custody remains unresolved.

Metadata is a fixed 66-byte binary commitment:

- byte 0: schema version;
- byte 1: lifecycle state;
- bytes 2-33: the first 32-byte digest; and
- bytes 34-65: the canonical action digest or authorization-evidence hash.

The payable's first digest is a randomly salted, domain-separated commitment to
the off-chain invoice digest. The control's first digest is the action digest.
No supplier name, amount, bank account, tax identifier, ATCUD, invoice number,
evidence, source digest or document URL is published. The layout is
raw-field-free, not anonymous: public action and evidence commitments may still
be linkable when an observer has the source data.

HCS messages contain the action, evidence and manifest commitments plus public
token, topic and transaction references. Intended holder accounts are committed
as one domain-separated holder-set hash rather than published as beneficiary
fields.

The payable metadata may be finalized with its supply key while the serial
remains in treasury, as allowed by HIP-850. After distribution, the committed
metadata is treated as immutable. Ownership is never financial authority. The
production flow should snapshot the current payable holder as the candidate
beneficiary of a newly authorized action. A production signing guard must then
load that immutable action, recompute its digest and validate the exact amount,
asset, payer, holder-beneficiary, collection IDs, serials, policy result,
authorization evidence and expiry. Transfer of the payable after authorization
invalidates that action rather than silently redirecting payment.

The two NFTs are not the payment asset. The Testnet proof creates a separate,
no-value, synthetic-EUR HTS fungible token with two decimals and a finite,
sealed supply. Its token ID, exact atom amount and explicit one-test-cent to
one-source-cent mapping enter the canonical action before authorization. This
preserves the existing prohibition on relabelling an arbitrary HBAR amount as a
EUR invoice settlement.

After World-backed distinct-human quorum, x402 verification and a successful HCS
`authorization.v2` precommit that binds the exact action, evidence, token IDs,
serials and intended holders, one HIP-551 batch performs:

1. unfreeze the control holder for the control token;
2. one transfer transaction containing the exact allowlisted settlement-token
   payment from payer to the snapshotted payable holder, the payable NFT return
   to treasury and the control NFT return to treasury;
3. burn the returned payable NFT;
4. burn the returned control NFT; and
5. submit a compact, digest-only HCS settlement commitment.

The payable holder signs its NFT return, the control holder signs its permit
return, the payer signs the value transfer, each token's supply key signs its
burn, the freeze key signs the unfreeze, the topic submit key signs the HCS
message, and the batch key binds all inner transactions into one outer batch.
The atomic HCS message is an intent/commitment, not the same batch's execution
receipt: consensus status and receipt data do not exist when the inner message
is signed. A post-consensus execution audit event references the batch receipt,
consensus timestamp, Hedera transaction hash, serialized transaction-list hash
and atomic commitment observed by the runner. The runner rejects a serialized
batch above 6 KB before submission.

The v2 intent guard validates and hashes the canonical settlement intent. A
second verifier uses a pinned, direct Hedera protobuf dependency to decode every
outer node candidate from the signed transaction list. It requires canonical
encoding, identical signed inner bytes, the exact five operation bodies, IDs,
duration, batch key, transfer and burn semantics, HCS message, no allowances or
extras, exact role signer sets and valid signatures over every body. This avoids
depending on SDK-private fields and closes the parallel-manifest gap.

The atomicity claim is deliberately narrow: successful consensus makes the
payment, both token returns, both burns and the HCS settlement commitment
indivisible. The actual execution receipt remains post-consensus. A failed batch
rolls back those effects, but still incurs outer and processed inner transaction
fees.

The standalone network-mechanics runner uses an `authorization-fixture.v2`
precommit so that HIP-551 rollback and lifecycle mechanics can be exercised
repeatedly without claiming a fresh World/x402 authorization. That fixture is
visibly labelled, every event carries `authorityMode: "MECHANICS_FIXTURE"`, and
the later events are named `mechanics-settlement-commitment.v2` and
`mechanics-execution.v2`. None is admissible to the production-oriented
settlement path. The full path must use `authorization.v2` and reserve
`AUTHORIZED`, `settlement-commitment.v2` and `execution.v2` for admitted work.
The deliberately malformed rollback batch is required to fail this wire verifier
on its incorrect Control burn serial before the dedicated Testnet failure
harness explicitly submits it. The valid settlement is not submitted unless the
wire verifier admits it.

## Required proof

The experimental gate must demonstrate on Hedera Testnet that:

- Mirror Node confirms both exact token configurations and metadata;
- association, KYC, freeze and controlled unfreeze are exercised;
- a deliberately invalid batch fails without moving settlement tokens, changing
  NFT ownership, burning supply or publishing its settlement commitment, and is
  also rejected by the signed-wire verifier before the failure harness submits
  it;
- the valid batch pays the actual payable holder and atomically returns and
  burns both serials;
- Mirror Node confirms both deleted serials, zero remaining supply, the
  digest-bound atomic commitment and the later runner-derived mechanics
  execution event; and
- post-hash mutation of any canonical intent field is rejected before batch
  assembly.

The failed-batch proof compares claimant balances and NFT/HCS state. It does not
expect the fee payer's balance to remain unchanged.

## Consequences

- The demo uses HTS compliance and lifecycle operations for a real purpose
  rather than adding prize features cosmetically.
- The payable creates a credible path toward financing and assignment, while
  retaining an explicit warning that the Testnet token is not legal assignment.
- The control token makes authorization consumption visible without pretending
  bearer ownership replaces Remit's deterministic authority checks.
- The atomic commitment narrows ADR 0006's audit gap but does not remove it: the
  receipt-referencing execution fact remains postcommit and recoverable. The
  path also increases transaction size, signer coordination, fees, key-custody
  demands and recovery complexity.
- A reusable per-organization Control collection is not proven. The current
  collection-per-run path holds one serial, so its post-burn account
  relationship cannot expose another active Control. Reuse requires a final
  atomic refreeze or dedicated one-Control accounts plus a tested multi-serial
  policy.
- The x402 verification purchase remains a separate earlier payment. It is
  evidence bound into the approved action; it is not part of the final batch.
- A production adoption requires a further ADR covering legal assignment, debtor
  notice and priority, regulated custody, threshold or managed keys, durable
  batch-attempt persistence, crash recovery, idempotent resubmission, retention
  and DPIA analysis, disaster recovery and mainnet operational controls.

## First-party sources

- [ETHGlobal Lisbon 2026 Hedera prizes](https://ethglobal.com/events/lisbon2026/prizes/hedera)
- [Hedera atomic batch transactions](https://docs.hedera.com/native/transactions/batch)
- [Hedera NFT burn requirements](https://docs.hedera.com/native/tokens/burn)
- [Hedera NFT metadata updates and HIP-850](https://docs.hedera.com/native/tokens/update-nft-metadata)
- [Hedera token freeze](https://docs.hedera.com/native/tokens/freeze)
- [Hedera token KYC](https://docs.hedera.com/native/tokens/enable-kyc)
- [Hedera token pause](https://docs.hedera.com/native/tokens/pause)
- [Hedera token transfers](https://docs.hedera.com/native/tokens/transfer)
- [Hedera HCS message submission](https://docs.hedera.com/native/consensus/submit-message)
