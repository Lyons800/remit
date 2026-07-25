import { z } from 'zod';

import {
  assetIdSchema,
  beneficiarySchema,
  boundedOpaqueStringSchema,
  isSortedUnique,
  nonNegativeSafeIntegerSchema,
  positiveSafeIntegerSchema,
  schemaVersionV1Schema,
  sha256DigestSchema,
  utcInstantSchema,
  uuidV7Schema,
} from '../primitives.js';
import type { BeneficiaryV1 } from '../primitives.js';

function beneficiarySortKey(beneficiary: BeneficiaryV1): string {
  return beneficiary.kind === 'IBAN'
    ? `IBAN:${beneficiary.value}`
    : `CAIP_10:${beneficiary.accountId}`;
}

export const supplierStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'REVOKED']);

export const supplierMasterSnapshotCoreV1Schema = z
  .object({
    approvedBeneficiaries: z.array(beneficiarySchema).max(64),
    defaultAssetId: assetIdSchema,
    effectiveAt: utcInstantSchema,
    externalSupplierReference: boundedOpaqueStringSchema.nullable(),
    legalIdentityHash: sha256DigestSchema,
    organizationId: uuidV7Schema,
    paymentTerms: z
      .object({
        days: nonNegativeSafeIntegerSchema.max(365),
        kind: z.literal('NET_DAYS'),
      })
      .strict(),
    schemaVersion: schemaVersionV1Schema,
    snapshotVersion: positiveSafeIntegerSchema,
    sourceConnectionId: uuidV7Schema.nullable(),
    status: supplierStatusSchema,
    supplierId: uuidV7Schema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const beneficiaryKeys =
      snapshot.approvedBeneficiaries.map(beneficiarySortKey);

    if (!isSortedUnique(beneficiaryKeys)) {
      context.addIssue({
        code: 'custom',
        message: 'approved beneficiaries must be sorted and unique',
        path: ['approvedBeneficiaries'],
      });
    }

    if (
      snapshot.status === 'ACTIVE' &&
      snapshot.approvedBeneficiaries.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        message: 'an active supplier requires an approved beneficiary',
        path: ['approvedBeneficiaries'],
      });
    }
  });

export const supplierMasterSnapshotV1Schema = supplierMasterSnapshotCoreV1Schema
  .safeExtend({
    snapshotDigest: sha256DigestSchema,
  })
  .strict();

export type SupplierMasterSnapshotCoreV1 = z.infer<
  typeof supplierMasterSnapshotCoreV1Schema
>;
export type SupplierMasterSnapshotV1 = z.infer<
  typeof supplierMasterSnapshotV1Schema
>;
export type SupplierStatus = z.infer<typeof supplierStatusSchema>;
