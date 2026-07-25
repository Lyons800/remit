import {
  actionFactBinding,
  createAdapterVerifiedApprovalFact,
  createRequestingAgentExecutionFact,
  type AdapterVerifiedApprovalFact,
  type RequestingAgentExecutionFact,
} from '@invoiceguard/domain';
import {
  verifyAuthorizationBundle,
  type AuthorizationBundleV1,
} from '@invoiceguard/protocol/hashing';

import type { VersionedScopedWorldPrincipal } from './privacy.js';

export const WORLD_APPROVAL_ADAPTER_ID = 'world-approval-adapter' as const;

const WORLD_PRINCIPAL_PATTERN = /^hmac-sha256:[A-Za-z0-9_-]{43}$/u;
const WORLD_PRINCIPAL_VERSION_PATTERN = /^v[1-9][0-9]{0,8}$/u;

export type VerifiedWorldApprovalEvidence = Readonly<{
  actionHumanPrincipal: string;
  agentBackingRecordId: string;
  agentKitChallengeId: string;
  agentTenantPrincipal: string;
  approvalId: string;
  approvalSessionId: string;
  consumptionClaimId: string;
  decisionId: string;
  expiresAt: string;
  role: string;
  roleCredentialId: string;
  signedProofDigest: string;
  subjectId: string;
  verifiedAt: string;
  worldProofId: string;
}>;

export type VerifiedWorldExecutorEvidence = Readonly<{
  actionHumanPrincipal: string;
  agentBackingRecordId: string;
  agentId: string;
  agentKitChallengeId: string;
  agentTenantPrincipal: string;
  expiresAt: string;
  factId: string;
  roleCredentialId: string;
  signedProofDigest: string;
  verifiedAt: string;
}>;

export type WorldApprovalIdentityClaims = Readonly<{
  actionDigest: string;
  actionHumanPrincipals: readonly VersionedScopedWorldPrincipal[];
  agentKitChallengeId: string;
  agentTenantPrincipals: readonly VersionedScopedWorldPrincipal[];
  approvalId: string;
  approvalSessionId: string;
  consumptionClaimId: string;
  decisionId: string;
  organizationId: string;
  subjectId: string;
  worldProofId: string;
}>;

function requireVerifiedBundle(
  input: AuthorizationBundleV1,
): AuthorizationBundleV1 {
  return verifyAuthorizationBundle(input);
}

function requireCurrentWindow(
  verifiedAt: string,
  expiresAt: string,
  actionExpiresAt: string,
): void {
  if (verifiedAt >= expiresAt || expiresAt > actionExpiresAt) {
    throw new Error(
      'World authority validity must be non-empty and cannot outlive the action.',
    );
  }
}

function requireHumanApprovalRoute(
  authorization: AuthorizationBundleV1,
  role: string,
): void {
  if (
    authorization.decision.route !== 'HUMAN_APPROVAL' ||
    !authorization.decision.requiredAuthority.roles.some(
      (requirement) => requirement.role === role,
    )
  ) {
    throw new Error(
      'World approval role must be required by the frozen human-approval policy.',
    );
  }
}

export function createWorldApprovalFact(
  authorizationInput: AuthorizationBundleV1,
  evidence: VerifiedWorldApprovalEvidence,
): AdapterVerifiedApprovalFact {
  const authorization = requireVerifiedBundle(authorizationInput);
  requireHumanApprovalRoute(authorization, evidence.role);
  requireCurrentWindow(
    evidence.verifiedAt,
    evidence.expiresAt,
    authorization.actionCore.expiresAt,
  );

  return createAdapterVerifiedApprovalFact({
    ...actionFactBinding(authorization),
    actionHumanPrincipal: evidence.actionHumanPrincipal,
    adapterId: WORLD_APPROVAL_ADAPTER_ID,
    agentBackingRecordId: evidence.agentBackingRecordId,
    agentBackingStatus: 'CURRENT',
    agentKitChallengeId: evidence.agentKitChallengeId,
    agentTenantPrincipal: evidence.agentTenantPrincipal,
    approvalId: evidence.approvalId,
    approvalSessionId: evidence.approvalSessionId,
    companyRoleStatus: 'CURRENT',
    consumptionClaimId: evidence.consumptionClaimId,
    decision: 'APPROVE',
    decisionId: evidence.decisionId,
    expiresAt: evidence.expiresAt,
    humanDecisionStatus: 'VERIFIED',
    kind: 'APPROVAL_FACT',
    role: evidence.role,
    roleCredentialId: evidence.roleCredentialId,
    signedProofDigest: evidence.signedProofDigest,
    subjectId: evidence.subjectId,
    verifiedAt: evidence.verifiedAt,
    worldProofId: evidence.worldProofId,
  });
}

export function createWorldRequestingAgentExecutionFact(
  authorizationInput: AuthorizationBundleV1,
  evidence: VerifiedWorldExecutorEvidence,
): RequestingAgentExecutionFact {
  const authorization = requireVerifiedBundle(authorizationInput);
  const required = authorization.decision.requiredExecutor;
  requireCurrentWindow(
    evidence.verifiedAt,
    evidence.expiresAt,
    authorization.actionCore.expiresAt,
  );

  return createRequestingAgentExecutionFact(authorization, {
    actionHumanPrincipal: evidence.actionHumanPrincipal,
    adapterId: required.adapterId,
    agentBackingRecordId: evidence.agentBackingRecordId,
    agentBookRegistry: required.agentBookRegistry,
    agentBookStatus: 'CURRENT',
    agentId: evidence.agentId,
    agentKitChallengeId: evidence.agentKitChallengeId,
    agentTenantPrincipal: evidence.agentTenantPrincipal,
    audience: required.audience,
    companyRoleStatus: 'CURRENT',
    expiresAt: evidence.expiresAt,
    factId: evidence.factId,
    grantDigest: required.grant.digest,
    grantId: required.grant.id,
    grantStatus: 'CURRENT',
    grantVersion: required.grant.version,
    role: required.requiredRole,
    roleCredentialId: evidence.roleCredentialId,
    scope: required.requiredScope,
    signedProofDigest: evidence.signedProofDigest,
    subjectId: evidence.agentId,
    tenantId: authorization.actionCore.organizationId,
    verifiedAt: evidence.verifiedAt,
  });
}

