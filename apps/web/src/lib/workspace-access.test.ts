import { describe, expect, it } from 'vitest';

import {
  authConfigurationState,
  canManageWorkspace,
} from './workspace-access.js';

describe('authConfigurationState', () => {
  it('allows the public demo only when auth is entirely absent', () => {
    expect(authConfigurationState({})).toBe('absent');
  });

  it('rejects partially configured auth instead of silently using the demo', () => {
    expect(
      authConfigurationState({ BETTER_AUTH_URL: 'https://remithq.xyz' }),
    ).toBe('partial');
  });

  it('recognises a complete configuration', () => {
    expect(
      authConfigurationState({
        BETTER_AUTH_SECRET: 'secret',
        BETTER_AUTH_URL: 'https://remithq.xyz',
        DATABASE_URL: 'postgresql://database',
        GOOGLE_CLIENT_ID: 'client',
        GOOGLE_CLIENT_SECRET: 'secret',
      }),
    ).toBe('configured');
  });
});

describe('canManageWorkspace', () => {
  it.each(['owner', 'admin', 'member,admin'])(
    'allows the Better Auth %s role to manage the roster',
    (role) => {
      expect(canManageWorkspace(role)).toBe(true);
    },
  );

  it.each(['member', 'FINANCE_APPROVER', '', 'member,viewer'])(
    'does not turn the %s role into workspace administration',
    (role) => {
      expect(canManageWorkspace(role)).toBe(false);
    },
  );
});
