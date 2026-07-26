import { lookupAgentHumanBackings } from '@remit/world-adapter/agentbook';
import { listWorkspacePeople } from '@remit/persistence';
import { headers } from 'next/headers';

import { db, resolveOrganizationId } from '../../../../lib/workspace.server';
import {
  isWorldApprovalConfigured,
  mintApprovalRequest,
} from '../../../../lib/world-approval.server';

/**
 * Open a World App approval for one exact payment.
 *
 * The approver must already be on this organisation's roster and must have a
 * role, because a World proof establishes personhood and nothing else. A
 * verified human with no company role is still not an approver — that
 * separation is the product, and enforcing it before minting the request is
 * cheaper than discovering it after someone has approved on their phone.
 *
 * The agent must also be registered in AgentBook. Asking a human to approve on
 * behalf of an agent nobody has vouched for would produce a proof we could not
 * attribute.
 */

export const dynamic = 'force-dynamic';

const DIGEST = /^[0-9a-f]{64}$/;

export async function POST(request: Request): Promise<Response> {
  if (!isWorldApprovalConfigured()) {
    return Response.json(
      {
        error:
          'World approval is not configured in this environment. See docs — the demo falls back to simulated approvals.',
      },
      { status: 501 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { actionDigest, agentAddress } = body as {
    actionDigest?: unknown;
    agentAddress?: unknown;
  };

  if (typeof actionDigest !== 'string' || !DIGEST.test(actionDigest)) {
    return Response.json(
      { error: 'actionDigest must be 64 lowercase hex characters' },
      { status: 400 },
    );
  }
  if (typeof agentAddress !== 'string') {
    return Response.json(
      { error: 'agentAddress is required' },
      { status: 400 },
    );
  }

  try {
    const { organizationId } = await resolveOrganizationId(await headers());
    const roster = await listWorkspacePeople(db(), organizationId);
    const person = roster.find(
      (candidate) =>
        candidate.agentAddress.toLowerCase() === agentAddress.toLowerCase(),
    );

    if (person === undefined) {
      return Response.json(
        { error: 'that agent is not on this organisation roster' },
        { status: 403 },
      );
    }
    if (person.role === null) {
      return Response.json(
        {
          error: `${person.displayName} has no approval role. World proves a person; the company grants authority.`,
        },
        { status: 403 },
      );
    }

    const [backing] = await lookupAgentHumanBackings([person.agentAddress]);
    if (backing === undefined || backing.humanId === null) {
      return Response.json(
        {
          error:
            'that agent is not registered in AgentBook, so an approval could not be attributed to a human',
        },
        { status: 409 },
      );
    }

    const minted = mintApprovalRequest({
      actionDigest,
      agentAddress: person.agentAddress as `0x${string}`,
      humanId: backing.humanId,
      organizationId,
      requiredRole: person.role,
      roleGrantId: `grant-${person.personId}`,
      subjectId: person.personId,
    });

    return Response.json(
      {
        approvalSessionId: minted.approvalSessionId,
        config: minted.config,
        expiresAt: minted.expiresAt,
        preset: minted.preset,
        // Returned so the UI can show what the proof will be checked against.
        // Verification happens server-side regardless.
        expectedSignalHash: minted.expectedSignalHash,
        worldActionId: minted.worldActionId,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'mint failed' },
      { status: 500 },
    );
  }
}
