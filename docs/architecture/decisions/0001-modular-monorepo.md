# ADR 0001: Modular TypeScript monorepo

- Status: accepted
- Date: 2026-07-25

## Context

Remit needs one product UI, one policy/control API, an independently paid
verification service, an isolated financial worker, and three sponsor adapters.
Multiple team members and coding agents must work concurrently without mixing
trust boundaries or duplicating dependencies.

## Decision

Use a pnpm TypeScript monorepo with:

- six deployable applications and services;
- pure domain and protocol packages;
- sponsor-specific adapter packages;
- Turborepo for the task graph; and
- one Git worktree per active branch/agent.

The control plane remains a modular monolith. The verifier, x402 buyer,
facilitator, and settlement worker are separate because they hold different
keys, cross independent payment/service boundaries, or require incompatible
Hedera dependency graphs.

## Consequences

- Domain behavior can be tested without networks or frameworks.
- Domain reducers revalidate canonical protocol envelopes and otherwise remain
  free of persistence, framework, network, and sponsor dependencies.
- Sponsor dependencies remain visible and replaceable.
- The verifier and worker can fail independently.
- Local development has several processes and needs Docker Compose.
- Package-boundary linting is mandatory to prevent accidental coupling.

## Rejected alternatives

- One Next.js application: hides financial and paid-service trust boundaries.
- Many microservices: creates operational risk without additional security.
- Multiple repositories: makes one hackathon product harder to review,
  reproduce, and submit.
