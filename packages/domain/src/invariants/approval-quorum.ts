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

export type VerifiedApprovalFact = Readonly<{
  actionDigest: string;
  actionHumanPrincipal: string;
  agentBackingStatus: 'CURRENT' | 'STALE' | 'UNVERIFIED';
  agentTenantPrincipal: string;
  companyRoleStatus: 'CURRENT' | 'EXPIRED' | 'REVOKED' | 'UNVERIFIED';
  decision: 'APPROVE';
  expiresAt: string;
  humanDecisionStatus: 'REPLAYED' | 'STALE' | 'UNVERIFIED' | 'VERIFIED';
  role: string;
  subjectId: string;
  verifiedAt: string;
}>;

const APPROVAL_KEYS = [
  'actionDigest',
  'actionHumanPrincipal',
  'agentBackingStatus',
  'agentTenantPrincipal',
  'companyRoleStatus',
  'decision',
  'expiresAt',
  'humanDecisionStatus',
  'role',
  'subjectId',
  'verifiedAt',
] as const;
const REQUIREMENT_KEYS = [
  'actionHumanQuorum',
  'agentBookQuorum',
  'companySubjectQuorum',
  'roles',
] as const;
const ROLE_REQUIREMENT_KEYS = ['count', 'role'] as const;

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function validateRequirement(
  input: unknown,
): DomainResult<ApprovalRequirement> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, REQUIREMENT_KEYS) ||
    !Array.isArray(input.roles)
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

  const roles: Readonly<{ count: number; role: string }>[] = [];
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

function parseApprovalFact(input: unknown): VerifiedApprovalFact | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, APPROVAL_KEYS) ||
    !isSha256Digest(input.actionDigest) ||
    !isNonEmptyBoundedString(input.actionHumanPrincipal) ||
    !isNonEmptyBoundedString(input.agentTenantPrincipal) ||
    !isNonEmptyBoundedString(input.role) ||
    !isNonEmptyBoundedString(input.subjectId) ||
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
    agentBackingStatus: input.agentBackingStatus,
    agentTenantPrincipal: input.agentTenantPrincipal,
    companyRoleStatus: input.companyRoleStatus,
    decision: input.decision,
    expiresAt: input.expiresAt as string,
    humanDecisionStatus: input.humanDecisionStatus,
    role: input.role,
    subjectId: input.subjectId,
    verifiedAt: input.verifiedAt as string,
  });
}

export function validateApprovalQuorum(
  actionDigest: string,
  requirementInput: unknown,
  approvalsInput: unknown,
  now: string,
): DomainResult<readonly VerifiedApprovalFact[]> {
  if (!isSha256Digest(actionDigest) || !isCanonicalUtcInstant(now)) {
    return refuse('APPROVAL_FACT_INVALID');
  }

  const validRequirement = validateRequirement(requirementInput);
  if (!validRequirement.ok) {
    return validRequirement;
  }
  const requirement = validRequirement.value;

  if (!Array.isArray(approvalsInput)) {
    return refuse('APPROVAL_FACT_INVALID');
  }

  const approvals: VerifiedApprovalFact[] = [];
  for (const input of approvalsInput) {
    const approval = parseApprovalFact(input);
    if (approval === null || approval.verifiedAt >= approval.expiresAt) {
      return refuse('APPROVAL_FACT_INVALID');
    }
    if (approval.actionDigest !== actionDigest) {
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
  if (approvals.length < requiredCount) {
    return refuse('APPROVAL_QUORUM_NOT_MET');
  }

  return accept(Object.freeze(approvals));
}
