# ADR 0004: Transactional outbox and recoverable effects

- Status: accepted
- Date: 2026-07-25

## Context

A process can crash after submitting a Hedera transaction but before recording
the receipt. Retrying a newly created transaction can pay twice. Database and
network state cannot be changed atomically.

## Decision

Use a transactional outbox and effect-attempt record. Persist deterministic
idempotency metadata and the exact frozen/signed transaction bytes before
submission. On uncertainty, reconcile the original transaction through
Hedera/Mirror before any resubmission. Never construct a replacement effect from
mutable state.

## Consequences

- Recovery logic is part of the primary implementation, not a later patch.
- The worker needs a leasing/claim protocol and observable attempt states.
- Integration tests must kill the process before and after submission.
- Final action consumption derives from a valid consensus receipt.

## Rejected alternatives

- Fire-and-forget calls from an HTTP handler.
- A `paid=true` flag written before network execution.
- Retrying with a new transaction or nonce after every timeout.
