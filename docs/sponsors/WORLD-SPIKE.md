# World offline integration record

Status: offline compatibility and AP fact integration proven; live authority not
proven.

Checked: 2026-07-26.

## Admitted package surface

| Package                 | Version  | License      | Official source revision                   | Offline purpose                              |
| ----------------------- | -------- | ------------ | ------------------------------------------ | -------------------------------------------- |
| `@worldcoin/agentkit`   | `0.2.0`  | not declared | `f87b798cd6a75d941f922e5e030c42f8ee866be0` | Exact AgentKit challenge verification        |
| `@worldcoin/idkit-core` | `4.2.2`  | MIT          | `0af7afb9b347755eb26163355d044d8b46486ba3` | IDKit v4 proof-of-human request contract     |
| `viem`                  | `2.55.8` | MIT          | `211a1dd56cd0e3f6cf2ae6a38c5322d97f53a117` | EOA fixture verification and World Chain RPC |

The AgentKit dependency graph requires `undici-types@~6.19.2`; the workspace
pins `6.19.2`, which satisfies the repository's unchanged no-downgrade
supply-chain policy. No trust-policy exclusion was added.

The AgentKit npm artifact and its pinned source revision contain no declared
license. InvoiceGuard does not infer one. Production use or redistribution is a
NO-GO until a compatible license or explicit legal basis is confirmed. The exact
dependency sources, license findings, and rollback are recorded in the
[technology baseline](../architecture/TECHNOLOGY-BASELINE.md#admitted-world-offline-dependency-set).

`@worldcoin/human-in-the-loop` and its React binding are not installed. Their
workflow dependency does not pass the current supply-chain gate, and a live
integration must also prove an explicit IDKit v4 `proofOfHuman` configuration
with legacy proofs disabled.

## What is implemented

- Exact EIP-191 AgentKit challenge construction and verification, including
  InvoiceGuard's path, sole-resource, statement, method, chain, action-digest,
  nonce, expiry, one-use, and unsigned-field checks. A verified claim is an
  opaque, in-process result created only after atomic challenge consumption; a
  serialized or structurally copied claim must be verified again.
- AgentBook resolution only after an HTTPS World RPC reports numeric chain ID
  `480`, with distinct unregistered, unavailable, and indeterminate outcomes.
- Tenant- and action-scoped HMAC principals with versioned current/previous
  aliases for safe key rotation.
- An IDKit v4 proof-of-human request contract derived from a validated trusted
  deployment context, with exact app, environment, relying-party ID, explicit
  `proofOfHuman`, expected signal hash, user-presence requirement, short RP
  context, and legacy proofs disabled.
- One World action identifier derived only from organization and action digest,
  shared across every role and decision slot. The signal separately binds the
  subject, approval session, role, decision, grant, agent, principal version,
  and expiry.
- One verifier/composition path correlates the validated authorization bundle,
  opaque approval and requester AgentKit claims, current AgentBook resolutions,
  company-role authority, trusted deployment, and verified IDKit result before
  projecting the AP domain's canonical `AdapterVerifiedApprovalFact` and
  `RequestingAgentExecutionFact`. There are no exported structural fact or
  status constructors.
- The projection derives its validity ceiling as the minimum of every
  authorization, session, relying-party, AgentKit, AgentBook, role, and World
  proof expiry. A later projection must repeat verification rather than refresh
  a retained structural fact.
- The projection receives transient raw AgentBook and IDKit identifiers and
  derives every current and still-admitted previous HMAC alias from the
  authoritative keyring. Caller-supplied or truncated alias arrays are rejected.

There is deliberately no World-specific durable human-decision type. Sponsor
verification ends at the adapter; the AP domain owns authorization and quorum
semantics.

## Local evidence

Run the scoped evidence after building its declared workspace dependencies:

```bash
pnpm --filter @invoiceguard/world-adapter... build
pnpm exec vitest run packages/world-adapter/test
pnpm --filter @invoiceguard/world-adapter typecheck
```

The suite uses released SDK behavior where available and explicit synthetic
ports and fixtures elsewhere. It proves local contracts, refusal behavior,
canonical AP fact parsing/quorum, same-action distinctness, complete rotation
aliases, minimum expiry, and rejection of fabricated, serialized, omitted, or
substituted authority evidence. It does not represent live World evidence.

## Live admission gates

This integration remains a NO-GO for live World authority until all of the
following are evidenced:

- a production Developer Portal app and RP configuration;
- a compatible AgentKit license or explicit legal basis for production use and
  redistribution;
- a live `IDKit.request` or admitted first-party connector round trip followed
  by World's server-side verification;
- live AgentBook registration and resolution for the required distinct humans;
- cryptographically issued and revoked company-role credentials;
- a deployed composition root that rechecks the trusted subject, action,
  AgentBook backing, role, and proof immediately before authorization;
- one physical serializable repository transaction that consumes the exact
  challenge, session, proof, and fact while reserving every current/previous
  company-subject, AgentBook, and action-human uniqueness claim; and
- deployed judge evidence from the same reviewed build SHA.

No PostgreSQL repository or migration is part of this offline integration. No
live AgentBook registration, World proof, real-human quorum, company-role
authority, or settlement claim has been made.

AgentBook backing and action-time IDKit identity remain independent facts.
Current first-party interfaces do not prove they identify the same person, and
InvoiceGuard makes no such claim.

## First-party sources

- [AgentKit integration guide](https://docs.world.org/agents/agent-kit/integrate)
- [AgentKit SDK reference](https://docs.world.org/agents/agent-kit/sdk-reference)
- [AgentKit published source revision](https://github.com/worldcoin/agentkit/commit/f87b798cd6a75d941f922e5e030c42f8ee866be0)
- [Human-in-the-Loop integration](https://docs.world.org/agents/human-in-the-loop/integrate)
- [Human-in-the-Loop SDK reference](https://docs.world.org/agents/human-in-the-loop/sdk-reference)
- [IDKit integration](https://docs.world.org/world-id/idkit/integrate)
- [IDKit Core published source revision](https://github.com/worldcoin/idkit/commit/0af7afb9b347755eb26163355d044d8b46486ba3)
- [viem published source revision](https://github.com/wevm/viem/commit/211a1dd56cd0e3f6cf2ae6a38c5322d97f53a117)
