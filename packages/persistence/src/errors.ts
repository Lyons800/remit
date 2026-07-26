export type PersistenceErrorCode =
  | 'DATABASE_CONSTRAINT_VIOLATION'
  | 'DATABASE_VALUE_INVALID'
  | 'INVALID_PERSISTED_AGGREGATE'
  | 'INVALID_TRANSITION'
  | 'MANDATE_LEDGER_CONFLICT'
  | 'OUTBOX_EVENT_CONFLICT'
  | 'SERIALIZATION_RETRY'
  | 'STALE_AGGREGATE_VERSION'
  | 'UNAUTHORIZED_WRITER'
  | 'UNIQUE_IDENTITY_CONFLICT';

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly constraint: string | null;

  constructor(
    code: PersistenceErrorCode,
    message: string,
    constraint: string | null = null,
  ) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
    this.constraint = constraint;
  }
}

export function mapPostgresError(error: unknown): never {
  if (error instanceof PersistenceError) {
    throw error;
  }
  const postgresCode =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : null;
  const constraint =
    typeof error === 'object' &&
    error !== null &&
    'constraint_name' in error &&
    typeof error.constraint_name === 'string'
      ? error.constraint_name
      : null;
  const table =
    typeof error === 'object' &&
    error !== null &&
    'table_name' in error &&
    typeof error.table_name === 'string'
      ? error.table_name
      : null;
  const isOutbox =
    table === 'outbox_events' || constraint?.startsWith('outbox_') === true;

  if (postgresCode === '40001') {
    throw new PersistenceError(
      'SERIALIZATION_RETRY',
      'serializable transaction must be recomputed from current state',
    );
  }
  if (postgresCode === '23505') {
    throw new PersistenceError(
      isOutbox ? 'OUTBOX_EVENT_CONFLICT' : 'UNIQUE_IDENTITY_CONFLICT',
      constraint === null
        ? 'a persistence uniqueness identity is already reserved'
        : `persistence uniqueness identity already reserved: ${constraint}`,
      constraint,
    );
  }
  if (
    postgresCode === '23502' ||
    postgresCode === '23503' ||
    postgresCode === '23514' ||
    postgresCode === '23P01'
  ) {
    throw new PersistenceError(
      isOutbox ? 'OUTBOX_EVENT_CONFLICT' : 'DATABASE_CONSTRAINT_VIOLATION',
      constraint === null
        ? 'database constraint rejected the persistence write'
        : `database constraint rejected the persistence write: ${constraint}`,
      constraint,
    );
  }
  if (
    postgresCode === '22001' ||
    postgresCode === '22003' ||
    postgresCode === '22023' ||
    postgresCode === '22P02'
  ) {
    throw new PersistenceError(
      isOutbox ? 'OUTBOX_EVENT_CONFLICT' : 'DATABASE_VALUE_INVALID',
      'database rejected an invalid persistence value',
      constraint,
    );
  }
  throw error;
}
