const AUTH_IDENTITY_ENVIRONMENT_NAMES = [
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
] as const;

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type AuthConfigurationState = 'absent' | 'configured' | 'partial';

export function authConfigurationState(
  source: EnvironmentSource = process.env,
): AuthConfigurationState {
  const configured = AUTH_IDENTITY_ENVIRONMENT_NAMES.filter((name) => {
    const value = source[name];
    return value !== undefined && value.trim() !== '';
  }).length;

  if (configured === 0) return 'absent';
  const databaseUrl =
    source['DATABASE_URL_UNPOOLED'] ?? source['DATABASE_URL'] ?? '';
  if (
    configured === AUTH_IDENTITY_ENVIRONMENT_NAMES.length &&
    databaseUrl.trim() !== ''
  ) {
    return 'configured';
  }
  return 'partial';
}

export function canManageWorkspace(role: string): boolean {
  return role
    .split(',')
    .map((entry) => entry.trim())
    .some((entry) => entry === 'owner' || entry === 'admin');
}

export class WorkspaceAccessError extends Error {
  public constructor(
    message: string,
    public readonly status: 401 | 403 | 409 | 503,
    public readonly code:
      | 'AUTH_NOT_CONFIGURED'
      | 'AUTH_UNAVAILABLE'
      | 'MEMBERSHIP_REQUIRED'
      | 'ONBOARDING_REQUIRED'
      | 'SIGN_IN_REQUIRED',
  ) {
    super(message);
    this.name = 'WorkspaceAccessError';
  }
}
