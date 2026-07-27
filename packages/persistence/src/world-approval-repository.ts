import type postgres from 'postgres';

import { mapPostgresError } from './errors.js';

/**
 * Durable World approval sessions.
 *
 * Serverless instances share nothing, so the session that a phone proof
 * verifies against — and the one-consumption guarantee when a settlement
 * executes — live here. Every transition is an atomic conditional UPDATE:
 * a lost race refuses, it never double-executes.
 *
 * The stored request is the exact minted `WorldProofOfHumanRequest` as JSON.
 * It contains no secret material — the RP signing key never leaves the
 * process that minted the request.
 */

export const APPROVAL_SESSION_STATUSES = [
  'executed',
  'failed',
  'pending',
  'verified',
  'verifying',
] as const;

export type ApprovalSessionStatus = (typeof APPROVAL_SESSION_STATUSES)[number];

export interface WorldApprovalSession {
  readonly approvalSessionId: string;
  readonly organizationId: string;
  readonly actionDigest: string;
  readonly request: unknown;
  readonly status: ApprovalSessionStatus;
  readonly expiresAt: Date;
}

interface SessionRow {
  readonly approval_session_id: string;
  readonly organization_id: string;
  readonly action_digest: string;
  readonly request: unknown;
  readonly status: string;
  readonly expires_at: Date;
}

function toSession(row: SessionRow): WorldApprovalSession {
  return {
    approvalSessionId: row.approval_session_id,
    organizationId: row.organization_id,
    actionDigest: row.action_digest,
    request: row.request,
    status: row.status as ApprovalSessionStatus,
    expiresAt: row.expires_at,
  };
}

export async function insertApprovalSession(
  sql: postgres.Sql,
  input: {
    readonly approvalSessionId: string;
    readonly organizationId: string;
    readonly actionDigest: string;
    readonly request: unknown;
    readonly expiresAt: Date;
  },
): Promise<void> {
  try {
    await sql`
      INSERT INTO world_approval_sessions
        (approval_session_id, organization_id, action_digest, request, expires_at)
      VALUES
        (${input.approvalSessionId}, ${input.organizationId},
         ${input.actionDigest}, ${sql.json(input.request as never)},
         ${input.expiresAt})
    `;
  } catch (error) {
    throw mapPostgresError(error);
  }
}

export async function getApprovalSession(
  sql: postgres.Sql,
  approvalSessionId: string,
): Promise<WorldApprovalSession | undefined> {
  const rows = await sql<readonly SessionRow[]>`
    SELECT approval_session_id, organization_id, action_digest, request,
           status, expires_at
    FROM world_approval_sessions
    WHERE approval_session_id = ${approvalSessionId}
  `;
  const row = rows[0];
  return row === undefined ? undefined : toSession(row);
}

/**
 * Atomically move a session from one of `from` to `to`.
 *
 * Returns false when the session is absent or its status changed underneath —
 * which is exactly the race the caller must treat as a refusal.
 */
export async function transitionApprovalSession(
  sql: postgres.Sql,
  input: {
    readonly approvalSessionId: string;
    readonly from: readonly ApprovalSessionStatus[];
    readonly to: ApprovalSessionStatus;
  },
): Promise<boolean> {
  const rows = await sql<readonly Readonly<{ approval_session_id: string }>[]>`
    UPDATE world_approval_sessions
    SET status = ${input.to}, updated_at = transaction_timestamp()
    WHERE approval_session_id = ${input.approvalSessionId}
      AND status = ANY(${sql.array([...input.from])})
    RETURNING approval_session_id
  `;
  return rows.length === 1;
}

export async function countOpenApprovalSessions(
  sql: postgres.Sql,
  organizationId: string,
  now: Date,
): Promise<number> {
  const rows = await sql<readonly Readonly<{ open: string }>[]>`
    SELECT count(*)::text AS open
    FROM world_approval_sessions
    WHERE organization_id = ${organizationId}
      AND status = 'pending'
      AND expires_at > ${now}
  `;
  return Number(rows[0]?.open ?? '0');
}

/**
 * Claim one exact action for one human. False means already claimed — this
 * human has approved this exact action before, and a second approval must be
 * refused as a replay.
 */
export async function claimActionHuman(
  sql: postgres.Sql,
  input: {
    readonly actionHumanPrincipal: string;
    readonly expiresAt: Date;
  },
): Promise<boolean> {
  const rows = await sql<
    readonly Readonly<{ action_human_principal: string }>[]
  >`
    INSERT INTO world_used_action_humans (action_human_principal, expires_at)
    VALUES (${input.actionHumanPrincipal}, ${input.expiresAt})
    ON CONFLICT (action_human_principal) DO NOTHING
    RETURNING action_human_principal
  `;
  return rows.length === 1;
}

export async function purgeExpiredApprovalState(
  sql: postgres.Sql,
  now: Date,
): Promise<void> {
  await sql`
    DELETE FROM world_approval_sessions WHERE expires_at <= ${now}
  `;
  await sql`
    DELETE FROM world_used_action_humans WHERE expires_at <= ${now}
  `;
}
