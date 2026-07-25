const MAX_UINT_256 = (1n << 256n) - 1n;
const CANONICAL_ATOMS = /^(?:0|[1-9]\d{0,77})$/u;

export function parseCanonicalAtoms(value: unknown): bigint | null {
  if (typeof value !== 'string' || !CANONICAL_ATOMS.test(value)) {
    return null;
  }

  const atoms = BigInt(value);
  return atoms <= MAX_UINT_256 ? atoms : null;
}

export function parsePositiveAtoms(value: unknown): bigint | null {
  const atoms = parseCanonicalAtoms(value);
  return atoms === null || atoms === 0n ? null : atoms;
}
