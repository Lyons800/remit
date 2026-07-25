import { digestCanonicalValue, digestDomains } from '../digest.js';
import type { Sha256Digest } from '../primitives.js';
import {
  paymentPolicyConfigV1Schema,
  paymentPolicyEvaluationRequestV1Schema,
  paymentPolicyInputV1Schema,
  policyInputManifestCoreV1Schema,
  policyInputManifestV1Schema,
  type PaymentPolicyConfigV1,
  type PaymentPolicyEvaluationRequestV1,
  type PaymentPolicyInputV1,
  type PolicyInputManifestV1,
} from './policy-input.v1.js';
import type {
  PolicyDecisionV1,
  PolicyReasonCode,
} from './policy-decision.v1.js';

export type EvaluatedPolicyDecisionV1 = Omit<
  PolicyDecisionV1,
  'actionCoreDigest'
>;

function asciiSort(values: readonly PolicyReasonCode[]): PolicyReasonCode[] {
  return [...new Set(values)].sort();
}

export function hashPaymentPolicyConfig(config: unknown): Sha256Digest {
  return digestCanonicalValue(
    digestDomains.policyConfig,
    paymentPolicyConfigV1Schema,
    config,
  );
}

export function hashPaymentPolicyInput(input: unknown): Sha256Digest {
  return digestCanonicalValue(
    digestDomains.policyInput,
    paymentPolicyInputV1Schema,
    input,
  );
}

export function createPolicyInputManifest(
  config: unknown,
  input: unknown,
): PolicyInputManifestV1 {
  const core = policyInputManifestCoreV1Schema.parse({
    configDigest: hashPaymentPolicyConfig(config),
    evaluator: {
      id: 'invoiceguard.policy',
      version: 1,
    },
    inputDigest: hashPaymentPolicyInput(input),
    schemaVersion: 1,
  });
  const inputRoot = digestCanonicalValue(
    digestDomains.policyInputManifest,
    policyInputManifestCoreV1Schema,
    core,
  );
  return policyInputManifestV1Schema.parse({ ...core, inputRoot });
}

function purchaseOrderSatisfied(input: PaymentPolicyInputV1): boolean {
  return (
    (input.purchaseOrder.mode === 'NOT_REQUIRED' &&
      input.purchaseOrder.result === 'NOT_REQUIRED') ||
    (input.purchaseOrder.mode === 'EXACT_REFERENCE' &&
      input.purchaseOrder.result === 'EXACT_REFERENCE_MATCH') ||
    (input.purchaseOrder.mode === 'EXACT_REFERENCE_AND_TOTAL' &&
      input.purchaseOrder.result === 'EXACT_REFERENCE_AND_TOTAL_MATCH')
  );
}

function mandateSourceSatisfied(input: PaymentPolicyInputV1): boolean {
  if (input.mandate === null) {
    return false;
  }
  if (input.sourceTrustClass === 'AUTHENTICATED_STRUCTURED') {
    return true;
  }
  return (
    input.mandate.sourceRequirement.mode ===
      'AUTHENTICATED_OR_INDEPENDENTLY_CONFIRMED' &&
    input.fieldsIndependentlyConfirmed
  );
}

function blockReasons(input: PaymentPolicyInputV1): PolicyReasonCode[] {
  const reasons: PolicyReasonCode[] = [];
  if (!input.policyEnabled) {
    reasons.push('POLICY_DISABLED');
  }
  if (input.duplicateStatus === 'ALREADY_PAID') {
    reasons.push('DUPLICATE_ALREADY_PAID');
  }
  if (input.duplicateStatus === 'OBLIGATION_SETTLED') {
    reasons.push('OBLIGATION_ALREADY_SETTLED');
  }
  if (input.supplierStatus === 'INACTIVE') {
    reasons.push('SUPPLIER_INACTIVE');
  }
  if (input.supplierStatus === 'REVOKED') {
    reasons.push('SUPPLIER_REVOKED');
  }
  if (input.amountStatus === 'INVALID') {
    reasons.push('AMOUNT_INVALID');
  }
  if (input.assetStatus === 'UNSUPPORTED') {
    reasons.push('ASSET_UNSUPPORTED');
  }
  if (input.networkStatus === 'UNSUPPORTED') {
    reasons.push('NETWORK_UNSUPPORTED');
  }
  if (input.mappingPolicyStatus === 'UNSUPPORTED') {
    reasons.push('MAPPING_POLICY_UNSUPPORTED');
  }
  return asciiSort(reasons);
}

