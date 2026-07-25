import { createHmac } from 'node:crypto';

const ACTION_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const HEX_IDENTIFIER_PATTERN = /^0x[0-9a-fA-F]+$/u;
const MINIMUM_HMAC_KEY_BYTES = 32;
const DERIVATION_VERSION_PATTERN = /^v[1-9][0-9]{0,8}$/u;

export type ScopedWorldPrincipal = `hmac-sha256:${string}`;
export type ScopedWorldDisplayTag = `world-${string}`;
export type WorldPrincipalDerivationVersion = `v${number}`;
export type VersionedScopedWorldPrincipal = Readonly<{
  derivationVersion: WorldPrincipalDerivationVersion;
  principal: ScopedWorldPrincipal;
}>;
export type WorldPrincipalDerivationKey = Readonly<{
  key: Uint8Array;
  version: WorldPrincipalDerivationVersion;
}>;
export type WorldPrincipalKeyring = Readonly<{
  current: WorldPrincipalDerivationKey;
  previous: readonly WorldPrincipalDerivationKey[];
}>;

function requireHmacKey(key: Uint8Array): Uint8Array {
  if (key.byteLength < MINIMUM_HMAC_KEY_BYTES) {
    throw new Error('World principal HMAC key must contain at least 32 bytes.');
  }

  return key;
}

function requireDerivationVersion(
  value: string,
): WorldPrincipalDerivationVersion {
  if (!DERIVATION_VERSION_PATTERN.test(value)) {
    throw new Error('World principal derivation version must use v<number>.');
  }

  return value as WorldPrincipalDerivationVersion;
}

function copyDerivationKey(
  input: WorldPrincipalDerivationKey,
): WorldPrincipalDerivationKey {
  return Object.freeze({
    key: Uint8Array.from(requireHmacKey(input.key)),
    version: requireDerivationVersion(input.version),
  });
}

export function createWorldPrincipalKeyring(
  current: WorldPrincipalDerivationKey,
  previous: readonly WorldPrincipalDerivationKey[] = [],
): WorldPrincipalKeyring {
  const keys = [current, ...previous].map(copyDerivationKey);
  const versions = new Set(keys.map(({ version }) => version));
  const keyMaterials = new Set(
    keys.map(({ key }) => Buffer.from(key).toString('base64url')),
  );

  if (versions.size !== keys.length) {
    throw new Error('World principal key versions must be unique.');
  }

  if (keyMaterials.size !== keys.length) {
    throw new Error(
      'World principal HMAC key material must be unique across versions.',
    );
  }

  const [currentKey, ...previousKeys] = keys;

  if (currentKey === undefined) {
    throw new Error('A current World principal key is required.');
  }

  return Object.freeze({
    current: currentKey,
    previous: Object.freeze(previousKeys),
  });
}

function requireNonempty(value: string, name: string): string {
  if (value.length === 0) {
    throw new Error(`${name} must not be empty.`);
  }

  return value;
}

function requireActionDigest(value: string): string {
  if (!ACTION_DIGEST_PATTERN.test(value)) {
    throw new Error('actionDigest must be a lowercase SHA-256 hex digest.');
  }

  return value;
}

