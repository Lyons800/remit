import { headers } from 'next/headers';

import { resolveOrganizationId } from '../../../../lib/workspace.server';
import { verifyWorldApprovalProof } from '../../../../lib/world-approval.server';

/**
 * Verify a completed IDKit result on the server.
 *
 * The request body is the unmodified IDKit result. The approval session stays
 * in the query string so the proof can be forwarded to World without wrapping
 * or remapping any of its fields.
 */

export const dynamic = 'force-dynamic';

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;

const statusFor = {
  PROOF_MISMATCH: 400,
  PROOF_REPLAYED: 409,
  SESSION_EXPIRED: 410,
  SESSION_NOT_FOUND: 404,
  SESSION_REPLAYED: 409,
  WORLD_REJECTED: 400,
  WORLD_UNAVAILABLE: 503,
} as const;

const messageFor = {
  PROOF_MISMATCH:
    'The World response did not match this payment approval request.',
  PROOF_REPLAYED: 'That human has already approved this exact World action.',
  SESSION_EXPIRED: 'This World approval request has expired.',
  SESSION_NOT_FOUND: 'This World approval request is not available.',
  SESSION_REPLAYED: 'This World approval request has already been used.',
  WORLD_REJECTED: 'World did not verify this proof.',
  WORLD_UNAVAILABLE:
    'World verification is temporarily unavailable. You can retry this request.',
} as const;

export async function POST(request: Request): Promise<Response> {
  const approvalSessionId = new URL(request.url).searchParams.get('session');
  if (approvalSessionId === null || !SESSION_ID.test(approvalSessionId)) {
    return Response.json(
      { error: 'a valid approval session is required' },
      { status: 400 },
    );
  }

  let proof: unknown;
  try {
    proof = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  try {
    const { organizationId } = await resolveOrganizationId(await headers());
    const verified = await verifyWorldApprovalProof({
      approvalSessionId,
      organizationId,
      proof,
    });
    if (!verified.ok) {
      return Response.json(
        { error: messageFor[verified.reason], reason: verified.reason },
        { status: statusFor[verified.reason] },
      );
    }

    return Response.json(
      {
        actionDigest: verified.actionDigest,
        approvalSessionId: verified.approvalSessionId,
        success: true,
        verifiedAt: verified.verifiedAt,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'The World proof could not be verified.' },
      { status: 500 },
    );
  }
}
