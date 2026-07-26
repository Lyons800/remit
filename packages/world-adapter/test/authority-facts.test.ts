import type { IDKitResult } from '@worldcoin/idkit-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';

import { humanAuthorization } from '../../domain/test/fixtures/authorization.js';
import * as worldAdapter from '../src/index.js';
import {
  authorizeAgentkitRequest,
  createAgentkitApprovalChallenge,
  createTrustedWorldDeploymentContext,
  createWorldAuthorityAdmissionWriter,
  createWorldAuthorityCompositionPolicy,
  createWorldHumanApprovalBinding,
  createWorldPrincipalKeyring,
  createWorldProofOfHumanRequest,
  deriveAgentTenantPrincipalAliases,
  signAgentkitApprovalChallenge,
  verifyAndAdmitWorldAuthority,
  WORLD_AGENTBOOK_ADAPTER_ID,
  WORLD_AGENTBOOK_ADAPTER_VERSION,
  WORLD_AGENTBOOK_ADDRESS,
  WORLD_AGENTBOOK_BACKING_RECORD_SOURCE,
  WORLD_AGENTBOOK_CHAIN_ID,
  WORLD_AGENTBOOK_NUMERIC_CHAIN_ID,
  WORLD_AGENTBOOK_REGISTRY_ID,
  WORLD_AGENT_SIGNATURE_CHAIN_ID,
  type VerifiedAgentkitClaim,
  type VerifiedWorldAuthorityAdmissionBundle,
  type VerifiedWorldCompanyAuthority,
  type WorldAuthorityAdmissionDependencies,
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
const compositionPolicy = createWorldAuthorityCompositionPolicy(deployment);
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

function backingForClaim(
  claim: VerifiedAgentkitClaim,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    agentBookAdapterId: WORLD_AGENTBOOK_ADAPTER_ID,
    agentBookAdapterVersion: WORLD_AGENTBOOK_ADAPTER_VERSION,
    agentAddress: claim.agentAddress,
    backingRecordId: `agentbook-record:${claim.agentAddress}`,
    backingRecordSource: WORLD_AGENTBOOK_BACKING_RECORD_SOURCE,
    expiresAt: BACKING_EXPIRES_AT,
    humanId: humanIdForClaim(claim),
    observedNetworkId: WORLD_AGENTBOOK_CHAIN_ID,
    observedNumericChainId: WORLD_AGENTBOOK_NUMERIC_CHAIN_ID,
    registryAddress: WORLD_AGENTBOOK_ADDRESS,
    registryId: WORLD_AGENTBOOK_REGISTRY_ID,
    status: 'backed' as const,
    verifiedAt: '2026-07-25T10:00:20.000Z',
    ...overrides,
  };
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
  const resolveAgentBookBacking = vi.fn(async (claim: VerifiedAgentkitClaim) =>
    backingForClaim(claim),
  );
  const resolveCompanyAuthority = vi.fn(
    async (requirement: WorldCompanyAuthorityRequirement) => ({
      authority: authorityFor(requirement),
      status: 'valid' as const,
    }),
  );
  let admittedBundle: VerifiedWorldAuthorityAdmissionBundle | null = null;
  const writeAtomically = vi.fn(
    async (bundle: VerifiedWorldAuthorityAdmissionBundle) => {
      admittedBundle = bundle;
      return {
        atomicGroupId: `world-authority:${bundle.bundleDigest}`,
        bundleDigest: bundle.bundleDigest,
        committedAt: NOW.toISOString(),
        status: 'committed' as const,
        writerId: 'synthetic-world-authority-writer',
      };
    },
  );
  const admissionWriter = createWorldAuthorityAdmissionWriter({
    writeAtomically,
    writerId: 'synthetic-world-authority-writer',
  });
  const dependencies: WorldAuthorityAdmissionDependencies = {
    admissionWriter,
    compositionPolicy,
    principalKeyring: keyring,
    resolveAgentBookBacking,
    resolveCompanyAuthority,
    verifyWorldProof,
  };
  return {
    admittedBundle: () => admittedBundle,
    admissionWriter,
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
    writeAtomically,
  };
}

async function requireAdmission(harness = createHarness()) {
  const result = await verifyAndAdmitWorldAuthority(
    harness.input,
    harness.dependencies,
  );
  if (!result.ok) {
    throw new Error(`Synthetic admission failed: ${result.reason}.`);
  }
  const bundle = harness.admittedBundle();
  if (bundle === null) {
    throw new Error('Synthetic admission did not receive its complete bundle.');
  }
  return { admission: result.admission, bundle };
}

