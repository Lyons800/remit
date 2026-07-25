# Repository consolidation review

- Date: 2026-07-25
- Scope: the InvoiceGuard monorepo, its three active feature worktrees, and the
  earlier `callguard` prototype
- Decision: keep this monorepo as the only submission repository

The current repository should not be restarted. Its protocol, domain,
application, adapter, and service boundaries are the stronger base. The earlier
prototype remains a source of product and interface references, not a second
implementation to maintain or merge wholesale.

## Canonical protocol and AP domain

Keep `packages/protocol` and `packages/domain` as the system spine.

The protocol uses validated canonical JSON and domain-separated SHA-256 digests.
Payment amounts and caps are positive decimal strings in atomic units; JSON
floating-point values are not admitted. Canonical digests are raw lowercase
64-character hexadecimal strings.

The AP contracts must land before sponsor adapters. World and Hedera should
consume the shared action, authorization, evidence, amount, and digest types
instead of preserving branch-local equivalents.

## World authority

Keep the World worktree. It adds useful company-authority, human-distinctness,
privacy, deployment-pinning, and fail-closed adapter boundaries.

The safe product claim is limited to the implemented offline and contract tests.
A live World proof, AgentBook registration/read, and company-role authority
check still require operator-controlled credentials and reproducible evidence.
No local credential or stable human identifier belongs in source, fixtures,
logs, or review notes.

## Hedera x402 and settlement

Keep the Hedera worktree. Its request-bound quote, complete transaction-effect
inspection, signed facilitator attestation, durable replay controls, and HTS
admission contracts are the canonical implementation.

The live claim remains blocked until a real Testnet x402 payment and settlement
asset flow are recorded against the exact submitted commit.

Do not port the prototype's `IGPAY` NFT as currently designed. Minting and
burning a separate token after authorization does not itself prevent replay of
the supplier payment, and its plain evidence objects are not an authenticated
ledger boundary. Reconsider tokenized payables only if settlement is
cryptographically gated by the token lifecycle and the extra transaction cost
improves the product rather than adding a prize-shaped side effect.

## 0G extraction

The prototype's strict extraction schema and fail-closed result shape are useful
references. They are not ready to port.

A later catalog observation may satisfy the model-availability condition in ADR
0005, but it does not resolve the remaining requirements for pinned provider
selection, exact request and response binding, independently checked
attestation, network admission, and reproducible live evidence. The prototype
also uses a separate digest system and falls back to another eligible provider
when a preferred model is unavailable.

Reopen ADR 0005 only after every recorded admission condition is rechecked. A
catalog change alone is not enough to retract the current no-go decision.

## Product interface and live gates

Use the earlier HTML queue and approval screens as product references, then
implement the real interface in `apps/web` against the canonical AP contracts.
Do not copy the prototype core into the monorepo.

Earlier live-gate scripts can inform the operator workflow, but each admitted
integration needs a reviewed implementation in this repository with:

- explicit Testnet and deployment pinning;
- fail-closed configuration;
- redacted evidence tied to the exact build SHA; and
- no secrets or reusable authorizations in repository history.

## Delivery order

1. Merge the AP protocol and domain contracts.
2. Rebase World and Hedera onto those contracts and remove duplicate primitives.
3. Implement invoice ingestion, deterministic routing, reservation, and
   exception operations.
4. Build the control API and responsive web approval flow.
5. Run live World and Hedera gates and capture redacted evidence.
6. Add further sponsor integrations only when they strengthen the same payment
   story and satisfy their admission record.
