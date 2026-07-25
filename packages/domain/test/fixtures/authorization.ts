import {
  createAuthorizationBundle,
  createStandingMandate,
  hashPaymentActionCore,
} from '@invoiceguard/protocol/hashing';
import {
  paymentActionCoreV1Schema,
  type PaymentActionCoreV1,
  type PaymentPolicyEvaluationRequestV1,
  type PaymentPolicyInputV1,
} from '@invoiceguard/protocol';

export const NOW = '2026-07-25T10:00:00.000Z';
export const ACTION_EXPIRES_AT = '2026-07-25T11:00:00.000Z';
export const MANDATE_EXPIRES_AT = '2026-08-01T00:00:00.000Z';

export const IDS = {
  action: '019f939b-fe5e-7e92-b72e-8d4531958d01',
  invoiceRevision: '019f939b-fe5e-7e92-b72e-8d4531958d06',
  mandate: '019f939b-fe5e-7e92-b72e-8d4531958d02',
  obligation: '019f939b-fe5e-7e92-b72e-8d4531958d03',
  organization: '019f939b-fe5e-7e92-b72e-8d4531958d04',
  supplier: '019f939b-fe5e-7e92-b72e-8d4531958d05',
} as const;

export const DIGESTS = {
  evidencePolicy: '1'.repeat(64),
  evidenceRoot: '2'.repeat(64),
  invoice: '3'.repeat(64),
  mappingPolicy: '5'.repeat(64),
  supplierSnapshot: '6'.repeat(64),
} as const;

export const BENEFICIARY = {
  accountId: 'hedera:296:0.0.1000',
  kind: 'CAIP_10',
} as const;

export const standingMandate = createStandingMandate({
  approvedBeneficiary: BENEFICIARY,
  expiresAt: MANDATE_EXPIRES_AT,
  mandateId: IDS.mandate,
  mandateVersion: 1,
  mappingPolicyHash: DIGESTS.mappingPolicy,
  maximumSettlementInvoiceAmountAtoms: '5000000',
  maximumSettlementPeriodAmountAtoms: '20000000',
  maximumSourceInvoiceAmountAtoms: '5000000',
  notBefore: '2026-07-01T00:00:00.000Z',
  organizationId: IDS.organization,
  period: { kind: 'UTC_CALENDAR_MONTH' },
  purchaseOrderPolicy: { mode: 'EXACT_REFERENCE_AND_TOTAL' },
  requiredEvidencePolicy: {
    digest: DIGESTS.evidencePolicy,
    id: 'routine-supplier-v1',
    version: 1,
  },
  schemaVersion: 1,
  settlementAssetId: 'hedera:296/hts:0.0.9001',
  settlementBeneficiary: BENEFICIARY.accountId,
  settlementNetworkId: 'hedera:296',
  sourceAssetId: 'iso4217:EUR',
  sourceRequirement: {
    mode: 'AUTHENTICATED_OR_INDEPENDENTLY_CONFIRMED',
  },
  supplierId: IDS.supplier,
  supplierSnapshotDigest: DIGESTS.supplierSnapshot,
  verificationMode: 'NOT_REQUIRED',
});

export const actionCore = {
  actionId: IDS.action,
  beneficiary: {
    approved: BENEFICIARY,
    proposed: BENEFICIARY,
  },
  createdAt: NOW,
  evidenceRoot: DIGESTS.evidenceRoot,
  expiresAt: ACTION_EXPIRES_AT,
  nonce: '0123456789abcdef0123456789abcdef',
  organizationId: IDS.organization,
  policy: {
    id: 'routine-invoice-policy',
    version: 1,
  },
  requestType: 'SUPPLIER_INVOICE_PAYMENT',
  schemaVersion: 1,
  settlement: {
    amountAtoms: '2500000',
    assetId: standingMandate.settlementAssetId,
    beneficiary: standingMandate.settlementBeneficiary,
    mappingPolicyHash: DIGESTS.mappingPolicy,
    networkId: standingMandate.settlementNetworkId,
  },
  sourceInvoice: {
    amountAtoms: '2500000',
    assetId: standingMandate.sourceAssetId,
    digest: DIGESTS.invoice,
    invoiceRevisionId: IDS.invoiceRevision,
    obligationId: IDS.obligation,
  },
  supplierId: IDS.supplier,
  supplierSnapshotDigest: DIGESTS.supplierSnapshot,
} as const;

const humanAuthority = {
  actionHumanQuorum: 2,
  agentBookQuorum: 2,
  companySubjectQuorum: 2,
  roles: [
    { count: 1, role: 'FINANCE_APPROVER' },
    { count: 1, role: 'TREASURY_APPROVER' },
  ],
};

export function policyEvaluationForCore(
  coreInput: PaymentActionCoreV1,
  overrides: Partial<PaymentPolicyInputV1> = {},
): PaymentPolicyEvaluationRequestV1 {
  const core = paymentActionCoreV1Schema.parse(coreInput);
  return {
    config: {
      humanAuthority,
      humanEvidencePolicy: {
        digest: DIGESTS.evidencePolicy,
        id: 'changed-beneficiary-v1',
        version: 1,
      },
      humanVerificationMode: 'REQUIRED',
      policy: core.policy,
      schemaVersion: 1,
    },
    input: {
      actionCoreDigest: hashPaymentActionCore(core),
      actionCreatedAt: core.createdAt,
      actionExpiresAt: core.expiresAt,
      amountStatus: 'WITHIN_MANDATE',
      assetStatus: 'SUPPORTED',
      beneficiaryStatus: 'EXACT_MATCH',
      duplicateStatus: 'CLEAR',
      evaluatedAt: NOW,
      extractionConflict: false,
      fieldsIndependentlyConfirmed: false,
      mandate: {
        activeStatus: 'ACTIVE',
        evidencePolicy: standingMandate.requiredEvidencePolicy,
        exactContainment: true,
        periodCapAvailable: true,
        reference: {
          mandateDigest: standingMandate.mandateDigest,
          mandateId: standingMandate.mandateId,
          mandateVersion: standingMandate.mandateVersion,
        },
        sourceRequirement: standingMandate.sourceRequirement,
        verificationMode: standingMandate.verificationMode,
      },
      mappingPolicyStatus: 'SUPPORTED',
      networkStatus: 'SUPPORTED',
      policyEnabled: true,
      purchaseOrder: {
        mode: standingMandate.purchaseOrderPolicy.mode,
        result: 'EXACT_REFERENCE_AND_TOTAL_MATCH',
      },
      schemaVersion: 1,
      sourceTrustClass: 'AUTHENTICATED_STRUCTURED',
      supplierFirstPayment: false,
      supplierMatch: 'EXACT',
      supplierStatus: 'ACTIVE',
      ...overrides,
    },
  };
}

export const policyEvaluation = policyEvaluationForCore(actionCore);

export const authorization = createAuthorizationBundle(
  actionCore,
  policyEvaluation,
);

export const humanAuthorization = createAuthorizationBundle(
  actionCore,
  policyEvaluationForCore(actionCore, {
    beneficiaryStatus: 'CHANGED',
    mandate: null,
  }),
);

export const blockAuthorization = createAuthorizationBundle(
  actionCore,
  policyEvaluationForCore(actionCore, {
    duplicateStatus: 'ALREADY_PAID',
    mandate: null,
    purchaseOrder: {
      mode: 'NOT_REQUIRED',
      result: 'NOT_REQUIRED',
    },
  }),
);

export const activeMandateAggregate = {
  record: standingMandate,
  state: 'ACTIVE',
} as const;
