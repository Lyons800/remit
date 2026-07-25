import {
  createAdapterRecord,
  hasExactKeys,
  hasValidAdapterRecordDigest,
} from '../facts/adapter-record.js';
import { accept, refuse, type DomainResult } from '../result.js';
import { isCanonicalUtcInstant } from '../state/temporal.js';
import {
  isNonEmptyBoundedString,
  isRecord,
  isSha256Digest,
} from '../values/validation.js';

export type ApprovalRequirement = Readonly<{
  actionHumanQuorum: number;
  agentBookQuorum: number;
  companySubjectQuorum: number;
  roles: readonly Readonly<{ count: number; role: string }>[];
}>;

export type ApprovalBinding = Readonly<{
  actionDigest: string;
  actionId: string;
  invoiceRevisionId: string;
  minimumVerifiedAt: string;
  nonce: string;
  obligationId: string;
  organizationId: string;
}>;

export type AdapterVerifiedApprovalFactCore = Readonly<{
  actionDigest: string;
  actionHumanPrincipal: string;
  actionId: string;
  adapterId: string;
  agentBackingRecordId: string;
  agentBackingStatus: 'CURRENT' | 'STALE' | 'UNVERIFIED';
  agentTenantPrincipal: string;
  agentKitChallengeId: string;
  approvalId: string;
  approvalSessionId: string;
  companyRoleStatus: 'CURRENT' | 'EXPIRED' | 'REVOKED' | 'UNVERIFIED';
  consumptionClaimId: string;
  decision: 'APPROVE';
  decisionId: string;
  expiresAt: string;
  humanDecisionStatus: 'REPLAYED' | 'STALE' | 'UNVERIFIED' | 'VERIFIED';
  invoiceRevisionId: string;
  kind: 'APPROVAL_FACT';
  nonce: string;
  obligationId: string;
  organizationId: string;
  role: string;
  roleCredentialId: string;
  signedProofDigest: string;
  subjectId: string;
  verifiedAt: string;
  worldProofId: string;
}>;

export type AdapterVerifiedApprovalFact = Readonly<
  AdapterVerifiedApprovalFactCore & { recordDigest: string }
>;

const APPROVAL_KEYS = [
  'actionDigest',
  'actionHumanPrincipal',
  'actionId',
  'adapterId',
  'agentBackingRecordId',
  'agentBackingStatus',
  'agentTenantPrincipal',
  'agentKitChallengeId',
  'approvalId',
  'approvalSessionId',
  'companyRoleStatus',
  'consumptionClaimId',
  'decision',
  'decisionId',
  'expiresAt',
  'humanDecisionStatus',
  'invoiceRevisionId',
  'kind',
  'nonce',
  'obligationId',
  'organizationId',
  'recordDigest',
  'role',
  'roleCredentialId',
  'signedProofDigest',
  'subjectId',
  'verifiedAt',
  'worldProofId',
] as const;
const REQUIREMENT_KEYS = [
  'actionHumanQuorum',
  'agentBookQuorum',
  'companySubjectQuorum',
  'roles',
] as const;
const ROLE_REQUIREMENT_KEYS = ['count', 'role'] as const;
const BINDING_KEYS = [
  'actionDigest',
  'actionId',
  'invoiceRevisionId',
  'minimumVerifiedAt',
  'nonce',
  'obligationId',
  'organizationId',
] as const;

