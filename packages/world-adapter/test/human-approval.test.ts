import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';

import {
  createTrustedWorldDeploymentContext,
  createWorldHumanApprovalBinding,
  createWorldProofOfHumanRequest,
  deriveAgentTenantPrincipal,
  validateTrustedWorldDeploymentContext,
  validateWorldProofOfHumanResult,
  validateWorldProofOfHumanRequest,
} from '../src/index.js';

const ACTION_DIGEST = 'a'.repeat(64);
const KEY = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
const account = privateKeyToAccount(
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
);
const LIVE_DEPLOYMENT = createTrustedWorldDeploymentContext({
  appId: 'app_invoiceguard',
  environment: 'production',
  mode: 'live',
  rpId: 'rp_invoiceguard',
});

function createBinding(
  overrides: Partial<
    Parameters<typeof createWorldHumanApprovalBinding>[0]
  > = {},
) {
  const createdAt = new Date('2026-07-25T20:00:00.000Z');

  return createWorldHumanApprovalBinding({
    actionDigest: ACTION_DIGEST,
    agentAddress: account.address,
    agentTenantPrincipal: deriveAgentTenantPrincipal({
      humanId: '0x1234',
      key: KEY,
      organizationId: 'synthetic-acme',
    }),
    agentTenantPrincipalDerivationVersion: 'v1',
    approvalSessionId: 'approval-session-0001',
    createdAt,
    decision: 'APPROVE',
    expiresAt: new Date(createdAt.getTime() + 120_000),
    organizationId: 'synthetic-acme',
    requiredRole: 'AP_APPROVER',
    roleGrantId: 'role-grant-0001',
    subjectId: 'subject:operator-001',
    ...overrides,
  });
}

function createRequest(
  binding = createBinding(),
  overrides: Partial<Parameters<typeof createWorldProofOfHumanRequest>[0]> = {},
) {
  return createWorldProofOfHumanRequest({
    binding,
    deployment: LIVE_DEPLOYMENT,
    rpContext: {
      created_at: Date.parse(binding.createdAt) / 1_000,
      expires_at: Date.parse(binding.expiresAt) / 1_000,
      nonce: 'synthetic-rp-nonce',
      rp_id: 'rp_invoiceguard',
      signature: '0xsynthetic-rp-signature',
    },
    ...overrides,
  });
}

function createProof(request = createRequest()) {
  return {
    action: request.binding.worldActionId,
    environment: request.environment,
    nonce: request.config.rp_context.nonce,
    protocol_version: '4.0',
    responses: [
      {
        expires_at_min: 1_900_000_000,
        identifier: 'proof_of_human',
        issuer_schema_id: 1,
        nullifier: '0x1234',
        proof: ['0x01', '0x02', '0x03', '0x04', '0x05'],
        signal_hash: request.expectedSignalHash,
      },
    ],
    user_presence_completed: true,
  } as const;
}

