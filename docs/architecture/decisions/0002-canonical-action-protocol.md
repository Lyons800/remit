# ADR 0002: One canonical action protocol

- Status: accepted
- Date: 2026-07-25

## Context

Approvals are meaningless if the recipient, amount, evidence, policy, expiry, or
network can change between human review and settlement.

## Decision

Represent every payment request as a versioned schema, validate it at runtime,
canonicalize it with RFC 8785, prepend a domain separator, and hash it with
SHA-256.

All approvals, service quotes, verification results, outbox effects, HCS
messages, and settlement evidence bind the same digest. Integer atoms and
explicit CAIP identifiers replace floating-point amounts and ambiguous chain or
account names.

## Consequences

- A one-character change creates a different action.
- Human-readable output must come from the exact validated object.
- Schema upgrades create a new version and cannot reuse old approvals.
- Canonicalization requires known-vector and cross-runtime tests.

## Rejected alternatives

- Database row ID only: does not bind the reviewed semantics.
- Arbitrary `JSON.stringify`: property order and number handling are unsafe
  protocol assumptions.
- An LLM-generated summary hash: cannot be reproduced or trusted.
