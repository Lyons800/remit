# Hedera integration contract

Status: AP-bound offline contract implemented; x402 protocol spike live;
AP-bound live execution and supplier settlement pending.

Checked: 2026-07-26.

## Why Hedera is load-bearing

Hedera proves two separate financial transitions:

1. a low-balance agent autonomously purchases the configured supplier-evidence
   check through x402; and
2. a constrained worker executes the exact approved Testnet transfer once.

The check is released only after the first transaction reaches consensus. The
second transaction is signed only after deterministic authorization and a
successful HCS authorization precommit. InvoiceGuard never claims the two
transactions are atomic.

## Dependency and process contract

Exact x402 runtime:

```json
{
  "@hiero-ledger/sdk": "2.85.0",
  "@x402/core": "2.19.0",
  "@x402/hedera": "2.19.0"
}
```

Exact settlement runtime:

```json
{
  "@hashgraph/hedera-agent-kit": "4.0.0",
  "@hiero-ledger/sdk": "2.81.0"
}
```

The dependency graphs remain in separate workspace packages and processes.
`@hashgraph/sdk` and `@hiero-ledger/sdk` are distinct packages, not aliases. No
Hedera SDK object crosses a process boundary.

The first offline integration slice lives in `packages/hedera-x402-adapter`. It
converts the AP effect's CAIP-2 identifier `hedera:296` to the x402 SDK
identifier `hedera:testnet`, validates only canonical Hedera entity IDs at the
wire boundary, and emits raw lowercase 64-hex SHA-256 digests. Prefixed digest
strings are rejected.

## Live spike status

A real Hedera Testnet x402 transaction reached consensus on 2026-07-26. Mirror
Node proves that the agent account paid `0.01 HBAR` to the verification-service
account and that a distinct facilitator paid the network fee. The run did not
execute this repository's admitted AP adapter: its runner and signed artifacts
are absent, its digest and signature formats differ, and its transaction has no
request-digest memo. It is classified as a live protocol spike in
[`docs/evidence`](../evidence/x402-live-2026-07-26.md), not G4 completion.

A separate HTS NFT create/mint/burn spike also has public Mirror evidence. The
NFT remained in treasury and had no monetary value. It is not coupled to the AP
authorization or settlement state machine, so InvoiceGuard does not use it as
authority, payment, consumption, or replay protection. Its exact evidence and
limitations are recorded in
[`docs/evidence`](../evidence/hts-payable-live-2026-07-26.md).

## x402 purchase

The verifier endpoint is:

```text
POST /v2/supplier-evidence-checks/{actionDigest}
```

1. The adapter derives the request only from a revalidated
   `AuthorizationBundleV1`, its exact `VerificationQuoteRequestEffect`, the
   frozen invoice revision, and the verified supplier snapshot. Payment and
   result construction independently re-derive that complete request; neither
   trusts a caller-provided identity, beneficiary, policy, invoice, or snapshot
   digest.
2. Without payment, it returns HTTP 402 requirements for `hedera:testnet`, HBAR
   asset `0.0.0`, an exact tinybar amount, concrete service receiver, short
   expiry, challenge ID, facilitator fee payer, action digest, request digest,
   evidence-policy digest, service identity, key, and AP network ID.
   Construction first verifies a signed deployment policy that authorizes the
   exact amount, receiver, facilitator fee payer, transaction-fee cap, service
   identity, key, network, validity window, and node-account allowlist.
3. The payment agent creates a native Hedera `TransferTransaction`, signs the
   buyer debit, and uses:

   ```text
   invoiceguard:x402:v2:<64-hex-request-digest>
   ```

   as its public memo.

4. The facilitator validates the exact network, asset, amount, receiver,
   fee-payer policy, zero-sum transfer, memo, digest, and buyer signature.
5. The facilitator adds its fee-payer signature, submits the same transaction,
   and awaits its consensus receipt.
6. The verifier releases the resource only after `/settle` returns a `SUCCESS`
   receipt. `/verify` alone is never proof of payment.
7. A signed facilitator attestation binds the AP action, request, quote,
   challenge, resource, exact payment terms, payment attempt, transaction ID,
   payer, and consensus time.
8. A separately signed service result binds that accepted payment, the frozen
   evidence root, result, reason codes, issue time, and expiry. Only then does
   the adapter construct the domain's adapter-verified payment and evidence
   facts.

Both signed JSON boundaries reject missing or additional fields. Version 2 has
fixed digest and Ed25519 vectors in the offline tests.

