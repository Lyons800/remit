import { describe, expect, it } from 'vitest';

import {
  actionFactBinding,
  parseAdapterVerifiedApprovalFact,
  parseRequestingAgentExecutionFact,
  validateApprovalQuorum,
} from '@invoiceguard/domain';

import {
  authorization,
  humanAuthorization,
} from '../../domain/test/fixtures/authorization.js';
import {
  createWorldApprovalFact,
  createWorldApprovalIdentityClaims,
  createWorldPrincipalKeyring,
  createWorldRequestingAgentExecutionFact,
  deriveActionHumanPrincipalAliases,
  deriveAgentTenantPrincipalAliases,
  refreshWorldApprovalFact,
  refreshWorldRequestingAgentExecutionFact,
  type ScopedWorldPrincipal,
  type VerifiedWorldApprovalEvidence,
  type VerifiedWorldExecutorEvidence,
} from '../src/index.js';

const VERIFIED_AT = '2026-07-25T10:10:00.000Z';
const REFRESHED_AT = '2026-07-25T10:20:00.000Z';
const EXPIRES_AT = '2026-07-25T10:50:00.000Z';
const SHORTER_EXPIRY = '2026-07-25T10:45:00.000Z';

function scopedPrincipal(character: string): ScopedWorldPrincipal {
  return `hmac-sha256:${character.repeat(43)}`;
}

function approvalEvidence(
  index: number,
  role: string,
  overrides: Partial<VerifiedWorldApprovalEvidence> = {},
): VerifiedWorldApprovalEvidence {
  return {
    actionHumanPrincipal: scopedPrincipal(String(index)),
    agentBackingRecordId: `agent-backing-${index}`,
    agentKitChallengeId: `agentkit-challenge-${index}`,
    agentTenantPrincipal: scopedPrincipal(
      String.fromCodePoint('A'.charCodeAt(0) + index),
    ),
    approvalId: `approval-${index}`,
    approvalSessionId: `approval-session-${index}`,
    consumptionClaimId: `approval-consumption-${index}`,
    decisionId: `decision-${index}`,
    expiresAt: EXPIRES_AT,
    role,
    roleCredentialId: `role-credential-${index}`,
    signedProofDigest: String(index).repeat(64),
    subjectId: `subject-${index}`,
    verifiedAt: VERIFIED_AT,
    worldProofId: `world-proof-${index}`,
    ...overrides,
  };
}

function executorEvidence(
  overrides: Partial<VerifiedWorldExecutorEvidence> = {},
): VerifiedWorldExecutorEvidence {
  return {
    actionHumanPrincipal: scopedPrincipal('X'),
    agentBackingRecordId: 'requesting-agent-backing-1',
    agentId: 'payment-agent-1',
    agentKitChallengeId: 'requesting-agentkit-challenge-1',
    agentTenantPrincipal: scopedPrincipal('Y'),
    expiresAt: EXPIRES_AT,
    factId: 'requesting-agent-fact-1',
    roleCredentialId: 'requesting-agent-role-credential-1',
    signedProofDigest: 'a'.repeat(64),
    verifiedAt: VERIFIED_AT,
    ...overrides,
  };
}

