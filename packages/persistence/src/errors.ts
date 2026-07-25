export type PersistenceErrorCode =
  | 'INVALID_PERSISTED_AGGREGATE'
  | 'INVALID_TRANSITION'
  | 'MANDATE_LEDGER_CONFLICT'
  | 'OUTBOX_EVENT_CONFLICT'
  | 'SERIALIZATION_RETRY'
  | 'STALE_AGGREGATE_VERSION'
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
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '40001'
  ) {
    throw new PersistenceError(
      'SERIALIZATION_RETRY',
      'serializable transaction must be recomputed from current state',
    );
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  ) {
    const constraint =
      'constraint_name' in error && typeof error.constraint_name === 'string'
        ? error.constraint_name
        : null;
    throw new PersistenceError(
      'UNIQUE_IDENTITY_CONFLICT',
      constraint === null
        ? 'a persistence uniqueness identity is already reserved'
        : `persistence uniqueness identity already reserved: ${constraint}`,
      constraint,
    );
  }
  throw error;
}
