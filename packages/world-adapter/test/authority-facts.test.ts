import type { IDKitResult } from '@worldcoin/idkit-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';

import {
  actionFactBinding,
  parseAdapterVerifiedApprovalFact,
  parseRequestingAgentExecutionFact,
  validateApprovalQuorum,
} from '@invoiceguard/domain';

import { humanAuthorization } from '../../domain/test/fixtures/authorization.js';
import * as worldAdapter from '../src/index.js';
import {
  authorizeAgentkitRequest,
  createAgentkitApprovalChallenge,
  createTrustedWorldDeploymentContext,
  createWorldHumanApprovalBinding,
  createWorldPrincipalKeyring,
  createWorldProofOfHumanRequest,
  deriveAgentTenantPrincipalAliases,
  signAgentkitApprovalChallenge,
  verifyAndProjectWorldAuthority,
  WORLD_AGENT_SIGNATURE_CHAIN_ID,
  type VerifiedAgentkitClaim,
  type VerifiedWorldCompanyAuthority,
  type WorldAuthorityProjectionDependencies,
  type WorldCompanyAuthorityRequirement,
} from '../src/index.js';

const ISSUED_AT = new Date('2026-07-25T10:00:00.000Z');
const NOW = new Date('2026-07-25T10:00:30.000Z');
const SESSION_EXPIRES_AT = new Date('2026-07-25T10:02:00.000Z');
const RP_EXPIRES_AT = new Date('2026-07-25T10:01:45.000Z');
const WORLD_EXPIRES_AT = new Date('2026-07-25T10:01:20.000Z');
const APPROVAL_AUTHORITY_EXPIRES_AT = '2026-07-25T10:01:10.000Z';
const REQUESTER_AUTHORITY_EXPIRES_AT = '2026-07-25T10:01:25.000Z';
const BACKING_EXPIRES_AT = '2026-07-25T10:04:00.000Z';
const APPROVAL_HUMAN_ID = '0x1234';
const REQUESTER_HUMAN_ID = '0x9876';
const APPROVAL_NULLIFIER = '0x5678';

const approvalAccount = privateKeyToAccount(
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
);
const requesterAccount = privateKeyToAccount(
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
);
const deployment = createTrustedWorldDeploymentContext({
  appId: 'app_invoiceguard',
  environment: 'production',
  mode: 'live',
  rpId: 'rp_invoiceguard',
});
const keyring = createWorldPrincipalKeyring(
  { key: new Uint8Array(32).fill(1), version: 'v2' },
  [{ key: new Uint8Array(32).fill(2), version: 'v1' }],
);

type WorldIdKitResultV4 = Extract<
  IDKitResult,
  { action: string; protocol_version: '4.0' }
>;

let approvalClaim: VerifiedAgentkitClaim;
let requesterClaim: VerifiedAgentkitClaim;

async function withFixtureClock<T>(operation: () => Promise<T>): Promise<T> {
  const realDate = globalThis.Date;
  const fixedDate = new Proxy(realDate, {
    construct(target, argumentsList) {
      return Reflect.construct(
        target,
        argumentsList.length === 0 ? [NOW.getTime()] : argumentsList,
      );
    },
    get(target, property, receiver) {
      return property === 'now'
        ? () => NOW.getTime()
        : Reflect.get(target, property, receiver);
    },
  });
  vi.stubGlobal('Date', fixedDate);
  try {
    return await operation();
  } finally {
    vi.unstubAllGlobals();
  }
}

