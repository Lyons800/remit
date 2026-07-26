import { createHash } from 'node:crypto';

import type postgres from 'postgres';

const PAYMENT_EFFECT_CONTRACTS_MIGRATION_ID =
  '0001_payment_effect_contracts.sql';
const MIGRATION_LOCK = 'invoiceguard:persistence:migrations';

export type MigrationResult = 'ALREADY_APPLIED' | 'APPLIED';

export async function applyPaymentEffectContractsMigration(
  sql: postgres.Sql,
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
      WHERE migration_id = ${PAYMENT_EFFECT_CONTRACTS_MIGRATION_ID}
    `;
    if (existing.length === 1) {
      if (existing[0]?.checksum !== checksum) {
        throw new Error(
          `migration checksum mismatch: ${PAYMENT_EFFECT_CONTRACTS_MIGRATION_ID}`,
        );
      }
      return 'ALREADY_APPLIED';
    }

    await transaction.unsafe(migrationSql);
    await transaction`
      INSERT INTO invoiceguard_schema_migrations (migration_id, checksum)
      VALUES (${PAYMENT_EFFECT_CONTRACTS_MIGRATION_ID}, ${checksum})
    `;
    return 'APPLIED';
  });
}
