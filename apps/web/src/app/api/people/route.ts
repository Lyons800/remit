import {
  addWorkspacePerson,
  listWorkspacePeople,
  setWorkspacePersonRole,
  type PersonRole,
  type WorkspacePerson,
} from '@invoiceguard/persistence';

import { DEMO_ORGANIZATION_ID, db } from '../../../lib/workspace.server';

/**
 * The workspace roster.
 *
 * Only the organisation's own claims live here — a name, an agent wallet, and
 * a granted role. Which human backs a wallet is read from AgentBook at request
 * time by /api/agentbook and is never persisted, because a stored
 * agent-to-human mapping would let anyone who reached this database
 * manufacture a quorum.
 */

export const dynamic = 'force-dynamic';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ROLES = new Set(['FINANCE_APPROVER', 'TREASURY_APPROVER']);

/** The agents the demo narrative uses, inserted once so the page is never empty. */
const SEED = [
  {
    personId: 'a1',
    displayName: 'Oisin — finance',
    agentAddress: '0xA03F5F37Dcb5A16c317dbf88941c2049B9B96f34',
    role: 'FINANCE_APPROVER' as PersonRole,
  },
  {
    personId: 'a2',
    displayName: 'Oisin — treasury (second device)',
    agentAddress: '0x4EaB3ef90cdd8250e1A82227766F96dcdf7b275B',
    role: 'TREASURY_APPROVER' as PersonRole,
  },
  {
    personId: 'b1',
    displayName: 'Second approver',
    agentAddress: '0xa26810aF0b4FEB9158C10e74817c790995D97729',
    role: 'TREASURY_APPROVER' as PersonRole,
  },
];

async function roster(): Promise<readonly WorkspacePerson[]> {
  const sql = db();
  const existing = await listWorkspacePeople(sql, DEMO_ORGANIZATION_ID);
  if (existing.length > 0) return existing;

  for (const person of SEED) {
    try {
      await addWorkspacePerson(sql, DEMO_ORGANIZATION_ID, person);
    } catch {
      /* a concurrent request seeded first — harmless */
    }
  }
  return listWorkspacePeople(sql, DEMO_ORGANIZATION_ID);
}

export async function GET(): Promise<Response> {
  try {
    return Response.json(
      { people: await roster() },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'unavailable' },
      { status: 503 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { displayName, agentAddress, role } = body as {
    displayName?: unknown;
    agentAddress?: unknown;
    role?: unknown;
  };

  if (typeof displayName !== 'string' || displayName.trim() === '') {
    return Response.json({ error: 'displayName is required' }, { status: 400 });
  }
  if (typeof agentAddress !== 'string' || !ADDRESS.test(agentAddress.trim())) {
    return Response.json(
      { error: 'agentAddress must be a 0x-prefixed 20-byte address' },
      { status: 400 },
    );
  }
  const nextRole: PersonRole =
    typeof role === 'string' && ROLES.has(role) ? (role as PersonRole) : null;

  try {
    const person = await addWorkspacePerson(db(), DEMO_ORGANIZATION_ID, {
      personId: `p-${agentAddress.trim().slice(2, 10).toLowerCase()}`,
      displayName,
      agentAddress,
      role: nextRole,
    });
    return Response.json({ person }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'insert failed';
    // A duplicate agent is a client mistake, not a server fault.
    const status = /unique|duplicate/i.test(message) ? 409 : 500;
    return Response.json(
      {
        error:
          status === 409
            ? 'That agent wallet is already in the workspace.'
            : message,
      },
      { status },
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { personId, role } = body as { personId?: unknown; role?: unknown };
  if (typeof personId !== 'string' || personId === '') {
    return Response.json({ error: 'personId is required' }, { status: 400 });
  }
  const nextRole: PersonRole =
    typeof role === 'string' && ROLES.has(role) ? (role as PersonRole) : null;

  try {
    const person = await setWorkspacePersonRole(
      db(),
      DEMO_ORGANIZATION_ID,
      personId,
      nextRole,
    );
    if (person === null) {
      return Response.json({ error: 'no such person' }, { status: 404 });
    }
    return Response.json({ person });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'update failed' },
      { status: 500 },
    );
  }
}
