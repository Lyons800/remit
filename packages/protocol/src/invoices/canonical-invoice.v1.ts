import { z } from 'zod';

import {
  assetIdSchema,
  beneficiarySchema,
  canonicalAtomsSchema,
  isoDateSchema,
  isSortedUnique,
  nonEmptyBoundedStringSchema,
  positiveAtomsSchema,
  positiveSafeIntegerSchema,
  schemaVersionV1Schema,
  sha256DigestSchema,
  utcInstantSchema,
  uuidV7Schema,
} from '../primitives.js';

export const canonicalInvoiceV1Schema = z
  .object({
    createdAt: utcInstantSchema,
    dueDate: isoDateSchema,
    invoiceAssetId: assetIdSchema,
    invoiceId: uuidV7Schema,
    invoiceNumber: nonEmptyBoundedStringSchema,
    invoiceRevision: positiveSafeIntegerSchema,
    invoiceRevisionId: uuidV7Schema,
    issueDate: isoDateSchema,
    lineItemsRoot: sha256DigestSchema,
    netAmountAtoms: canonicalAtomsSchema,
    obligationId: uuidV7Schema,
    organizationId: uuidV7Schema,
    proposedBeneficiary: beneficiarySchema,
    purchaseOrderReferences: z.array(nonEmptyBoundedStringSchema).max(128),
    schemaVersion: schemaVersionV1Schema,
    sourceEvidenceRoot: sha256DigestSchema,
    supplierId: uuidV7Schema,
    supplierSnapshotDigest: sha256DigestSchema,
    supersedesInvoiceRevisionId: uuidV7Schema.nullable(),
    taxAmountAtoms: canonicalAtomsSchema,
    totalAmountAtoms: positiveAtomsSchema,
  })
  .strict()
  .superRefine((invoice, context) => {
    if (
      BigInt(invoice.netAmountAtoms) + BigInt(invoice.taxAmountAtoms) !==
      BigInt(invoice.totalAmountAtoms)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'net amount plus tax amount must equal total amount',
        path: ['totalAmountAtoms'],
      });
    }

    if (invoice.dueDate < invoice.issueDate) {
      context.addIssue({
        code: 'custom',
        message: 'due date cannot precede issue date',
        path: ['dueDate'],
      });
    }

    if (
      (invoice.invoiceRevision === 1) !==
      (invoice.supersedesInvoiceRevisionId === null)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'revision one must not supersede another revision; later revisions must',
        path: ['supersedesInvoiceRevisionId'],
      });
    }

    if (!isSortedUnique(invoice.purchaseOrderReferences)) {
      context.addIssue({
        code: 'custom',
        message: 'purchase-order references must be sorted and unique',
        path: ['purchaseOrderReferences'],
      });
    }
  });

export type CanonicalInvoiceV1 = z.infer<typeof canonicalInvoiceV1Schema>;
