import { accept, refuse, type DomainResult } from '../result.js';

export type ApprovalRequirement = Readonly<{
  actionHumanQuorum: number;
  agentBookQuorum: number;
  companySubjectQuorum: number;
  roles: readonly Readonly<{ count: number; role: string }>[];
}>;

export type CountableApproval = Readonly<{
  actionDigest: string;
  actionHumanPrincipal: string;
  agentTenantPrincipal: string;
  role: string;
  subjectId: string;
}>;

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateRequirement(
  requirement: ApprovalRequirement,
): DomainResult<ApprovalRequirement> {
  const quorums = [
    requirement.actionHumanQuorum,
    requirement.agentBookQuorum,
    requirement.companySubjectQuorum,
  ];
  const roles = requirement.roles.map(({ role }) => role);

  if (
    quorums.some((quorum) => !isNonNegativeInteger(quorum)) ||
    requirement.roles.some(
      ({ count, role }) =>
        !Number.isSafeInteger(count) || count <= 0 || role.length === 0,
    ) ||
    new Set(roles).size !== roles.length
  ) {
    return refuse('APPROVAL_REQUIREMENT_INVALID');
  }

  return accept(requirement);
}

export function validateApprovalQuorum(
  actionDigest: string,
  requirement: ApprovalRequirement,
  approvals: readonly CountableApproval[],
): DomainResult<readonly CountableApproval[]> {
  const validRequirement = validateRequirement(requirement);
  if (!validRequirement.ok) {
    return validRequirement;
  }

  if (approvals.some((approval) => approval.actionDigest !== actionDigest)) {
    return refuse('ACTION_DIGEST_MISMATCH');
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

  return accept(approvals);
}
