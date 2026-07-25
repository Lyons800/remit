import type { PaymentPolicyEvaluationRequestV1 } from '../../src/hashing.js';
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

export const vectorStraightThroughEvaluation =
  paymentActionVector.policyEvaluation as unknown as PaymentPolicyEvaluationRequestV1;

export const vectorExpected = paymentActionVector.expected;

export const vectorHumanEvaluation = {
  config: vectorStraightThroughEvaluation.config,
  input: {
    ...vectorStraightThroughEvaluation.input,
    beneficiaryStatus: 'CHANGED',
    mandate: null,
  },
} as const satisfies PaymentPolicyEvaluationRequestV1;

export const vectorBlockEvaluation = {
  config: vectorStraightThroughEvaluation.config,
  input: {
    ...vectorStraightThroughEvaluation.input,
    duplicateStatus: 'ALREADY_PAID',
    mandate: null,
    purchaseOrder: {
      mode: 'NOT_REQUIRED',
      result: 'NOT_REQUIRED',
    },
  },
} as const satisfies PaymentPolicyEvaluationRequestV1;