Version 2.19 requires wiring the released payer-signature verifier and preflight
callback. A live smoke test is a gate, not an assumption.

## Recovery seam

Offline recovery distinguishes `CLAIMED`, `PREPARED`, and `CONSENSUS` payment
attempts. Once fully signed transaction bytes are prepared, retries must reuse
their exact canonical Base64 bytes, SHA-256 byte hash, and transaction ID. A
durable consensus record is loaded before applying live-window expiry, while a
new payment cannot begin after the AP effect or quote expires.

Before recovery returns stored `CONSENSUS`, it re-inspects the prepared
transaction and cryptographically verifies the complete strict facilitator
attestation envelope against `trustedFacilitator` from application composition.
The envelope's key ID never selects its own trust anchor. Receipt status,
network, asset, amount, receiver, payer, facilitator fee payer, challenge,
resource, service, action, request, quote, attempt, transaction ID, and `paidAt`
must all match the re-derived quote and inspected transaction. Recovery returns
a newly frozen, verified consensus value rather than the untrusted stored
object.

`PREPARED` is admitted only after the pinned Hiero SDK decodes and exactly
re-serializes the real transaction bytes. Inspection requires one frozen HBAR
`TransferTransaction` with at least two serialized signature entries, one
allowed node account, the facilitator transaction fee payer, one exact buyer
debit, one exact receiver credit, no token or NFT transfers, the request memo,
and a transaction fee no greater than the signed deployment cap. Hedera
transaction bytes do not carry a ledger/network ID; the network semantic is
therefore bound by the authenticated deployment policy and its node-account
allowlist, not inferred from an unencoded field.

A `CLAIMED` lease that expires before `PREPARED` cannot be resumed. Recovery
requires a quote issued after the old lease, a distinct quote ID and digest, and
a distinct payment-attempt ID. `takeoverExpiredClaim` is the application store
seam that atomically appends `ABANDONED` history and installs the replacement
claim; racing callers must leave exactly one winner.

The adapter does not implement or duplicate the application persistence layer.
`VerificationEffectIdentitySource` is the explicit prerequisite seam for the
durable event identity that is not currently carried by
`VerificationQuoteRequestEffect`; the adapter never invents one. The
application-owned store must make claims and state advances durable before any
submission.

The later application/persistence merge must provide both the trusted event
identity and compare-and-swap implementation of `takeoverExpiredClaim`. No
domain effect field or caller authority was invented in this adapter branch.

This slice performs no network calls, signs no live transaction, creates no
runtime environment variables, and provides no G4 or G5 evidence. Consensus
attestations still require a later live integration and smoke test.

## Supplier-evidence result

The paid service checks the configured evidence bundle for one action. In the
synthetic fixture, it reads a separately administered, signed supplier-change
registry. The control API and payment agent have no write path to this registry.
`MATCH` means the service found an unexpired record whose supplier identity
hash, proposed beneficiary fingerprint, issuer, source-document digest, evidence
root, and action digest all match the request. `MISMATCH` means a declared field
differs. Missing, malformed, stale, or unavailable evidence returns `UNKNOWN`.

The result does not prove legal account ownership, invoice truth, tax
compliance, or the correctness of any source outside that declared policy.

## Settlement

Use one custom Agent Kit `RETURN_BYTES` tool:

```text
execute_approved_intent({ actionDigest })
```

The tool loads the immutable action itself. The model cannot supply a
beneficiary or amount. `RETURN_BYTES` means transaction construction succeeded;
it does not mean consensus.

The deterministic signing guard decodes the returned transaction and requires:

- `hedera:testnet`;
- `TransferTransaction` only;
- exact treasury payer, beneficiary, action asset, integer atom amount, and
  zero-sum transfers;
- one explicitly allowlisted two-decimal synthetic-EUR HTS fungible test token
  after its live transfer spike passes;
- no token, contract, schedule, allowance, or additional operation;
- exact `invoiceguard:exec:v1:<digest>` memo;
- exact source invoice, settlement effect, and `mappingPolicyHash`;
- current signed `MATCH` attestation when the frozen verification mode is
  `REQUIRED`, or an explicit `NOT_REQUIRED` policy marker with no substituted
  attestation;
- successful HCS authorization precommit;
- unexpired and unconsumed action; and
- transaction bytes and ID matching the durable execution claim.