function validateRequirement(
  input: unknown,
): DomainResult<ApprovalRequirement> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, REQUIREMENT_KEYS) ||
    !Array.isArray(input.roles) ||
    input.roles.length > 255
  ) {
    return refuse('APPROVAL_REQUIREMENT_INVALID');
  }

  const quorums = [
    input.actionHumanQuorum,
    input.agentBookQuorum,
    input.companySubjectQuorum,
  ];
  if (
    quorums.some(
      (quorum) =>
        typeof quorum !== 'number' ||
        !Number.isSafeInteger(quorum) ||
        quorum < 0 ||
        quorum > 255,
    )
  ) {
    return refuse('APPROVAL_REQUIREMENT_INVALID');
  }

  const roles: { count: number; role: string }[] = [];
  for (const candidate of input.roles) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ROLE_REQUIREMENT_KEYS) ||
      typeof candidate.count !== 'number' ||
      !Number.isSafeInteger(candidate.count) ||
      candidate.count <= 0 ||
      candidate.count > 255 ||
      !isNonEmptyBoundedString(candidate.role)
    ) {
      return refuse('APPROVAL_REQUIREMENT_INVALID');
    }
    roles.push(Object.freeze({ count: candidate.count, role: candidate.role }));
  }

  const roleNames = roles.map(({ role }) => role);
  if (new Set(roleNames).size !== roleNames.length) {
    return refuse('APPROVAL_REQUIREMENT_INVALID');
  }

  return accept(
    Object.freeze({
      actionHumanQuorum: input.actionHumanQuorum as number,
      agentBookQuorum: input.agentBookQuorum as number,
      companySubjectQuorum: input.companySubjectQuorum as number,
      roles: Object.freeze(roles),
    }),
  );
}

function parseBinding(input: unknown): ApprovalBinding | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, BINDING_KEYS) ||
    !isSha256Digest(input.actionDigest) ||
    !isNonEmptyBoundedString(input.actionId) ||
    !isNonEmptyBoundedString(input.invoiceRevisionId) ||
    !isCanonicalUtcInstant(
      typeof input.minimumVerifiedAt === 'string'
        ? input.minimumVerifiedAt
        : '',
    ) ||
    !isNonEmptyBoundedString(input.nonce) ||
    !isNonEmptyBoundedString(input.obligationId) ||
    !isNonEmptyBoundedString(input.organizationId)
  ) {
    return null;
  }
  return Object.freeze({
    actionDigest: input.actionDigest,
    actionId: input.actionId,
    invoiceRevisionId: input.invoiceRevisionId,
    minimumVerifiedAt: input.minimumVerifiedAt as string,
    nonce: input.nonce,
    obligationId: input.obligationId,
    organizationId: input.organizationId,
  });
}

function parseApprovalCore(
  input: unknown,
): AdapterVerifiedApprovalFactCore | null {
  if (
    !isRecord(input) ||
    input.kind !== 'APPROVAL_FACT' ||
    !isSha256Digest(input.actionDigest) ||
    !isNonEmptyBoundedString(input.actionHumanPrincipal) ||
    !isNonEmptyBoundedString(input.actionId) ||
    !isNonEmptyBoundedString(input.adapterId) ||
    !isNonEmptyBoundedString(input.agentBackingRecordId) ||
    !isNonEmptyBoundedString(input.agentTenantPrincipal) ||
    !isNonEmptyBoundedString(input.agentKitChallengeId) ||
    !isNonEmptyBoundedString(input.approvalId) ||
    !isNonEmptyBoundedString(input.approvalSessionId) ||
    !isNonEmptyBoundedString(input.consumptionClaimId) ||
    !isNonEmptyBoundedString(input.decisionId) ||
    !isNonEmptyBoundedString(input.invoiceRevisionId) ||
    !isNonEmptyBoundedString(input.nonce) ||
    !isNonEmptyBoundedString(input.obligationId) ||
    !isNonEmptyBoundedString(input.organizationId) ||
    !isNonEmptyBoundedString(input.role) ||
    !isNonEmptyBoundedString(input.roleCredentialId) ||
    !isSha256Digest(input.signedProofDigest) ||
    !isNonEmptyBoundedString(input.subjectId) ||
    !isNonEmptyBoundedString(input.worldProofId) ||
    !isCanonicalUtcInstant(
      typeof input.verifiedAt === 'string' ? input.verifiedAt : '',
    ) ||
    !isCanonicalUtcInstant(
      typeof input.expiresAt === 'string' ? input.expiresAt : '',
    ) ||
    input.decision !== 'APPROVE' ||
    (input.companyRoleStatus !== 'CURRENT' &&
      input.companyRoleStatus !== 'EXPIRED' &&
      input.companyRoleStatus !== 'REVOKED' &&
      input.companyRoleStatus !== 'UNVERIFIED') ||
    (input.agentBackingStatus !== 'CURRENT' &&
      input.agentBackingStatus !== 'STALE' &&
      input.agentBackingStatus !== 'UNVERIFIED') ||
    (input.humanDecisionStatus !== 'VERIFIED' &&
      input.humanDecisionStatus !== 'STALE' &&
      input.humanDecisionStatus !== 'UNVERIFIED' &&
      input.humanDecisionStatus !== 'REPLAYED')
  ) {
    return null;
  }

  return Object.freeze({
    actionDigest: input.actionDigest,
    actionHumanPrincipal: input.actionHumanPrincipal,
    actionId: input.actionId,
    adapterId: input.adapterId,
    agentBackingRecordId: input.agentBackingRecordId,
    agentBackingStatus: input.agentBackingStatus,
    agentTenantPrincipal: input.agentTenantPrincipal,
    agentKitChallengeId: input.agentKitChallengeId,
    approvalId: input.approvalId,
    approvalSessionId: input.approvalSessionId,
    companyRoleStatus: input.companyRoleStatus,
    consumptionClaimId: input.consumptionClaimId,
    decision: input.decision,
    decisionId: input.decisionId,
    expiresAt: input.expiresAt as string,
    humanDecisionStatus: input.humanDecisionStatus,
    invoiceRevisionId: input.invoiceRevisionId,
    kind: input.kind,
    nonce: input.nonce,
    obligationId: input.obligationId,
    organizationId: input.organizationId,
    role: input.role,
    roleCredentialId: input.roleCredentialId,
    signedProofDigest: input.signedProofDigest,
    subjectId: input.subjectId,
    verifiedAt: input.verifiedAt as string,
    worldProofId: input.worldProofId,
  });
}

