import { describe, expect, it } from 'vitest';

import { mapPostgresError, PersistenceError } from '../src/errors.js';

function mapped(error: unknown): PersistenceError {
  try {
    mapPostgresError(error);
  } catch (mappedError) {
    if (mappedError instanceof PersistenceError) {
      return mappedError;
    }
    throw mappedError;
  }
}

describe('PostgreSQL error normalization', () => {
  it.each(['23502', '23503', '23514', '23P01'])(
    'maps integrity code %s to a stable constraint error',
    (code) => {
      expect(
        mapped({
          code,
          constraint_name: 'settlement_receipt_attempt_binding',
          table_name: 'settlement_receipts',
        }),
      ).toMatchObject({
        code: 'DATABASE_CONSTRAINT_VIOLATION',
        constraint: 'settlement_receipt_attempt_binding',
      });
    },
  );

  it.each(['22001', '22003', '22023', '22P02'])(
    'maps value code %s to a stable invalid-value error',
    (code) => {
      expect(mapped({ code })).toMatchObject({
        code: 'DATABASE_VALUE_INVALID',
      });
    },
  );

  it('normalizes database failures from the outbox boundary separately', () => {
    expect(
      mapped({
        code: '23514',
        constraint_name: 'outbox_payload_binding',
        table_name: 'outbox_events',
      }),
    ).toMatchObject({
      code: 'OUTBOX_EVENT_CONFLICT',
      constraint: 'outbox_payload_binding',
    });
  });

  it('preserves an already normalized persistence error', () => {
    const original = new PersistenceError(
      'MANDATE_LEDGER_CONFLICT',
      'already normalized',
    );
    expect(mapped(original)).toBe(original);
  });
});
