import { z } from 'zod';

import {
  assetIdSchema,
  beneficiarySchema,
  caip10Network,
  caip10Schema,
  caip19Network,
  caip19Schema,
  caip2Schema,
  nonEmptyBoundedStringSchema,
  positiveAtomsSchema,
  positiveSafeIntegerSchema,
  schemaVersionV1Schema,
  sha256DigestSchema,
  utcInstantSchema,
  uuidV7Schema,
} from '../primitives.js';

export const verificationModeSchema = z.enum(['NOT_REQUIRED', 'REQUIRED']);

export const standingMandateCoreV1Schema = z
  .object({
    approvedBeneficiary: beneficiarySchema,
    expiresAt: utcInstantSchema,
    mandateId: uuidV7Schema,
    mandateVersion: positiveSafeIntegerSchema,
    mappingPolicyHash: sha256DigestSchema,
    maximumSettlementInvoiceAmountAtoms: positiveAtomsSchema,
    maximumSettlementPeriodAmountAtoms: positiveAtomsSchema,
    maximumSourceInvoiceAmountAtoms: positiveAtomsSchema,
    notBefore: utcInstantSchema,
    organizationId: uuidV7Schema,
    period: z
      .object({
        kind: z.enum(['UTC_CALENDAR_DAY', 'UTC_CALENDAR_MONTH']),
      })
      .strict(),
    purchaseOrderPolicy: z
      .object({
        mode: z.enum([
          'NOT_REQUIRED',
          'EXACT_REFERENCE',
          'EXACT_REFERENCE_AND_TOTAL',
        ]),
      })
      .strict(),
    requiredEvidencePolicy: z
      .object({
        digest: sha256DigestSchema,
        id: nonEmptyBoundedStringSchema,
        version: positiveSafeIntegerSchema,
      })
      .strict(),
    schemaVersion: schemaVersionV1Schema,
    settlementAssetId: caip19Schema,
    settlementBeneficiary: caip10Schema,
    settlementNetworkId: caip2Schema,
    sourceAssetId: assetIdSchema,
    supplierId: uuidV7Schema,
    supplierSnapshotDigest: sha256DigestSchema,
    verificationMode: verificationModeSchema,
  })
  .strict()
  .superRefine((mandate, context) => {
    if (mandate.notBefore >= mandate.expiresAt) {
      context.addIssue({
        code: 'custom',
        message: 'mandate expiry must follow its effective time',
        path: ['expiresAt'],
      });
    }

    if (
      BigInt(mandate.maximumSettlementPeriodAmountAtoms) <
      BigInt(mandate.maximumSettlementInvoiceAmountAtoms)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'period cap cannot be below per-invoice cap',
        path: ['maximumSettlementPeriodAmountAtoms'],
      });
    }

    if (
      caip19Network(mandate.settlementAssetId) !== mandate.settlementNetworkId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'settlement asset must belong to the settlement network',
        path: ['settlementAssetId'],
      });
    }

    if (
      caip10Network(mandate.settlementBeneficiary) !==
      mandate.settlementNetworkId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'settlement beneficiary must belong to the settlement network',
        path: ['settlementBeneficiary'],
      });
    }
  });

export const standingMandateV1Schema = standingMandateCoreV1Schema
  .safeExtend({
    mandateDigest: sha256DigestSchema,
  })
  .strict();

export type StandingMandateCoreV1 = z.infer<typeof standingMandateCoreV1Schema>;
export type StandingMandateV1 = z.infer<typeof standingMandateV1Schema>;
export type VerificationMode = z.infer<typeof verificationModeSchema>;
