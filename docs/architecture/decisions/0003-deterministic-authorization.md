# ADR 0003: Deterministic authorization

- Status: accepted
- Date: 2026-07-25

## Context

World and the configured verification service provide useful facts, but neither
establishes everything needed to authorize company funds. Model output is
probabilistic and may be manipulated.

## Decision

Use a pure deterministic policy engine. It evaluates:

- World-derived distinct-human equivalence;
- independently issued company roles and revocation;
- standing-mandate containment or action-bound Human-in-the-Loop decisions;
- exact-action agent signatures;
- expiry and nonce state;
- verifier signature and digest/evidence/payment binding;
- `MATCH`, `MISMATCH`, or `UNKNOWN`;
- network, recipient, asset, amount, and spend caps; and
- one-use state.

The policy route is explicit: `STRAIGHT_THROUGH`, `HUMAN_APPROVAL`, or `BLOCK`.
The policy engine accepts only a strict, versioned configuration and strict,
versioned normalized input. It hashes both into a canonical manifest and derives
the route, reason codes, authority, purchase-order result, verification mode,
and mandate reference. Callers cannot supply those outputs. `STRAIGHT_THROUGH`
may require zero per-invoice human decisions only under the standing-mandate
constraints in ADR 0008.

AI may extract candidate fields or recommend a route. It cannot produce a
supplier-evidence result, sign, mutate policy, or directly authorize settlement.
Only the configured deterministic service can issue the signed `MATCH`,
`MISMATCH`, or `UNKNOWN` envelope.

## Consequences

- Every decision has machine-readable reason codes.
- Negative tests can prove why no value moved.
- A service or model compromise remains a trust risk but cannot alter the action
  or bypass other controls.
- Policy versions are immutable and included in the action digest.
