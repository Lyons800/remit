# World offline integration record

Status: offline compatibility and atomic-admission contract proven; live
authority not proven.

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
  serialized or structurally copied claim must be verified again. That brand is
  an in-process sequencing guard, not durable authentication or protection from
  an untrusted composition root.
- AgentBook resolution only after an HTTPS World RPC reports numeric chain ID
  `480`, with distinct unregistered, unavailable, and indeterminate outcomes. A
  successful resolution records the observed numeric chain and network, registry
  ID and contract, adapter ID and version, backing-record source and validity
  window. Every field must match the frozen composition policy.
- Tenant- and action-scoped HMAC principals with versioned current/previous
  aliases for safe key rotation.
- An IDKit v4 proof-of-human request contract derived from a process-branded,
  frozen deployment context, with a digest identity binding the exact app,
  environment, relying-party ID and mode. Requests keep that identity alongside
  explicit `proofOfHuman`, expected signal hash, user-presence requirement,
  short RP context, and disabled legacy proofs.
- One World action identifier derived only from organization and action digest,
  shared across every role and decision slot. The signal separately binds the
  subject, approval session, role, decision, grant, agent, principal version,
  and expiry.
- One verifier/composition path correlates the validated authorization bundle,
  approval and requester AgentKit claims, exact AgentBook provenance,
  company-role authority, frozen deployment, and verified IDKit result before
  constructing the AP domain's `AdapterVerifiedApprovalFact` and
  `RequestingAgentExecutionFact`.
- Those domain factories are public structural validators and `recordDigest` is
  only a canonical checksum. Neither proves adapter origin or authority. The
  World API therefore returns no loose facts.
- The path derives its validity ceiling as the minimum of every authorization,
  session, relying-party, AgentKit, AgentBook, role, and World proof expiry. A
  later admission must repeat verification rather than refresh a retained
  structural fact.
- The path receives transient raw AgentBook and IDKit identifiers and derives
  every current and still-admitted previous HMAC alias from the authoritative
  keyring. Caller-supplied or truncated alias arrays are rejected.
- It creates one digest-bound `WorldAuthorityAdmissionBundle` containing both
  facts, exact approval/requester AgentBook evidence, deployment and composition
  policy IDs, and every identity claim. The whole bundle is mandatory input to a
  process-branded admission-writer capability; success exposes only the
  bundle-bound writer receipt.

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
same-action distinctness, exact AgentBook provenance, complete rotation aliases,
minimum expiry, deployment/policy substitution refusal, and rejection of
fabricated, serialized, omitted, truncated, or substituted authority evidence.
It deliberately does not demonstrate quorum from extracted structural facts. Its
synthetic admission writer proves the port contract, not a physical transaction
or live World authority.

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
- an authenticated admission-writer capability owned only by that composition
  root;
- one physical serializable repository transaction that consumes the exact
  challenge, session and proof while reserving every current/previous
  company-subject, approval AgentBook, requester AgentBook and action-human
  claim;
- persistence of the complete admission bundle, both facts and the matching
  writer receipt in that same atomic group; and
- deployed judge evidence from the same reviewed build SHA.

No PostgreSQL repository or migration is part of this offline integration. No
live AgentBook registration, World proof, real-human quorum, company-role
authority, or settlement claim has been made.

AgentBook backing and action-time IDKit identity remain independent facts.
Current first-party interfaces do not prove they identify the same person, and
InvoiceGuard makes no such claim.

### Exact persistence-branch integration

After rebasing the persistence branch, its composition root must implement
`WorldAuthorityAdmissionWriter` with an authenticated writer capability, not a
generic callback exposed to request handlers. The implementation must:

1. accept the in-process branded bundle directly, or define an independently
   authenticated transport if a process boundary would strip that brand;
2. recheck the bundle digest, composition-policy ID, deployment ID, observed
   AgentBook provenance, action and expected aggregate version;
3. consume the challenge, approval session and World proof, and reserve every
   identity claim in the bundle, including all overlap-key aliases;
4. persist the complete bundle, approval fact, requester fact and bundle-bound
   writer receipt in one serializable transaction using the domain atomic-group
   key; and
5. expose those facts to quorum or payment transitions only when read back
   through that authenticated repository record.

Until that integration exists and its concurrent-conflict tests pass,
structurally valid facts and synthetic writer receipts are test artifacts, not
live authority.

## First-party sources

- [AgentKit integration guide](https://docs.world.org/agents/agent-kit/integrate)
- [AgentKit SDK reference](https://docs.world.org/agents/agent-kit/sdk-reference)
- [AgentKit published source revision](https://github.com/worldcoin/agentkit/commit/f87b798cd6a75d941f922e5e030c42f8ee866be0)
- [Human-in-the-Loop integration](https://docs.world.org/agents/human-in-the-loop/integrate)
- [Human-in-the-Loop SDK reference](https://docs.world.org/agents/human-in-the-loop/sdk-reference)
- [IDKit integration](https://docs.world.org/world-id/idkit/integrate)
- [IDKit Core published source revision](https://github.com/worldcoin/idkit/commit/0af7afb9b347755eb26163355d044d8b46486ba3)
- [viem published source revision](https://github.com/wevm/viem/commit/211a1dd56cd0e3f6cf2ae6a38c5322d97f53a117)
