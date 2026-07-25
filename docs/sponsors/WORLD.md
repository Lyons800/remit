# World authorization integration contract

Status: offline adapter contract implemented; live authority is a NO-GO.

Checked: 2026-07-26.

## Why World is load-bearing

AgentKit is the eligibility boundary for the autonomous invoice and payment
agents on every policy lane. Without AgentKit, a company cannot establish the
human backing and accountability class of an enrolled agent. On an exception,
World AgentBook also lets InvoiceGuard determine that two approval-agent wallets
are backed by the same anonymous World ID human and count them once.

AgentKit does not prove that a person reviewed a payment when the agent signed
it. World Human-in-the-Loop provides that separate fact when deterministic
policy routes an invoice to human approval. Routine invoices fully contained by
a standing mandate do not manufacture per-invoice approval ceremony. Neither
World surface establishes a company role, creates a mandate, or grants treasury
authority.

The decisive demo fixture is:

```text
A1 -> AgentBook P1 + fresh action human H1 + role -> counted
A2 -> AgentBook P1 + fresh action human H2 + role -> not another vote
B  -> AgentBook P2 + repeated action human H1 + role -> not another vote
C  -> AgentBook P3 + fresh action human H3 + role -> counted
```

## Pinned surface

- Package: `@worldcoin/agentkit@0.2.0`
- IDKit request contract: `@worldcoin/idkit-core@4.2.2`
- EVM verification and World RPC: `viem@2.55.8`
- CLI: `@worldcoin/agentkit-cli@0.2.0`
- Canonical lookup chain: World Chain, `eip155:480`; the HTTPS RPC must return
  numeric chain ID `480` before a lookup is accepted
- AgentBook: `0xA23aB2712eA7BBa896930544C7d6636a96b944dA`
- Approval signature: EIP-191 EOA using declared chain `eip155:296`
- Mode: free/custom verification, never AgentKit discount mode
- Human approval: `@worldcoin/human-in-the-loop` and its React binding are not
  installed; exact versions remain gated on supply-chain admission and a live
  control-plane spike

The World identity wallet is intentionally unfunded or minimally funded. It is
not the Hedera service payer or settlement account.

## Registration

Register and inspect each EVM identity wallet with the released CLI:

```bash
npx @worldcoin/agentkit-cli@0.2.0 register 0xAgentAddress
npx @worldcoin/agentkit-cli@0.2.0 status 0xAgentAddress
```

Registration requires the World App and a real World ID human. InvoiceGuard
needs three AgentBook humans for the complete refusal-and-quorum fixture.
Registration is completed before the live demo and its transaction evidence is
retained.

AgentBook registration does not prove possession of the submitted wallet and an
address can be re-registered with its next registration nonce. InvoiceGuard
therefore requires the wallet to sign an enrollment challenge before a company
role is issued.

## Enrollment and company authority

After proof of wallet possession:

1. resolve `humanId` from canonical AgentBook;
2. normalize it and derive
   `tenantPrincipal = HMAC-SHA256(orgKey, normalizedHumanId)`;
3. issue a short-lived company role grant bound to:

   ```text
   grantId
   organizationId
   agentAddress
   tenantPrincipal
   subjectId
   role
   scopeHash
   maximumAmountAtoms
   notBefore
   expiresAt
   audience
   issuerKeyId
   ```

4. pin the company issuer and retain a revocation record.

World human backing and the company role remain independently required.

## Straight-through agent flow

A routine invoice may omit per-invoice Human-in-the-Loop only after
deterministic policy proves exact containment by a current standing mandate. The
payment agent still:

1. proves possession of its enrolled identity wallet;
2. resolves to a current AgentBook human backing;
3. presents a current company role scoped to the organization, supplier,
   mandate, asset, amount, and action;
4. signs a short-lived challenge containing the exact action digest; and
5. has its AgentBook mapping, role, mandate, caps, and action rechecked before
   settlement.

The agent cannot issue or broaden its own mandate. Leaving a mandate routes the
invoice to the exception or blocked path.

## Exact delegate flow

1. Store the immutable canonical action and recompute its SHA-256 digest.
2. Route approval only through:

   ```text
   POST /v1/orgs/{org}/payments/{digest}/decisions/approve
   ```

   The request body is empty.

3. Issue a 60-120 second AgentKit challenge with the exact external URL as both
   signed URI and sole resource, a fixed statement, and free mode.
4. The agent wallet signs and returns the AgentKit header.
5. Parse the header and run the released AgentKit validation and signature
   verification.
6. Add InvoiceGuard's mandatory checks:

   ```text
   payload.uri === expectedApprovalUri
   payload.resources === [expectedApprovalUri]
   payload.statement === expectedStatement
   payload.chainId === "eip155:296"
   payload.type === "eip191"
   request.method === "POST"
   storedAction.digest === pathDigest
   ```

7. Resolve the wallet through canonical AgentBook, derive the tenant principal,
   verify the company role grant, and check revocation.
8. Retain the verified delegate evidence until the matching action-time human
   decision is accepted.
9. Immediately before settlement, re-resolve AgentBook and recheck the role.

The released validator checks the expected domain and URI host/port but does not
enforce InvoiceGuard's exact path, resource, method, or action semantics. The
strict wrapper is consequently a security boundary, not optional hardening.
AgentKit's reference nonce storage also exposes separate check/record
operations, so the InvoiceGuard database owns atomic consumption.

## Action-time Human-in-the-Loop exception flow

