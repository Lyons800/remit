# ADR 0006: Hedera process and audit boundaries

- Status: accepted
- Date: 2026-07-25

## Context

InvoiceGuard uses Hedera both to purchase a verifier resource through x402 and
to execute a later approved financial operation. Those effects are not atomic.
Current `@x402/hedera` and Hedera Agent Kit releases also resolve different
Hiero SDK versions, whose class instances must not be mixed.

Agent Kit's built-in HCS hook runs after autonomous tool execution, does not
cover `RETURN_BYTES`, and catches publication errors. It cannot be the
settlement integrity gate.

## Decision

Use separate process and dependency boundaries:

1. x402 buyer/resource/facilitator code pins `@x402/hedera@2.19.0`,
   `@x402/core@2.19.0`, and `@hiero-ledger/sdk@2.85.0`;
2. settlement code pins `@hashgraph/hedera-agent-kit@4.0.0` and
   `@hiero-ledger/sdk@2.81.0`;
3. the boundary exchanges only validated JSON, decimal strings, identifiers, and
   base64 transaction bytes;
4. a custom Agent Kit tool accepts only an action digest, loads the immutable
   action itself, and returns unsigned frozen transaction bytes;
5. a deterministic signing guard decodes and validates the entire transaction
   before signing;
6. HCS `authorization.v1` is an explicit fail-closed precommit containing the
   hash of either standing-mandate or exception-quorum evidence; and
7. queueing settlement atomically persists the aggregate-held exact attempt and
   an initial `SETTLEMENT_SUBMISSION_REQUEST`; no poller infers first submission
   from a pending state;
8. the consensus settlement transaction atomically persists its receipt, one-use
   consumption, any mandate mutation, and one deterministic
   `EXECUTION_AUDIT_REQUEST`; and
9. HCS `execution.v1` is an at-least-once postcommit using that event ID and
   explicit `SETTLED_AUDIT_PENDING`, `SETTLED_AUDIT_DEGRADED`, and recovered
   `SETTLED` states.

The execution event ID is derived from the action digest and frozen attempt ID.
Retry upserts the same logical outbox event. An accepted execution fact must
bind the authorization audit, attempt, receipt and receipt digest, settlement
transaction, signed-bytes hash, network, writer account, writer identity, and
writer key.

The x402 service payment uses HBAR. Final settlement uses the exact HBAR or
allowlisted HTS fungible asset named by the payment action after the applicable
live spike passes. Both transfers carry a public digest-only memo. HCS contains
hashes and public transaction references, never beneficiary data or private
evidence.

## Consequences

- `/verify` is never treated as payment; the verifier waits for a `SUCCESS`
  settlement receipt.
- The x402 payment and company transfer are joined by protocol evidence and
  durable state, not presented as an atomic ledger operation.
- More processes are deployed, but key custody and incompatible SDK graphs
  remain isolated.
- Final settlement pauses when the HCS authorization precommit is unavailable.
- A postcommit outage cannot reverse a settled transfer, so it is visible and
  recoverable rather than falsely reported as a failed payment.
- Audit retry cannot recreate a consumption or mandate mutation and cannot
  change the transfer result; recovery only adds the exact consensus fact.

## Fallback

If x402 2.19 fails its live signature/preflight smoke tests, use the official
scaffold's locked `2.13.2 / 2.14.0 / 2.80.0` graph. Keep InvoiceGuard's
digest/memo checks, wait for the consensus receipt, and document that the older
`/verify` discovers an invalid payer signature only during settlement.

If Agent Kit v4 is unstable, construct the same transaction directly through the
pinned Hiero SDK. Do not claim Agent Kit use unless it remains on the executed
path.

## First-party sources

- [Official x402 scaffold](https://github.com/hedera-dev/scaffold-hbar/tree/templates/x402-pay-per-use)
- [`@x402/hedera@2.19.0` manifest](https://registry.npmjs.org/@x402%2Fhedera/2.19.0)
- [Hedera Agent Kit repository](https://github.com/hashgraph/hedera-agent-kit-js)
- [Agent Kit `RETURN_BYTES` documentation](https://github.com/hashgraph/hedera-agent-kit-js/blob/main/docs/MCP.md)
- [Agent Kit hooks and policies](https://github.com/hashgraph/hedera-agent-kit-js/blob/main/docs/HOOKS_AND_POLICIES.md)
- [HCS message submission](https://docs.hedera.com/native/consensus/submit-message)