async function createVerifiedClaim(
  account: typeof approvalAccount,
  nonce: string,
): Promise<VerifiedAgentkitClaim> {
  const challenge = createAgentkitApprovalChallenge({
    actionDigest: humanAuthorization.envelope.actionDigest,
    agentAddress: account.address,
    issuedAt: ISSUED_AT,
    nonce,
    organizationId: humanAuthorization.actionCore.organizationId,
    publicOrigin: 'http://localhost:4100',
  });
  const header = await signAgentkitApprovalChallenge(challenge, {
    address: account.address,
    chainId: WORLD_AGENT_SIGNATURE_CHAIN_ID,
    signMessage: (message) => account.signMessage({ message }),
    type: 'eip191',
  });
  const result = await withFixtureClock(() =>
    authorizeAgentkitRequest(
      {
        bodyByteLength: 0,
        challenge,
        header,
        method: 'POST',
        now: NOW,
        pathActionDigest: challenge.actionDigest,
        requestUri: challenge.approvalUri,
        storedActionDigest: challenge.actionDigest,
      },
      { commitAuthorization: async () => true },
    ),
  );
  if (!result.ok) {
    throw new Error(`Synthetic AgentKit claim failed: ${result.reason}.`);
  }
  return result.claim;
}

beforeAll(async () => {
  approvalClaim = await createVerifiedClaim(
    approvalAccount,
    '0123456789abcdef',
  );
  requesterClaim = await createVerifiedClaim(
    requesterAccount,
    'fedcba9876543210',
  );
});

function humanIdForClaim(claim: VerifiedAgentkitClaim): string {
  return claim.agentAddress === approvalAccount.address
    ? APPROVAL_HUMAN_ID
    : REQUESTER_HUMAN_ID;
}

function authorityFor(
  requirement: WorldCompanyAuthorityRequirement,
  overrides: Partial<VerifiedWorldCompanyAuthority> = {},
): VerifiedWorldCompanyAuthority {
  return {
    agentAddress: requirement.agentAddress,
    agentTenantPrincipal: requirement.agentTenantPrincipal,
    agentTenantPrincipalDerivationVersion:
      requirement.agentTenantPrincipalDerivationVersion,
    audience: requirement.audience ?? 'invoiceguard:approval',
    credentialDigest:
      requirement.kind === 'APPROVAL' ? '1'.repeat(64) : '2'.repeat(64),
    credentialId:
      requirement.kind === 'APPROVAL'
        ? 'approval-role-credential-1'
        : 'requester-role-credential-1',
    expiresAt:
      requirement.kind === 'APPROVAL'
        ? APPROVAL_AUTHORITY_EXPIRES_AT
        : REQUESTER_AUTHORITY_EXPIRES_AT,
    grantDigest: requirement.grantDigest ?? '3'.repeat(64),
    grantId: requirement.grantId,
    grantVersion: requirement.grantVersion ?? 7,
    notBefore: '2026-07-25T09:59:00.000Z',
    organizationId: requirement.organizationId,
    role: requirement.requiredRole,
    scope: requirement.scope ?? 'payments:approve',
    scopeActionDigest: requirement.actionDigest,
    subjectId: requirement.subjectId,
    ...overrides,
  };
}

function createProof(
  request: ReturnType<typeof createWorldProofOfHumanRequest>,
  nullifier = APPROVAL_NULLIFIER,
): WorldIdKitResultV4 {
  return {
    action: request.binding.worldActionId,
    environment: request.environment,
    nonce: request.config.rp_context.nonce,
    protocol_version: '4.0',
    responses: [
      {
        expires_at_min: WORLD_EXPIRES_AT.getTime() / 1_000,
        identifier: 'proof_of_human',
        issuer_schema_id: 1,
        nullifier,
        proof: ['0x1', '0x2', '0x3', '0x4', '0x5'],
        signal_hash: request.expectedSignalHash,
      },
    ],
    user_presence_completed: true,
  };
}

