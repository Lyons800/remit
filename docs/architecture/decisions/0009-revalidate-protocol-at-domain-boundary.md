# ADR 0009: Revalidate protocol envelopes at the domain boundary

- Status: accepted
- Date: 2026-07-25

## Context

A TypeScript type, boolean, or structural `verified` label is not runtime
evidence. Payment transitions may receive records reconstructed from JSON or a
database after their original API validation. Trusting a caller-produced
projection would let an expiry, route, mandate field, or policy input diverge
from the bytes whose digest was approved.

## Decision

`packages/domain` depends on the sponsor-neutral `packages/protocol`
verification surface. Every authorization transition re-runs the canonical
authorization-bundle verifier. Every mandate transition or containment check
re-runs the standing-mandate envelope verifier.

The canonical action directly binds the supplier snapshot digest. The policy
decision binds a canonical manifest of the versioned policy configuration and
normalized inputs, plus the derived evidence policy and purchase-order result.
Bundle verification re-runs the pure evaluator and rejects any divergence in
route, reasons, authority, verification, or mandate reference. The mandate
directly binds the mapped settlement beneficiary. Domain policy compares these
revalidated records rather than accepting caller assertions that they matched.

Policy evaluation cannot predate action creation, and authorization cannot
precede the frozen evaluation time. A mandate version cannot authorize an action
created before that version's `notBefore`, even if every other field matches.

The payment reducer carries the verified authorization bundle and every
state-dependent prerequisite record as part of its aggregate. Events cannot
choose the route, verification mode or expiry. Mandate authorization derives the
exact claim, reserves it from the supplied current ledger, persists the
`RESERVED` basis, and returns the required atomic ledger write. Human
authorization persists the exact current adapter-verified approval facts rather
than a computed quorum boolean. Both routes persist the requesting-agent
execution fact and revalidate current role and AgentBook authority before
freezing settlement.

Audit and settlement transitions require exact action-bound records rather than
validity flags. The frozen attempt binds attempt ID, deterministic idempotency
key, action and effect digest, transaction ID, signed bytes hash, network,
adapter, status, and times. Retry compares a candidate with that aggregate-held
record. Receipt and one-use consumption records must bind the same attempt,
transaction, bytes, effect, network, action, obligation, invoice revision,
nonce, and idempotency key. Evidence-result, consensus, service-payment,
authority and settlement objects are adapter-verified application-layer facts
produced only after the adapter validates the sponsor response; raw SDK or HTTP
payloads never enter the domain reducer.

Sponsor cryptography remains outside the domain. World approval adapters emit a
separate verified-fact contract whose action, status, validity, role and
distinctness semantics are checked by the domain.

## Consequences

- Deserialized records cannot enter an authorization transition on shape alone.
- Hydration cannot claim an advanced payment state without all prerequisite
  records and monotonic transition metadata.
- Mutation of a supplier snapshot, evidence policy, purchase-order result,
  route, expiry, or settlement beneficiary changes a digest or fails
  containment.
- The domain remains deterministic and free of databases, frameworks, networks
  and sponsor SDKs, but is no longer dependency-free.
- Protocol and domain changes must run together through the canonical mutation
  and transition suites.
