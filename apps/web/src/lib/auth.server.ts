import 'server-only';

import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import pg from 'pg';

import { readAuthEnvironment } from './auth-environment';

const AUTH_SCHEMA = 'invoiceguard_auth';

const globalWithAuth = globalThis as typeof globalThis & {
  remitAuthPool?: pg.Pool;
};

/**
 * Memoised per process. A module-level binding costs nothing at import time —
 * only assignment on first use — which is the whole point of the indirection.
 */
let cachedAuth: ReturnType<typeof createAuth> | undefined;

/**
 * Build the auth instance on first use, never at module scope.
 *
 * `next build` imports every route module while collecting page data, so
 * reading secrets at module scope makes the build itself require production
 * credentials — which fails CI, where none exist, and would force real secrets
 * into the build environment for no reason. Auth pages are all force-dynamic,
 * so nothing needs this until a request arrives.
 */
function createAuth() {
  const environment = readAuthEnvironment();

  const pool =
    globalWithAuth.remitAuthPool ??
    new pg.Pool({
      connectionString: environment.databaseUrl,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10_000,
      max: 3,
      options: `-c search_path=${AUTH_SCHEMA},public`,
    });
  globalWithAuth.remitAuthPool = pool;

  return betterAuth({
    advanced: {
      database: {
        generateId: 'uuid',
      },
    },
    baseURL: environment.baseUrl,
    database: pool,
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: 'owner',
        membershipLimit: 100,
        organizationLimit: 5,
        requireEmailVerificationOnInvitation: true,
      }),
      nextCookies(),
    ],
    secret: environment.secret,
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    socialProviders: {
      google: {
        clientId: environment.googleClientId,
        clientSecret: environment.googleClientSecret,
      },
    },
    trustedOrigins: [environment.baseUrl],
  });
}

/** Built on first use; the pg pool is reused across invocations via globalThis. */
export function getAuth(): ReturnType<typeof createAuth> {
  cachedAuth ??= createAuth();
  return cachedAuth;
}
