import { describe, expect, it } from 'vitest';

import {
  createExtractedInvoiceCandidate,
  createStandingMandate,
  createSupplierMasterSnapshot,
  hashExtractedInvoiceCandidateCore,
  hashStandingMandateCore,
  hashSupplierMasterSnapshotCore,
  verifyExtractedInvoiceCandidate,
  verifyStandingMandate,
  verifySupplierMasterSnapshot,
} from '../src/hashing.js';

const ID = {
  candidate: '019f939b-fe5e-7e92-b72e-8d4531958c40',
  connection: '019f939b-fe5e-7e92-b72e-8d4531958c41',
  mandate: '019f939b-fe5e-7e92-b72e-8d4531958c42',
  observation: '019f939b-fe5e-7e92-b72e-8d4531958c45',
  organization: '019f939b-fe5e-7e92-b72e-8d4531958c43',
  supplier: '019f939b-fe5e-7e92-b72e-8d4531958c44',
} as const;
const DIGEST = 'a'.repeat(64);
const BENEFICIARY = {
  accountId: 'hedera:296:0.0.1000',
  kind: 'CAIP_10',
} as const;

const supplierCore = {
  approvedBeneficiaries: [BENEFICIARY],
  defaultAssetId: 'iso4217:EUR',
  effectiveAt: '2026-07-01T00:00:00.000Z',
  externalSupplierReference: 'COURTGLASS',
  legalIdentityHash: DIGEST,
  organizationId: ID.organization,
  paymentTerms: { days: 30, kind: 'NET_DAYS' },
  schemaVersion: 1,
  snapshotVersion: 1,
  sourceConnectionId: ID.connection,
  status: 'ACTIVE',
  supplierId: ID.supplier,
} as const;

const candidateCore = {
  candidateId: ID.candidate,
  extractedAt: '2026-07-25T10:00:01.000Z',
  extractor: { id: 'fixture-extractor', version: '1.0.0' },
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

describe('immutable record digest envelopes', () => {
  it('recomputes extracted-candidate envelopes before use', () => {
    const candidate = createExtractedInvoiceCandidate(candidateCore);

    expect(candidate.candidateDigest).toBe(
      hashExtractedInvoiceCandidateCore(candidateCore),
    );
    expect(verifyExtractedInvoiceCandidate(candidate)).toEqual(candidate);
    expect(() =>
      verifyExtractedInvoiceCandidate({
        ...candidate,
        fields: {
          ...candidate.fields,
          invoiceNumber: 'SUBSTITUTED',
        },
      }),
    ).toThrow('does not recompute');
  });

  it('computes the supplier digest from the core only', () => {
    const snapshot = createSupplierMasterSnapshot(supplierCore);

    expect(snapshot.snapshotDigest).toBe(
      hashSupplierMasterSnapshotCore(supplierCore),
    );
    expect(verifySupplierMasterSnapshot(snapshot)).toEqual(snapshot);
    expect(() => hashSupplierMasterSnapshotCore(snapshot)).toThrow();
    expect(() =>
      verifySupplierMasterSnapshot({
        ...snapshot,
        externalSupplierReference: 'SUBSTITUTED',
      }),
    ).toThrow('does not recompute');
  });

  it('computes the mandate digest from the core only', () => {
    const snapshot = createSupplierMasterSnapshot(supplierCore);
    const mandateCore = {
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
      period: { kind: 'UTC_CALENDAR_MONTH' },
      purchaseOrderPolicy: { mode: 'EXACT_REFERENCE_AND_TOTAL' },
      requiredEvidencePolicy: {
        digest: DIGEST,
        id: 'routine-supplier-v1',
        version: 1,
      },
      schemaVersion: 1,
      settlementAssetId: 'hedera:296/hts:0.0.9001',
      settlementBeneficiary: 'hedera:296:0.0.1000',
      settlementNetworkId: 'hedera:296',
      sourceAssetId: 'iso4217:EUR',
      supplierId: ID.supplier,
      supplierSnapshotDigest: snapshot.snapshotDigest,
      verificationMode: 'NOT_REQUIRED',
    } as const;
    const mandate = createStandingMandate(mandateCore);

    expect(mandate.mandateDigest).toBe(hashStandingMandateCore(mandateCore));
    expect(verifyStandingMandate(mandate)).toEqual(mandate);
    expect(() => hashStandingMandateCore(mandate)).toThrow();
    expect(() =>
      verifyStandingMandate({
        ...mandate,
        maximumSettlementInvoiceAmountAtoms: '5000001',
      }),
    ).toThrow('does not recompute');
  });
});
