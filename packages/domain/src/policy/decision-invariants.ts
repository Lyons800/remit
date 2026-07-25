import {
  isBlockReason,
  isHumanReviewReason,
  type PolicyReasonCode,
} from './reason-codes.js';
import type { PolicyRoute, VerificationMode } from './routes.js';
import { accept, refuse, type DomainResult } from '../result.js';

export type PolicyDecisionFacts = Readonly<{
  hasStandingMandate: boolean;
  reasonCodes: readonly PolicyReasonCode[];
  requiredAuthority: Readonly<{
    actionHumanQuorum: number;
    agentBookQuorum: number;
    companySubjectQuorum: number;
    roles: readonly Readonly<{ count: number; role: string }>[];
  }>;
  route: PolicyRoute;
  verificationMode: VerificationMode;
}>;

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validatePolicyDecisionFacts(
  facts: PolicyDecisionFacts,
): DomainResult<PolicyDecisionFacts> {
  if (
    facts.reasonCodes.length === 0 ||
    hasDuplicate(facts.reasonCodes) ||
    hasDuplicate(facts.requiredAuthority.roles.map(({ role }) => role))
  ) {
    return refuse('POLICY_ROUTE_MISMATCH', 'reasons and roles must be unique');
  }

  const hasReview = facts.reasonCodes.some(isHumanReviewReason);
  const hasBlock = facts.reasonCodes.some(isBlockReason);
  const roleSlots = facts.requiredAuthority.roles.reduce(
    (total, { count }) => total + count,
    0,
  );
  const quorums = [
    facts.requiredAuthority.actionHumanQuorum,
    facts.requiredAuthority.agentBookQuorum,
    facts.requiredAuthority.companySubjectQuorum,
  ];
  const authorityIsValid =
    facts.requiredAuthority.roles.every(
      ({ count, role }) =>
        Number.isSafeInteger(count) && count > 0 && role.length > 0,
    ) && quorums.every(isNonNegativeInteger);

  if (!authorityIsValid) {
    return refuse('APPROVAL_REQUIREMENT_INVALID');
  }

  if (facts.route === 'STRAIGHT_THROUGH') {
    const confirmedSource =
      facts.reasonCodes.includes('SOURCE_AUTHENTICATED_STRUCTURED') ||
      facts.reasonCodes.includes('FIELDS_INDEPENDENTLY_CONFIRMED');
    const purchaseOrderSatisfied =
      facts.reasonCodes.includes('PURCHASE_ORDER_NOT_REQUIRED') !==
      facts.reasonCodes.includes('PURCHASE_ORDER_EXACT_MATCH');
    const requiredReasons = [
      'SUPPLIER_ACTIVE_EXACT_MATCH',
      'BENEFICIARY_EXACT_MATCH',
      'DUPLICATE_CLEAR',
      'AMOUNT_WITHIN_MANDATE',
      'PERIOD_CAP_AVAILABLE',
      'MANDATE_EXACT_CONTAINMENT',
    ] as const satisfies readonly PolicyReasonCode[];
    if (
      !facts.hasStandingMandate ||
      !confirmedSource ||
      !purchaseOrderSatisfied ||
      requiredReasons.some((reason) => !facts.reasonCodes.includes(reason)) ||
      hasReview ||
      hasBlock ||
      roleSlots !== 0 ||
      quorums.some((quorum) => quorum !== 0) ||
      (facts.verificationMode === 'NOT_REQUIRED') !==
        facts.reasonCodes.includes('EVIDENCE_NOT_REQUIRED_BY_MANDATE')
    ) {
      return refuse('POLICY_ROUTE_MISMATCH');
    }
  }

  if (
    facts.route === 'HUMAN_APPROVAL' &&
    (hasBlock ||
      !hasReview ||
      roleSlots === 0 ||
      quorums.some((quorum) => quorum !== roleSlots))
  ) {
    return refuse('POLICY_ROUTE_MISMATCH');
  }

  if (
    facts.route === 'BLOCK' &&
    (!hasBlock || roleSlots !== 0 || quorums.some((quorum) => quorum !== 0))
  ) {
    return refuse('POLICY_ROUTE_MISMATCH');
  }

  if (facts.route === 'BLOCK' && facts.verificationMode !== 'NOT_REQUIRED') {
    return refuse('VERIFICATION_MODE_MISMATCH');
  }

  if (
    facts.route === 'HUMAN_APPROVAL' &&
    (facts.verificationMode === 'REQUIRED') !==
      facts.reasonCodes.includes('EVIDENCE_REQUIRED')
  ) {
    return refuse('VERIFICATION_MODE_MISMATCH');
  }

  if (
    facts.route === 'HUMAN_APPROVAL' &&
    facts.reasonCodes.includes('BENEFICIARY_CHANGED') &&
    facts.verificationMode !== 'REQUIRED'
  ) {
    return refuse('VERIFICATION_REQUIRED');
  }

  return accept(facts);
}
