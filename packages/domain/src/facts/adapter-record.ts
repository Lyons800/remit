import { createHash } from 'node:crypto';

import { canonicalizeJson } from '@invoiceguard/protocol/hashing';

import { isRecord, isSha256Digest } from '../values/validation.js';

export function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

export function hashAdapterRecord(
  recordKind: string,
  core: Readonly<Record<string, unknown>>,
): string {
  const hash = createHash('sha256');
  hash.update(`invoiceguard:adapter-record:v1:${recordKind}`, 'ascii');
  hash.update(Uint8Array.of(0));
  hash.update(canonicalizeJson(core), 'utf8');
  return hash.digest('hex');
}

export function hasValidAdapterRecordDigest(
  input: unknown,
  recordKind: string,
): boolean {
  if (!isRecord(input) || !isSha256Digest(input.recordDigest)) {
    return false;
  }
  const { recordDigest, ...core } = input;
  return recordDigest === hashAdapterRecord(recordKind, core);
}

export function createAdapterRecord<
  TCore extends Readonly<Record<string, unknown>>,
>(recordKind: string, core: TCore): Readonly<TCore & { recordDigest: string }> {
  return Object.freeze({
    ...core,
    recordDigest: hashAdapterRecord(recordKind, core),
  });
}
