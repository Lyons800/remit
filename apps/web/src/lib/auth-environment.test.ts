import { describe, expect, it } from 'vitest';

import { readAuthEnvironment } from './auth-environment.js';

const validEnvironment = {
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://invoiceguard:secret@localhost/invoiceguard',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
} satisfies Readonly<Record<string, string>>;

describe('readAuthEnvironment', () => {
  it('returns only the validated identity configuration', () => {
    expect(readAuthEnvironment(validEnvironment)).toEqual({
      baseUrl: 'http://localhost:3000',
      databaseUrl: 'postgresql://invoiceguard:secret@localhost/invoiceguard',
      googleClientId: 'google-client-id',
      googleClientSecret: 'google-client-secret',
      secret: 'a'.repeat(32),
    });
  });

  it('fails closed when the session secret is too short', () => {
    expect(() =>
      readAuthEnvironment({
        ...validEnvironment,
        BETTER_AUTH_SECRET: 'too-short',
      }),
    ).toThrow('BETTER_AUTH_SECRET must be at least 32 characters');
  });

  it('rejects a non-Postgres database URL', () => {
    expect(() =>
      readAuthEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'https://database.example.com',
      }),
    ).toThrow('DATABASE_URL uses an unsupported protocol');
  });
});