export function createAdapterVerifiedApprovalFact(
  coreInput: AdapterVerifiedApprovalFactCore,
): AdapterVerifiedApprovalFact {
  const core = parseApprovalCore(coreInput);
  if (core === null) {
    throw new Error('Invalid adapter-verified approval fact core.');
  }
  return createAdapterRecord('APPROVAL_FACT', core);
}

export function parseAdapterVerifiedApprovalFact(
  input: unknown,
): AdapterVerifiedApprovalFact | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, APPROVAL_KEYS) ||
    !hasValidAdapterRecordDigest(input, 'APPROVAL_FACT')
  ) {
    return null;
  }
  const { recordDigest, ...candidateCore } = input;
  const core = parseApprovalCore(candidateCore);
  return core === null
    ? null
    : Object.freeze({ ...core, recordDigest: recordDigest as string });
}

function matchesBinding(
  fact: AdapterVerifiedApprovalFact,
  binding: ApprovalBinding,
): boolean {
  return (
    fact.actionDigest === binding.actionDigest &&
    fact.actionId === binding.actionId &&
    fact.organizationId === binding.organizationId &&
    fact.obligationId === binding.obligationId &&
    fact.invoiceRevisionId === binding.invoiceRevisionId &&
    fact.nonce === binding.nonce
  );
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export function validateApprovalQuorum(
  bindingInput: unknown,
  requirementInput: unknown,
  approvalsInput: unknown,
  now: string,
): DomainResult<readonly AdapterVerifiedApprovalFact[]> {
  const binding = parseBinding(bindingInput);
  if (binding === null || !isCanonicalUtcInstant(now)) {
    return refuse('APPROVAL_FACT_INVALID');
  }

  const validRequirement = validateRequirement(requirementInput);
  if (!validRequirement.ok) {
    return validRequirement;
  }
  const requirement = validRequirement.value;

  if (!Array.isArray(approvalsInput) || approvalsInput.length > 255) {
    return refuse('APPROVAL_FACT_INVALID');
  }

  const approvals: AdapterVerifiedApprovalFact[] = [];
  for (const input of approvalsInput) {
    const approval = parseAdapterVerifiedApprovalFact(input);
    if (
      approval === null ||
      approval.verifiedAt >= approval.expiresAt ||
      approval.verifiedAt < binding.minimumVerifiedAt
    ) {
      return refuse('APPROVAL_FACT_INVALID');
    }
    if (!matchesBinding(approval, binding)) {
      return refuse('ACTION_DIGEST_MISMATCH');
    }
    if (approval.companyRoleStatus === 'EXPIRED') {
      return refuse('ROLE_EXPIRED');
    }
    if (approval.companyRoleStatus === 'REVOKED') {
      return refuse('ROLE_REVOKED');
    }
    if (approval.companyRoleStatus === 'UNVERIFIED') {
      return refuse('ROLE_UNVERIFIED');
    }
    if (approval.agentBackingStatus !== 'CURRENT') {
      return refuse('AGENT_BACKING_UNVERIFIED');
    }
    if (approval.humanDecisionStatus === 'REPLAYED') {
      return refuse('REPLAY_DETECTED');
    }
    if (approval.humanDecisionStatus !== 'VERIFIED') {
      return refuse('HUMAN_DECISION_UNVERIFIED');
    }
    if (approval.verifiedAt > now || now >= approval.expiresAt) {
      return refuse('APPROVAL_STALE');
    }
    approvals.push(approval);
  }

  if (
    hasDuplicate(approvals.map(({ approvalId }) => approvalId)) ||
    hasDuplicate(approvals.map(({ approvalSessionId }) => approvalSessionId)) ||
    hasDuplicate(approvals.map(({ worldProofId }) => worldProofId)) ||
    hasDuplicate(
      approvals.map(({ agentKitChallengeId }) => agentKitChallengeId),
    ) ||
    hasDuplicate(approvals.map(({ decisionId }) => decisionId)) ||
    hasDuplicate(approvals.map(({ consumptionClaimId }) => consumptionClaimId))
  ) {
    return refuse('REPLAY_DETECTED');
  }

  const requiredRoles = new Set(requirement.roles.map(({ role }) => role));
  if (approvals.some(({ role }) => !requiredRoles.has(role))) {
    return refuse('ROLE_UNEXPECTED');
  }

  const distinctSubjects = new Set(approvals.map(({ subjectId }) => subjectId));
  if (distinctSubjects.size !== approvals.length) {
    return refuse('SUBJECT_NOT_DISTINCT');
  }

  const distinctAgents = new Set(
    approvals.map(({ agentTenantPrincipal }) => agentTenantPrincipal),
  );
  if (distinctAgents.size !== approvals.length) {
    return refuse('AGENT_PRINCIPAL_NOT_DISTINCT');
  }

  const distinctActionHumans = new Set(
    approvals.map(({ actionHumanPrincipal }) => actionHumanPrincipal),
  );
  if (distinctActionHumans.size !== approvals.length) {
    return refuse('ACTION_HUMAN_NOT_DISTINCT');
  }

  const roleCounts = new Map<string, number>();
  for (const approval of approvals) {
    roleCounts.set(approval.role, (roleCounts.get(approval.role) ?? 0) + 1);
  }

  for (const role of requirement.roles) {
    if ((roleCounts.get(role.role) ?? 0) < role.count) {
      return refuse('ROLE_MISSING');
    }
  }

  if (distinctSubjects.size < requirement.companySubjectQuorum) {
    return refuse('SUBJECT_NOT_DISTINCT');
  }
  if (distinctAgents.size < requirement.agentBookQuorum) {
    return refuse('AGENT_PRINCIPAL_NOT_DISTINCT');
  }
  if (distinctActionHumans.size < requirement.actionHumanQuorum) {
    return refuse('ACTION_HUMAN_NOT_DISTINCT');
  }

  const requiredCount = requirement.roles.reduce(
    (count, role) => count + role.count,
    0,
  );
  if (approvals.length !== requiredCount) {
    return refuse('APPROVAL_QUORUM_NOT_MET');
  }

  return accept(Object.freeze(approvals));
}
