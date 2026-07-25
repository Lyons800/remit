# World offline integration record

Status: offline compatibility and AP fact integration proven; live authority not
proven.

Checked: 2026-07-26.

## Admitted package surface

| Package                 | Version  | Offline purpose                              |
| ----------------------- | -------- | -------------------------------------------- |
| `@worldcoin/agentkit`   | `0.2.0`  | Exact AgentKit challenge verification        |
| `@worldcoin/idkit-core` | `4.2.2`  | IDKit v4 proof-of-human request contract     |
| `viem`                  | `2.55.8` | EOA fixture verification and World Chain RPC |

The AgentKit dependency graph requires `undici-types@~6.19.2`; the workspace
pins `6.19.2`, which satisfies the repository's unchanged no-downgrade
supply-chain policy. No trust-policy exclusion was added.

`@worldcoin/human-in-the-loop` and its React binding are not installed. Their
workflow dependency does not pass the current supply-chain gate, and a live
integration must also prove an explicit IDKit v4 `proofOfHuman` configuration
with legacy proofs disabled.

## What is implemented

- Exact EIP-191 AgentKit challenge construction and verification, including
  InvoiceGuard's path, sole-resource, statement, method, chain, action-digest,
  nonce, expiry, one-use, and unsigned-field checks.
- AgentBook resolution only after an HTTPS World RPC reports numeric chain ID
  `480`, with distinct unregistered, unavailable, and indeterminate outcomes.
- Tenant- and action-scoped HMAC principals with versioned current/previous
  aliases for safe key rotation.
- An IDKit v4 proof-of-human request contract with explicit `proofOfHuman`,
  expected signal hash, user-presence requirement, short RP context, and legacy
  proofs disabled.
- One World action identifier derived only from organization and action digest,
  shared across every role and decision slot. The signal separately binds the
  subject, approval session, role, decision, grant, agent, principal version,
  and expiry.
- World verified evidence projected into the AP domain's canonical
  `AdapterVerifiedApprovalFact` and `RequestingAgentExecutionFact`. Policy-owned
  executor fields are derived from the verified authorization bundle.
- Refresh rules that pin the complete action and proof provenance, allow only a
  non-decreasing verification time, and never extend the admitted expiry.
- Rotation identity claims containing the action, proof, session, decision,
  challenge, subject, and every currently admitted HMAC alias for later atomic
  reservation.

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
canonical AP fact parsing/quorum, same-action distinctness, and rotation alias
handling. It does not represent live World evidence.

## Live admission gates

This integration remains a NO-GO for live World authority until all of the
following are evidenced:

- a production Developer Portal app and RP configuration;
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
- [AgentKit repository](https://github.com/worldcoin/agentkit)
- [Human-in-the-Loop integration](https://docs.world.org/agents/human-in-the-loop/integrate)
- [Human-in-the-Loop SDK reference](https://docs.world.org/agents/human-in-the-loop/sdk-reference)
- [IDKit integration](https://docs.world.org/world-id/idkit/integrate)
- [IDKit repository](https://github.com/worldcoin/idkit-js)