function reviewReasons(input: PaymentPolicyInputV1): PolicyReasonCode[] {
  const reasons: PolicyReasonCode[] = [];
  if (input.sourceTrustClass === 'UNTRUSTED_UNSTRUCTURED') {
    reasons.push('SOURCE_UNSTRUCTURED');
    if (!input.fieldsIndependentlyConfirmed) {
      reasons.push('SOURCE_NOT_INDEPENDENTLY_CONFIRMED');
    }
  }
  if (input.extractionConflict) {
    reasons.push('EXTRACTION_CONFLICT');
  }
  if (input.supplierMatch === 'NEW') {
    reasons.push('SUPPLIER_NEW');
  } else if (input.supplierMatch === 'INDETERMINATE') {
    reasons.push('SUPPLIER_MATCH_INDETERMINATE');
  }
  if (input.supplierFirstPayment) {
    reasons.push('SUPPLIER_FIRST_PAYMENT');
  }
  if (input.beneficiaryStatus === 'CHANGED') {
    reasons.push('BENEFICIARY_CHANGED');
  } else if (input.beneficiaryStatus === 'MISSING') {
    reasons.push('BENEFICIARY_MISSING');
  } else if (input.beneficiaryStatus === 'INDETERMINATE') {
    reasons.push('BENEFICIARY_INDETERMINATE');
  }
  if (input.duplicateStatus === 'SUSPECTED') {
    reasons.push('DUPLICATE_SUSPECTED');
  } else if (input.duplicateStatus === 'INDETERMINATE') {
    reasons.push('POLICY_INPUT_INDETERMINATE');
  }
  if (!purchaseOrderSatisfied(input)) {
    reasons.push(
      input.purchaseOrder.result === 'UNKNOWN'
        ? 'PURCHASE_ORDER_MISSING'
        : 'PURCHASE_ORDER_MISMATCH',
    );
  }
  if (input.amountStatus === 'ABOVE_AUTOMATION_CAP') {
    reasons.push('AMOUNT_ABOVE_AUTOMATION_CAP');
  } else if (input.amountStatus === 'INDETERMINATE') {
    reasons.push('AMOUNT_INDETERMINATE');
  }
  if (input.assetStatus === 'INDETERMINATE') {
    reasons.push('ASSET_INDETERMINATE');
  }
  if (input.mandate === null) {
    reasons.push('MANDATE_NOT_FOUND');
  } else {
    if (input.mandate.activeStatus === 'PAUSED') {
      reasons.push('MANDATE_PAUSED');
    } else if (input.mandate.activeStatus === 'EXPIRED') {
      reasons.push('MANDATE_EXPIRED');
    } else if (input.mandate.activeStatus === 'REVOKED') {
      reasons.push('MANDATE_REVOKED');
    }
    if (!input.mandate.exactContainment || !mandateSourceSatisfied(input)) {
      reasons.push('MANDATE_OUT_OF_SCOPE');
    }
    if (!input.mandate.periodCapAvailable) {
      reasons.push('MANDATE_PERIOD_CAP_EXCEEDED');
    }
  }
  return asciiSort(reasons);
}

function straightThroughReasons(
  input: PaymentPolicyInputV1,
): PolicyReasonCode[] {
  const reasons: PolicyReasonCode[] = [
    'AMOUNT_WITHIN_MANDATE',
    'BENEFICIARY_EXACT_MATCH',
    'DUPLICATE_CLEAR',
    'MANDATE_EXACT_CONTAINMENT',
    'PERIOD_CAP_AVAILABLE',
    'SUPPLIER_ACTIVE_EXACT_MATCH',
  ];
  if (input.sourceTrustClass === 'AUTHENTICATED_STRUCTURED') {
    reasons.push('SOURCE_AUTHENTICATED_STRUCTURED');
  }
  if (input.fieldsIndependentlyConfirmed) {
    reasons.push('FIELDS_INDEPENDENTLY_CONFIRMED');
  }
  reasons.push(
    input.purchaseOrder.mode === 'NOT_REQUIRED'
      ? 'PURCHASE_ORDER_NOT_REQUIRED'
      : 'PURCHASE_ORDER_EXACT_MATCH',
  );
  if (input.mandate?.verificationMode === 'NOT_REQUIRED') {
    reasons.push('EVIDENCE_NOT_REQUIRED_BY_MANDATE');
  }
  return asciiSort(reasons);
}

