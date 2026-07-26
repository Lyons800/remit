# Technology baseline

Checked: 2026-07-26.

Installed versions are exact in the lockfile. Candidate versions are
research-pinned but do not become dependencies until their owning spike passes.
"Latest" is not a reason to upgrade a security-sensitive dependency during the
build; every sponsor SDK upgrade must be reviewed against its first-party
changelog and live contract tests.

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

| Technology                                                           |               Verified current version | Status             | Intended use                                                     |
| -------------------------------------------------------------------- | -------------------------------------: | ------------------ | ---------------------------------------------------------------- |
| Next.js                                                              |                                16.2.11 | installed          | Product web application                                          |
| React                                                                |                                 19.2.8 | installed          | Product UI                                                       |
| Hono                                                                 |                                4.12.32 | installed          | Control API and x402 verifier HTTP services                      |
| Zod                                                                  |                                  4.4.3 | installed          | Runtime validation at every external boundary                    |
| `@hono/zod-openapi`                                                  |                                  1.5.1 | candidate for PR 2 | OpenAPI contract generation                                      |
| PostgreSQL driver [`postgres`](https://github.com/porsager/postgres) |                                  3.4.9 | installed          | Payment persistence below the repository layer; Unlicense        |
| PostgreSQL driver [`pg`](https://github.com/brianc/node-postgres)    |                                 8.22.0 | installed          | Server-only Better Auth database connection; MIT                 |
| Better Auth                                                          |                                 1.6.23 | installed          | Google identity, revocable sessions, and organization membership |
| Drizzle ORM                                                          |                                 0.45.2 | candidate for PR 3 | Typed schema and migrations                                      |
| Pino                                                                 |                                 10.3.1 | candidate for PR 3 | Structured logs with explicit redaction                          |
| OpenTelemetry                                                        | version pinned during observability PR | not yet selected   | Cross-service traces and metrics                                 |

The persistence-contract work admitted `postgres@3.4.9` from its
[first-party repository](https://github.com/porsager/postgres), under the
Unlicense. It has no install script and stays below the repository boundary.
Rollback removes the dependency and its lockfile entry together with the
PostgreSQL repository implementation; it does not require weakening workspace
supply-chain policy. Drizzle remains uninstalled because the reviewed migration
and transaction surface does not need an ORM.

The company-identity slice admits `better-auth@1.6.23`, `pg@8.22.0`, and
development-only `@types/pg@8.20.0`. All are exact lockfile pins with unmodified
published artifacts. Better Auth and node-postgres are MIT licensed. Better Auth
owns only the `invoiceguard_auth` PostgreSQL schema and the web `/api/auth/*`
boundary. The web compiler skips checking third-party declaration files because
Better Auth publishes optional Bun and Cloudflare type references; InvoiceGuard
source retains every strict compiler rule.

Rollback disables the auth route and sign-in UI, removes the three direct
packages and their lock entries, and redeploys before retiring
`invoiceguard_auth`. Dropping that schema is a separate, explicitly approved
operation because it revokes sessions and deletes organization membership.

## Web3 and sponsor baseline

| Package                       | Verified current version | Status                         | Boundary                                    |
| ----------------------------- | -----------------------: | ------------------------------ | ------------------------------------------- |
| `@worldcoin/agentkit`         |                    0.2.0 | installed, offline only        | `packages/world-adapter` only               |
| `@worldcoin/idkit-core`       |                    4.2.2 | installed, offline only        | `packages/world-adapter` only               |
| `@x402/core`                  |                   2.19.0 | installed; protocol spike live | x402 protocol boundary                      |
| `@x402/hedera`                |                   2.19.0 | installed; protocol spike live | x402 buyer/facilitator runtime only         |
| `@x402/hono`                  |                   2.19.0 | pending x402 spike             | Verifier service boundary                   |
| `@hiero-ledger/sdk`           |                   2.85.0 | installed; protocol spike live | x402 runtime, matching `@x402/hedera`       |
| `@hashgraph/hedera-agent-kit` |                    4.0.0 | pending settlement spike       | settlement planner runtime only             |
| `@hiero-ledger/sdk`           |                   2.81.0 | pending settlement spike       | settlement runtime, pinned Agent Kit peer   |
| Viem                          |                   2.55.8 | installed, offline only        | World adapter EVM and RPC primitives        |
| Wagmi                         |                    3.7.4 | candidate                      | Browser wallet integration only if required |
| JOSE                          |                    6.2.4 | candidate                      | Company-role and verifier signed envelopes  |
| 0G SDK                        |             not admitted | rejected                       | No package, SDK, credential, or deployment  |

Sponsor packages are not imported by the domain, protocol, persistence, or UI
packages. The x402 and settlement SDK graphs live in separate processes and
workspace packages. `@hashgraph/sdk` is not an alias for `@hiero-ledger/sdk`;
Remit uses only the latter and never passes SDK class instances between
runtimes.

### Admitted World offline dependency set

The World spike pins both the immutable npm version and its official source
revision. The lockfile retains each npm integrity hash.

| Package and exact version     | Official source revision                                                                                                            | Declared license                                       | Admitted boundary                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| `@worldcoin/agentkit@0.2.0`   | [`f87b798cd6a75d941f922e5e030c42f8ee866be0`](https://github.com/worldcoin/agentkit/commit/f87b798cd6a75d941f922e5e030c42f8ee866be0) | None in the npm artifact or pinned repository revision | Local compatibility and offline adapter evidence only |
| `@worldcoin/idkit-core@4.2.2` | [`0af7afb9b347755eb26163355d044d8b46486ba3`](https://github.com/worldcoin/idkit/commit/0af7afb9b347755eb26163355d044d8b46486ba3)    | MIT                                                    | IDKit v4 request and response contracts only          |
| `viem@2.55.8`                 | [`211a1dd56cd0e3f6cf2ae6a38c5322d97f53a117`](https://github.com/wevm/viem/commit/211a1dd56cd0e3f6cf2ae6a38c5322d97f53a117)          | MIT                                                    | EOA fixtures and World Chain RPC only                 |

The AgentKit package's absent license declaration is recorded, not interpreted
as permission. Production use or redistribution remains blocked until the owner
publishes a compatible license or legal review supplies an explicit basis.

AgentKit's graph asks for `undici-types@~6.19.2`. The workspace pins the
transitive package to `6.19.2`; no trust-policy exclusion or release-age bypass
was added.

Rollback is mechanical and has no data migration: remove the three direct
dependencies from `packages/world-adapter`, remove the `undici-types@~6.19.2`
override if no other package needs it, remove the World adapter integration code
and tests, and regenerate `pnpm-lock.yaml` with pnpm `11.17.0`. No live
credential, database schema, registered identity, or deployed World authority
exists to revoke or migrate.

## Quality baseline

| Tool       | Verified current version | Status         | Purpose                                                               |
| ---------- | -----------------------: | -------------- | --------------------------------------------------------------------- |
| Vitest     |                   4.1.10 | installed      | Unit, property, contract, and integration tests                       |
| fast-check |                    4.9.0 | candidate PR 2 | Canonicalization, mutation, idempotency, and state-machine properties |
| Playwright |                   1.62.0 | candidate PR 4 | User and four-minute demo paths                                       |
| ESLint     |                   10.7.0 | installed      | Newest release admitted by the 24-hour package quarantine             |
| Prettier   |                    3.9.6 | installed      | Deterministic formatting                                              |

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
hours old and were rejected by policy. Remit selected the newest mature releases
instead of creating a convenience exception.

The isolated Hedera x402 graph adds three narrowly reviewed admissions:

- `protobufjs@8.0.1` may run its install compatibility check only for the exact
  pinned `@x402/hedera` peer graph. pnpm 11 supports version-scoped
  `allowBuilds` selectors. The other resolved versions, `7.6.5` and `8.2.0`, are
  explicitly denied because their postinstall is the same optional
  dependency-range check and is not required by the runtime.
- `semver@6.3.1` and `undici-types@6.19.8` are exact-version
  `trustPolicyExclude` entries. They are legacy transitives in the pinned
  `@hiero-ledger/sdk@2.85.0` graph, have lockfile integrity, and do not publish
  the npm provenance needed by the workspace's no-downgrade check.
- No release-age exception, exotic source, broad build permission, credential,
  or runtime environment variable was added.

These admissions establish the dependency and serialization baseline. A separate
x402 protocol spike now establishes one Testnet consensus transfer, but not
execution through the admitted AP adapter or its signature, memo,
canonical-digest, and recovery contracts. The distinction is recorded in the
evidence register.

TypeScript 7.0.2 was also rejected after peer validation:
`typescript-eslint@8.65.0` supports TypeScript below 6.1. The foundation pins
TypeScript 6.0.3 until the lint toolchain publishes a compatible release.

pnpm's global virtual store was evaluated for faster multi-worktree installs but
disabled in the foundation because Next.js peer type resolution did not remain
correct under the global symlink graph. Worktrees still share pnpm's
content-addressable package store while retaining a local virtual dependency
graph.

## Compatibility gate

Before admitting each pending dependency:

1. install the exact workspace with pnpm 11;
2. compile all sponsor SDK imports under TypeScript 6.0.3 strict mode;
3. run on Node 24 locally and in CI;
4. build the owning deployable image when containerization lands;
5. run a minimal live call for each admitted sponsor adapter; and
6. document any downgrade with an ADR instead of silently changing versions.
