import { z } from 'zod';

import {
  assetIdSchema,
  beneficiarySchema,
  caip10Network,
  caip10Schema,
  caip19Network,
  caip19Schema,
  caip2Schema,
  nonce128HexSchema,
  nonEmptyBoundedStringSchema,
  positiveAtomsSchema,
  positiveSafeIntegerSchema,
  schemaVersionV1Schema,
  sha256DigestSchema,
  utcInstantSchema,
  uuidV7Schema,
} from '../primitives.js';

export const policyReferenceSchema = z
  .object({
    id: nonEmptyBoundedStringSchema,
    version: positiveSafeIntegerSchema,
  })
  .strict();

export const paymentActionCoreV1Schema = z
  .object({
    actionId: uuidV7Schema,
    beneficiary: z
      .object({
        approved: beneficiarySchema.nullable(),
        proposed: beneficiarySchema,
      })
      .strict(),
    createdAt: utcInstantSchema,
    evidenceRoot: sha256DigestSchema,
    expiresAt: utcInstantSchema,
    nonce: nonce128HexSchema,
    organizationId: uuidV7Schema,
    policy: policyReferenceSchema,
    requestType: z.literal('SUPPLIER_INVOICE_PAYMENT'),
    schemaVersion: schemaVersionV1Schema,
    settlement: z
      .object({
        amountAtoms: positiveAtomsSchema,
        assetId: caip19Schema,
        beneficiary: caip10Schema,
        mappingPolicyHash: sha256DigestSchema,
        networkId: caip2Schema,
      })
      .strict(),
    sourceInvoice: z
      .object({
        amountAtoms: positiveAtomsSchema,
        assetId: assetIdSchema,
        digest: sha256DigestSchema,
        obligationId: uuidV7Schema,
      })
      .strict(),
    supplierId: uuidV7Schema,
  })
  .strict()
  .superRefine((action, context) => {
    if (action.createdAt >= action.expiresAt) {
      context.addIssue({
        code: 'custom',
        message: 'action expiry must follow creation',
        path: ['expiresAt'],
      });
    }

    if (
      caip10Network(action.settlement.beneficiary) !==
      action.settlement.networkId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'settlement beneficiary must belong to settlement network',
        path: ['settlement', 'beneficiary'],
      });
    }

    if (
      caip19Network(action.settlement.assetId) !== action.settlement.networkId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'settlement asset must belong to settlement network',
        path: ['settlement', 'assetId'],
      });
    }
  });

export type PaymentActionCoreV1 = z.infer<typeof paymentActionCoreV1Schema>;
export type PolicyReference = z.infer<typeof policyReferenceSchema>;
