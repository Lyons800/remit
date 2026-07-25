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
  aggregate version, require the exact domain effects, and commit normalized
  uniqueness, reservation, receipt, consumption, and outbox rows together.
- A serialization failure is returned as `SERIALIZATION_RETRY`. The caller must
  reload current state and rerun domain authorization; it must not blindly
  replay a stale transition.
- Network calls never run in a database transaction. Workers claim a short
  lease, commit it, perform the external operation, and acknowledge or release
  with the opaque lease token.
- Adapter and worker cryptographic authentication remains at the control API and
  service composition roots. Those processes must not expose this repository as
  a raw fact-insertion API.

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
PERSISTENCE_TEST_DATABASE_URL=postgresql://invoiceguard_test:invoiceguard_test@127.0.0.1:55432/invoiceguard_test \
  pnpm test:persistence
docker compose -f compose.persistence-test.yaml down
```

The suite recreates only the `public` schema in that disposable database. It
proves the physical constraint catalog, checksum drift rejection, aggregate
hydration and CAS, atomic effect rollback, approval/challenge consumption,
mandate reservation totals, competing outbox claims, lease release, and expired
lease recovery. Fixtures are synthetic; no sponsor or live-network evidence is
used.
