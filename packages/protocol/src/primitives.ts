import { z } from 'zod';

const MAX_UINT_256 = (1n << 256n) - 1n;
const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const CANONICAL_ATOMS_PATTERN = /^(?:0|[1-9]\d{0,77})$/u;
const POSITIVE_ATOMS_PATTERN = /^[1-9]\d{0,77}$/u;
const CAIP_2_PATTERN = /^[a-z0-9-]{3,8}:[A-Za-z0-9_-]{1,32}$/u;
const CAIP_10_PATTERN =
  /^[a-z0-9-]{3,8}:[A-Za-z0-9_-]{1,32}:[A-Za-z0-9.%_-]{1,128}$/u;
const CAIP_19_PATTERN =
  /^[a-z0-9-]{3,8}:[A-Za-z0-9_-]{1,32}\/[a-z0-9-]{3,16}:[A-Za-z0-9.%_-]{1,128}$/u;
const NAMESPACED_ASSET_PATTERN = /^[a-z0-9-]{3,16}:[A-Za-z0-9._%-]{1,128}$/u;

function isCanonicalUtcInstant(value: string): boolean {
  if (!UTC_INSTANT_PATTERN.test(value)) {
    return false;
  }

  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function isCanonicalIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const instant = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(instant.valueOf()) &&
    instant.toISOString().slice(0, 10) === value
  );
}

function isUint256(value: string): boolean {
  return CANONICAL_ATOMS_PATTERN.test(value) && BigInt(value) <= MAX_UINT_256;
}

function isValidIban(value: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/u.test(value)) {
    return false;
  }

  const rearranged = `${value.slice(4)}${value.slice(0, 4)}`;
  let remainder = 0;

  for (const character of rearranged) {
    const numeric =
      character >= 'A'
        ? String(character.charCodeAt(0) - 'A'.charCodeAt(0) + 10)
        : character;

    for (const digit of numeric) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder === 1;
}

export function isSortedUnique(
  values: readonly string[],
): values is readonly string[] {
  return values.every((value, index) => {
    if (index === 0) {
      return true;
    }

    const previous = values[index - 1];
    return previous !== undefined && previous < value;
  });
}

export const schemaVersionV1Schema = z.literal(1);
export const uuidV7Schema = z.string().regex(UUID_V7_PATTERN);
export const sha256DigestSchema = z.string().regex(SHA_256_PATTERN);
export const canonicalAtomsSchema = z
  .string()
  .regex(CANONICAL_ATOMS_PATTERN)
  .refine(isUint256, 'must fit in an unsigned 256-bit integer');
export const positiveAtomsSchema = z
  .string()
  .regex(POSITIVE_ATOMS_PATTERN)
  .refine(isUint256, 'must fit in an unsigned 256-bit integer');
export const positiveSafeIntegerSchema = z.number().int().positive().safe();
export const nonNegativeSafeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .safe();
export const utcInstantSchema = z
  .string()
  .refine(isCanonicalUtcInstant, 'must be a canonical UTC millisecond instant');
export const isoDateSchema = z
  .string()
  .refine(isCanonicalIsoDate, 'must be a valid ISO calendar date');
export const nonce128HexSchema = z.string().regex(/^[0-9a-f]{32}$/u);
export const boundedOpaqueStringSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) =>
    [...value].every((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
    }),
  );
export const nonEmptyBoundedStringSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value === value.trim());
export const canonicalMediaTypeSchema = z
  .string()
  .regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u);
export const caip2Schema = z.string().regex(CAIP_2_PATTERN);
export const caip10Schema = z.string().regex(CAIP_10_PATTERN);
export const caip19Schema = z.string().regex(CAIP_19_PATTERN);
export const assetIdSchema = z.union([
  caip19Schema,
  z.string().regex(NAMESPACED_ASSET_PATTERN),
]);
export const canonicalIbanSchema = z
  .string()
  .refine(isValidIban, 'must be a canonical checksum-valid IBAN');

export const beneficiarySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('IBAN'),
      value: canonicalIbanSchema,
    })
    .strict(),
  z
    .object({
      accountId: caip10Schema,
      kind: z.literal('CAIP_10'),
    })
    .strict(),
]);

export function caip10Network(accountId: string): string {
  return accountId.split(':', 2).join(':');
}

export function caip19Network(assetId: string): string | null {
  const separatorIndex = assetId.indexOf('/');
  return separatorIndex === -1 ? null : assetId.slice(0, separatorIndex);
}

export type AssetId = z.infer<typeof assetIdSchema>;
export type BeneficiaryV1 = z.infer<typeof beneficiarySchema>;
export type Caip10 = z.infer<typeof caip10Schema>;
export type Caip19 = z.infer<typeof caip19Schema>;
export type Sha256Digest = z.infer<typeof sha256DigestSchema>;
export type UtcInstant = z.infer<typeof utcInstantSchema>;
export type UuidV7 = z.infer<typeof uuidV7Schema>;