function createHarness(
  overrides: Readonly<{
    approvalClaim?: VerifiedAgentkitClaim;
    approvalHumanId?: string;
    nullifier?: string;
    requesterClaim?: VerifiedAgentkitClaim;
    role?: string;
    roleGrantId?: string;
    subjectId?: string;
  }> = {},
) {
  const selectedApprovalClaim = overrides.approvalClaim ?? approvalClaim;
  const selectedRequesterClaim = overrides.requesterClaim ?? requesterClaim;
  const approvalHumanId =
    overrides.approvalHumanId ?? humanIdForClaim(selectedApprovalClaim);
  const aliases = deriveAgentTenantPrincipalAliases({
    humanId: approvalHumanId,
    keyring,
    organizationId: humanAuthorization.actionCore.organizationId,
  });
  const currentAlias = aliases[0];
  if (currentAlias === undefined) {
    throw new Error('Synthetic keyring must have a current alias.');
  }
  const binding = createWorldHumanApprovalBinding({
    actionDigest: humanAuthorization.envelope.actionDigest,
    agentAddress: selectedApprovalClaim.agentAddress,
    agentTenantPrincipal: currentAlias.principal,
    agentTenantPrincipalDerivationVersion: currentAlias.derivationVersion,
    approvalSessionId: `approval-session-${selectedApprovalClaim.nonce}`,
    createdAt: ISSUED_AT,
    decision: 'APPROVE',
    expiresAt: SESSION_EXPIRES_AT,
    organizationId: humanAuthorization.actionCore.organizationId,
    requiredRole: overrides.role ?? 'FINANCE_APPROVER',
    roleGrantId: overrides.roleGrantId ?? 'approval-role-grant-1',
    subjectId: overrides.subjectId ?? 'subject:finance-approver-1',
  });
  const request = createWorldProofOfHumanRequest({
    binding,
    deployment,
    rpContext: {
      created_at: ISSUED_AT.getTime() / 1_000,
      expires_at: RP_EXPIRES_AT.getTime() / 1_000,
      nonce: `rp-${selectedApprovalClaim.nonce}`,
      rp_id: deployment.rpId,
      signature: '0xsynthetic-rp-signature',
    },
  });
  const verifyWorldProof = vi.fn(async () => ({ status: 'verified' as const }));
  const resolveAgentBookBacking = vi.fn(
    async (claim: VerifiedAgentkitClaim) => ({
      agentAddress: claim.agentAddress,
      backingRecordId: `agentbook-record:${claim.agentAddress}`,
      expiresAt: BACKING_EXPIRES_AT,
      humanId: humanIdForClaim(claim),
      status: 'backed' as const,
      verifiedAt: '2026-07-25T10:00:20.000Z',
    }),
  );
  const resolveCompanyAuthority = vi.fn(
    async (requirement: WorldCompanyAuthorityRequirement) => ({
      authority: authorityFor(requirement),
      status: 'valid' as const,
    }),
  );
  const dependencies: WorldAuthorityProjectionDependencies = {
    principalKeyring: keyring,
    resolveAgentBookBacking,
    resolveCompanyAuthority,
    verifyWorldProof,
    worldDeployment: deployment,
  };
  return {
    dependencies,
    input: {
      approval: {
        agentkitClaim: selectedApprovalClaim,
        proof: createProof(request, overrides.nullifier),
        request,
      },
      authorization: humanAuthorization,
      now: NOW,
      requester: {
        agentId: 'payment-agent-1',
        agentkitClaim: selectedRequesterClaim,
      },
    },
    request,
    resolveAgentBookBacking,
    resolveCompanyAuthority,
    verifyWorldProof,
  };
}

async function requireProjection(harness = createHarness()) {
  const result = await verifyAndProjectWorldAuthority(
    harness.input,
    harness.dependencies,
  );
  if (!result.ok) {
    throw new Error(`Synthetic projection failed: ${result.reason}.`);
  }
  return result.projection;
}

