# Hackathon provenance

## Event

- Event: ETHGlobal Lisbon 2026
- Track: Classic / From Scratch
- Repository initialized: 2026-07-25 17:32 WEST
- Required starting point: empty repository

## Starting-state declaration

This repository began without pre-existing Remit application code, contracts,
designs, generated assets, or deployment state.

All project-specific implementation, architecture records, product assets,
tests, prompts, and plans committed here are created during the event window.
Public libraries, sponsor SDKs, official templates, and open-source starter code
may be used only when their source, version, license, and modifications are
documented.

The separate research workspace used to select the concept was also produced
during the event. Relevant decisions will be restated in this repository so the
submitted history is complete and auditable.

## Third-party integration provenance

The Hedera x402 slice consumes these exact public packages. pnpm installs their
published artifacts under the repository lockfile; no third-party package source
is copied, vendored, patched, or modified.

| Package             | Exact version | Published source                                                               | Upstream source                                                       | License    | Modifications                           |
| ------------------- | ------------: | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ---------- | --------------------------------------- |
| `@x402/core`        |      `2.19.0` | [npm registry manifest](https://registry.npmjs.org/@x402%2Fcore/2.19.0)        | [x402 Foundation `x402`](https://github.com/x402-foundation/x402)     | Apache-2.0 | None; installed artifact is unmodified. |
| `@x402/hedera`      |      `2.19.0` | [npm registry manifest](https://registry.npmjs.org/@x402%2Fhedera/2.19.0)      | [x402 Foundation `x402`](https://github.com/x402-foundation/x402)     | Apache-2.0 | None; installed artifact is unmodified. |
| `@hiero-ledger/sdk` |      `2.85.0` | [npm registry manifest](https://registry.npmjs.org/@hiero-ledger%2Fsdk/2.85.0) | [Hiero JavaScript SDK](https://github.com/hiero-ledger/hiero-sdk-js)  | Apache-2.0 | None; installed artifact is unmodified. |
| `better-auth`       |      `1.6.23` | [npm registry manifest](https://registry.npmjs.org/better-auth/1.6.23)         | [Better Auth](https://github.com/better-auth/better-auth)             | MIT        | None; installed artifact is unmodified. |
| `pg`                |      `8.22.0` | [npm registry manifest](https://registry.npmjs.org/pg/8.22.0)                  | [node-postgres](https://github.com/brianc/node-postgres)              | MIT        | None; installed artifact is unmodified. |
| `@types/pg`         |      `8.20.0` | [npm registry manifest](https://registry.npmjs.org/@types%2Fpg/8.20.0)         | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT        | None; development types are unmodified. |

Remit's adapter, trust-policy checks, canonical bindings, recovery seam, and
tests are original event-window code outside those packages.

## AI-assisted development

AI tools may assist research, planning, implementation, testing, and review. The
team remains responsible for:

- understanding every committed design and code path;
- reviewing generated changes before commit;
- recording material prompts, plans, and architecture decisions;
- validating sponsor integrations against first-party documentation;
- retaining negative tests and live evidence; and
- never presenting mocked or generated evidence as a live integration.

## Initial partner scope

1. World AgentKit: human-backed-agent verification and agent accountability.
2. World Human-in-the-Loop: fresh, action-bound decisions from distinct humans.
3. Hedera: agent-to-service payment, exact Testnet financial operation, and
   auditable receipts.

0G was evaluated as an optional private supplier-evidence implementation and
rejected under the documented admission gate.
