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

## 2026-07-25 - GitHub delivery and security repair

### Outcome

- Reauthenticated the GitHub CLI as `Lyons800`.
- Created `Lyons800/invoiceguard` privately, pushed the provenance-only `main`
  and `chore/foundation`, and opened pull request 1.
- Configured rebase-only merges, automatic branch cleanup, issues, delivery
  labels, and repository topics.
- Kept public visibility as an explicit source-disclosure decision.

### CI findings

- Granted the Gitleaks workflow read-only pull-request metadata after its first
  private-repository run was denied by GitHub.
- Retained GitHub's dependency-diff review for public operation and added a
  locked production audit while the repository is private.
- The audit found vulnerable transitive `sharp` and `postcss` versions beneath
  Next.js.
- Pinned `sharp` 0.35.3 and `postcss` 8.5.23 after their release-age and
  registry records passed the repository policy.

### Validation

- The resolved graph contains one patched version of each package.
- `pnpm audit --prod --audit-level=moderate` reports no known vulnerabilities.
- Formatting, lint, 14 workspace type checks, test type checks, 33 tests, and
  all 14 production builds pass with pnpm 11.17.0.

### Remaining external step

The repository cannot enable a ruleset while it is a private personal repository
on the current GitHub plan. Public visibility requires explicit owner approval;
the documented `main` ruleset follows immediately afterward.

## 2026-07-26 - World offline AP integration

### Outcome

- Admitted pinned AgentKit, IDKit Core, and viem packages without weakening the
  repository supply-chain policy.
- Added exact AgentKit challenge, World Chain AgentBook, IDKit request-contract,
  and versioned privacy primitives from the reviewed World spike.
- Reused one World action across all roles and decisions for a canonical payment
  while retaining slot-specific subject, role, grant, session, agent, decision,
  and expiry binding in the signal.
- Emitted only the AP domain's canonical `AdapterVerifiedApprovalFact` and
  `RequestingAgentExecutionFact`; no parallel durable World decision record was
  introduced.
- Kept physical persistence, live Developer Portal verification, registered
  identities, company credentials, and real-human quorum as explicit NO-GO
  gates.