function normalizeHexIdentifier(value: string, name: string): string {
  if (!HEX_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed hexadecimal identifier.`);
  }

  const integer = BigInt(value);

  if (integer === 0n) {
    throw new Error(`${name} must not be zero.`);
  }

  const normalized = integer.toString(16);

  if (normalized.length > 64) {
    throw new Error(`${name} must fit in 32 bytes.`);
  }

  return `0x${normalized.padStart(64, '0')}`;
}

function scopedHmac(
  key: Uint8Array,
  domain: string,
  fields: readonly string[],
): string {
  const hmac = createHmac('sha256', requireHmacKey(key));

  for (const field of [domain, ...fields]) {
    hmac.update(String(Buffer.byteLength(field, 'utf8')));
    hmac.update(':');
    hmac.update(field, 'utf8');
  }

  return hmac.digest('base64url');
}

function requireUniqueDerivedAliases(
  aliases: readonly VersionedScopedWorldPrincipal[],
): readonly VersionedScopedWorldPrincipal[] {
  const principals = new Set(aliases.map(({ principal }) => principal));

  if (principals.size !== aliases.length) {
    throw new Error(
      'Derived World principal aliases must be unique across key versions.',
    );
  }

  return Object.freeze(aliases);
}

type AgentTenantPrincipalInput = Readonly<{
  humanId: string;
  key: Uint8Array;
  organizationId: string;
}>;

type AgentTenantPrincipalAliasesInput = Readonly<{
  humanId: string;
  keyring: WorldPrincipalKeyring;
  organizationId: string;
}>;

export function deriveAgentTenantPrincipal({
  humanId,
  key,
  organizationId,
}: AgentTenantPrincipalInput): ScopedWorldPrincipal {
  const digest = scopedHmac(key, 'invoiceguard:agent-human:v1', [
    requireNonempty(organizationId, 'organizationId'),
    normalizeHexIdentifier(humanId, 'humanId'),
  ]);

  return `hmac-sha256:${digest}`;
}

export function deriveAgentTenantPrincipalAliases({
  humanId,
  keyring,
  organizationId,
}: AgentTenantPrincipalAliasesInput): readonly VersionedScopedWorldPrincipal[] {
  const validatedKeyring = createWorldPrincipalKeyring(
    keyring.current,
    keyring.previous,
  );

  return requireUniqueDerivedAliases(
    [validatedKeyring.current, ...validatedKeyring.previous].map(
      ({ key, version }) =>
        Object.freeze({
          derivationVersion: version,
          principal: deriveAgentTenantPrincipal({
            humanId,
            key,
            organizationId,
          }),
        }),
    ),
  );
}

type ActionHumanPrincipalInput = Readonly<{
  actionDigest: string;
  key: Uint8Array;
  nullifier: string;
  organizationId: string;
  worldActionId: string;
}>;

type ActionHumanPrincipalAliasesInput = Omit<ActionHumanPrincipalInput, 'key'> &
  Readonly<{ keyring: WorldPrincipalKeyring }>;

export function deriveActionHumanPrincipal({
  actionDigest,
  key,
  nullifier,
  organizationId,
  worldActionId,
}: ActionHumanPrincipalInput): ScopedWorldPrincipal {
  const digest = scopedHmac(key, 'invoiceguard:action-human:v1', [
    requireNonempty(organizationId, 'organizationId'),
    requireActionDigest(actionDigest),
    requireNonempty(worldActionId, 'worldActionId'),
    normalizeHexIdentifier(nullifier, 'nullifier'),
  ]);

  return `hmac-sha256:${digest}`;
}

export function deriveActionHumanPrincipalAliases({
  actionDigest,
  keyring,
  nullifier,
  organizationId,
  worldActionId,
}: ActionHumanPrincipalAliasesInput): readonly VersionedScopedWorldPrincipal[] {
  const validatedKeyring = createWorldPrincipalKeyring(
    keyring.current,
    keyring.previous,
  );

  return requireUniqueDerivedAliases(
    [validatedKeyring.current, ...validatedKeyring.previous].map(
      ({ key, version }) =>
        Object.freeze({
          derivationVersion: version,
          principal: deriveActionHumanPrincipal({
            actionDigest,
            key,
            nullifier,
            organizationId,
            worldActionId,
          }),
        }),
    ),
  );
}

export function deriveActionHumanDisplayTag(
  input: ActionHumanPrincipalInput,
): ScopedWorldDisplayTag {
  const digest = scopedHmac(input.key, 'invoiceguard:action-display:v1', [
    requireNonempty(input.organizationId, 'organizationId'),
    requireActionDigest(input.actionDigest),
    requireNonempty(input.worldActionId, 'worldActionId'),
    normalizeHexIdentifier(input.nullifier, 'nullifier'),
  ]);

  return `world-${digest.slice(0, 12)}`;
}
