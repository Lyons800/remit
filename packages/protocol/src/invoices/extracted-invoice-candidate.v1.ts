import { z } from 'zod';

import {
  boundedOpaqueStringSchema,
  isSortedUnique,
  nonEmptyBoundedStringSchema,
  nonNegativeSafeIntegerSchema,
  positiveSafeIntegerSchema,
  schemaVersionV1Schema,
  sha256DigestSchema,
  utcInstantSchema,
  uuidV7Schema,
} from '../primitives.js';

export const candidateFieldNameSchema = z.enum([
  'supplierExternalReference',
  'supplierLegalName',
  'invoiceNumber',
  'issueDate',
  'dueDate',
  'netAmountAtoms',
  'taxAmountAtoms',
  'totalAmountAtoms',
  'invoiceAssetId',
  'proposedBeneficiary',
  'purchaseOrderReferences',
]);

export const candidateWarningCodeSchema = z.enum([
  'AMBIGUOUS_VALUE',
  'CONFLICTING_VALUES',
  'LOW_CONFIDENCE',
  'MISSING_VALUE',
  'OCR_DEGRADED',
  'UNSUPPORTED_FORMAT',
]);

const textOffsetSpanSchema = z
  .object({
    end: nonNegativeSafeIntegerSchema,
    kind: z.literal('TEXT_OFFSET'),
    observationId: uuidV7Schema,
    start: nonNegativeSafeIntegerSchema,
  })
  .strict()
  .refine(({ end, start }) => start < end, {
    message: 'text span start must precede end',
  });

const pageBoxSpanSchema = z
  .object({
    heightMicros: positiveSafeIntegerSchema.max(1_000_000),
    kind: z.literal('PAGE_BOX'),
    observationId: uuidV7Schema,
    page: positiveSafeIntegerSchema,
    widthMicros: positiveSafeIntegerSchema.max(1_000_000),
    xMicros: nonNegativeSafeIntegerSchema.max(999_999),
    yMicros: nonNegativeSafeIntegerSchema.max(999_999),
  })
  .strict()
  .superRefine((span, context) => {
    if (
      span.xMicros + span.widthMicros > 1_000_000 ||
      span.yMicros + span.heightMicros > 1_000_000
    ) {
      context.addIssue({
        code: 'custom',
        message: 'page box must remain within normalized page bounds',
      });
    }
  });

export const sourceSpanV1Schema = z.discriminatedUnion('kind', [
  textOffsetSpanSchema,
  pageBoxSpanSchema,
]);

const candidateFieldsSchema = z
  .object({
    dueDate: nonEmptyBoundedStringSchema.nullable(),
    invoiceAssetId: nonEmptyBoundedStringSchema.nullable(),
    invoiceNumber: nonEmptyBoundedStringSchema.nullable(),
    issueDate: nonEmptyBoundedStringSchema.nullable(),
    netAmountAtoms: nonEmptyBoundedStringSchema.nullable(),
    proposedBeneficiary: nonEmptyBoundedStringSchema.nullable(),
    purchaseOrderReferences: z.array(nonEmptyBoundedStringSchema).max(128),
    supplierExternalReference: nonEmptyBoundedStringSchema.nullable(),
    supplierLegalName: nonEmptyBoundedStringSchema.nullable(),
    taxAmountAtoms: nonEmptyBoundedStringSchema.nullable(),
    totalAmountAtoms: nonEmptyBoundedStringSchema.nullable(),
  })
  .strict()
  .superRefine(({ purchaseOrderReferences }, context) => {
    if (!isSortedUnique(purchaseOrderReferences)) {
      context.addIssue({
        code: 'custom',
        message: 'purchase-order references must be sorted and unique',
        path: ['purchaseOrderReferences'],
      });
    }
  });

const fieldEvidenceSchema = z
  .object({
    confidenceBps: nonNegativeSafeIntegerSchema.max(10_000),
    field: candidateFieldNameSchema,
    sourceSpans: z.array(sourceSpanV1Schema).min(1).max(64),
    warningCodes: z.array(candidateWarningCodeSchema).max(16),
  })
  .strict()
  .superRefine(({ warningCodes }, context) => {
    if (!isSortedUnique(warningCodes)) {
      context.addIssue({
        code: 'custom',
        message: 'warning codes must be sorted and unique',
        path: ['warningCodes'],
      });
    }
  });

export const extractedInvoiceCandidateCoreV1Schema = z
  .object({
    candidateId: uuidV7Schema,
    extractedAt: utcInstantSchema,
    extractor: z
      .object({
        id: boundedOpaqueStringSchema,
        version: boundedOpaqueStringSchema,
      })
      .strict(),
    fieldEvidence: z.array(fieldEvidenceSchema).max(11),
    fields: candidateFieldsSchema,
    observationIds: z.array(uuidV7Schema).min(1).max(32),
    organizationId: uuidV7Schema,
    parseWarningCodes: z.array(candidateWarningCodeSchema).max(16),
    schemaVersion: schemaVersionV1Schema,
  })
  .strict()
  .superRefine((candidate, context) => {
    if (!isSortedUnique(candidate.observationIds)) {
      context.addIssue({
        code: 'custom',
        message: 'observation IDs must be sorted and unique',
        path: ['observationIds'],
      });
    }

    if (!isSortedUnique(candidate.parseWarningCodes)) {
      context.addIssue({
        code: 'custom',
        message: 'parse warning codes must be sorted and unique',
        path: ['parseWarningCodes'],
      });
    }

    const evidenceFields = candidate.fieldEvidence.map(({ field }) => field);
    if (!isSortedUnique(evidenceFields)) {
      context.addIssue({
        code: 'custom',
        message: 'field evidence must be sorted and unique by field',
        path: ['fieldEvidence'],
      });
    }

    for (const evidence of candidate.fieldEvidence) {
      for (const span of evidence.sourceSpans) {
        if (!candidate.observationIds.includes(span.observationId)) {
          context.addIssue({
            code: 'custom',
            message: 'source span must reference a candidate observation',
            path: ['fieldEvidence'],
          });
        }
      }
    }

    for (const [field, value] of Object.entries(candidate.fields)) {
      const present = Array.isArray(value) ? value.length > 0 : value !== null;
      if (
        present &&
        !candidate.fieldEvidence.some((evidence) => evidence.field === field)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'every populated candidate field requires source evidence',
          path: ['fieldEvidence'],
        });
      }
    }
  });

export const extractedInvoiceCandidateV1Schema =
  extractedInvoiceCandidateCoreV1Schema
    .safeExtend({
      candidateDigest: sha256DigestSchema,
    })
    .strict();

export type CandidateFieldName = z.infer<typeof candidateFieldNameSchema>;
export type CandidateWarningCode = z.infer<typeof candidateWarningCodeSchema>;
export type ExtractedInvoiceCandidateCoreV1 = z.infer<
  typeof extractedInvoiceCandidateCoreV1Schema
>;
export type ExtractedInvoiceCandidateV1 = z.infer<
  typeof extractedInvoiceCandidateV1Schema
>;
export type SourceSpanV1 = z.infer<typeof sourceSpanV1Schema>;
