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
decision directly binds the evidence-policy identity, version and digest plus
the purchase-order policy and result. The mandate directly binds the mapped
settlement beneficiary. Domain policy compares these revalidated records rather
than accepting caller assertions that they matched.

Policy evaluation cannot predate action creation, and authorization cannot
precede the frozen evaluation time. A mandate version cannot authorize an action
created before that version's `notBefore`, even if every other field matches.

Sponsor cryptography remains outside the domain. World approval adapters emit a
separate verified-fact contract whose action, status, validity, role and
distinctness semantics are checked by the domain.

## Consequences

- Deserialized records cannot enter an authorization transition on shape alone.
- Mutation of a supplier snapshot, evidence policy, purchase-order result,
  route, expiry, or settlement beneficiary changes a digest or fails
  containment.
- The domain remains deterministic and free of databases, frameworks, networks
  and sponsor SDKs, but is no longer dependency-free.
- Protocol and domain changes must run together through the canonical mutation
  and transition suites.