The worker persists the frozen bytes hash and transaction ID before signing,
submits only those bytes, and waits for a receipt. On timeout it reconciles the
same transaction ID through receipt and Mirror APIs. It never automatically
builds a replacement transaction.

## HCS evidence

Do not use the optional Agent Kit audit hook as the integrity boundary.

- `authorization.v1`: explicit HCS transaction before signing the company
  transfer; its hash binds either the standing mandate or exception quorum, and
  receipt `SUCCESS` is required.
- `execution.v1`: postcommit event after the transfer; retried at least once
  with one deterministic event ID.

If the postcommit is unavailable after a successful transfer, state becomes
`audit-degraded`, not failed. HCS contains only hashes and public transaction
references:

```json
{
  "type": "authorization.v1",
  "eventId": "sha256:...",
  "actionDigest": "sha256:...",
  "authorizationEvidenceHash": "sha256:...",
  "verificationMode": "REQUIRED",
  "verificationEvidenceHash": "sha256:...",
  "policyHash": "sha256:...",
  "decision": "MATCH"
}
```

## Key and account split

Use dedicated ECDSA Testnet accounts:

1. low-balance x402 buyer;
2. capped facilitator fee payer;
3. supplier-evidence service receiver;
4. settlement treasury;
5. audit writer plus HCS topic submit key; and
6. separate application service-attestation key.

The verifier holds no facilitator or treasury key. The Agent Kit planner is
keyless. The settlement signer accepts only validated frozen bytes.

## Required tests

- 402, signed buyer payment, consensus `SUCCESS`, and one resource release;
- invalid payer signature fails before submission under 2.19;
- altered digest, memo, network, asset, receiver, amount, fee payer, or body
  fails;
- crash after x402 submit reconciles the same transaction;
- HCS authorization outage prevents the company transfer;
- postcommit outage yields `audit-degraded` and recovers one event;
- modified Agent Kit bytes fail the deterministic signing guard;
- wrong HBAR/HTS asset, token ID, or atom count fails before signing;
- two workers racing the same digest produce one execution claim;
- ambiguous submit creates no replacement transaction ID;
- replayed action returns existing evidence and produces no second transfer.

## Fallback

If x402 2.19 is not green, pin the official scaffold's `@x402/hedera@2.13.2`,
`@x402/core@2.14.0`, and SDK `2.80.0` graph. Preserve the memo/digest checks,
release only after a consensus receipt, and disclose that invalid payer
signatures may be discovered during settlement.

If Agent Kit v4 is not green, use the same direct Hiero SDK planning contract
and remove the Agent Kit claim. There is no fail-open fallback for HCS
authorization.

## Judge evidence

- raw 402 requirements hash and paid request hash;
- x402 transaction ID, facilitator transaction ID, transfer list, memo, receipt,
  and Mirror/HashScan link;
- signed digest-bound `MATCH` attestation and x402 transaction when the fixture
  requires verification;
- HCS authorization sequence, running hash, payer, and consensus time;
- decoded final frozen transaction and bytes hash;
- final receipt, Mirror transfer, and HCS execution event;
- replay attempt proving no second transfer; and
- one evidence manifest tied to the exact repository/deployment SHA.

The source invoice currency and demonstrated settlement asset are always shown
separately. HBAR is never presented as a EUR payment. The preferred synthetic
EUR-denominated HTS token may be used only after the token-transfer guard and
Agent Kit planning path pass live review; its two-decimal parity mapping and
token ID are frozen in the action. It remains a no-value Testnet fixture, not a
bank payment or backed stablecoin.

## First-party sources

- [Official Hedera x402 scaffold](https://github.com/hedera-dev/scaffold-hbar/tree/templates/x402-pay-per-use)
- [Scaffold runbook](https://github.com/hedera-dev/scaffold-hbar/blob/templates/x402-pay-per-use/RUNBOOK.md)
- [`@x402/hedera@2.19.0` manifest](https://registry.npmjs.org/@x402%2Fhedera/2.19.0)
- [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js)
- [Agent Kit `RETURN_BYTES`](https://github.com/hashgraph/hedera-agent-kit-js/blob/main/docs/MCP.md)
- [HCS submit-message guide](https://docs.hedera.com/native/consensus/submit-message)
- [HCS Mirror query tutorial](https://docs.hedera.com/native/tutorials/consensus/query-mirror-node)
- [Hedera transaction IDs](https://docs.hedera.com/native/transactions/transaction-id)
- [Mirror transaction endpoint](https://docs.hedera.com/api-reference/transactions/get-transaction-by-id)
