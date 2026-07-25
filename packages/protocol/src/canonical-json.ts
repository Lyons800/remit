export type CanonicalJsonPrimitive = boolean | null | number | string;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }

  return false;
}

function serializeString(value: string): string {
  if (hasLoneSurrogate(value)) {
    throw new TypeError('RFC 8785 input cannot contain a lone surrogate.');
  }

  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('Unable to serialize JSON string.');
  }
  return serialized;
}

export function canonicalizeJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return serializeString(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('RFC 8785 input must contain finite numbers.');
    }

    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError('Unable to serialize JSON number.');
    }
    return serialized;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('RFC 8785 input must be a plain JSON object.');
    }

    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries
      .map(([key, item]) => `${serializeString(key)}:${canonicalizeJson(item)}`)
      .join(',')}}`;
  }

  throw new TypeError(`Unsupported JSON value type: ${typeof value}.`);
}
