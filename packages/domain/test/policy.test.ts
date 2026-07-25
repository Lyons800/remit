import { describe, expect, it } from 'vitest';

import { policyReasonCodeSchema } from '../../protocol/src/index.js';
import {
  blockReasonCodes,
  domainRefusalCodes,
  humanReviewReasonCodes,
  policyReasonCodes,
  straightThroughReasonCodes,
  validatePolicyDecisionFacts,
  type PolicyDecisionFacts,
} from '../src/index.js';

const straightThroughDecision = {
  hasStandingMandate: true,
  reasonCodes: [
    'AMOUNT_WITHIN_MANDATE',
    'BENEFICIARY_EXACT_MATCH',
    'DUPLICATE_CLEAR',
    'EVIDENCE_NOT_REQUIRED_BY_MANDATE',
    'MANDATE_EXACT_CONTAINMENT',
    'PERIOD_CAP_AVAILABLE',
    'PURCHASE_ORDER_EXACT_MATCH',
    'SOURCE_AUTHENTICATED_STRUCTURED',
    'SUPPLIER_ACTIVE_EXACT_MATCH',
  ],
  requiredAuthority: {
    actionHumanQuorum: 0,
    agentBookQuorum: 0,
    companySubjectQuorum: 0,
    roles: [],
  },
  route: 'STRAIGHT_THROUGH',
  verificationMode: 'NOT_REQUIRED',
} as const satisfies PolicyDecisionFacts;

const humanApprovalDecision = {
  hasStandingMandate: false,
  reasonCodes: ['BENEFICIARY_CHANGED', 'EVIDENCE_REQUIRED'],
  requiredAuthority: {
    actionHumanQuorum: 2,
    agentBookQuorum: 2,
    companySubjectQuorum: 2,
    roles: [
      { count: 1, role: 'FINANCE_APPROVER' },
      { count: 1, role: 'TREASURY_APPROVER' },
    ],
  },
  route: 'HUMAN_APPROVAL',
  verificationMode: 'REQUIRED',
} as const satisfies PolicyDecisionFacts;

const blockDecision = {
  hasStandingMandate: false,
  reasonCodes: ['DUPLICATE_ALREADY_PAID'],
  requiredAuthority: {
    actionHumanQuorum: 0,
    agentBookQuorum: 0,
    companySubjectQuorum: 0,
    roles: [],
  },
  route: 'BLOCK',
  verificationMode: 'NOT_REQUIRED',
} as const satisfies PolicyDecisionFacts;

describe('policy reason vocabulary', () => {
  it('keeps every reason in one category and aligned with the protocol', () => {
    const categorized = [
      ...straightThroughReasonCodes,
      ...humanReviewReasonCodes,
      ...blockReasonCodes,
    ];

    expect(new Set(categorized).size).toBe(categorized.length);
    expect(policyReasonCodes).toEqual(categorized);
    expect(new Set(policyReasonCodes)).toEqual(
      new Set(policyReasonCodeSchema.options),
    );
  });

  it('keeps refusal codes unique', () => {
    expect(new Set(domainRefusalCodes).size).toBe(domainRefusalCodes.length);
  });
});

describe('deterministic policy decision invariants', () => {
  it.each([
    ['straight-through', straightThroughDecision],
    ['human approval', humanApprovalDecision],
    ['block', blockDecision],
  ])('accepts a complete %s decision', (_name, decision) => {
    expect(validatePolicyDecisionFacts(decision)).toEqual({
      ok: true,
      value: decision,
    });
  });

  it('rejects a partial straight-through trace', () => {
    expect(
      validatePolicyDecisionFacts({
        ...straightThroughDecision,
        reasonCodes: [
          'MANDATE_EXACT_CONTAINMENT',
          'SOURCE_AUTHENTICATED_STRUCTURED',
        ],
      }),
    ).toMatchObject({
      error: { code: 'POLICY_ROUTE_MISMATCH' },
      ok: false,
    });
  });

  it('rejects straight-through without exact purchase-order disposition', () => {
    expect(
      validatePolicyDecisionFacts({
        ...straightThroughDecision,
        reasonCodes: straightThroughDecision.reasonCodes.filter(
          (reason) => reason !== 'PURCHASE_ORDER_EXACT_MATCH',
        ),
      }),
    ).toMatchObject({
      error: { code: 'POLICY_ROUTE_MISMATCH' },
      ok: false,
    });
  });

  it('rejects malformed or duplicate approval requirements', () => {
    expect(
      validatePolicyDecisionFacts({
        ...humanApprovalDecision,
        requiredAuthority: {
          ...humanApprovalDecision.requiredAuthority,
          roles: [
            { count: 1, role: 'FINANCE_APPROVER' },
            { count: 1, role: 'FINANCE_APPROVER' },
          ],
        },
      }),
    ).toMatchObject({
      error: { code: 'POLICY_ROUTE_MISMATCH' },
      ok: false,
    });

    expect(
      validatePolicyDecisionFacts({
        ...humanApprovalDecision,
        requiredAuthority: {
          ...humanApprovalDecision.requiredAuthority,
          actionHumanQuorum: Number.NaN,
        },
      }),
    ).toMatchObject({
      error: { code: 'APPROVAL_REQUIREMENT_INVALID' },
      ok: false,
    });
  });

  it('requires paid evidence only for changed-beneficiary review', () => {
    expect(
      validatePolicyDecisionFacts({
        ...humanApprovalDecision,
        verificationMode: 'NOT_REQUIRED',
      }),
    ).toMatchObject({
      error: { code: 'VERIFICATION_MODE_MISMATCH' },
      ok: false,
    });

    const blockedChangedBeneficiary = {
      ...blockDecision,
      reasonCodes: ['BENEFICIARY_CHANGED', 'DUPLICATE_ALREADY_PAID'] as const,
    };
    expect(validatePolicyDecisionFacts(blockedChangedBeneficiary)).toEqual({
      ok: true,
      value: blockedChangedBeneficiary,
    });
  });
});
