export const straightThroughReasonCodes = [
  'SOURCE_AUTHENTICATED_STRUCTURED',
  'FIELDS_INDEPENDENTLY_CONFIRMED',
  'SUPPLIER_ACTIVE_EXACT_MATCH',
  'BENEFICIARY_EXACT_MATCH',
  'DUPLICATE_CLEAR',
  'PURCHASE_ORDER_NOT_REQUIRED',
  'PURCHASE_ORDER_EXACT_MATCH',
  'AMOUNT_WITHIN_MANDATE',
  'PERIOD_CAP_AVAILABLE',
  'MANDATE_EXACT_CONTAINMENT',
  'EVIDENCE_NOT_REQUIRED_BY_MANDATE',
] as const;

export const humanReviewReasonCodes = [
  'SOURCE_UNSTRUCTURED',
  'SOURCE_NOT_INDEPENDENTLY_CONFIRMED',
  'EXTRACTION_CONFLICT',
  'SUPPLIER_NEW',
  'SUPPLIER_FIRST_PAYMENT',
  'SUPPLIER_MATCH_INDETERMINATE',
  'BENEFICIARY_CHANGED',
  'BENEFICIARY_MISSING',
  'BENEFICIARY_INDETERMINATE',
  'DUPLICATE_SUSPECTED',
  'PURCHASE_ORDER_MISSING',
  'PURCHASE_ORDER_MISMATCH',
  'AMOUNT_INDETERMINATE',
  'AMOUNT_ABOVE_AUTOMATION_CAP',
  'ASSET_INDETERMINATE',
  'MANDATE_NOT_FOUND',
  'MANDATE_PAUSED',
  'MANDATE_EXPIRED',
  'MANDATE_REVOKED',
  'MANDATE_OUT_OF_SCOPE',
  'MANDATE_PERIOD_CAP_EXCEEDED',
  'EVIDENCE_REQUIRED',
  'POLICY_INPUT_INDETERMINATE',
] as const;

export const blockReasonCodes = [
  'DUPLICATE_ALREADY_PAID',
  'OBLIGATION_ALREADY_SETTLED',
  'SUPPLIER_INACTIVE',
  'SUPPLIER_REVOKED',
  'AMOUNT_INVALID',
  'ASSET_UNSUPPORTED',
  'NETWORK_UNSUPPORTED',
  'MAPPING_POLICY_UNSUPPORTED',
  'POLICY_DISABLED',
] as const;

export const policyReasonCodes = [
  ...straightThroughReasonCodes,
  ...humanReviewReasonCodes,
  ...blockReasonCodes,
] as const;

export type BlockReasonCode = (typeof blockReasonCodes)[number];
export type HumanReviewReasonCode = (typeof humanReviewReasonCodes)[number];
export type PolicyReasonCode = (typeof policyReasonCodes)[number];
export type StraightThroughReasonCode =
  (typeof straightThroughReasonCodes)[number];

const straightThroughReasons: ReadonlySet<string> = new Set(
  straightThroughReasonCodes,
);
const humanReviewReasons: ReadonlySet<string> = new Set(humanReviewReasonCodes);
const blockReasons: ReadonlySet<string> = new Set(blockReasonCodes);

export function isStraightThroughReason(
  code: PolicyReasonCode,
): code is StraightThroughReasonCode {
  return straightThroughReasons.has(code);
}

export function isHumanReviewReason(
  code: PolicyReasonCode,
): code is HumanReviewReasonCode {
  return humanReviewReasons.has(code);
}

export function isBlockReason(code: PolicyReasonCode): code is BlockReasonCode {
  return blockReasons.has(code);
}
