import { describe, expect, it } from 'vitest';

import {
  canonicalInvoiceV1Schema,
  extractedInvoiceCandidateCoreV1Schema,
  sourceObservationV1Schema,
  standingMandateCoreV1Schema,
  supplierMasterSnapshotCoreV1Schema,
} from '../src/index.js';

const ID = {
  candidate: '019f939b-fe5e-7e92-b72e-8d4531958c1b',
  connection: '019f939b-fe5e-7e92-b72e-8d4531958c1c',
  invoice: '019f939b-fe5e-7e92-b72e-8d4531958c1d',
  invoiceRevision: '019f939b-fe5e-7e92-b72e-8d4531958c1e',
  mandate: '019f939b-fe5e-7e92-b72e-8d4531958c1f',
  observation: '019f939b-fe5e-7e92-b72e-8d4531958c20',
  obligation: '019f939b-fe5e-7e92-b72e-8d4531958c21',
  organization: '019f939b-fe5e-7e92-b72e-8d4531958c22',
  supplier: '019f939b-fe5e-7e92-b72e-8d4531958c23',
} as const;

const DIGEST = 'a'.repeat(64);
const BENEFICIARY = {
  accountId: 'hedera:296:0.0.1001',
  kind: 'CAIP_10',
} as const;

function validObservation() {
  return {
    actorReference: 'connector:accounting-demo',
    byteLength: 512,
    connectionId: ID.connection,
    contentSha256: DIGEST,
    externalEventId: 'event-100',
    mediaType: 'application/json',
    observationId: ID.observation,
    organizationId: ID.organization,
    receivedAt: '2026-07-25T10:00:00.000Z',
    schemaVersion: 1,
    sourceKind: 'ACCOUNTING',
    sourceTrustClass: 'AUTHENTICATED_STRUCTURED',
  } as const;
}

function validCandidate() {
  return {
    candidateId: ID.candidate,
    extractedAt: '2026-07-25T10:00:01.000Z',
    extractor: {
      id: 'fixture-extractor',
      version: '1.0.0',
    },
    fieldEvidence: [
      {
        confidenceBps: 9_900,
        field: 'invoiceNumber',
        sourceSpans: [
          {
            end: 16,
            kind: 'TEXT_OFFSET',
            observationId: ID.observation,
            start: 1,
          },
        ],
        warningCodes: [],
      },
    ],
    fields: {
      dueDate: null,
      invoiceAssetId: null,
      invoiceNumber: 'CG-2026-0718',
      issueDate: null,
      netAmountAtoms: null,
      proposedBeneficiary: null,
      purchaseOrderReferences: [],
      supplierExternalReference: null,
      supplierLegalName: null,
      taxAmountAtoms: null,
      totalAmountAtoms: null,
    },
    observationIds: [ID.observation],
    organizationId: ID.organization,
    parseWarningCodes: [],
    schemaVersion: 1,
  } as const;
}

function validInvoice() {
  return {
    createdAt: '2026-07-25T10:05:00.000Z',
    dueDate: '2026-08-24',
    invoiceAssetId: 'iso4217:EUR',
    invoiceId: ID.invoice,
    invoiceNumber: 'CG-2026-0718',
    invoiceRevision: 1,
    invoiceRevisionId: ID.invoiceRevision,
    issueDate: '2026-07-25',
    lineItemsRoot: DIGEST,
    netAmountAtoms: '2000000',
    obligationId: ID.obligation,
    organizationId: ID.organization,
    proposedBeneficiary: BENEFICIARY,
    purchaseOrderReferences: ['PO-100'],
    schemaVersion: 1,
    sourceEvidenceRoot: DIGEST,
    supplierId: ID.supplier,
    supplierSnapshotDigest: DIGEST,
    supersedesInvoiceRevisionId: null,
    taxAmountAtoms: '500000',
    totalAmountAtoms: '2500000',
  } as const;
}

function validSupplierSnapshot() {
  return {
    approvedBeneficiaries: [BENEFICIARY],
    defaultAssetId: 'iso4217:EUR',
    effectiveAt: '2026-07-01T00:00:00.000Z',
    externalSupplierReference: 'COURTGLASS',
    legalIdentityHash: DIGEST,
    organizationId: ID.organization,
    paymentTerms: {
      days: 30,
      kind: 'NET_DAYS',
    },
    schemaVersion: 1,
    snapshotVersion: 1,
    sourceConnectionId: ID.connection,
    status: 'ACTIVE',
    supplierId: ID.supplier,
  } as const;
}

