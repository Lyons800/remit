import { getMigrations } from 'better-auth/db/migration';
import { organization } from 'better-auth/plugins';
import process from 'node:process';
import pg from 'pg';

const schema = 'invoiceguard_auth';
const expectedTables = [
  'account',
  'invitation',
  'member',
  'organization',
  'session',
  'user',
  'verification',
];
const connectionString =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const checkOnly = process.argv.includes('--check');
const resetEmptySchema = process.argv.includes('--reset-empty-schema');

if (connectionString === undefined || connectionString.length === 0) {
  throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
}

const administrativePool = new pg.Pool({
  connectionString,
  connectionTimeoutMillis: 10_000,
  max: 1,
});

async function inspectSchema(pool) {
  const tables = await pool.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `,
    [schema],
  );

  const idColumns = await pool.query(
    `
      SELECT table_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = $1
        AND column_name = 'id'
      ORDER BY table_name
    `,
    [schema],
  );

  return {
    tables: tables.rows.map(({ table_name: tableName }) => tableName),
    idColumns: idColumns.rows,
  };
}

async function assertTablesEmpty(pool, tables) {
  for (const table of tables) {
    const escapedSchema = pg.escapeIdentifier(schema);
    const escapedTable = pg.escapeIdentifier(table);
    const result = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM ${escapedSchema}.${escapedTable} LIMIT 1) AS populated`,
    );

    if (result.rows[0]?.populated === true) {
      throw new Error(
        `Refusing to reset ${schema}: table ${table} contains data`,
      );
    }
  }
}

function isLegacyTextSchema(snapshot) {
  return snapshot.idColumns.some(
    ({ data_type: dataType, column_default: columnDefault }) =>
      dataType !== 'uuid' ||
      typeof columnDefault !== 'string' ||
      !columnDefault.includes('gen_random_uuid'),
  );
}

async function prepareSchema(pool) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  const snapshot = await inspectSchema(pool);

  if (snapshot.tables.length === 0 || !isLegacyTextSchema(snapshot)) {
    return;
  }

  if (!resetEmptySchema) {
    throw new Error(
      `${schema} uses the legacy text-id schema; rerun with --reset-empty-schema after confirming every auth table is empty`,
    );
  }

  await assertTablesEmpty(pool, snapshot.tables);
  await pool.query('BEGIN');
  try {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

try {
  await prepareSchema(administrativePool);
} finally {
  await administrativePool.end();
}

const migrationPool = new pg.Pool({
  connectionString,
  connectionTimeoutMillis: 10_000,
  max: 1,
  options: `-c search_path=${schema},public`,
});

try {
  const migration = await getMigrations({
    advanced: {
      database: {
        generateId: 'uuid',
      },
    },
    database: migrationPool,
    plugins: [
      organization({
        creatorRole: 'owner',
        requireEmailVerificationOnInvitation: true,
      }),
    ],
  });

  if (checkOnly) {
    if (migration.toBeCreated.length > 0 || migration.toBeAdded.length > 0) {
      process.exitCode = 1;
      process.stderr.write('Better Auth schema is not current\n');
    } else {
      process.stdout.write('Better Auth schema is current\n');
    }
  } else {
    await migration.runMigrations();
  }

  const snapshot = await inspectSchema(migrationPool);
  const missingTables = expectedTables.filter(
    (table) => !snapshot.tables.includes(table),
  );

  if (missingTables.length > 0 || isLegacyTextSchema(snapshot)) {
    process.exitCode = 1;
    process.stderr.write(
      `Better Auth schema failed UUID validation${
        missingTables.length > 0 ? `; missing: ${missingTables.join(', ')}` : ''
      }\n`,
    );
  } else if (!checkOnly) {
    process.stdout.write('Better Auth schema is current\n');
  }
} finally {
  await migrationPool.end();
}