describe('World authority admission boundary', () => {
  it('exposes one mandatory admission path and no loose World projection API', () => {
    expect('verifyAndAdmitWorldAuthority' in worldAdapter).toBe(true);
    expect('verifyAndProjectWorldAuthority' in worldAdapter).toBe(false);
    expect('createWorldApprovalFact' in worldAdapter).toBe(false);
    expect('createWorldRequestingAgentExecutionFact' in worldAdapter).toBe(
      false,
    );
    expect('createWorldApprovalIdentityClaims' in worldAdapter).toBe(false);
    expect('refreshWorldApprovalFact' in worldAdapter).toBe(false);
  });

  it('passes one complete digest-bound bundle to the admission writer', async () => {
    const harness = createHarness();
    const { admission, bundle } = await requireAdmission(harness);

    expect(harness.writeAtomically).toHaveBeenCalledExactlyOnceWith(bundle);
    expect(admission.bundleDigest).toBe(bundle.bundleDigest);
    expect(bundle.bundleDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(bundle.compositionPolicyId).toBe(compositionPolicy.policyId);
    expect(bundle.worldDeploymentId).toBe(deployment.deploymentId);
    expect(bundle.approvalFact).toMatchObject({
      agentBackingStatus: 'CURRENT',
      companyRoleStatus: 'CURRENT',
      expiresAt: APPROVAL_AUTHORITY_EXPIRES_AT,
      humanDecisionStatus: 'VERIFIED',
    });
    expect(bundle.requesterFact).toMatchObject({
      adapterId: humanAuthorization.decision.requiredExecutor.adapterId,
      agentBookStatus: 'CURRENT',
      companyRoleStatus: 'CURRENT',
      expiresAt: REQUESTER_AUTHORITY_EXPIRES_AT,
      grantStatus: 'CURRENT',
    });
    expect(Reflect.ownKeys(bundle).some((key) => typeof key === 'symbol')).toBe(
      true,
    );
  });

  it('makes every current and overlap alias part of the admitted bundle', async () => {
    const harness = createHarness();
    const { bundle } = await requireAdmission(harness);

    expect(bundle.identityClaims.approval.actionHumanPrincipals).toHaveLength(
      2,
    );
    expect(bundle.identityClaims.approval.agentTenantPrincipals).toHaveLength(
      2,
    );
    expect(bundle.identityClaims.requester.agentTenantPrincipals).toHaveLength(
      2,
    );
    expect(
      bundle.identityClaims.approval.actionHumanPrincipals.map(
        ({ derivationVersion }) => derivationVersion,
      ),
    ).toEqual(['v2', 'v1']);

    const forgedInput = {
      ...harness.input,
      approval: {
        ...harness.input.approval,
        actionHumanPrincipals:
          bundle.identityClaims.approval.actionHumanPrincipals.slice(0, 1),
        agentTenantPrincipals:
          bundle.identityClaims.approval.agentTenantPrincipals.slice(0, 1),
      },
    };
    await expect(
      verifyAndAdmitWorldAuthority(
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
      verifyAndAdmitWorldAuthority(
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
      verifyAndAdmitWorldAuthority(
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
      verifyAndAdmitWorldAuthority(
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
      resolveAgentBookBacking: vi.fn(async (claim: VerifiedAgentkitClaim) =>
        backingForClaim(claim, {
          backingRecordId: 'agentbook-record:substituted',
          humanId: '0xdeadbeef',
        }),
      ),
    };
    await expect(
      verifyAndAdmitWorldAuthority(
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
      verifyAndAdmitWorldAuthority(
        roleHarness.input,
        substitutedRoleDependencies,
      ),
    ).resolves.toEqual({
      ok: false,
      reason: 'AUTHORITY_MISMATCH',
    });
  });

  it.each([
    ['numeric chain', { observedNumericChainId: 296 }],
    ['network', { observedNetworkId: 'eip155:296' }],
    ['registry ID', { registryId: 'world-agentbook:eip155:296' }],
    ['registry contract', { registryAddress: requesterAccount.address }],
    ['adapter ID', { agentBookAdapterId: 'substituted-agentbook-adapter' }],
    ['adapter version', { agentBookAdapterVersion: '2' }],
    ['backing record source', { backingRecordSource: 'substituted:lookup' }],
  ] as const)(
    'rejects substituted AgentBook %s before CURRENT admission',
    async (_label, provenanceOverride) => {
      const harness = createHarness();
      const dependencies = {
        ...harness.dependencies,
        resolveAgentBookBacking: vi.fn(async (claim: VerifiedAgentkitClaim) =>
          backingForClaim(claim, provenanceOverride),
        ),
      };

      await expect(
        verifyAndAdmitWorldAuthority(harness.input, dependencies),
      ).resolves.toEqual({
        ok: false,
        reason: 'AGENTBOOK_PROVENANCE_MISMATCH',
      });
      expect(harness.writeAtomically).not.toHaveBeenCalled();
    },
  );

  it('rejects serialized policies and whole deployment/RP substitution', async () => {
    const harness = createHarness();
    const alternateDeployment = createTrustedWorldDeploymentContext({
      appId: 'app_substituted',
      environment: 'production',
      mode: 'live',
      rpId: 'rp_substituted',
    });
    const alternateRequest = createWorldProofOfHumanRequest({
      binding: harness.request.binding,
      deployment: alternateDeployment,
      rpContext: {
        created_at: ISSUED_AT.getTime() / 1_000,
        expires_at: RP_EXPIRES_AT.getTime() / 1_000,
        nonce: 'rp-substituted-boundary',
        rp_id: alternateDeployment.rpId,
        signature: '0xsubstituted-rp-signature',
      },
    });
    const substitutedPolicy = {
      ...compositionPolicy,
      worldDeployment: alternateDeployment,
      worldDeploymentId: alternateDeployment.deploymentId,
    };
    const substitutedInput = {
      ...harness.input,
      approval: {
        ...harness.input.approval,
        proof: createProof(alternateRequest),
        request: alternateRequest,
      },
    };

    await expect(
      verifyAndAdmitWorldAuthority(substitutedInput, {
        ...harness.dependencies,
        compositionPolicy:
          substitutedPolicy as typeof harness.dependencies.compositionPolicy,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'COMPOSITION_POLICY_INVALID',
    });
    await expect(
      verifyAndAdmitWorldAuthority(substitutedInput, harness.dependencies),
    ).resolves.toEqual({
      ok: false,
      reason: 'REQUEST_INVALID',
    });
    await expect(
      verifyAndAdmitWorldAuthority(harness.input, {
        ...harness.dependencies,
        compositionPolicy: structuredClone(
          compositionPolicy,
        ) as typeof compositionPolicy,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'COMPOSITION_POLICY_INVALID',
    });
    expect(harness.verifyWorldProof).not.toHaveBeenCalled();
    expect(harness.writeAtomically).not.toHaveBeenCalled();
  });

  it('rejects serialized bundles and any identity-claim omission at the writer capability', async () => {
    const harness = createHarness();
    const { bundle } = await requireAdmission(harness);
    const serialized = structuredClone(
      bundle,
    ) as VerifiedWorldAuthorityAdmissionBundle;
    const omittedRequesterClaims = {
      ...bundle,
      identityClaims: {
        actionDigest: bundle.identityClaims.actionDigest,
        approval: bundle.identityClaims.approval,
        compositionPolicyId: bundle.identityClaims.compositionPolicyId,
        organizationId: bundle.identityClaims.organizationId,
        worldDeploymentId: bundle.identityClaims.worldDeploymentId,
      },
    } as unknown as VerifiedWorldAuthorityAdmissionBundle;
    const truncatedApprovalAliases = {
      ...bundle,
      identityClaims: {
        ...bundle.identityClaims,
        approval: {
          ...bundle.identityClaims.approval,
          agentTenantPrincipals:
            bundle.identityClaims.approval.agentTenantPrincipals.slice(0, 1),
        },
      },
    } as VerifiedWorldAuthorityAdmissionBundle;

    await expect(harness.admissionWriter.admit(serialized)).resolves.toEqual({
      reason: 'BUNDLE_INVALID',
      status: 'rejected',
    });
    await expect(
      harness.admissionWriter.admit(omittedRequesterClaims),
    ).resolves.toEqual({
      reason: 'BUNDLE_INVALID',
      status: 'rejected',
    });
    await expect(
      harness.admissionWriter.admit(truncatedApprovalAliases),
    ).resolves.toEqual({
      reason: 'BUNDLE_INVALID',
      status: 'rejected',
    });
    expect(harness.writeAtomically).toHaveBeenCalledOnce();
  });

  it('requires the configured admission-writer capability', async () => {
    const harness = createHarness();
    const structuralWriter = { ...harness.admissionWriter };

    await expect(
      verifyAndAdmitWorldAuthority(harness.input, {
        ...harness.dependencies,
        admissionWriter:
          structuralWriter as typeof harness.dependencies.admissionWriter,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'ADMISSION_WRITER_INVALID',
    });
    expect(harness.writeAtomically).not.toHaveBeenCalled();
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
      verifyAndAdmitWorldAuthority(
        malformedVerification.input,
        malformedVerificationDependencies,
      ),
    ).resolves.toEqual({
      ok: false,
      reason: 'WORLD_PROOF_INVALID',
    });

    const { bundle } = await requireAdmission();
    expect(bundle.approvalFact.expiresAt).toBe(APPROVAL_AUTHORITY_EXPIRES_AT);
    expect(bundle.requesterFact.expiresAt).toBe(REQUESTER_AUTHORITY_EXPIRES_AT);
    expect(Date.parse(bundle.approvalFact.expiresAt)).toBeLessThan(
      SESSION_EXPIRES_AT.getTime(),
    );
  });
});
