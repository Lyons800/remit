const MINIMUM_SECRET_LENGTH = 32;

export type AuthEnvironment = Readonly<{
  baseUrl: string;
  databaseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  secret: string;
}>;

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function requireValue(source: EnvironmentSource, name: string): string {
  const value = source[name]?.trim();

  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function requireUrl(
  source: EnvironmentSource,
  name: string,
  protocols: ReadonlySet<string>,
): string {
  const value = requireValue(source, name);
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (!protocols.has(parsed.protocol)) {
    throw new Error(`${name} uses an unsupported protocol`);
  }

  return parsed.toString().replace(/\/$/, '');
}

export function readAuthEnvironment(
  source: EnvironmentSource = process.env,
): AuthEnvironment {
  const secret = requireValue(source, 'BETTER_AUTH_SECRET');

  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(
      `BETTER_AUTH_SECRET must be at least ${MINIMUM_SECRET_LENGTH} characters`,
    );
  }

  return Object.freeze({
    baseUrl: requireUrl(
      source,
      'BETTER_AUTH_URL',
      new Set(['http:', 'https:']),
    ),
    databaseUrl: requireUrl(
      source,
      'DATABASE_URL',
      new Set(['postgres:', 'postgresql:']),
    ),
    googleClientId: requireValue(source, 'GOOGLE_CLIENT_ID'),
    googleClientSecret: requireValue(source, 'GOOGLE_CLIENT_SECRET'),
    secret,
  });
}
