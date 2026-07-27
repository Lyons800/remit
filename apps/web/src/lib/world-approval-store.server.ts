import 'server-only';

import type postgres from 'postgres';

import {
  claimActionHuman,
  countOpenApprovalSessions,
  getApprovalSession,
  insertApprovalSession,
  purgeExpiredApprovalState,
  transitionApprovalSession,
  type ApprovalSessionStatus,
  type WorldApprovalSession,
} from '@remit/persistence';

/**
 * Storage boundary for World approval sessions.
 *
 * The approval state machine (mint → verify → consume) is pure logic over
 * this interface; Postgres provides the durable implementation and tests use
 * the in-memory one. Both give the same guarantee where it matters: a status
 * transition succeeds for exactly one caller.
 */
export interface WorldApprovalSessionStore {
  insert(session: WorldApprovalSession): Promise<void>;
  get(approvalSessionId: string): Promise<WorldApprovalSession | undefined>;
  transition(
    approvalSessionId: string,
    from: readonly ApprovalSessionStatus[],
    to: ApprovalSessionStatus,
  ): Promise<boolean>;
  countOpen(organizationId: string, now: Date): Promise<number>;
  claimActionHuman(principal: string, expiresAt: Date): Promise<boolean>;
  purgeExpired(now: Date): Promise<void>;
}

export function postgresWorldApprovalStore(
  sql: postgres.Sql,
): WorldApprovalSessionStore {
  return {
    claimActionHuman: (principal, expiresAt) =>
      claimActionHuman(sql, { actionHumanPrincipal: principal, expiresAt }),
    countOpen: (organizationId, now) =>
      countOpenApprovalSessions(sql, organizationId, now),
    get: (approvalSessionId) => getApprovalSession(sql, approvalSessionId),
    insert: (session) =>
      insertApprovalSession(sql, {
        actionDigest: session.actionDigest,
        approvalSessionId: session.approvalSessionId,
        expiresAt: session.expiresAt,
        organizationId: session.organizationId,
        request: session.request,
      }),
    purgeExpired: (now) => purgeExpiredApprovalState(sql, now),
    transition: (approvalSessionId, from, to) =>
      transitionApprovalSession(sql, { approvalSessionId, from, to }),
  };
}

/** Same contract, no database. For unit tests of the state machine. */
export function inMemoryWorldApprovalStore(): WorldApprovalSessionStore {
  const sessions = new Map<
    string,
    { session: WorldApprovalSession; status: ApprovalSessionStatus }
  >();
  const usedActionHumans = new Map<string, Date>();

  return {
    claimActionHuman: async (principal, expiresAt) => {
      if (usedActionHumans.has(principal)) return false;
      usedActionHumans.set(principal, expiresAt);
      return true;
    },
    countOpen: async (organizationId, now) => {
      let open = 0;
      for (const { session, status } of sessions.values()) {
        if (
          session.organizationId === organizationId &&
          status === 'pending' &&
          session.expiresAt > now
        ) {
          open += 1;
        }
      }
      return open;
    },
    get: async (approvalSessionId) => {
      const entry = sessions.get(approvalSessionId);
      return entry === undefined
        ? undefined
        : { ...entry.session, status: entry.status };
    },
    insert: async (session) => {
      sessions.set(session.approvalSessionId, {
        session,
        status: session.status,
      });
    },
    purgeExpired: async (now) => {
      for (const [id, entry] of sessions) {
        if (entry.session.expiresAt <= now) sessions.delete(id);
      }
      for (const [principal, expiresAt] of usedActionHumans) {
        if (expiresAt <= now) usedActionHumans.delete(principal);
      }
    },
    transition: async (approvalSessionId, from, to) => {
      const entry = sessions.get(approvalSessionId);
      if (entry === undefined || !from.includes(entry.status)) return false;
      entry.status = to;
      return true;
    },
  };
}
