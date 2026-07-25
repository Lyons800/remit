# Technology baseline

Checked: 2026-07-25.

Versions are exact in the lockfile. "Latest" is not a reason to upgrade a
security-sensitive dependency during the build; every sponsor SDK upgrade must
be reviewed against its first-party changelog and live contract tests.

## Runtime and workspace

| Technology | Baseline | Reason                                                                                   |
| ---------- | -------: | ---------------------------------------------------------------------------------------- |
| Node.js    |   24 LTS | Current LTS line; ESM, native test/runtime improvements, and supported by pnpm 11        |
| pnpm       |  11.17.0 | Exact package-manager pin, workspace support, supply-chain controls, efficient worktrees |
| TypeScript |    6.0.3 | Newest stable compiler supported by the strict lint toolchain                            |
| Turborepo  |   2.10.6 | Newest release admitted by the 24-hour package quarantine                                |

Node 26 is Current, not LTS, and is not the production baseline. Node 24 is the
current LTS line according to the
[Node release table](https://nodejs.org/en/about/previous-releases).

## Application framework candidates

| Technology                   |               Verified current version | Intended use                                  |
| ---------------------------- | -------------------------------------: | --------------------------------------------- |
| Next.js                      |                                16.2.11 | Product web application                       |
| React                        |                                 19.2.8 | Product UI                                    |
| Hono                         |                                4.12.32 | Control API and x402 verifier HTTP services   |
| Zod                          |                                  4.4.3 | Runtime validation at every external boundary |
| `@hono/zod-openapi`          |                                  1.5.1 | OpenAPI contract generation                   |
| PostgreSQL driver `postgres` |                                  3.4.9 | Database access below the repository layer    |
| Drizzle ORM                  |                                 0.45.2 | Typed schema and migrations                   |
| Pino                         |                                 10.3.1 | Structured logs with explicit redaction       |
| OpenTelemetry                | version pinned during observability PR | Cross-service traces and metrics              |

## Web3 and sponsor baseline

| Package                       | Verified current version | Boundary                                    |
| ----------------------------- | -----------------------: | ------------------------------------------- |
| `@worldcoin/agentkit`         |                    0.2.0 | `packages/world-adapter` only               |
| `@x402/core`                  |                   2.19.0 | x402 protocol boundary                      |
| `@x402/hedera`                |                   2.19.0 | x402 buyer/facilitator runtime only         |
| `@x402/hono`                  |                   2.19.0 | Verifier service boundary                   |
| `@hiero-ledger/sdk`           |                   2.85.0 | x402 runtime, matching `@x402/hedera`       |
| `@hashgraph/hedera-agent-kit` |                    4.0.0 | settlement planner runtime only             |
| `@hiero-ledger/sdk`           |                   2.81.0 | settlement runtime, pinned Agent Kit peer   |
| Viem                          |                   2.55.8 | EVM typed-data and address primitives       |
| Wagmi                         |                    3.7.4 | Browser wallet integration only if required |
| JOSE                          |                    6.2.4 | Company-role and verifier signed envelopes  |
| 0G SDK                        |             not admitted | No package, SDK, credential, or deployment  |

Sponsor packages are not imported by the domain, protocol, persistence, or UI
packages. The x402 and settlement SDK graphs live in separate processes and
workspace packages. `@hashgraph/sdk` is not an alias for `@hiero-ledger/sdk`;
CallGuard uses only the latter and never passes SDK class instances between
runtimes.

## Quality baseline

| Tool       | Verified current version | Purpose                                                               |
| ---------- | -----------------------: | --------------------------------------------------------------------- |
| Vitest     |                   4.1.10 | Unit, property, contract, and integration tests                       |
| fast-check |                    4.9.0 | Canonicalization, mutation, idempotency, and state-machine properties |
| Playwright |                   1.62.0 | User and four-minute demo paths                                       |
| ESLint     |                   10.7.0 | Newest release admitted by the 24-hour package quarantine             |
| Prettier   |                    3.9.6 | Deterministic formatting                                              |

## Dependency security

The workspace follows pnpm's current
[supply-chain guidance](https://pnpm.io/supply-chain-security):

- commit the lockfile;
- pin the package-manager version;
- retain pnpm 11's default one-day `minimumReleaseAge`;
- block exotic transitive dependency sources;
- use `trustPolicy: no-downgrade`;
- allow dependency build scripts only for reviewed packages;
- install with `--frozen-lockfile` in CI;
- review every sponsor SDK and cryptography dependency update; and
- generate an SBOM for tagged demo builds.

Sponsor packages released during the event may need a narrowly documented
release-age exception. The exception must pin an exact version and record the
official source.

At foundation install, Turborepo 2.10.7 and ESLint 10.8.0 were less than 24
hours old and were rejected by policy. CallGuard selected the newest mature
releases instead of creating a convenience exception.

TypeScript 7.0.2 was also rejected after peer validation:
`typescript-eslint@8.65.0` supports TypeScript below 6.1. The foundation pins
TypeScript 6.0.3 until the lint toolchain publishes a compatible release.

pnpm's global virtual store was evaluated for faster multi-worktree installs but
disabled in the foundation because Next.js peer type resolution did not remain
correct under the global symlink graph. Worktrees still share pnpm's
content-addressable package store while retaining a local virtual dependency
graph.

## Compatibility gate

Before freezing this baseline:

1. install the exact workspace with pnpm 11;
2. compile all sponsor SDK imports under TypeScript 6.0.3 strict mode;
3. run on Node 24 locally and in CI;
4. build all Docker images;
5. run a minimal live call for each admitted sponsor adapter; and
6. document any downgrade with an ADR instead of silently changing versions.
