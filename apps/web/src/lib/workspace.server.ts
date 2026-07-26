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

/**
 * Which organisation the current request is acting for.
 *
 * A signed-in user acts for the organisation on their session. Everyone else
 * gets the demo organisation, which is deliberately public and holds only
 * synthetic records.
 *
 * The important property is the direction of the fallback: an unauthenticated
 * visitor can only ever reach the demo organisation, and a signed-in user can
 * never accidentally be handed it in place of their own. If the session has no
 * active organisation the caller is sent to onboarding rather than silently
 * shown somebody else's ledger.
 *
 * This is the only place the id is decided. Every repository function already
 * takes it as a parameter, so scoping happens here and nowhere else.
 */
export async function resolveOrganizationId(headers: Headers): Promise<{
  organizationId: string;
  isDemo: boolean;
  needsOnboarding: boolean;
}> {
  try {
    const { getAuth } = await import('./auth.server');
    const session = await getAuth().api.getSession({ headers });
    if (session === null) {
      return {
        organizationId: DEMO_ORGANIZATION_ID,
        isDemo: true,
        needsOnboarding: false,
      };
    }
    const active = session.session.activeOrganizationId;
    if (active === null || active === undefined || active === '') {
      return {
        organizationId: DEMO_ORGANIZATION_ID,
        isDemo: true,
        needsOnboarding: true,
      };
    }
    return { organizationId: active, isDemo: false, needsOnboarding: false };
  } catch {
    // Auth not configured in this environment — the demo remains reachable.
    return {
      organizationId: DEMO_ORGANIZATION_ID,
      isDemo: true,
      needsOnboarding: false,
    };
  }
}
