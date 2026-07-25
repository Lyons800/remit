import { readFile } from 'node:fs/promises';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  applyPaymentEffectContractsMigration,
  paymentPersistenceUniquenessContract,
} from '../../src/index.js';

const databaseUrl = process.env['PERSISTENCE_TEST_DATABASE_URL'];
if (databaseUrl === undefined) {
  throw new Error('PERSISTENCE_TEST_DATABASE_URL is required');
}

const sql = postgres(databaseUrl, {
  max: 4,
  onnotice: () => undefined,
});
const migrationUrl = new URL(
  '../../migrations/0001_payment_effect_contracts.sql',
  import.meta.url,
);
const migrationSql = await readFile(migrationUrl, 'utf8');

beforeAll(async () => {
  await sql.unsafe('DROP SCHEMA public CASCADE');
  await sql.unsafe('CREATE SCHEMA public');
});

afterAll(async () => {
  await sql.end();
});

describe('PostgreSQL payment-effect schema', () => {
  it('applies once, records its checksum, and rejects drift', async () => {
    await expect(
      applyPaymentEffectContractsMigration(sql, migrationSql),
    ).resolves.toBe('APPLIED');
    await expect(
      applyPaymentEffectContractsMigration(sql, migrationSql),
    ).resolves.toBe('ALREADY_APPLIED');
    await expect(
      applyPaymentEffectContractsMigration(
        sql,
        `${migrationSql}\nSELECT 'drift';`,
      ),
    ).rejects.toThrow('migration checksum mismatch');
  });

  it('physically reserves every declared uniqueness identity', async () => {
    const rows = await sql<readonly Readonly<{ name: string }>[]>`
      SELECT conname AS name
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
      UNION
      SELECT indexname AS name
      FROM pg_indexes
      WHERE schemaname = 'public'
    `;
    const physicalNames = new Set(rows.map(({ name }) => name));
    const missing = paymentPersistenceUniquenessContract.uniqueKeys
      .map(({ name }) => name)
      .filter((name) => !physicalNames.has(name));

    expect(missing).toEqual([]);
  });
});
