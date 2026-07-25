# Hedera integration contract

Status: architecture contract pending live spikes.

Checked: 2026-07-25.

## Why Hedera is load-bearing

Hedera proves two separate financial transitions:

1. a low-balance agent autonomously purchases the configured beneficiary check
   through x402; and
2. a constrained worker executes the exact approved Testnet transfer once.

The check is released only after the first transaction reaches consensus. The
second transaction is signed only after deterministic authorization and a
successful HCS approval precommit. CallGuard never claims the two transactions
are atomic.

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

## x402 purchase

The verifier endpoint is:

```text
POST /v1/beneficiary-checks/{actionDigest}
```

1. The service recomputes the body digest and matches it to the route.
2. Without payment, it returns HTTP 402 requirements for `hedera:testnet`, HBAR
   asset `0.0.0`, an exact tinybar amount, concrete service receiver, short
   expiry, challenge ID, facilitator, and action digest.
3. The payment agent creates a native Hedera `TransferTransaction`, signs the
   buyer debit, and uses:

   ```text
   cg:x402:v1:<64-hex-action-digest>
   ```

   as its public memo.

4. The facilitator validates the exact network, asset, amount, receiver,
   fee-payer policy, zero-sum transfer, memo, digest, and buyer signature.
5. The facilitator adds its fee-payer signature, submits the same transaction,
   and awaits its consensus receipt.
6. The verifier releases the resource only after `/settle` returns a `SUCCESS`
   receipt. `/verify` alone is never proof of payment.
7. A signed service attestation binds the action digest, result, policy, x402
   transaction ID, payer, amount, issue time, and expiry.

Version 2.19 requires wiring the released payer-signature verifier and preflight
callback. A live smoke test is a gate, not an assumption.

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
- exact treasury payer, beneficiary, tinybar amount, and zero-sum transfers;
- no token, contract, schedule, allowance, or additional operation;
- exact `cg:exec:v1:<digest>` memo;
- current signed `MATCH` attestation;
- successful HCS approval precommit;
- unexpired and unconsumed action; and
- transaction bytes and ID matching the durable execution claim.

The worker persists the frozen bytes hash and transaction ID before signing,
submits only those bytes, and waits for a receipt. On timeout it reconciles the
same transaction ID through receipt and Mirror APIs. It never automatically
builds a replacement transaction.

## HCS evidence

Do not use the optional Agent Kit audit hook as the integrity boundary.

- `approval.v1`: explicit HCS transaction before signing the company transfer;
  receipt `SUCCESS` is required.
- `execution.v1`: postcommit event after the transfer; retried at least once
  with one deterministic event ID.

If the postcommit is unavailable after a successful transfer, state becomes
`audit-degraded`, not failed. HCS contains only hashes and public transaction
references:

```json
{
  "type": "approval.v1",
  "eventId": "sha256:...",
  "actionDigest": "sha256:...",
  "attestationHash": "sha256:...",
  "x402TransactionId": "0.0.x@...",
  "policyHash": "sha256:...",
  "decision": "MATCH"
}
```

## Key and account split

Use dedicated ECDSA Testnet accounts:

1. low-balance x402 buyer;
2. capped facilitator fee payer;
3. beneficiary-check service receiver;
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
- HCS approval outage prevents the company transfer;
- postcommit outage yields `audit-degraded` and recovers one event;
- modified Agent Kit bytes fail the deterministic signing guard;
- two workers racing the same digest produce one execution claim;
- ambiguous submit creates no replacement transaction ID;
- replayed action returns existing evidence and produces no second transfer.

## Fallback

If x402 2.19 is not green, pin the official scaffold's `@x402/hedera@2.13.2`,
`@x402/core@2.14.0`, and SDK `2.80.0` graph. Preserve the memo/digest checks,
release only after a consensus receipt, and disclose that invalid payer
signatures may be discovered during settlement.

If Agent Kit v4 is not green, use the same direct Hiero SDK planning contract
and remove the Agent Kit claim. There is no fail-open fallback for HCS approval.

## Judge evidence

- raw 402 requirements hash and paid request hash;
- x402 transaction ID, facilitator transaction ID, transfer list, memo, receipt,
  and Mirror/HashScan link;
- signed digest-bound `MATCH` attestation;
- HCS approval sequence, running hash, payer, and consensus time;
- decoded final frozen transaction and bytes hash;
- final receipt, Mirror transfer, and HCS execution event;
- replay attempt proving no second transfer; and
- one evidence manifest tied to the exact repository/deployment SHA.

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
