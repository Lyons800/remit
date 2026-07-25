import type { StandingMandateV1 } from '@invoiceguard/protocol';
import {
  canonicalizeJson,
  verifyAuthorizationBundle,
  verifyStandingMandate,
  type AuthorizationBundleV1,
} from '@invoiceguard/protocol/hashing';

import type {
  MandatePeriodKind,
  PurchaseOrderPolicyMode,
  PurchaseOrderPolicyResult,
  StandingMandateAggregate,
} from '../payment-context.js';
import { accept, refuse, type DomainResult } from '../result.js';
import { isCanonicalUtcInstant } from '../state/temporal.js';
import { parsePositiveAtoms } from '../values/atoms.js';
import { isRecord } from '../values/validation.js';

export type MandateContainment = Readonly<{
  actionDigest: string;
  mandateDigest: string;
  mandateId: string;
  mandateVersion: number;
  periodCapAtoms: string;
  periodKey: string;
  settlementAmountAtoms: string;
}>;

function purchaseOrderSatisfied(
  mode: PurchaseOrderPolicyMode,
  result: PurchaseOrderPolicyResult,
): boolean {
  return (
    (mode === 'NOT_REQUIRED' && result === 'NOT_REQUIRED') ||
    (mode === 'EXACT_REFERENCE' && result === 'EXACT_REFERENCE_MATCH') ||
    (mode === 'EXACT_REFERENCE_AND_TOTAL' &&
      result === 'EXACT_REFERENCE_AND_TOTAL_MATCH')
  );
}

function verifyAuthorization(
  input: unknown,
): DomainResult<AuthorizationBundleV1> {
  try {
    return accept(verifyAuthorizationBundle(input as AuthorizationBundleV1));
  } catch {
    return refuse(
      'MANDATE_CONTAINMENT_FAILED',
      'authorization bundle does not recompute',
    );
  }
}

function verifyMandateAggregate(
  input: unknown,
): DomainResult<StandingMandateAggregate> {
  if (
    !isRecord(input) ||
    (input.state !== 'ISSUED' &&
      input.state !== 'ACTIVE' &&
      input.state !== 'PAUSED' &&
      input.state !== 'REVOKED' &&
      input.state !== 'EXPIRED')
  ) {
    return refuse(
      'MANDATE_CONTAINMENT_FAILED',
      'mandate aggregate is malformed',
    );
  }

  try {
    return accept(
      Object.freeze({
        record: verifyStandingMandate(input.record),
        state: input.state,
      }),
    );
  } catch {
    return refuse(
      'MANDATE_CONTAINMENT_FAILED',
      'mandate envelope does not recompute',
    );
  }
}

export function deriveMandatePeriodKey(
  period: Readonly<{ kind: MandatePeriodKind }>,
  now: string,
): DomainResult<string> {
  if (!isCanonicalUtcInstant(now)) {
    return refuse('MANDATE_TIME_INVALID');
  }

  return accept(
    period.kind === 'UTC_CALENDAR_DAY'
      ? `UTC_DAY:${now.slice(0, 10)}`
      : `UTC_MONTH:${now.slice(0, 7)}`,
  );
}

function beneficiaryMatchesMandate(
  approved: AuthorizationBundleV1['actionCore']['beneficiary']['approved'],
  proposed: AuthorizationBundleV1['actionCore']['beneficiary']['proposed'],
  mandate: StandingMandateV1,
): boolean {
  if (approved === null) {
    return false;
  }

  const mandateBeneficiary = canonicalizeJson(mandate.approvedBeneficiary);
  return (
    canonicalizeJson(approved) === mandateBeneficiary &&
    canonicalizeJson(proposed) === mandateBeneficiary
  );
}