describe('World to AP authority facts', () => {
  it('emits the canonical AP approval and requester fact types', () => {
    const approvals = [
      createWorldApprovalFact(
        humanAuthorization,
        approvalEvidence(1, 'FINANCE_APPROVER'),
      ),
      createWorldApprovalFact(
        humanAuthorization,
        approvalEvidence(2, 'TREASURY_APPROVER'),
      ),
    ];
    for (const approval of approvals) {
      expect(parseAdapterVerifiedApprovalFact(approval)).toEqual(approval);
    }

    expect(
      validateApprovalQuorum(
        {
          ...actionFactBinding(humanAuthorization),
          minimumVerifiedAt: humanAuthorization.decision.evaluatedAt,
        },
        humanAuthorization.decision.requiredAuthority,
        approvals,
        VERIFIED_AT,
      ),
    ).toEqual({ ok: true, value: approvals });

    const requester = createWorldRequestingAgentExecutionFact(
      humanAuthorization,
      executorEvidence(),
    );
    expect(parseRequestingAgentExecutionFact(requester)).toEqual(requester);
    expect(requester).toMatchObject({
      adapterId: humanAuthorization.decision.requiredExecutor.adapterId,
      agentBookRegistry:
        humanAuthorization.decision.requiredExecutor.agentBookRegistry,
      audience: humanAuthorization.decision.requiredExecutor.audience,
      grantDigest: humanAuthorization.decision.requiredExecutor.grant.digest,
      grantId: humanAuthorization.decision.requiredExecutor.grant.id,
      grantVersion: humanAuthorization.decision.requiredExecutor.grant.version,
      role: humanAuthorization.decision.requiredExecutor.requiredRole,
      scope: humanAuthorization.decision.requiredExecutor.requiredScope,
      subjectId: 'payment-agent-1',
      tenantId: humanAuthorization.actionCore.organizationId,
    });
  });

  it('refuses non-policy approval roles, non-human routes, and invalid ceilings', () => {
    expect(() =>
      createWorldApprovalFact(
        humanAuthorization,
        approvalEvidence(1, 'UNREQUESTED_ROLE'),
      ),
    ).toThrow(/required by the frozen human-approval policy/u);
    expect(() =>
      createWorldApprovalFact(
        authorization,
        approvalEvidence(1, 'FINANCE_APPROVER'),
      ),
    ).toThrow(/required by the frozen human-approval policy/u);
    expect(() =>
      createWorldRequestingAgentExecutionFact(
        humanAuthorization,
        executorEvidence({
          expiresAt: '2026-07-25T11:00:00.001Z',
        }),
      ),
    ).toThrow(/cannot outlive the action/u);
    expect(() =>
      createWorldApprovalFact(
        humanAuthorization,
        approvalEvidence(1, 'FINANCE_APPROVER', {
          actionHumanPrincipal: 'hmac-sha256:short',
        }),
      ),
    ).toThrow(/must be a scoped World HMAC principal/u);
  });

  it('refreshes status without substituting provenance or extending validity', () => {
    const originalApproval = createWorldApprovalFact(
      humanAuthorization,
      approvalEvidence(1, 'FINANCE_APPROVER'),
    );
    expect(
      refreshWorldApprovalFact(
        humanAuthorization,
        originalApproval,
        approvalEvidence(1, 'FINANCE_APPROVER', {
          expiresAt: SHORTER_EXPIRY,
          verifiedAt: REFRESHED_AT,
        }),
      ),
    ).toMatchObject({
      approvalId: originalApproval.approvalId,
      expiresAt: SHORTER_EXPIRY,
      verifiedAt: REFRESHED_AT,
    });
    expect(() =>
      refreshWorldApprovalFact(
        humanAuthorization,
        originalApproval,
        approvalEvidence(1, 'FINANCE_APPROVER', {
          decisionId: 'substituted-decision',
          verifiedAt: REFRESHED_AT,
        }),
      ),
    ).toThrow(/cannot substitute authority provenance/u);
    expect(() =>
      refreshWorldApprovalFact(
        {
          ...humanAuthorization,
          actionCore: {
            ...humanAuthorization.actionCore,
            actionId: 'substituted-action',
          },
        },
        originalApproval,
        approvalEvidence(1, 'FINANCE_APPROVER', {
          verifiedAt: REFRESHED_AT,
        }),
      ),
    ).toThrow();
    expect(() =>
      refreshWorldApprovalFact(
        humanAuthorization,
        originalApproval,
        approvalEvidence(1, 'FINANCE_APPROVER', {
          expiresAt: '2026-07-25T10:55:00.000Z',
          verifiedAt: REFRESHED_AT,
        }),
      ),
    ).toThrow(/cannot move verification backward or extend expiry/u);

    const originalRequester = createWorldRequestingAgentExecutionFact(
      humanAuthorization,
      executorEvidence(),
    );
    expect(
      refreshWorldRequestingAgentExecutionFact(
        humanAuthorization,
        originalRequester,
        executorEvidence({
          expiresAt: SHORTER_EXPIRY,
          verifiedAt: REFRESHED_AT,
        }),
      ),
    ).toMatchObject({
      expiresAt: SHORTER_EXPIRY,
      factId: originalRequester.factId,
      verifiedAt: REFRESHED_AT,
    });
    expect(() =>
      refreshWorldRequestingAgentExecutionFact(
        humanAuthorization,
        originalRequester,
        executorEvidence({
          agentKitChallengeId: 'substituted-challenge',
          verifiedAt: REFRESHED_AT,
        }),
      ),
    ).toThrow(/cannot substitute authority provenance/u);
  });

  it('reserves every HMAC rotation alias under AP identity claims', () => {
    const keyring = createWorldPrincipalKeyring(
      { key: new Uint8Array(32).fill(1), version: 'v2' },
      [{ key: new Uint8Array(32).fill(2), version: 'v1' }],
    );
    const agentAliases = deriveAgentTenantPrincipalAliases({
      humanId: '0x1234',
      keyring,
      organizationId: humanAuthorization.actionCore.organizationId,
    });
    const humanAliases = deriveActionHumanPrincipalAliases({
      actionDigest: humanAuthorization.envelope.actionDigest,
      keyring,
      nullifier: '0x5678',
      organizationId: humanAuthorization.actionCore.organizationId,
      worldActionId: 'invoiceguard-approval-v1-test',
    });
    const currentAgentAlias = agentAliases[0];
    const currentHumanAlias = humanAliases[0];
    if (currentAgentAlias === undefined || currentHumanAlias === undefined) {
      throw new Error('Expected current World principal aliases.');
    }
    const approval = createWorldApprovalFact(
      humanAuthorization,
      approvalEvidence(1, 'FINANCE_APPROVER', {
        actionHumanPrincipal: currentHumanAlias.principal,
        agentTenantPrincipal: currentAgentAlias.principal,
      }),
    );
    const claims = createWorldApprovalIdentityClaims(approval, {
      actionHumanPrincipals: humanAliases,
      agentTenantPrincipals: agentAliases,
    });
    expect(claims.actionHumanPrincipals).toHaveLength(2);
    expect(claims.agentTenantPrincipals).toHaveLength(2);
    expect(claims).toMatchObject({
      actionDigest: humanAuthorization.envelope.actionDigest,
      agentKitChallengeId: approval.agentKitChallengeId,
      decisionId: approval.decisionId,
      worldProofId: approval.worldProofId,
    });
    expect(() =>
      createWorldApprovalIdentityClaims(approval, {
        actionHumanPrincipals: [
          humanAliases[1] as (typeof humanAliases)[number],
        ],
        agentTenantPrincipals: agentAliases,
      }),
    ).toThrow(/include the admitted principal/u);
    expect(() =>
      createWorldApprovalIdentityClaims(approval, {
        actionHumanPrincipals: [
          {
            derivationVersion: 'v2',
            principal: 'hmac-sha256:short',
          },
        ],
        agentTenantPrincipals: agentAliases,
      }),
    ).toThrow(/aliases must be unique/u);
  });
});
