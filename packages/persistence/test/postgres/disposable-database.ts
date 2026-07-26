export const DISPOSABLE_DATABASE_CONFIRMATION =
  'invoiceguard-persistence-disposable-v1';

export type LiveDatabaseIdentity = Readonly<{
  database_name: string;
  server_address: string;
  user_name: string;
}>;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const TEST_DATABASE = 'invoiceguard_test';
const TEST_USER = 'invoiceguard_test';
const TEST_SCHEMA_PATTERN = /^invoiceguard_test_[0-9]+_[0-9a-f]{32}$/u;

function isLocalContainerAddress(value: string): boolean {
  const [address] = value.split('/');
  const octets = (address ?? '').split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function assertDisposableDatabaseUrl(
  databaseUrl: string | undefined,
  confirmation: string | undefined,
): URL {
  if (confirmation !== DISPOSABLE_DATABASE_CONFIRMATION) {
    throw new Error('disposable PostgreSQL confirmation is required');
  }
  if (databaseUrl === undefined) {
    throw new Error('PERSISTENCE_TEST_DATABASE_URL is required');
  }
  const parsed = new URL(databaseUrl);
  if (
    (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
    !LOOPBACK_HOSTS.has(parsed.hostname) ||
    decodeURIComponent(parsed.username) !== TEST_USER ||
    decodeURIComponent(parsed.pathname.slice(1)) !== TEST_DATABASE
  ) {
    throw new Error(
      'persistence tests require the loopback invoiceguard_test database and user',
    );
  }
  return parsed;
}

export function assertLiveDisposableDatabase(
  identity: LiveDatabaseIdentity,
): void {
  const [serverAddress] = identity.server_address.split('/');
  if (
    identity.database_name !== TEST_DATABASE ||
    identity.user_name !== TEST_USER ||
    (!LOOPBACK_HOSTS.has(serverAddress ?? '') &&
      !isLocalContainerAddress(identity.server_address))
  ) {
    throw new Error(
      'connected PostgreSQL identity is not the disposable loopback test database',
    );
  }
}

export function assertDisposableSchemaName(schemaName: string): void {
  if (!TEST_SCHEMA_PATTERN.test(schemaName)) {
    throw new Error('refusing destructive access to a non-test schema');
  }
}
