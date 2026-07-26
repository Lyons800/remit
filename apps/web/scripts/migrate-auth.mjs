import { getMigrations } from 'better-auth/db/migration';
import { organization } from 'better-auth/plugins';
import process from 'node:process';
import pg from 'pg';

const schema = 'invoiceguard_auth';
const connectionString =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (connectionString === undefined || connectionString.length === 0) {
  throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
}

const administrativePool = new pg.Pool({
  connectionString,
  connectionTimeoutMillis: 10_000,
  max: 1,
});

await administrativePool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
await administrativePool.end();

const migrationPool = new pg.Pool({
  connectionString,
  connectionTimeoutMillis: 10_000,
  max: 1,
  options: `-c search_path=${schema},public`,
});

try {
  const migration = await getMigrations({
    database: migrationPool,
    plugins: [
      organization({
        creatorRole: 'owner',
        requireEmailVerificationOnInvitation: true,
      }),
    ],
  });

  if (process.argv.includes('--check')) {
    if (migration.toBeCreated.length > 0 || migration.toBeAdded.length > 0) {
      process.exitCode = 1;
      process.stderr.write('Better Auth schema is not current\n');
    } else {
      process.stdout.write('Better Auth schema is current\n');
    }
  } else {
    await migration.runMigrations();
    process.stdout.write('Better Auth schema is current\n');
  }
} finally {
  await migrationPool.end();
}