describe('World action-time approval binding', () => {
  it('pins an explicit live World app, relying party, and environment', () => {
    const deployment = createTrustedWorldDeploymentContext({
      appId: 'app_invoiceguard',
      environment: 'production',
      mode: 'live',
      rpId: 'rp_invoiceguard',
    });

    expect(validateTrustedWorldDeploymentContext(deployment)).toEqual({
      context: deployment,
      ok: true,
    });
  });

  it.each([
    {
      appId: 'app_staging_invoiceguard',
      environment: 'staging' as const,
      mode: 'live' as const,
      rpId: 'rp_invoiceguard',
    },
    {
      appId: 'app_invoiceguard',
      environment: 'sandbox' as const,
      mode: 'live' as const,
      rpId: 'rp_invoiceguard',
    },
  ])('rejects non-production live deployment %#', (input) => {
    expect(() => createTrustedWorldDeploymentContext(input)).toThrow(
      /Live World deployments/u,
    );
  });

  it('allows staging only when the deployment is explicitly a test', () => {
    const deployment = createTrustedWorldDeploymentContext({
      appId: 'app_staging_invoiceguard',
      environment: 'staging',
      mode: 'test',
      rpId: 'rp_invoiceguard',
    });

    expect(deployment).toMatchObject({
      appId: 'app_staging_invoiceguard',
      deploymentId: expect.stringMatching(/^world-deployment:[0-9a-f]{64}$/u),
      environment: 'staging',
      mode: 'test',
      rpId: 'rp_invoiceguard',
    });
  });

  it('rejects serialized deployment boundaries and binds their identity into requests', () => {
    const request = createRequest();
    const serializedDeployment = structuredClone(LIVE_DEPLOYMENT);

    expect(request.deploymentId).toBe(LIVE_DEPLOYMENT.deploymentId);
    expect(validateTrustedWorldDeploymentContext(serializedDeployment)).toEqual(
      { ok: false },
    );
    expect(
      validateWorldProofOfHumanRequest(
        { ...request, deploymentId: `world-deployment:${'0'.repeat(64)}` },
        LIVE_DEPLOYMENT,
      ),
    ).toEqual({ ok: false, reason: 'DEPLOYMENT_MISMATCH' });
  });

  it('keeps one World action across slots while scoping each signal', () => {
    const first = createBinding();
    const second = createBinding({
      approvalSessionId: 'approval-session-0002',
      roleGrantId: 'role-grant-0002',
      subjectId: 'subject:operator-002',
    });

    expect(first.worldActionId).toBe(second.worldActionId);
    expect(first.worldSignal).not.toBe(second.worldSignal);
    expect(first.worldActionId).toMatch(
      /^invoiceguard-approval-v1-[0-9a-f]{64}$/u,
    );
    expect(first.worldSignal).toMatch(/^invoiceguard-signal-v1-[0-9a-f]{64}$/u);
    expect(JSON.stringify({ first, second })).not.toContain('0x1234');
  });

  it('keeps role and decision under one action-human distinctness class', () => {
    const baseline = createBinding();
    const changedAction = createBinding({
      actionDigest: 'b'.repeat(64),
    });
    const changedRole = createBinding({ requiredRole: 'CONTROLLER' });
    const rejection = createBinding({ decision: 'REJECT' });

    expect(changedAction.worldActionId).not.toBe(baseline.worldActionId);
    expect(changedRole.worldActionId).toBe(baseline.worldActionId);
    expect(rejection.worldActionId).toBe(baseline.worldActionId);
    expect(changedRole.worldSignal).not.toBe(baseline.worldSignal);
    expect(rejection.worldSignal).not.toBe(baseline.worldSignal);
  });

  it('constructs an explicit protocol-v4 config and preset contract', () => {
    const binding = createBinding();
    const request = createRequest(binding);

    expect(request.config).toEqual({
      action: binding.worldActionId,
      allow_legacy_proofs: false,
      app_id: 'app_invoiceguard',
      environment: 'production',
      require_user_presence: true,
      rp_context: {
        created_at: Date.parse(binding.createdAt) / 1_000,
        expires_at: Date.parse(binding.expiresAt) / 1_000,
        nonce: 'synthetic-rp-nonce',
        rp_id: 'rp_invoiceguard',
        signature: '0xsynthetic-rp-signature',
      },
    });
    expect(request.preset).toEqual({
      signal: binding.worldSignal,
      type: 'ProofOfHuman',
    });
    expect(request.expectedSignalHash).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  it('accepts only the exact action-bound proof-of-human response', () => {
    const request = createRequest();
    const proof = createProof(request);

    expect(validateWorldProofOfHumanResult(proof, request)).toEqual({
      ok: true,
      proof,
      response: proof.responses[0],
    });
  });

  it.each([
    ['action', { action: `invoiceguard-approval-v1-${'0'.repeat(64)}` }],
    ['nonce', { nonce: 'substituted-nonce' }],
    ['environment', { environment: 'staging' }],
    ['user presence', { user_presence_completed: false }],
  ])('rejects a World result with substituted %s', (_label, mutation) => {
    const request = createRequest();

    expect(
      validateWorldProofOfHumanResult(
        { ...createProof(request), ...mutation },
        request,
      ),
    ).toMatchObject({ ok: false });
  });

  it.each([
    ['signal', { signal_hash: `0x${'0'.repeat(64)}` }],
    ['credential', { identifier: 'selfie' }],
    ['issuer', { issuer_schema_id: 11 }],
    ['nullifier', { nullifier: '0x0' }],
    ['proof', { proof: ['0x01'] }],
  ])('rejects a World response with substituted %s', (_label, mutation) => {
    const request = createRequest();
    const proof = createProof(request);

    expect(
      validateWorldProofOfHumanResult(
        {
          ...proof,
          responses: [{ ...proof.responses[0], ...mutation }],
        },
        request,
      ),
    ).toMatchObject({ ok: false });
  });

  it('rejects a session proof for an exact-action request', () => {
    const request = createRequest();

    expect(
      validateWorldProofOfHumanResult(
        { ...createProof(request), session_id: `session_${'a'.repeat(128)}` },
        request,
      ),
    ).toEqual({ ok: false, reason: 'PROTOCOL_MISMATCH' });
  });

  it.each([
    ['uppercase action digest', { actionDigest: 'A'.repeat(64) }],
    ['invalid agent', { agentAddress: '0x1234' }],
    ['unscoped principal', { agentTenantPrincipal: 'human-1' }],
    ['short session ID', { approvalSessionId: 'short' }],
    [
      'expired at creation',
      {
        createdAt: new Date('2026-07-25T20:00:01.000Z'),
        expiresAt: new Date('2026-07-25T20:00:00.000Z'),
      },
    ],
    [
      'long-lived session',
      {
        createdAt: new Date('2026-07-25T20:00:00.000Z'),
        expiresAt: new Date('2026-07-25T20:05:01.000Z'),
      },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(() => createBinding(overrides)).toThrow();
  });

  it('rejects an RP context that outlives its approval session', () => {
    const binding = createBinding();

    expect(() =>
      createRequest(binding, {
        rpContext: {
          created_at: Date.parse(binding.createdAt) / 1_000,
          expires_at: Date.parse(binding.expiresAt) / 1_000 + 1,
          nonce: 'synthetic-rp-nonce',
          rp_id: 'rp_invoiceguard',
          signature: '0xsynthetic-rp-signature',
        },
      }),
    ).toThrow('expire no later');
  });

  it('rejects a substituted action binding', () => {
    const binding = createBinding();

    expect(() =>
      createRequest({
        ...binding,
        worldActionId: `invoiceguard-approval-v1-${'b'.repeat(64)}`,
      }),
    ).toThrow('does not match');
  });

  it('accepts the documented staging app ID form explicitly', () => {
    const request = createRequest(createBinding(), {
      deployment: createTrustedWorldDeploymentContext({
        appId: 'app_staging_invoiceguard',
        environment: 'staging',
        mode: 'test',
        rpId: 'rp_invoiceguard',
      }),
    });

    expect(request.config.app_id).toBe('app_staging_invoiceguard');
    expect(request.config.environment).toBe('staging');
  });

  it('rejects a relying party not owned by the trusted deployment', () => {
    const binding = createBinding();

    expect(() =>
      createWorldProofOfHumanRequest({
        binding,
        deployment: LIVE_DEPLOYMENT,
        rpContext: {
          created_at: Date.parse(binding.createdAt) / 1_000,
          expires_at: Date.parse(binding.expiresAt) / 1_000,
          nonce: 'synthetic-rp-nonce',
          rp_id: 'rp_substituted',
          signature: '0xsynthetic-rp-signature',
        },
      }),
    ).toThrow(/does not match the trusted deployment/u);
  });
});