function canUseMandate(input: PaymentPolicyInputV1): boolean {
  return (
    input.mandate !== null &&
    input.mandate.activeStatus === 'ACTIVE' &&
    input.mandate.exactContainment &&
    input.mandate.periodCapAvailable &&
    mandateSourceSatisfied(input) &&
    input.supplierStatus === 'ACTIVE' &&
    input.supplierMatch === 'EXACT' &&
    !input.supplierFirstPayment &&
    input.beneficiaryStatus === 'EXACT_MATCH' &&
    input.duplicateStatus === 'CLEAR' &&
    purchaseOrderSatisfied(input) &&
    input.amountStatus === 'WITHIN_MANDATE' &&
    input.assetStatus === 'SUPPORTED' &&
    input.networkStatus === 'SUPPORTED' &&
    input.mappingPolicyStatus === 'SUPPORTED' &&
    !input.extractionConflict
  );
}

export function evaluatePaymentPolicy(
  requestInput: unknown,
): EvaluatedPolicyDecisionV1 {
  const request = paymentPolicyEvaluationRequestV1Schema.parse(requestInput);
  const { config, input } = request;
  const manifest = createPolicyInputManifest(config, input);
  const blocked = blockReasons(input);

  if (blocked.length > 0) {
    return Object.freeze({
      evaluatedAt: input.evaluatedAt,
      evidencePolicy: config.humanEvidencePolicy,
      expiresAt: input.actionExpiresAt,
      inputManifest: manifest,
      policy: config.policy,
      purchaseOrder: input.purchaseOrder,
      reasonCodes: blocked,
      requiredExecutor: config.executorAuthority,
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
    });
  }

  if (canUseMandate(input)) {
    const mandate = input.mandate;
    if (mandate === null) {
      throw new Error('Policy evaluator invariant: mandate disappeared.');
    }
    return Object.freeze({
      evaluatedAt: input.evaluatedAt,
      evidencePolicy: mandate.evidencePolicy,
      expiresAt: input.actionExpiresAt,
      inputManifest: manifest,
      policy: config.policy,
      purchaseOrder: input.purchaseOrder,
      reasonCodes: straightThroughReasons(input),
      requiredExecutor: config.executorAuthority,
      requiredAuthority: {
        actionHumanQuorum: 0,
        agentBookQuorum: 0,
        companySubjectQuorum: 0,
        roles: [],
      },
      route: 'STRAIGHT_THROUGH',
      schemaVersion: 1,
      standingMandate: mandate.reference,
      verificationMode: mandate.verificationMode,
    });
  }

  const reasons = reviewReasons(input);
  const verificationMode =
    input.beneficiaryStatus === 'CHANGED' ||
    config.humanVerificationMode === 'REQUIRED'
      ? 'REQUIRED'
      : 'NOT_REQUIRED';
  if (verificationMode === 'REQUIRED') {
    reasons.push('EVIDENCE_REQUIRED');
  }
  if (reasons.length === 0) {
    reasons.push('POLICY_INPUT_INDETERMINATE');
  }

  return Object.freeze({
    evaluatedAt: input.evaluatedAt,
    evidencePolicy: config.humanEvidencePolicy,
    expiresAt: input.actionExpiresAt,
    inputManifest: manifest,
    policy: config.policy,
    purchaseOrder: input.purchaseOrder,
    reasonCodes: asciiSort(reasons),
    requiredExecutor: config.executorAuthority,
    requiredAuthority: config.humanAuthority,
    route: 'HUMAN_APPROVAL',
    schemaVersion: 1,
    standingMandate: null,
    verificationMode,
  });
}

export function parsePaymentPolicyEvaluationRequest(
  input: unknown,
): PaymentPolicyEvaluationRequestV1 {
  return paymentPolicyEvaluationRequestV1Schema.parse(input);
}

export type {
  PaymentPolicyConfigV1,
  PaymentPolicyEvaluationRequestV1,
  PaymentPolicyInputV1,
};