export function validateMandateContainment(
  authorizationInput: unknown,
  mandateAggregateInput: unknown,
  now: string,
): DomainResult<MandateContainment> {
  const authorizationResult = verifyAuthorization(authorizationInput);
  if (!authorizationResult.ok) {
    return authorizationResult;
  }

  const mandateResult = verifyMandateAggregate(mandateAggregateInput);
  if (!mandateResult.ok) {
    return mandateResult;
  }

  const authorization = authorizationResult.value;
  const mandateAggregate = mandateResult.value;
  const action = authorization.actionCore;
  const decision = authorization.decision;
  const mandate = mandateAggregate.record;

  if (!isCanonicalUtcInstant(now) || mandate.notBefore >= mandate.expiresAt) {
    return refuse('MANDATE_TIME_INVALID');
  }

  if (
    mandateAggregate.state !== 'ACTIVE' ||
    now < mandate.notBefore ||
    now >= mandate.expiresAt
  ) {
    return refuse('MANDATE_NOT_ACTIVE');
  }

  if (now < decision.evaluatedAt) {
    return refuse(
      'ACTION_TIME_INVALID',
      'policy decision is not current at the trusted transition time',
    );
  }

  if (action.createdAt < mandate.notBefore) {
    return refuse(
      'MANDATE_CONTAINMENT_FAILED',
      'action predates the referenced mandate version',
    );
  }

  if (
    now >= action.expiresAt ||
    decision.expiresAt !== action.expiresAt ||
    action.expiresAt > mandate.expiresAt
  ) {
    return refuse('ACTION_EXPIRED');
  }

  if (
    decision.route !== 'STRAIGHT_THROUGH' ||
    decision.standingMandate === null
  ) {
    return refuse('POLICY_ROUTE_MISMATCH');
  }

  const reference = decision.standingMandate;
  if (
    reference.mandateId !== mandate.mandateId ||
    reference.mandateVersion !== mandate.mandateVersion ||
    reference.mandateDigest !== mandate.mandateDigest
  ) {
    return refuse(
      'MANDATE_CONTAINMENT_FAILED',
      'frozen policy decision references another mandate',
    );
  }

  const sourceAmount = parsePositiveAtoms(action.sourceInvoice.amountAtoms);
  const sourceCap = parsePositiveAtoms(mandate.maximumSourceInvoiceAmountAtoms);
  const settlementAmount = parsePositiveAtoms(action.settlement.amountAtoms);
  const settlementInvoiceCap = parsePositiveAtoms(
    mandate.maximumSettlementInvoiceAmountAtoms,
  );
  const settlementPeriodCap = parsePositiveAtoms(
    mandate.maximumSettlementPeriodAmountAtoms,
  );

  if (
    sourceAmount === null ||
    sourceCap === null ||
    settlementAmount === null ||
    settlementInvoiceCap === null ||
    settlementPeriodCap === null ||
    sourceAmount > sourceCap ||
    settlementAmount > settlementInvoiceCap ||
    settlementInvoiceCap > settlementPeriodCap
  ) {
    return refuse('MANDATE_CAP_EXCEEDED');
  }

  if (
    action.organizationId !== mandate.organizationId ||
    action.supplierId !== mandate.supplierId ||
    action.supplierSnapshotDigest !== mandate.supplierSnapshotDigest ||
    !beneficiaryMatchesMandate(
      action.beneficiary.approved,
      action.beneficiary.proposed,
      mandate,
    ) ||
    action.sourceInvoice.assetId !== mandate.sourceAssetId ||
    action.settlement.assetId !== mandate.settlementAssetId ||
    action.settlement.networkId !== mandate.settlementNetworkId ||
    action.settlement.beneficiary !== mandate.settlementBeneficiary ||
    action.settlement.mappingPolicyHash !== mandate.mappingPolicyHash ||
    decision.verificationMode !== mandate.verificationMode ||
    canonicalizeJson(decision.evidencePolicy) !==
      canonicalizeJson(mandate.requiredEvidencePolicy) ||
    decision.purchaseOrder.mode !== mandate.purchaseOrderPolicy.mode ||
    !purchaseOrderSatisfied(
      mandate.purchaseOrderPolicy.mode,
      decision.purchaseOrder.result,
    )
  ) {
    return refuse('MANDATE_CONTAINMENT_FAILED');
  }

  const periodKey = deriveMandatePeriodKey(mandate.period, now);
  if (!periodKey.ok) {
    return periodKey;
  }

  return accept(
    Object.freeze({
      actionDigest: authorization.envelope.actionDigest,
      mandateDigest: mandate.mandateDigest,
      mandateId: mandate.mandateId,
      mandateVersion: mandate.mandateVersion,
      periodCapAtoms: settlementPeriodCap.toString(),
      periodKey: periodKey.value,
      settlementAmountAtoms: settlementAmount.toString(),
    }),
  );
}
