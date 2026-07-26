import 'server-only';

import postgres from 'postgres';

import {
  authConfigurationState,
  canManageWorkspace,
  WorkspaceAccessError,
} from './workspace-access';

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

type WorkspaceResolution = Readonly<{
  canManage: boolean;
  isDemo: boolean;
  needsOnboarding: boolean;
  organizationId: string;
}>;

async function authenticatedWorkspace(
  requestHeaders: Headers,
): Promise<WorkspaceResolution | null> {
  const state = authConfigurationState();
  if (state === 'absent') return null;
  if (state === 'partial') {
    throw new WorkspaceAccessError(
      'Authentication is only partially configured.',
      503,
      'AUTH_NOT_CONFIGURED',
    );
  }

  const auth = await import('./auth.server')
    .then(({ getAuth }) => getAuth())
    .catch(() => {
      throw new WorkspaceAccessError(
        'Authentication is unavailable.',
        503,
        'AUTH_UNAVAILABLE',
      );
    });

  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  try {
    session = await auth.api.getSession({ headers: requestHeaders });
  } catch {
    throw new WorkspaceAccessError(
      'Authentication is unavailable.',
      503,
      'AUTH_UNAVAILABLE',
    );
  }

  if (session === null) return null;

  const active = session.session.activeOrganizationId;
  if (active === null || active === undefined || active === '') {
    return {
      canManage: false,
      organizationId: DEMO_ORGANIZATION_ID,
      isDemo: true,
      needsOnboarding: true,
    };
  }

  try {
    const membership = await auth.api.getActiveMemberRole({
      headers: requestHeaders,
      query: { organizationId: active },
    });
    return {
      canManage: canManageWorkspace(membership.role),
      organizationId: active,
      isDemo: false,
      needsOnboarding: false,
    };
  } catch {
    throw new WorkspaceAccessError(
      'You are not a member of the active company workspace.',
      403,
      'MEMBERSHIP_REQUIRED',
    );
  }
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
  canManage: boolean;
  organizationId: string;
  isDemo: boolean;
  needsOnboarding: boolean;
}> {
  const workspace = await authenticatedWorkspace(headers);
  return (
    workspace ?? {
      canManage: false,
      organizationId: DEMO_ORGANIZATION_ID,
      isDemo: true,
      needsOnboarding: false,
    }
  );
}

export async function requireManagedOrganization(
  headers: Headers,
): Promise<{ organizationId: string }> {
  if (authConfigurationState() === 'absent') {
    throw new WorkspaceAccessError(
      'Sign-in is not configured in this environment.',
      503,
      'AUTH_NOT_CONFIGURED',
    );
  }

  const workspace = await authenticatedWorkspace(headers);
  if (workspace === null) {
    throw new WorkspaceAccessError(
      'Sign in to change the company workspace.',
      401,
      'SIGN_IN_REQUIRED',
    );
  }
  if (workspace.needsOnboarding) {
    throw new WorkspaceAccessError(
      'Create or select a company workspace first.',
      409,
      'ONBOARDING_REQUIRED',
    );
  }
  if (!workspace.canManage) {
    throw new WorkspaceAccessError(
      'Only a company owner or administrator can manage the roster.',
      403,
      'MEMBERSHIP_REQUIRED',
    );
  }

  return { organizationId: workspace.organizationId };
}
