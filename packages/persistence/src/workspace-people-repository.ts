import type postgres from 'postgres';

import { mapPostgresError } from './errors.js';

/**
 * The workspace roster: who is in this organisation and what it lets them do.
 *
 * What is stored here is only ever the organisation's own claim — a name, an
 * agent wallet, and a granted role. Which human backs that wallet is read from
 * World AgentBook at decision time and never written down, because a stored
 * agent-to-human mapping would let anyone who reached this database
 * manufacture a quorum.
 */

export const APPROVER_ROLES = [
  'FINANCE_APPROVER',
  'TREASURY_APPROVER',
] as const;

export type ApproverRole = (typeof APPROVER_ROLES)[number];

/** `null` means present in the workspace but carrying no approval authority. */
export type PersonRole = ApproverRole | null;

export interface WorkspacePerson {
  readonly personId: string;
  readonly displayName: string;
  readonly agentAddress: string;
  readonly role: PersonRole;
}

interface PersonRow {
  readonly person_id: string;
  readonly display_name: string;
  readonly agent_address: string;
  readonly role: string | null;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function toPerson(row: PersonRow): WorkspacePerson {
  return {
    personId: row.person_id,
    displayName: row.display_name,
    agentAddress: row.agent_address,
    role: row.role === null ? null : (row.role as ApproverRole),
  };
}

function isApproverRole(value: unknown): value is ApproverRole {
  return (
    typeof value === 'string' &&
    (APPROVER_ROLES as readonly string[]).includes(value)
  );
}

/** Normalise before storage — the column only accepts lowercase hex. */
export function normalizeAgentAddress(address: string): string {
  const trimmed = address.trim();
  if (!ADDRESS.test(trimmed)) {
    throw new Error(`not an agent wallet address: ${address}`);
  }
  return trimmed.toLowerCase();
}

export async function listWorkspacePeople(
  sql: postgres.Sql,
  organizationId: string,
): Promise<readonly WorkspacePerson[]> {
  try {
    const rows = await sql<readonly PersonRow[]>`
      SELECT person_id, display_name, agent_address, role
      FROM workspace_people
      WHERE organization_id = ${organizationId}
      ORDER BY created_at ASC
    `;
    return rows.map(toPerson);
  } catch (error) {
    throw mapPostgresError(error);
  }
}

export async function addWorkspacePerson(
  sql: postgres.Sql,
  organizationId: string,
  person: Readonly<{
    personId: string;
    displayName: string;
    agentAddress: string;
    role: PersonRole;
  }>,
): Promise<WorkspacePerson> {
  const agentAddress = normalizeAgentAddress(person.agentAddress);
  const role = isApproverRole(person.role) ? person.role : null;

  try {
    const rows = await sql<readonly PersonRow[]>`
      INSERT INTO workspace_people
        (organization_id, person_id, display_name, agent_address, role)
      VALUES
        (${organizationId}, ${person.personId}, ${person.displayName.trim()},
         ${agentAddress}, ${role})
      RETURNING person_id, display_name, agent_address, role
    `;
    const row = rows[0];
    if (row === undefined) throw new Error('insert returned no row');
    return toPerson(row);
  } catch (error) {
    throw mapPostgresError(error);
  }
}

export async function setWorkspacePersonRole(
  sql: postgres.Sql,
  organizationId: string,
  personId: string,
  role: PersonRole,
): Promise<WorkspacePerson | null> {
  const next = isApproverRole(role) ? role : null;
  try {
    const rows = await sql<readonly PersonRow[]>`
      UPDATE workspace_people
      SET role = ${next}, updated_at = transaction_timestamp()
      WHERE organization_id = ${organizationId} AND person_id = ${personId}
      RETURNING person_id, display_name, agent_address, role
    `;
    const row = rows[0];
    return row === undefined ? null : toPerson(row);
  } catch (error) {
    throw mapPostgresError(error);
  }
}

export async function removeWorkspacePerson(
  sql: postgres.Sql,
  organizationId: string,
  personId: string,
): Promise<boolean> {
  try {
    const rows = await sql`
      DELETE FROM workspace_people
      WHERE organization_id = ${organizationId} AND person_id = ${personId}
      RETURNING person_id
    `;
    return rows.length > 0;
  } catch (error) {
    throw mapPostgresError(error);
  }
}
