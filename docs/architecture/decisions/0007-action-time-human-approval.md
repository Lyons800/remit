# ADR 0007: Action-time human approval in one web application

- Status: accepted
- Date: 2026-07-25

## Context

AgentKit establishes that an agent wallet is backed by a registered human. It
does not establish that a person reviewed a particular payment when the agent
signed it. InvoiceGuard also needs a narrow approval experience that works on a
phone without creating a second client or moving authority keys into a browser.

## Decision

Use World Human-in-the-Loop as an additional authorization fact:

1. every approval candidate remains an AgentKit-backed, company-enrolled agent;
2. the company role binds the agent, its AgentBook-derived tenant principal, and
   the authenticated application subject;
3. one World action identifier binds the canonical action digest, role,
   decision, approval session, and expiry;
4. the World proof signal binds the authenticated subject to that approval
   session;
5. AgentBook principals and action-scoped World nullifiers are independently
   deduplicated; and
6. proof verification, role checks, nonce consumption, and decision insertion
   complete atomically before the decision can count.

The official interfaces do not prove that the IDKit user is the same person as
the AgentBook human backing the delegate. InvoiceGuard requires both facts and
does not claim that they are cryptographically joined.

`apps/web` is the sole human interface. It provides a desktop operations view
and a focused mobile approval route from the same Next.js application. The
mobile route may be installable through a web manifest, but approval,
verification, and settlement always use fresh server state and never work
offline.

## Consequences

- A mobile action review is part of the authorization path, not a second
  product.
- The RP signing key, raw World identifiers, role issuer key, agent keys, and
  financial keys remain server-side.
- The same World action identifier is reused for every slot on one canonical
  action so a human cannot obtain different nullifiers by changing tool calls.
- Native mobile, MiniKit, Capacitor, Expo, service-worker mutation queues, and
  offline approval are outside the accepted architecture.
- A spike must prove that the Human-in-the-Loop workflow can resume through the
  existing control-plane boundary before its packages are admitted.

## Rejected alternatives

- AgentKit signature alone: no evidence of fresh human review.
- World proof alone: no company authority or human-backed-agent evidence.
- Native or World Mini App: another runtime and release path without a required
  sponsor or product capability.
- A mutable approval body: permits reviewed and executed fields to diverge.

## First-party sources

- [World Human-in-the-Loop integration](https://docs.world.org/agents/human-in-the-loop/integrate)
- [World Human-in-the-Loop SDK reference](https://docs.world.org/agents/human-in-the-loop/sdk-reference)
- [World IDKit integration](https://docs.world.org/world-id/idkit/integrate)
