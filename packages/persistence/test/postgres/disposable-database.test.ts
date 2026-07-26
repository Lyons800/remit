import { describe, expect, it } from 'vitest';

import {
  DISPOSABLE_DATABASE_CONFIRMATION,
  assertDisposableDatabaseUrl,
  assertDisposableSchemaName,
  assertLiveDisposableDatabase,
} from './disposable-database.js';

const localUrl = 'postgresql://remit_test:test@127.0.0.1:55432/remit_test';

describe('disposable PostgreSQL test guards', () => {
  it('requires an explicit confirmation and exact loopback database identity', () => {
    expect(() => assertDisposableDatabaseUrl(localUrl, undefined)).toThrow(
      'confirmation',
    );
    expect(() =>
      assertDisposableDatabaseUrl(
        localUrl.replace('127.0.0.1', 'database.internal'),
        DISPOSABLE_DATABASE_CONFIRMATION,
      ),
    ).toThrow('loopback');
    expect(() =>
      assertDisposableDatabaseUrl(
        localUrl.replace('/remit_test', '/remit'),
        DISPOSABLE_DATABASE_CONFIRMATION,
      ),
    ).toThrow('loopback');
    expect(
      assertDisposableDatabaseUrl(localUrl, DISPOSABLE_DATABASE_CONFIRMATION)
        .hostname,
    ).toBe('127.0.0.1');
  });

  it('checks the live server identity independently of the URL', () => {
    expect(() =>
      assertLiveDisposableDatabase({
        database_name: 'remit_test',
        server_address: '203.0.113.8',
        user_name: 'remit_test',
      }),
    ).toThrow('connected PostgreSQL identity');
    expect(() =>
      assertLiveDisposableDatabase({
        database_name: 'remit_test',
        server_address: '127.0.0.1',
        user_name: 'remit_test',
      }),
    ).not.toThrow();
  });

  it('permits destructive cleanup only for randomized test schemas', () => {
    expect(() => assertDisposableSchemaName('public')).toThrow(
      'non-test schema',
    );
    expect(() =>
      assertDisposableSchemaName(
        'remit_test_123_0123456789abcdef0123456789abcdef',
      ),
    ).not.toThrow();
  });
});
