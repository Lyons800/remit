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
normalized inputs, plus the derived evidence policy, its service identity, key
and network, the required executor role, scope, audience and versioned grant,
and the purchase-order result. Bundle verification re-runs the pure evaluator
and rejects any divergence in route, reasons, authority, verification, or
mandate reference. The mandate directly binds the mapped settlement beneficiary.
Domain policy compares these revalidated records rather than accepting caller
assertions that they matched.

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
execution fact. Hydration proves that the persisted fact was current, in time,
and exactly policy-bound when authorization occurred. Authorization, audit
commit, settlement freeze, and retry each require a fresh adapter-verified fact
with the same agent identity, current role and grant, current AgentBook backing,
and the frozen adapter, audience, tenant, subject and scope. Refresh cannot
change the AgentKit challenge, signed-proof digest, immutable fact ID, or
original validity ceiling. Human-approval refresh likewise pins its adapter,
decision, approval session, World proof, AgentKit challenge, signed-proof
digest, roles, subjects, and quorum principals, and cannot extend its original
expiry. A retained required-verification result must still be `MATCH` and
unexpired at authorization, audit commit, settlement freeze, and retry;
historical hydration remains valid for inspection and safe recovery transitions.

Audit and settlement transitions require exact action-bound records rather than
validity flags. The authorization audit binds the exact authority fact plus the
writer, account, key and network that committed it. The frozen attempt binds
attempt ID, deterministic idempotency key, action and effect digest, transaction
ID, canonical base64url-encoded signed transaction bytes and their SHA-256 hash,
network, adapter, status, and times. Retry accepts no caller attempt: after
current authority, mandate or human approvals, reservation and expiry are
revalidated, the effect carries the aggregate-held original bytes. Receipt and
uncertainty records bind their source adapter to the same attempt, transaction,
exact bytes, effect, network, action, obligation, invoice revision, nonce, and
idempotency key. One-use consumption records additionally bind the serializable
writer, aggregate version and atomic group.

Queueing the frozen attempt returns the initial submission outbox effect in the
same atomic group as the aggregate transition. Consensus settlement returns a
deterministic execution-audit outbox effect in the same atomic group as the
receipt, one-use consumption, and applicable mandate mutation. The resulting
audit-pending and audit-degraded states preserve moved value. Retrying execution
audit uses the same event ID, and only an exact receipt-, attempt-, writer-, and
authorization-bound consensus fact can recover to settled.

Evidence payment and result facts retain the exact configured service identity,
key, network, quote, payment attempt and payment transaction. The result must
copy those fields from the accepted payment. Evidence-result, consensus,
service-payment, authority and settlement objects are adapter-verified
application-layer facts produced only after the adapter validates the sponsor
response; raw SDK or HTTP payloads never enter the domain reducer.

Sponsor cryptography remains outside the domain. World approval adapters emit a
separate verified-fact contract whose action, status, validity, role and
distinctness semantics are checked by the domain.

## Consequences

- Deserialized records cannot enter an authorization transition on shape alone.
- Hydration cannot claim an advanced payment state without all prerequisite
  records, their exact chronology, and monotonic transition metadata.
- A historically valid aggregate may be inspected or driven to a safe terminal
  state after its retained authority expires, but cannot produce a new financial
  effect until current authority is revalidated.
- Mutation of a supplier snapshot, evidence policy, purchase-order result,
  route, expiry, or settlement beneficiary changes a digest or fails
  containment.
- The domain remains deterministic and free of databases, frameworks, networks
  and sponsor SDKs, but is no longer dependency-free.
- Protocol and domain changes must run together through the canonical mutation
  and transition suites.
