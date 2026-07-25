# Agent instructions

These instructions apply to every coding-agent session in this repository.

## Start here

Read:

1. `HACKATHON_PROVENANCE.md`
2. `docs/product/PRODUCT-BRIEF.md`
3. `docs/architecture/SYSTEM-ARCHITECTURE.md`
4. `docs/architecture/AUTHORITY-MODEL.md`
5. `docs/architecture/THREAT-MODEL.md`
6. applicable ADRs and sponsor integration documents
7. `CONTRIBUTING.md`

Do not begin implementation from a chat summary alone.

## Non-negotiable invariants

- World human backing is not company authority.
- Company role is not proof of distinct humanity.
- An AI or external service result is not real-world truth.
- Only deterministic policy authorizes a financial effect.
- All approvals, verification, and settlement bind one recomputed canonical
  action digest.
- AgentKit backing, company role, and action-time World approval are independent
  facts; no one fact substitutes for another.
- Integer amounts and explicit network/account identifiers only.
- `MISMATCH`, `UNKNOWN`, expiry, revocation, mutation, and replay move no value.
- One action settles at most once, including across process crashes.
- Browser code receives no private financial, issuer, verifier, HMAC, or
  provider key.
- Live mode has no fake or silent fallback adapter.
- Financial operations are Hedera Testnet only. World AgentBook registration and
  lookup on World Chain `eip155:480` are an identity-only exception.
- 0G is currently rejected and cannot be installed or selected unless ADR 0005
  is explicitly reopened after every hard gate passes.
- No fourth partner integration.
- `apps/web` is the only human-facing application. Do not add a native client,
  MiniKit, an offline approval path, or browser-held authority credentials.

## Architecture rules

- `packages/domain` is pure and imports no framework, database, network, or
  sponsor SDK.
- `packages/protocol` owns schemas, canonicalization, and signed envelopes.
- Sponsor SDK imports stay inside their adapter package or deployable
  composition root.
- The payment agent, x402 facilitator, and settlement worker hold only their own
  distinct Hedera keys.
- The x402 and settlement dependency graphs stay in separate packages and
  processes; SDK objects never cross their boundary.
- The verifier is the only component permitted to hold its signing key.
- External effects use the outbox/recovery protocol in ADR 0004.
- New cross-package dependencies require an architecture review.

## Working method

1. Work from one issue or plan item on one branch/worktree.
2. Inspect current code and tests before editing.
3. Make the smallest coherent change.
4. Add failure-path tests before declaring the happy path complete.
5. Run the repository's documented checks.
6. Review the diff for claims, secrets, generated evidence, and unrelated
   changes.
7. Commit with a meaningful Conventional Commit message.
8. Leave a session handoff containing branch, SHA, checks, evidence, blockers,
   and next exact action.

Do not stage or rewrite another workstream's files. Do not bypass a failing
check by weakening configuration or deleting coverage.

## Documentation discipline

- First-party sponsor documentation is authoritative.
- Record URL, package version, network, and access date for sponsor behavior.
- Distinguish documented behavior from CallGuard design decisions.
- Put material architecture changes in an ADR.
- Update claims and limitations whenever evidence changes.
- Label synthetic fixtures, mocks, and recorded responses explicitly.

## Stop conditions

Stop and escalate when:

- a sponsor SDK cannot perform the claimed transition;
- a requested change weakens a security invariant;
- a live operation may target mainnet or uncontrolled funds;
- credentials or sensitive identifiers may have leaked;
- a migration or external effect cannot be rolled back/reconciled;
- the branch contains unrelated user changes; or
- the exact repository/branch/PR target is ambiguous.
