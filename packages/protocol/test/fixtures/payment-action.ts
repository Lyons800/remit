import type { PolicyDecisionInputV1 } from '../../src/hashing.js';
import { paymentActionCoreV1Schema } from '../../src/index.js';
import paymentActionVector from '../vectors/payment-action-v1.json' with { type: 'json' };

export const vectorIds = {
  action: '019f939b-fe5e-7e92-b72e-8d4531958c30',
  invoiceRevision: '019f939b-fe5e-7e92-b72e-8d4531958c35',
  mandate: '019f939b-fe5e-7e92-b72e-8d4531958c31',
  obligation: '019f939b-fe5e-7e92-b72e-8d4531958c32',
  organization: '019f939b-fe5e-7e92-b72e-8d4531958c33',
  supplier: '019f939b-fe5e-7e92-b72e-8d4531958c34',
} as const;

export const vectorActionCore = paymentActionCoreV1Schema.parse(
  paymentActionVector.actionCore,
);

export const vectorStraightThroughDecision =
  paymentActionVector.decisionInput as unknown as PolicyDecisionInputV1;

export const vectorExpected = paymentActionVector.expected;

export const vectorHumanDecision = {
  evidencePolicy: {
    digest: '9'.repeat(64),
    id: 'changed-beneficiary-v1',
    version: 1,
  },
  evaluatedAt: '2026-07-25T10:00:01.000Z',
  expiresAt: vectorActionCore.expiresAt,
  inputRoot: '6'.repeat(64),
  policy: vectorActionCore.policy,
  purchaseOrder: {
    mode: 'EXACT_REFERENCE_AND_TOTAL',
    result: 'EXACT_REFERENCE_AND_TOTAL_MATCH',
  },
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
  schemaVersion: 1,
  standingMandate: null,
  verificationMode: 'REQUIRED',
} as const satisfies PolicyDecisionInputV1;

export const vectorBlockDecision = {
  evidencePolicy: {
    digest: '9'.repeat(64),
    id: 'blocked-action-v1',
    version: 1,
  },
  evaluatedAt: '2026-07-25T10:00:01.000Z',
  expiresAt: vectorActionCore.expiresAt,
  inputRoot: '7'.repeat(64),
  policy: vectorActionCore.policy,
  purchaseOrder: {
    mode: 'NOT_REQUIRED',
    result: 'NOT_REQUIRED',
  },
  reasonCodes: ['DUPLICATE_ALREADY_PAID'],
  requiredAuthority: {
    actionHumanQuorum: 0,
    agentBookQuorum: 0,
    companySubjectQuorum: 0,
    roles: [],
  },
  route: 'BLOCK',
  schemaVersion: 1,
  standingMandate: null,
  verificationMode: 'NOT_REQUIRED',
} as const satisfies PolicyDecisionInputV1;
