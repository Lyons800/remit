import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  mintApprovalRequest,
  verifyWorldApprovalProof,
} from './world-approval.server.js';

const ADDRESS = '0xA03F5F37Dcb5A16c317dbf88941c2049B9B96f34';

function mint(actionDigest: string) {
  return mintApprovalRequest({
    actionDigest,
    agentAddress: ADDRESS,
    humanId: '0x1234',
    organizationId: `test-org-${actionDigest.slice(0, 8)}`,
    requiredRole: 'TREASURY_APPROVER',
    roleGrantId: `grant-${actionDigest.slice(0, 8)}`,
    subjectId: `subject-${actionDigest.slice(0, 8)}`,
  });
}

function proofFor(minted: ReturnType<typeof mintApprovalRequest>) {
  const config = minted.config as { rp_context: { nonce: string } };
  return {
    action: minted.worldActionId,
    environment: 'production',
    nonce: config.rp_context.nonce,
    protocol_version: '4.0',
    responses: [
      {
        expires_at_min: 1_900_000_000,
        identifier: 'proof_of_human',
        issuer_schema_id: 1,
        nullifier: '0x1234',
        proof: ['0x01', '0x02', '0x03', '0x04', '0x05'],
        signal_hash: minted.expectedSignalHash,
      },
    ],
    user_presence_completed: true,
  } as const;
}

function verifiedPortal(proof: ReturnType<typeof proofFor>) {
  return Response.json({
    action: proof.action,
    environment: proof.environment,
    results: [
      {
        identifier: 'proof_of_human',
        nullifier: proof.responses[0].nullifier,
        success: true,
      },
    ],
    success: true,
  });
}

beforeEach(() => {
  vi.stubEnv('WORLD_APP_ID', 'app_invoiceguard');
  vi.stubEnv('WORLD_RP_ID', 'rp_invoiceguard');
  vi.stubEnv(
    'RP_SIGNING_KEY',
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
  vi.stubEnv('WORLD_PRINCIPAL_HMAC_KEY', '11'.repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('World browser approval verification', () => {
  it('forwards the exact IDKit result and consumes the demo session', async () => {
    const minted = mint('1'.repeat(64));
    const proof = proofFor(minted);
    const fetcher = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toEqual(proof);
        return verifiedPortal(proof);
      },
    ) as unknown as typeof fetch;

    const first = await verifyWorldApprovalProof({
      approvalSessionId: minted.approvalSessionId,
      fetcher,
      organizationId: 'test-org-11111111',
      proof,
    });

    expect(first).toMatchObject({
      actionDigest: '1'.repeat(64),
      approvalSessionId: minted.approvalSessionId,
      ok: true,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    await expect(
      verifyWorldApprovalProof({
        approvalSessionId: minted.approvalSessionId,
        fetcher,
        organizationId: 'test-org-11111111',
        proof,
      }),
    ).resolves.toEqual({ ok: false, reason: 'SESSION_REPLAYED' });
  });

  it('refuses a mismatched signal without calling World', async () => {
    const minted = mint('2'.repeat(64));
    const proof = proofFor(minted);
    const fetcher = vi.fn() as unknown as typeof fetch;

    await expect(
      verifyWorldApprovalProof({
        approvalSessionId: minted.approvalSessionId,
        fetcher,
        organizationId: 'test-org-22222222',
        proof: {
          ...proof,
          responses: [
            { ...proof.responses[0], signal_hash: `0x${'0'.repeat(64)}` },
          ],
        },
      }),
    ).resolves.toEqual({ ok: false, reason: 'PROOF_MISMATCH' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('allows a retry when the World verifier is temporarily unavailable', async () => {
    const minted = mint('3'.repeat(64));
    const proof = proofFor(minted);
    const unavailable = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    await expect(
      verifyWorldApprovalProof({
        approvalSessionId: minted.approvalSessionId,
        fetcher: unavailable,
        organizationId: 'test-org-33333333',
        proof,
      }),
    ).resolves.toEqual({ ok: false, reason: 'WORLD_UNAVAILABLE' });

    const recovered = vi.fn(async () =>
      verifiedPortal(proof),
    ) as unknown as typeof fetch;
    await expect(
      verifyWorldApprovalProof({
        approvalSessionId: minted.approvalSessionId,
        fetcher: recovered,
        organizationId: 'test-org-33333333',
        proof,
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('keeps the session retryable when World rate-limits verification', async () => {
    const minted = mint('4'.repeat(64));
    const proof = proofFor(minted);
    const rateLimited = vi.fn(async () =>
      Response.json({ message: 'rate limited' }, { status: 429 }),
    ) as unknown as typeof fetch;

    await expect(
      verifyWorldApprovalProof({
        approvalSessionId: minted.approvalSessionId,
        fetcher: rateLimited,
        organizationId: 'test-org-44444444',
        proof,
      }),
    ).resolves.toEqual({ ok: false, reason: 'WORLD_UNAVAILABLE' });

    const recovered = vi.fn(async () =>
      verifiedPortal(proof),
    ) as unknown as typeof fetch;
    await expect(
      verifyWorldApprovalProof({
        approvalSessionId: minted.approvalSessionId,
        fetcher: recovered,
        organizationId: 'test-org-44444444',
        proof,
      }),
    ).resolves.toMatchObject({ ok: true });
  });
});