const approvalIdentityFields = [
  'actionDigest',
  'actionHumanPrincipal',
  'actionId',
  'adapterId',
  'agentBackingRecordId',
  'agentKitChallengeId',
  'agentTenantPrincipal',
  'approvalId',
  'approvalSessionId',
  'consumptionClaimId',
  'decisionId',
  'invoiceRevisionId',
  'nonce',
  'obligationId',
  'organizationId',
  'role',
  'roleCredentialId',
  'signedProofDigest',
  'subjectId',
  'worldProofId',
] as const satisfies readonly (keyof AdapterVerifiedApprovalFact)[];

const executorIdentityFields = [
  'actionDigest',
  'actionHumanPrincipal',
  'actionId',
  'adapterId',
  'agentBackingRecordId',
  'agentBookRegistry',
  'agentId',
  'agentKitChallengeId',
  'agentTenantPrincipal',
  'audience',
  'factId',
  'grantDigest',
  'grantId',
  'grantVersion',
  'invoiceRevisionId',
  'nonce',
  'obligationId',
  'organizationId',
  'role',
  'roleCredentialId',
  'scope',
  'signedProofDigest',
  'subjectId',
  'tenantId',
] as const satisfies readonly (keyof RequestingAgentExecutionFact)[];

function requireSameFields<T extends object>(
  original: T,
  refreshed: T,
  fields: readonly (keyof T)[],
  kind: string,
): void {
  if (fields.some((field) => original[field] !== refreshed[field])) {
    throw new Error(`${kind} refresh cannot substitute authority provenance.`);
  }
}

export function refreshWorldApprovalFact(
  authorization: AuthorizationBundleV1,
  original: AdapterVerifiedApprovalFact,
  evidence: VerifiedWorldApprovalEvidence,
): AdapterVerifiedApprovalFact {
  const refreshed = createWorldApprovalFact(authorization, evidence);
  requireSameFields(
    original,
    refreshed,
    approvalIdentityFields,
    'World approval',
  );
  if (
    refreshed.verifiedAt < original.verifiedAt ||
    refreshed.expiresAt > original.expiresAt
  ) {
    throw new Error(
      'World approval refresh cannot move verification backward or extend expiry.',
    );
  }
  return refreshed;
}

export function refreshWorldRequestingAgentExecutionFact(
  authorization: AuthorizationBundleV1,
  original: RequestingAgentExecutionFact,
  evidence: VerifiedWorldExecutorEvidence,
): RequestingAgentExecutionFact {
  const refreshed = createWorldRequestingAgentExecutionFact(
    authorization,
    evidence,
  );
  requireSameFields(
    original,
    refreshed,
    executorIdentityFields,
    'World executor',
  );
  if (
    refreshed.verifiedAt < original.verifiedAt ||
    refreshed.expiresAt > original.expiresAt
  ) {
    throw new Error(
      'World executor refresh cannot move verification backward or extend expiry.',
    );
  }
  return refreshed;
}

function requireAliasSet(
  aliases: readonly VersionedScopedWorldPrincipal[],
  admittedPrincipal: string,
  kind: string,
): readonly VersionedScopedWorldPrincipal[] {
  const versions = new Set(
    aliases.map(({ derivationVersion }) => derivationVersion),
  );
  const principals = new Set(aliases.map(({ principal }) => principal));
  if (
    aliases.length === 0 ||
    versions.size !== aliases.length ||
    principals.size !== aliases.length ||
    aliases.some(
      ({ derivationVersion, principal }) =>
        !WORLD_PRINCIPAL_VERSION_PATTERN.test(derivationVersion) ||
        !WORLD_PRINCIPAL_PATTERN.test(principal),
    ) ||
    !aliases.some(({ principal }) => principal === admittedPrincipal)
  ) {
    throw new Error(
      `${kind} aliases must be unique and include the admitted principal.`,
    );
  }
  return Object.freeze(aliases.map((alias) => Object.freeze({ ...alias })));
}

export function createWorldApprovalIdentityClaims(
  approval: AdapterVerifiedApprovalFact,
  input: Readonly<{
    actionHumanPrincipals: readonly VersionedScopedWorldPrincipal[];
    agentTenantPrincipals: readonly VersionedScopedWorldPrincipal[];
  }>,
): WorldApprovalIdentityClaims {
  if (approval.adapterId !== WORLD_APPROVAL_ADAPTER_ID) {
    throw new Error('World identity claims require a World approval fact.');
  }

  return Object.freeze({
    actionDigest: approval.actionDigest,
    actionHumanPrincipals: requireAliasSet(
      input.actionHumanPrincipals,
      approval.actionHumanPrincipal,
      'Action-human',
    ),
    agentKitChallengeId: approval.agentKitChallengeId,
    agentTenantPrincipals: requireAliasSet(
      input.agentTenantPrincipals,
      approval.agentTenantPrincipal,
      'AgentBook',
    ),
    approvalId: approval.approvalId,
    approvalSessionId: approval.approvalSessionId,
    consumptionClaimId: approval.consumptionClaimId,
    decisionId: approval.decisionId,
    organizationId: approval.organizationId,
    subjectId: approval.subjectId,
    worldProofId: approval.worldProofId,
  });
}
