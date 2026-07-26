import { createHash } from 'node:crypto';

import type postgres from 'postgres';

const PAYMENT_EFFECT_CONTRACTS_MIGRATION_ID =
  '0001_payment_effect_contracts.sql';
const WORKSPACE_PEOPLE_MIGRATION_ID = '0002_workspace_people.sql';
const MIGRATION_LOCK = 'invoiceguard:persistence:migrations';

export type MigrationResult = 'ALREADY_APPLIED' | 'APPLIED';

/**
 * Apply one migration exactly once, keyed by id and pinned by checksum.
 *
 * A migration whose text changed after it was applied is a different migration
 * wearing the same name, so this raises rather than running it. Accepting it
 * silently would leave two databases both claiming the same schema version.
 */
export async function applyNamedMigration(
  sql: postgres.Sql,
  migrationId: string,
  migrationSql: string,
): Promise<MigrationResult> {
  const checksum = createHash('sha256')
    .update(migrationSql, 'utf8')
    .digest('hex');

  return sql.begin('isolation level serializable', async (transaction) => {
    await transaction`
      SELECT pg_advisory_xact_lock(hashtext(${MIGRATION_LOCK}))
    `;
    await transaction`
      CREATE TABLE IF NOT EXISTS invoiceguard_schema_migrations (
        migration_id text PRIMARY KEY,
        checksum text NOT NULL
          CHECK ((checksum ~ '^[0-9a-f]{64}$') IS TRUE),
        applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
      )
    `;

    const existing = await transaction<
      readonly Readonly<{ checksum: string }>[]
    >`
      SELECT checksum
      FROM invoiceguard_schema_migrations
      WHERE migration_id = ${migrationId}
    `;
    if (existing.length === 1) {
      if (existing[0]?.checksum !== checksum) {
        throw new Error(`migration checksum mismatch: ${migrationId}`);
      }
      return 'ALREADY_APPLIED';
    }

    await transaction.unsafe(migrationSql);
    await transaction`
      INSERT INTO invoiceguard_schema_migrations (migration_id, checksum)
      VALUES (${migrationId}, ${checksum})
    `;
    return 'APPLIED';
  });
}

export async function applyPaymentEffectContractsMigration(
  sql: postgres.Sql,
  migrationSql: string,
): Promise<MigrationResult> {
  return applyNamedMigration(
    sql,
    PAYMENT_EFFECT_CONTRACTS_MIGRATION_ID,
    migrationSql,
  );
}

export async function applyWorkspacePeopleMigration(
  sql: postgres.Sql,
  migrationSql: string,
): Promise<MigrationResult> {
  return applyNamedMigration(sql, WORKSPACE_PEOPLE_MIGRATION_ID, migrationSql);
}
