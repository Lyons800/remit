import type { z } from 'zod';

import { digestCanonicalValue, digestDomains } from './digest.js';
import {
  canonicalInvoiceV1Schema,
  type CanonicalInvoiceV1,
} from './invoices/canonical-invoice.v1.js';
import {
  extractedInvoiceCandidateCoreV1Schema,
  extractedInvoiceCandidateV1Schema,
  type ExtractedInvoiceCandidateCoreV1,
  type ExtractedInvoiceCandidateV1,
} from './invoices/extracted-invoice-candidate.v1.js';
import {
  standingMandateCoreV1Schema,
  standingMandateV1Schema,
  type StandingMandateCoreV1,
  type StandingMandateV1,
} from './invoices/standing-mandate.v1.js';
import {
  supplierMasterSnapshotCoreV1Schema,
  supplierMasterSnapshotV1Schema,
  type SupplierMasterSnapshotCoreV1,
  type SupplierMasterSnapshotV1,
} from './invoices/supplier-master-snapshot.v1.js';
import {
  digestManifestV1Schema,
  type DigestManifestV1,
} from './manifests/digest-manifest.v1.js';
import type { Sha256Digest } from './primitives.js';

function createDigestEnvelope<
  TCore extends Readonly<Record<string, unknown>>,
  TEnvelope,
>(
  coreSchema: z.ZodType<TCore>,
  envelopeSchema: z.ZodType<TEnvelope>,
  domain: Parameters<typeof digestCanonicalValue>[0],
  digestField: string,
  value: unknown,
): TEnvelope {
  const core = coreSchema.parse(value);
  const digest = digestCanonicalValue(domain, coreSchema, core);
  return envelopeSchema.parse({ ...core, [digestField]: digest });
}

export function hashCanonicalInvoice(invoice: unknown): Sha256Digest {
  return digestCanonicalValue(
    digestDomains.canonicalInvoice,
    canonicalInvoiceV1Schema,
    invoice,
  );
}

export function createExtractedInvoiceCandidate(
  core: unknown,
): ExtractedInvoiceCandidateV1 {
  return createDigestEnvelope(
    extractedInvoiceCandidateCoreV1Schema,
    extractedInvoiceCandidateV1Schema,
    digestDomains.invoiceCandidate,
    'candidateDigest',
    core,
  );
}

export function hashExtractedInvoiceCandidateCore(core: unknown): Sha256Digest {
  return digestCanonicalValue(
    digestDomains.invoiceCandidate,
    extractedInvoiceCandidateCoreV1Schema,
    core,
  );
}

export function createSupplierMasterSnapshot(
  core: unknown,
): SupplierMasterSnapshotV1 {
  return createDigestEnvelope(
    supplierMasterSnapshotCoreV1Schema,
    supplierMasterSnapshotV1Schema,
    digestDomains.supplierSnapshot,
    'snapshotDigest',
    core,
  );
}

export function hashSupplierMasterSnapshotCore(core: unknown): Sha256Digest {
  return digestCanonicalValue(
    digestDomains.supplierSnapshot,
    supplierMasterSnapshotCoreV1Schema,
    core,
  );
}

export function createStandingMandate(core: unknown): StandingMandateV1 {
  return createDigestEnvelope(
    standingMandateCoreV1Schema,
    standingMandateV1Schema,
    digestDomains.standingMandate,
    'mandateDigest',
    core,
  );
}

export function hashStandingMandateCore(core: unknown): Sha256Digest {
  return digestCanonicalValue(
    digestDomains.standingMandate,
    standingMandateCoreV1Schema,
    core,
  );
}

export function hashDigestManifest(manifest: unknown): Sha256Digest {
  return digestCanonicalValue(
    digestDomains.digestManifest,
    digestManifestV1Schema,
    manifest,
  );
}

export type {
  CanonicalInvoiceV1,
  DigestManifestV1,
  ExtractedInvoiceCandidateCoreV1,
  StandingMandateCoreV1,
  SupplierMasterSnapshotCoreV1,
};
