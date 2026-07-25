const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyBoundedString(
  value: unknown,
  maximumLength = 512,
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value === value.trim() &&
    [...value].every((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
    })
  );
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0;
}

export function isSha256Digest(value: unknown): value is string {
  return typeof value === 'string' && SHA_256_PATTERN.test(value);
}
