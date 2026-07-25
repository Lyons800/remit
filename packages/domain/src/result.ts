import type { DomainRefusal, DomainRefusalCode } from './errors.js';

export type DomainResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ error: DomainRefusal; ok: false }>;

export function accept<T>(value: T): DomainResult<T> {
  return Object.freeze({ ok: true, value });
}

export function refuse<T>(
  code: DomainRefusalCode,
  detail?: string,
): DomainResult<T> {
  return Object.freeze({
    error: Object.freeze(detail === undefined ? { code } : { code, detail }),
    ok: false,
  });
}