describe('World to AP verified authority projection', () => {
  it('exposes one verifier path and no structural fact constructors', () => {
    expect('createWorldApprovalFact' in worldAdapter).toBe(false);
    expect('createWorldRequestingAgentExecutionFact' in worldAdapter).toBe(
      false,
    );
    expect('createWorldApprovalIdentityClaims' in worldAdapter).toBe(false);
    expect('refreshWorldApprovalFact' in worldAdapter).toBe(false);
  });

  it('projects only correlated verified evidence into canonical AP facts', async () => {
    const financeHarness = createHarness();
    const treasuryHarness = createHarness({
      approvalClaim: requesterClaim,
      approvalHumanId: REQUESTER_HUMAN_ID,
      nullifier: '0x8765',
      requesterClaim: approvalClaim,
      role: 'TREASURY_APPROVER',
      roleGrantId: 'approval-role-grant-2',
      subjectId: 'subject:treasury-approver-1',
    });
    const finance = await requireProjection(financeHarness);
    const treasury = await requireProjection(treasuryHarness);

    expect(parseAdapterVerifiedApprovalFact(finance.approvalFact)).toEqual(
      finance.approvalFact,
    );
    expect(parseRequestingAgentExecutionFact(finance.requesterFact)).toEqual(
      finance.requesterFact,
    );
    expect(
      validateApprovalQuorum(
        {
          ...actionFactBinding(humanAuthorization),
          minimumVerifiedAt: humanAuthorization.decision.evaluatedAt,
        },
        humanAuthorization.decision.requiredAuthority,
        [finance.approvalFact, treasury.approvalFact],
        NOW.toISOString(),
      ),
    ).toEqual({
      ok: true,
      value: [finance.approvalFact, treasury.approvalFact],
    });
    expect(finance.approvalFact).toMatchObject({
      agentBackingStatus: 'CURRENT',
      companyRoleStatus: 'CURRENT',
      expiresAt: APPROVAL_AUTHORITY_EXPIRES_AT,
      humanDecisionStatus: 'VERIFIED',
    });
    expect(finance.requesterFact).toMatchObject({
      adapterId: humanAuthorization.decision.requiredExecutor.adapterId,
      agentBookStatus: 'CURRENT',
      companyRoleStatus: 'CURRENT',
      expiresAt: REQUESTER_AUTHORITY_EXPIRES_AT,
      grantStatus: 'CURRENT',
    });
    expect(
      Reflect.ownKeys(finance).some((key) => typeof key === 'symbol'),
    ).toBe(true);
  });

  it('derives every rotation alias internally and rejects caller alias lists', async () => {
    const harness = createHarness();
    const projection = await requireProjection(harness);

    expect(projection.identityClaims.actionHumanPrincipals).toHaveLength(2);
    expect(projection.identityClaims.agentTenantPrincipals).toHaveLength(2);
    expect(
      projection.identityClaims.actionHumanPrincipals.map(
        ({ derivationVersion }) => derivationVersion,
      ),
    ).toEqual(['v2', 'v1']);

    const forgedInput = {
      ...harness.input,
      approval: {
        ...harness.input.approval,
        actionHumanPrincipals:
          projection.identityClaims.actionHumanPrincipals.slice(0, 1),
        agentTenantPrincipals:
          projection.identityClaims.agentTenantPrincipals.slice(0, 1),
      },
    };
    await expect(
      verifyAndProjectWorldAuthority(
        forgedInput as unknown as typeof harness.input,
        harness.dependencies,
      ),
    ).resolves.toEqual({ ok: false, reason: 'INPUT_INVALID' });
    expect(harness.verifyWorldProof).toHaveBeenCalledOnce();
  });

  it('refuses fabricated or substituted AgentKit, proof, backing, and role evidence', async () => {
    const fabricatedHarness = createHarness();
    const fabricatedClaim = structuredClone(
      fabricatedHarness.input.approval.agentkitClaim,
    );
    await expect(
      verifyAndProjectWorldAuthority(
        {
          ...fabricatedHarness.input,
          approval: {
            ...fabricatedHarness.input.approval,
            agentkitClaim: fabricatedClaim,
          },
        },
        fabricatedHarness.dependencies,
      ),
    ).resolves.toEqual({
      ok: false,
      reason: 'AGENTKIT_CLAIM_INVALID',
    });

    const claimHarness = createHarness();
    const substitutedClaim = {
      ...claimHarness.input.approval.agentkitClaim,
      actionDigest: 'f'.repeat(64),
    };
    await expect(
      verifyAndProjectWorldAuthority(
        {
          ...claimHarness.input,
          approval: {
            ...claimHarness.input.approval,
            agentkitClaim: substitutedClaim,
          },
        },
        claimHarness.dependencies,
      ),
    ).resolves.toEqual({
      ok: false,
      reason: 'AGENTKIT_CLAIM_INVALID',
    });

    const proofHarness = createHarness();
    const substitutedProof = structuredClone(
      proofHarness.input.approval.proof,
    ) as WorldIdKitResultV4;
    const proofResponse = substitutedProof.responses[0];
    if (proofResponse === undefined) {
      throw new Error('Synthetic World proof must have one response.');
    }
    proofResponse.signal_hash = `0x${'0'.repeat(64)}`;
    await expect(
      verifyAndProjectWorldAuthority(
        {
          ...proofHarness.input,
          approval: {
            ...proofHarness.input.approval,
            proof: substitutedProof,
          },
        },
        proofHarness.dependencies,
      ),
    ).resolves.toEqual({
      ok: false,
      reason: 'WORLD_PROOF_MISMATCH',
    });
    expect(proofHarness.verifyWorldProof).not.toHaveBeenCalled();

    const backingHarness = createHarness();
    const substitutedBackingDependencies = {
      ...backingHarness.dependencies,
      resolveAgentBookBacking: vi.fn(async (claim: VerifiedAgentkitClaim) => ({
        agentAddress: claim.agentAddress,
        backingRecordId: 'agentbook-record:substituted',
        expiresAt: BACKING_EXPIRES_AT,
        humanId: '0xdeadbeef',
        status: 'backed' as const,
        verifiedAt: '2026-07-25T10:00:20.000Z',
      })),
    };
    await expect(
      verifyAndProjectWorldAuthority(
        backingHarness.input,
        substitutedBackingDependencies,
      ),
    ).resolves.toEqual({
      ok: false,
      reason: 'AGENTBOOK_BACKING_MISMATCH',
    });

    const roleHarness = createHarness();
    const substitutedRoleDependencies = {
      ...roleHarness.dependencies,
      resolveCompanyAuthority: vi.fn(
        async (requirement: WorldCompanyAuthorityRequirement) => ({
          authority: authorityFor(requirement, {
            subjectId: 'subject:substituted',
          }),
          status: 'valid' as const,
        }),
      ),
    };
    await expect(
      verifyAndProjectWorldAuthority(
        roleHarness.input,
        substitutedRoleDependencies,
      ),
    ).resolves.toEqual({
      ok: false,
      reason: 'AUTHORITY_MISMATCH',
    });
  });

  it('accepts no truthy verification shortcut or caller-selected expiry', async () => {
    const malformedVerification = createHarness();
    const malformedVerificationDependencies = {
      ...malformedVerification.dependencies,
      verifyWorldProof: vi.fn(async () => ({
        status: 'verified' as const,
        trusted: true,
      })),
    };
    await expect(
      verifyAndProjectWorldAuthority(
        malformedVerification.input,
        malformedVerificationDependencies,
      ),
    ).resolves.toEqual({
      ok: false,
      reason: 'WORLD_PROOF_INVALID',
    });

    const projection = await requireProjection();
    expect(projection.approvalFact.expiresAt).toBe(
      APPROVAL_AUTHORITY_EXPIRES_AT,
    );
    expect(projection.requesterFact.expiresAt).toBe(
      REQUESTER_AUTHORITY_EXPIRES_AT,
    );
    expect(Date.parse(projection.approvalFact.expiresAt)).toBeLessThan(
      SESSION_EXPIRES_AT.getTime(),
    );
  });
});
