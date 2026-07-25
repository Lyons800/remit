import { describe, expect, it } from 'vitest';

import {
  canonicalAtomsSchema,
  canonicalIbanSchema,
  isSortedUnique,
  utcInstantSchema,
  uuidV7Schema,
} from '../src/index.js';

describe('protocol primitives', () => {
  it.each(['0', '1', '2500000'])('accepts canonical atoms: %s', (atoms) => {
    expect(canonicalAtomsSchema.safeParse(atoms).success).toBe(true);
  });

  it.each(['', '-1', '01', '1.0', '1e3', ' 1', '1 '])(
    'rejects ambiguous atoms: %s',
    (atoms) => {
      expect(canonicalAtomsSchema.safeParse(atoms).success).toBe(false);
    },
  );

  it('bounds atoms to an unsigned 256-bit value', () => {
    expect(
      canonicalAtomsSchema.safeParse((1n << 256n).toString()).success,
    ).toBe(false);
  });

  it('requires canonical UTC millisecond instants', () => {
    expect(utcInstantSchema.safeParse('2026-07-25T10:00:00.000Z').success).toBe(
      true,
    );
    expect(utcInstantSchema.safeParse('2026-07-25T10:00:00Z').success).toBe(
      false,
    );
    expect(utcInstantSchema.safeParse('2026-02-30T10:00:00.000Z').success).toBe(
      false,
    );
  });

  it('accepts UUIDv7 only', () => {
    expect(
      uuidV7Schema.safeParse('019f939b-fe5e-7e92-b72e-8d4531958c1b').success,
    ).toBe(true);
    expect(
      uuidV7Schema.safeParse('550e8400-e29b-41d4-a716-446655440000').success,
    ).toBe(false);
  });

  it('validates a normalized IBAN checksum', () => {
    expect(
      canonicalIbanSchema.safeParse('GB82WEST12345698765432').success,
    ).toBe(true);
    expect(
      canonicalIbanSchema.safeParse('GB82 WEST 1234 5698 7654 32').success,
    ).toBe(false);
  });

  it('recognizes strict sorted uniqueness', () => {
    expect(isSortedUnique(['A', 'B', 'C'])).toBe(true);
    expect(isSortedUnique(['A', 'A'])).toBe(false);
    expect(isSortedUnique(['B', 'A'])).toBe(false);
  });
});
