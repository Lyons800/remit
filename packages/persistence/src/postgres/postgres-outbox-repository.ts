import { randomUUID } from 'node:crypto';

import { isPaymentDomainEventId } from '@invoiceguard/domain';
import type postgres from 'postgres';

import { mapPostgresError, PersistenceError } from '../errors.js';
import type {
  ClaimedOutboxEvent,
  OutboxRepository,
} from '../outbox-repository.js';

type ClaimedRow = Readonly<{
  action_digest: string;
  delivery_attempts: number;
  effect_type: string;
  event_id: string;
  lease_expires_at: Date;
  organization_id: string;
  payload: unknown;
}>;

async function normalizePostgres<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return mapPostgresError(error);
  }
}

function requireBoundedText(value: string, field: string): void {
  if (value.length === 0 || value.length > 256) {
    throw new PersistenceError(
      'OUTBOX_EVENT_CONFLICT',
      `${field} must contain 1 to 256 characters`,
    );
  }
}

function requireEventId(value: string): void {
  if (!isPaymentDomainEventId(value)) {
    throw new PersistenceError(
      'OUTBOX_EVENT_CONFLICT',
      'eventId must be a bounded InvoiceGuard payment event identity',
    );
  }
}

function requireSeconds(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 86_400) {
    throw new PersistenceError(
      'OUTBOX_EVENT_CONFLICT',
      `${field} must be an integer from 0 to 86400`,
    );
  }
}

function claimedEvent(row: ClaimedRow, leaseToken: string): ClaimedOutboxEvent {
  return Object.freeze({
    actionDigest: row.action_digest,
    deliveryAttempt: row.delivery_attempts,
    effectType: row.effect_type,
    eventId: row.event_id,
    leaseExpiresAt: row.lease_expires_at.toISOString(),
    leaseToken,
    organizationId: row.organization_id,
    payload: row.payload,
  });
}

export function createPostgresOutboxRepository(
  sql: postgres.Sql,
): OutboxRepository {
  return Object.freeze({
    async acknowledge(
      organizationId: string,
      eventId: string,
      leaseToken: string,
    ): Promise<void> {
      return normalizePostgres(async () => {
        requireEventId(eventId);
        requireBoundedText(leaseToken, 'leaseToken');
        const rows = await sql<readonly Readonly<{ event_id: string }>[]>`
          UPDATE outbox_events
          SET
            delivery_status = 'DELIVERED',
            lease_token = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            delivered_at = transaction_timestamp(),
            updated_at = transaction_timestamp()
          WHERE organization_id = ${organizationId}
            AND event_id = ${eventId}
            AND delivery_status = 'LEASED'
            AND lease_token = ${leaseToken}
          RETURNING event_id
        `;
        if (rows.length !== 1) {
          throw new PersistenceError(
            'OUTBOX_EVENT_CONFLICT',
            'outbox acknowledgement does not hold the active lease',
          );
        }
      });
    },

    async claimNext(
      workerId: string,
      leaseDurationSeconds: number,
    ): Promise<ClaimedOutboxEvent | null> {
      return normalizePostgres(async () => {
        requireBoundedText(workerId, 'workerId');
        requireSeconds(leaseDurationSeconds, 'leaseDurationSeconds');
        if (leaseDurationSeconds === 0) {
          throw new PersistenceError(
            'OUTBOX_EVENT_CONFLICT',
            'leaseDurationSeconds must be positive',
          );
        }
        const leaseToken = randomUUID();
        const rows = await sql<readonly ClaimedRow[]>`
          WITH candidate AS (
            SELECT organization_id, event_id
            FROM outbox_events
            WHERE available_at <= transaction_timestamp()
              AND (
                delivery_status = 'PENDING'
                OR (
                  delivery_status = 'LEASED'
                  AND lease_expires_at <= transaction_timestamp()
                )
              )
            ORDER BY available_at, created_at, organization_id, event_id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE outbox_events AS event
          SET
            delivery_status = 'LEASED',
            lease_token = ${leaseToken},
            lease_owner = ${workerId},
            lease_expires_at =
              transaction_timestamp()
              + make_interval(secs => ${leaseDurationSeconds}),
            delivery_attempts = delivery_attempts + 1,
            updated_at = transaction_timestamp()
          FROM candidate
          WHERE event.organization_id = candidate.organization_id
            AND event.event_id = candidate.event_id
          RETURNING
            event.organization_id,
            event.event_id,
            event.action_digest,
            event.effect_type,
            event.payload,
            event.delivery_attempts,
            event.lease_expires_at
        `;
        const row = rows[0];
        return row === undefined ? null : claimedEvent(row, leaseToken);
      });
    },

    async release(
      organizationId: string,
      eventId: string,
      leaseToken: string,
      retryDelaySeconds: number,
    ): Promise<void> {
      return normalizePostgres(async () => {
        requireEventId(eventId);
        requireBoundedText(leaseToken, 'leaseToken');
        requireSeconds(retryDelaySeconds, 'retryDelaySeconds');
        const rows = await sql<readonly Readonly<{ event_id: string }>[]>`
          UPDATE outbox_events
          SET
            delivery_status = 'PENDING',
            available_at =
              transaction_timestamp()
              + make_interval(secs => ${retryDelaySeconds}),
            lease_token = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = transaction_timestamp()
          WHERE organization_id = ${organizationId}
            AND event_id = ${eventId}
            AND delivery_status = 'LEASED'
            AND lease_token = ${leaseToken}
          RETURNING event_id
        `;
        if (rows.length !== 1) {
          throw new PersistenceError(
            'OUTBOX_EVENT_CONFLICT',
            'outbox release does not hold the active lease',
          );
        }
      });
    },
  });
}
