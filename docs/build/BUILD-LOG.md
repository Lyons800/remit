# Build log

This is a concise, append-only record of material build decisions. Git history
remains the source of truth for exact changes.

## 2026-07-25 - repository foundation

### Outcome

- Initialized an empty Classic-track repository during the event.
- Created a provenance-only root commit on `main`.
- Opened `chore/foundation` for all subsequent work.
- Froze the InvoiceGuard product claim, non-claims, authority model, threat
  model, sponsor contracts, and delivery gates.
- Bootstrapped a strict pnpm monorepo with seven deployables, seven internal
  packages, CI workflows, and explicit inactive-adapter shells.
- Isolated untrusted invoice extraction in its own no-credential process
  boundary.
- Added a responsive synthetic AP control room with desktop, tablet, and mobile
  checks.

### Evidence-driven decisions

- Wrapped released World AgentKit validation with exact
  URI/resource/method/chain/type/digest checks and atomic nonce consumption.
- Split World identity, company issuer, x402 buyer/facilitator, settlement,
  verifier, and HCS audit keys.
- Isolated Hedera x402 and Agent Kit dependency graphs in separate processes.
- Required an HCS authorization precommit; made execution postcommit
  recoverable.
- Split liveness from readiness; every foundation shell reports liveness and
  fails readiness until its owning integration passes.
- Rejected 0G after its testnet model catalog and first-party E2EE source failed
  the private, authenticated, digest-bound admission gate.
- Rejected same-day Turborepo and ESLint releases under the 24-hour package
  quarantine.
- Rejected TypeScript 7 because the strict lint stack does not support it.
- Disabled pnpm's global virtual store after it broke correct Next.js peer type
  resolution; retained the shared content-addressable store.

### Validation

- Formatting: passed.
- ESLint architecture and source rules: passed.
- Strict TypeScript across 14 workspaces plus root tests: passed.
- Foundation runtime and health tests: 33 passed.
- Production builds, including Next.js: passed.
- Peer dependency audit: no issues.
- Clean-output development boot: all six HTTP processes live; all six readiness
  checks returned 503 as designed.
- Responsive inspection: no overflow or browser warnings at 1440, 900, 768, 390,
  or 320 pixels.

### External blocker

GitHub device reauthentication is in progress. The public remote, ruleset, push,
and PR wait for successful authentication and owner/org confirmation.
