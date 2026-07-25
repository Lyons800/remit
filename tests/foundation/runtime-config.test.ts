import { describe, expect, it } from 'vitest';

import { parseServiceRuntime } from '../../packages/runtime-config/src/index.js';

const validOptions = {
  defaultPort: 4100,
  env: {
    INVOICEGUARD_BUILD_SHA: 'local',
    INVOICEGUARD_DEMO_MODE: 'inactive',
    CONTROL_API_PORT: '4100',
  },
  liveReady: false,
  portVariable: 'CONTROL_API_PORT',
  service: 'control-api',
} as const;

describe('parseServiceRuntime', () => {
  it('returns an immutable, explicit process identity', () => {
    const runtime = parseServiceRuntime(validOptions);

    expect(runtime).toEqual({
      adapterMode: 'inactive',
      buildSha: 'local',
      port: 4100,
      service: 'control-api',
    });
    expect(Object.isFrozen(runtime)).toBe(true);
  });

  it('allows local defaults only outside live mode', () => {
    const runtime = parseServiceRuntime({
      ...validOptions,
      env: {
        INVOICEGUARD_DEMO_MODE: 'fake',
      },
    });

    expect(runtime).toMatchObject({
      adapterMode: 'fake',
      buildSha: 'local',
      port: 4100,
    });
  });

  it.each([undefined, '', 'production', 'LIVE'])(
    'rejects an unknown adapter mode: %s',
    (mode) => {
      expect(() =>
        parseServiceRuntime({
          ...validOptions,
          env: {
            ...validOptions.env,
            INVOICEGUARD_DEMO_MODE: mode,
          },
        }),
      ).toThrow('INVOICEGUARD_DEMO_MODE');
    },
  );

  it.each(['0', '01', '65536', '4100.0', ' 4100', '4100x'])(
    'rejects a non-canonical port: %s',
    (port) => {
      expect(() =>
        parseServiceRuntime({
          ...validOptions,
          env: {
            ...validOptions.env,
            CONTROL_API_PORT: port,
          },
        }),
      ).toThrow('CONTROL_API_PORT');
    },
  );

  it('rejects live mode until the service passes its integration gate', () => {
    expect(() =>
      parseServiceRuntime({
        ...validOptions,
        env: {
          INVOICEGUARD_BUILD_SHA: 'a'.repeat(40),
          INVOICEGUARD_DEMO_MODE: 'live',
          CONTROL_API_PORT: '4100',
        },
      }),
    ).toThrow('control-api has not passed its live integration gate');
  });

  it('requires an exact commit and explicit port in live mode', () => {
    expect(() =>
      parseServiceRuntime({
        ...validOptions,
        env: {
          INVOICEGUARD_BUILD_SHA: 'local',
          INVOICEGUARD_DEMO_MODE: 'live',
          CONTROL_API_PORT: '4100',
        },
        liveReady: true,
      }),
    ).toThrow('INVOICEGUARD_BUILD_SHA');

    expect(() =>
      parseServiceRuntime({
        ...validOptions,
        env: {
          INVOICEGUARD_BUILD_SHA: 'a'.repeat(40),
          INVOICEGUARD_DEMO_MODE: 'live',
        },
        liveReady: true,
      }),
    ).toThrow('CONTROL_API_PORT');
  });

  it('accepts live mode only with a complete deployment identity', () => {
    const runtime = parseServiceRuntime({
      ...validOptions,
      env: {
        INVOICEGUARD_BUILD_SHA: 'a'.repeat(40),
        INVOICEGUARD_DEMO_MODE: 'live',
        CONTROL_API_PORT: '4100',
      },
      liveReady: true,
    });

    expect(runtime).toMatchObject({
      adapterMode: 'live',
      buildSha: 'a'.repeat(40),
      port: 4100,
    });
  });
});