function validMandate() {
  return {
    approvedBeneficiary: BENEFICIARY,
    expiresAt: '2027-07-01T00:00:00.000Z',
    mandateId: ID.mandate,
    mandateVersion: 1,
    mappingPolicyHash: DIGEST,
    maximumSettlementInvoiceAmountAtoms: '5000000',
    maximumSettlementPeriodAmountAtoms: '20000000',
    maximumSourceInvoiceAmountAtoms: '5000000',
    notBefore: '2026-07-01T00:00:00.000Z',
    organizationId: ID.organization,
    period: {
      kind: 'UTC_CALENDAR_MONTH',
    },
    purchaseOrderPolicy: {
      mode: 'EXACT_REFERENCE_AND_TOTAL',
    },
    requiredEvidencePolicy: {
      digest: DIGEST,
      id: 'routine-supplier-v1',
      serviceId: 'supplier-verifier-v1',
      serviceKeyId: 'supplier-verifier-key-1',
      serviceNetworkId: 'hedera:296',
      version: 1,
    },
    schemaVersion: 1,
    settlementAssetId: 'hedera:296/hts:0.0.9001',
    settlementBeneficiary: 'hedera:296:0.0.1001',
    settlementNetworkId: 'hedera:296',
    sourceAssetId: 'iso4217:EUR',
    sourceRequirement: {
      mode: 'AUTHENTICATED_OR_INDEPENDENTLY_CONFIRMED',
    },
    supplierId: ID.supplier,
    supplierSnapshotDigest: DIGEST,
    verificationMode: 'NOT_REQUIRED',
  } as const;
}

describe('AP protocol contracts', () => {
  it('accepts a connector observation and rejects spoofable connector metadata', () => {
    expect(
      sourceObservationV1Schema.safeParse(validObservation()).success,
    ).toBe(true);
    expect(
      sourceObservationV1Schema.safeParse({
        ...validObservation(),
        connectionId: null,
      }).success,
    ).toBe(false);
  });

  it('keeps upload and email observations untrusted', () => {
    expect(
      sourceObservationV1Schema.safeParse({
        ...validObservation(),
        connectionId: null,
        externalEventId: null,
        sourceKind: 'UPLOAD',
        sourceTrustClass: 'AUTHENTICATED_STRUCTURED',
      }).success,
    ).toBe(false);
  });

  it('requires provenance for every populated candidate field', () => {
    expect(
      extractedInvoiceCandidateCoreV1Schema.safeParse(validCandidate()).success,
    ).toBe(true);
    expect(
      extractedInvoiceCandidateCoreV1Schema.safeParse({
        ...validCandidate(),
        fieldEvidence: [],
      }).success,
    ).toBe(false);
  });

  it('rejects candidate evidence from an unrelated observation', () => {
    const candidate = validCandidate();
    const fieldEvidence = candidate.fieldEvidence[0];

    if (fieldEvidence === undefined) {
      throw new Error('fixture must include field evidence');
    }

    expect(
      extractedInvoiceCandidateCoreV1Schema.safeParse({
        ...candidate,
        fieldEvidence: [
          {
            ...fieldEvidence,
            sourceSpans: [
              {
                end: 16,
                kind: 'TEXT_OFFSET',
                observationId: ID.connection,
                start: 1,
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('enforces canonical invoice arithmetic and revision lineage', () => {
    expect(canonicalInvoiceV1Schema.safeParse(validInvoice()).success).toBe(
      true,
    );
    expect(
      canonicalInvoiceV1Schema.safeParse({
        ...validInvoice(),
        totalAmountAtoms: '2500001',
      }).success,
    ).toBe(false);
    expect(
      canonicalInvoiceV1Schema.safeParse({
        ...validInvoice(),
        invoiceRevision: 2,
      }).success,
    ).toBe(false);
  });

  it('requires active suppliers to have a canonical beneficiary', () => {
    expect(
      supplierMasterSnapshotCoreV1Schema.safeParse(validSupplierSnapshot())
        .success,
    ).toBe(true);
    expect(
      supplierMasterSnapshotCoreV1Schema.safeParse({
        ...validSupplierSnapshot(),
        approvedBeneficiaries: [],
      }).success,
    ).toBe(false);
  });

  it('binds mandate cap order and settlement network', () => {
    expect(standingMandateCoreV1Schema.safeParse(validMandate()).success).toBe(
      true,
    );
    expect(
      standingMandateCoreV1Schema.safeParse({
        ...validMandate(),
        maximumSettlementPeriodAmountAtoms: '4999999',
      }).success,
    ).toBe(false);
    expect(
      standingMandateCoreV1Schema.safeParse({
        ...validMandate(),
        settlementNetworkId: 'hedera:295',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown fields instead of stripping signed semantics', () => {
    expect(
      canonicalInvoiceV1Schema.safeParse({
        ...validInvoice(),
        unreviewedPaymentField: true,
      }).success,
    ).toBe(false);
  });
});
