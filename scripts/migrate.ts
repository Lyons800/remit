/**
 * Apply the persistence migrations.
 *
 * Idempotent and checksum-pinned: re-running is a no-op, and a migration whose
 * text changed after it was applied raises rather than silently diverging.
 *
 *   pnpm migrate
 *
 * Reads DATABASE_URL from .env.local, or the environment if it is already set
 * (which is how it runs against Neon from CI or a shell with Vercel env
 * loaded).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  applyPaymentEffectContractsMigration,
  applyWorkspacePeopleMigration,
} from '@remit/persistence';
import postgres from 'postgres';

function databaseUrl(): string {
  const fromEnv = process.env['DATABASE_URL'];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;

  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_URL=')) {
        return trimmed.slice('DATABASE_URL='.length);
      }
    }
  } catch {
    /* fall through */
  }

  console.error('DATABASE_URL is not set and .env.local does not define it.');
  process.exit(1);
}

const MIGRATIONS = [
  {
    id: '0001_payment_effect_contracts.sql',
    apply: applyPaymentEffectContractsMigration,
  },
  { id: '0002_workspace_people.sql', apply: applyWorkspacePeopleMigration },
] as const;

async function main(): Promise<void> {
  const url = databaseUrl();
  console.log(`\nmigrating ${new URL(url).host}\n`);

  const sql = postgres(url, { max: 1 });
  try {
    for (const migration of MIGRATIONS) {
      const text = readFileSync(
        resolve(process.cwd(), 'packages/persistence/migrations', migration.id),
        'utf8',
      );
      const result = await migration.apply(sql, text);
      console.log(`  ${result.padEnd(15)} ${migration.id}`);
    }
    console.log('\nschema up to date\n');
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    '\nmigration failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
