# Payment persistence

This package implements the PostgreSQL security boundary tracked by issue
[#20](https://github.com/Lyons800/invoiceguard/issues/20). It persists hydrated
payment aggregates, organization-scoped replay identities, mandate reservations,
settlement attempts and results, and recoverable outbox work.

## Boundary

- Callers provide a configured `postgres` client. The package does not read
  environment variables or credentials.
- Every aggregate loaded from JSON is rehydrated through
  `hydratePaymentActionAggregate`; invalid persisted state fails closed.
- Transition writes use `SERIALIZABLE`, lock the current action, compare the
  aggregate version, rerun the domain reducer from the supplied event and
  trusted context, and require the complete aggregate and effect set to equal
  that canonical successor. The command input, normalized uniqueness,
  reservation, receipt, consumption, and outbox rows commit together. Exact
  replay is checked against both the durable command input and effect body.
- `applyTransition` requires an opaque, boundary-specific writer capability. The
  composition root retains the issuer and configures each process's allowed
  effect types plus fact and effect adapter identifiers. Plain caller objects
  and capabilities issued by another boundary fail closed.
- A serialization failure is returned as `SERIALIZATION_RETRY`. The caller must
  reload current state and rerun domain authorization; it must not blindly
  replay a stale transition.
- Network calls never run in a database transaction. Workers claim a short
  lease, commit it, perform the external operation, and acknowledge or release
  with the opaque lease token.
- The capability boundary is in-process authorization plumbing, not proof of
  cryptographic process identity. Adapter and worker authentication remains a
  responsibility of the control API and service composition roots, which issue
  capabilities only after their own authentication policy succeeds. Those
  processes must not expose either the issuer or this repository as a raw
  fact-insertion API.

## Migration

`migrations/0001_payment_effect_contracts.sql` is forward-only.
`applyPaymentEffectContractsMigration` takes its reviewed contents, obtains a
transaction-scoped advisory lock, applies it atomically, and records a SHA-256
checksum. Changed contents under the same migration ID are rejected.

Rollback of application code may leave this additive schema in place. Dropping
the tables is permitted only for an explicitly disposable test database; a
database containing durable effects must be reconciled and migrated forward.

## Local integration tests

The Compose file contains only fixed synthetic test credentials:

```sh
docker compose -f compose.persistence-test.yaml up -d
PERSISTENCE_TEST_DISPOSABLE_CONFIRM=remit-persistence-disposable-v1 \
PERSISTENCE_TEST_DATABASE_URL=postgresql://remit_test:remit_test@127.0.0.1:55432/remit_test \
  pnpm test:persistence
docker compose -f compose.persistence-test.yaml down
```

Before any destructive statement, the suite requires an exact confirmation
token, verifies the URL's loopback host/test database/test user, and
independently checks the connected server identity. Each run creates a
randomized test schema; resets and cleanup are constrained to that verified
schema, never `public`. The suite proves the physical constraint catalog,
checksum drift rejection, aggregate hydration and CAS, atomic effect rollback,
approval/challenge consumption, mandate reservation totals, competing outbox
claims, lease release, and expired lease recovery. Fixtures are synthetic; no
sponsor or live-network evidence is used.
