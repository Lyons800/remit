import 'server-only';

import postgres from 'postgres';

/**
 * The demo organisation.
 *
 * Every persistence query is scoped by organisation, so one deployment could
 * hold many companies without their rosters mixing. This build only ever uses
 * the one.
 */
export const DEMO_ORGANIZATION_ID = '019f939b-fe5e-7e92-b72e-8d4531958c33';

let client: postgres.Sql | null = null;

/**
 * A lazily-created pooled client.
 *
 * Serverless invocations are short-lived and may run concurrently, so the pool
 * is deliberately small; Neon's pooled endpoint does the real multiplexing.
 */
export function db(): postgres.Sql {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is not configured');
  }
  client ??= postgres(url, { max: 3, idle_timeout: 20 });
  return client;
}

export function isDatabaseConfigured(): boolean {
  const url = process.env['DATABASE_URL'];
  return url !== undefined && url !== '';
}