1. Create one approval session bound server-side to:

   ```text
   worldActionId
   actionDigest
   agentAddress
   roleGrantId
   subjectId
   decision
   expiresAt
   ```

2. Derive `worldActionId` only from the organization and canonical action
   digest. Reuse it for every role, decision, and approval slot on that action.
   Do not accept an SDK or tool-call default that changes the action identifier.
3. Bind the proof signal to the authenticated subject, approval session, role,
   decision, role grant, agent, and expiry.
4. The offline adapter constructs and revalidates the IDKit v4 request contract.
   A future live composition root must call `IDKit.request` or an admitted
   first-party connector. The RP signing key and proof verification remain
   server-side.
5. Recompute the stored action digest, verify the World proof, recheck the
   company role, and derive versioned, action-scoped HMAC aliases of the
   returned nullifier.
6. After those sponsor checks, emit the domain's canonical
   `AdapterVerifiedApprovalFact`; AgentKit execution evidence emits the domain's
   canonical `RequestingAgentExecutionFact`. The World adapter does not define a
   parallel durable decision type.
7. A future physical repository must reserve every current and still-admitted
   previous HMAC alias while atomically consuming the agent challenge, approval
   session, World proof, and approval claim. That PostgreSQL transaction is not
   implemented by this offline integration.

The current World interfaces do not establish that the IDKit user is the same
person as the AgentBook human backing the agent. InvoiceGuard requires both
facts and does not claim that they are joined.

The action identifier is deliberately broader than the slot-specific signal.
World nullifiers are action-scoped, so including role or decision in
`worldActionId` would let one human receive a different nullifier for another
slot on the same payment.

## Availability and privacy behavior

The reference AgentBook verifier returns `null` both for an unregistered wallet
and for some RPC failures. InvoiceGuard performs an independent World RPC health
check:

- healthy lookup with no registration: authorization refusal;
- unhealthy or indeterminate lookup: dependency unavailable, fail closed.

The raw `humanId` is a public pseudonymous value on World Chain and wallets for
the same person are linkable within AgentBook. InvoiceGuard does not expose that
value or its company mapping in logs, UI, Hedera messages, or public evidence.
Normal records store a versioned tenant or action HMAC; public displays use an
action-scoped local label. During HMAC rotation, the adapter derives the current
and still-admitted previous aliases. The future physical repository must reserve
all aliases in one transaction so the same raw World identity cannot count once
per key version.

## Required tests

- exact URI, resource, statement, chain, type, method, and digest succeed;
- every one-field substitution fails;
- an unregistered wallet fails while an RPC outage reports unavailable;
- the same challenge cannot be consumed twice, including concurrently;
- every Human-in-the-Loop proof binds the expected action, signal, subject,
  decision, and expiry;
- every role and decision slot on one payment shares one World action while its
  signal remains slot-specific;
- verified World evidence parses as the canonical AP approval and requesting
  agent facts, and refresh cannot substitute action/proof identities or extend
  validity;
- reused or cross-action World nullifiers fail;
- a routine invoice inside a current standing mandate uses no per-invoice HITL;
- a beneficiary, amount, asset, evidence, or cap change exits that mandate;
- `A1 + A2` remain one quorum principal;
- two different delegates cannot count when the same action human is reused;
- distinct delegate and action-human classes reach quorum only when both roles
  are valid;
- wallet re-registration invalidates a principal-bound role;
- expired and revoked roles fail before authorization and before execution;
- raw World identifiers are absent from structured logs and evidence.

The scoped offline evidence and the unresolved live gates are recorded in
[WORLD-SPIKE.md](WORLD-SPIKE.md).

## Judge evidence

- canonical AgentBook registrations for `A1`, `A2`, `B`, and `C`;
- decoded signed challenge showing the exact digest route, nonce, expiry, chain,
  and identity wallet;
- approval timeline showing `1/2`, same-AgentBook-human rejection,
  same-action-human rejection, missing-role rejection, then `2/2`;
- one-character action mutation and challenge replay failures;
- redacted evidence record tied to the same build SHA as the deployment.

For an exception, the product claim is “a fresh verified human approved this
exact action for a separately human-backed, company-authorized delegate.”
InvoiceGuard does not claim that World cryptographically joins the two humans.
For straight-through payment, the claim is narrower: a currently human-backed,
company-authorized agent acted inside a separately governed standing mandate.

## First-party sources

- [AgentKit integration guide](https://docs.world.org/agents/agent-kit/integrate)
- [AgentKit SDK reference](https://docs.world.org/agents/agent-kit/sdk-reference)
- [Human-in-the-Loop integration](https://docs.world.org/agents/human-in-the-loop/integrate)
- [Human-in-the-Loop SDK reference](https://docs.world.org/agents/human-in-the-loop/sdk-reference)
- [IDKit integration](https://docs.world.org/world-id/idkit/integrate)
- [Official AgentKit repository](https://github.com/worldcoin/agentkit)
- [Official releases](https://github.com/worldcoin/agentkit/releases)
- [Released validator source](https://github.com/worldcoin/agentkit/blob/f87b798/core/src/validate.ts)
- [AgentBook contract](https://github.com/worldcoin/agentkit/blob/3775f076cb15fe9783353413bd6860c94f8bdeeb/contracts/src/AgentBook.sol)
- [Challenge implementation](https://github.com/worldcoin/agentkit/blob/3775f076cb15fe9783353413bd6860c94f8bdeeb/x402/src/server.ts)
- [Storage interface](https://github.com/worldcoin/agentkit/blob/3775f076cb15fe9783353413bd6860c94f8bdeeb/x402/src/storage.ts)
