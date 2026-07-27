import {
  executeSupplierSettlement,
  isHederaPaymentConfigured,
} from '../../../../lib/hedera-payment.server';
import { consumeVerifiedApproval } from '../../../../lib/world-approval.server';

/**
 * Execute the payment a verified World approval authorized.
 *
 * The order is the security property: the approval session is consumed —
 * atomically flipped from 'verified' to 'executed' — before any transaction is
 * submitted, so one approval can settle at most one payment and a concurrent
 * duplicate call refuses instead of double-paying. No verified approval, no
 * settlement, structurally.
 */

export const dynamic = 'force-dynamic';

const DIGEST = /^[0-9a-f]{64}$/;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;
const INVOICE_ID = /^[A-Za-z0-9-]{4,40}$/;

const messageFor = {
  ALREADY_EXECUTED: 'This approval has already settled its payment.',
  DIGEST_MISMATCH:
    'This approval is bound to a different payment and cannot settle this one.',
  NOT_VERIFIED: 'No verified World approval exists for this payment.',
} as const;

const statusFor = {
  ALREADY_EXECUTED: 409,
  DIGEST_MISMATCH: 403,
  NOT_VERIFIED: 403,
} as const;

export async function POST(request: Request): Promise<Response> {
  if (!isHederaPaymentConfigured()) {
    return Response.json(
      { error: 'Hedera settlement is not configured in this environment.' },
      { status: 501 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { actionDigest, approvalSessionId, invoiceId } = body as {
    actionDigest?: unknown;
    approvalSessionId?: unknown;
    invoiceId?: unknown;
  };
  if (typeof actionDigest !== 'string' || !DIGEST.test(actionDigest)) {
    return Response.json(
      { error: 'actionDigest must be 64 lowercase hex characters' },
      { status: 400 },
    );
  }
  if (
    typeof approvalSessionId !== 'string' ||
    !SESSION_ID.test(approvalSessionId)
  ) {
    return Response.json(
      { error: 'a valid approval session is required' },
      { status: 400 },
    );
  }
  if (typeof invoiceId !== 'string' || !INVOICE_ID.test(invoiceId)) {
    return Response.json({ error: 'a valid invoice is required' }, {
      status: 400,
    });
  }

  const consumed = consumeVerifiedApproval({ actionDigest, approvalSessionId });
  if (!consumed.ok) {
    return Response.json(
      { error: messageFor[consumed.reason], reason: consumed.reason },
      { status: statusFor[consumed.reason] },
    );
  }

  try {
    const receipt = await executeSupplierSettlement({
      actionDigest,
      invoiceId,
    });
    return Response.json(
      { success: true, ...receipt },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? `Settlement failed: ${error.message}`
            : 'Settlement failed.',
      },
      { status: 502 },
    );
  }
}
