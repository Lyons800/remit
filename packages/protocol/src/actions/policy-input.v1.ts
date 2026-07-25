import { z } from 'zod';

import {
  isSortedUnique,
  nonEmptyBoundedStringSchema,
  nonNegativeSafeIntegerSchema,
  positiveSafeIntegerSchema,
  schemaVersionV1Schema,
  sha256DigestSchema,
  utcInstantSchema,
  uuidV7Schema,
} from '../primitives.js';
import { verificationModeSchema } from '../invoices/standing-mandate.v1.js';
import { policyReferenceSchema } from './payment-action-core.v1.js';

const evidencePolicyReferenceSchema = z
  .object({
    digest: sha256DigestSchema,
    id: nonEmptyBoundedStringSchema,
    version: positiveSafeIntegerSchema,
  })
  .strict();

const authorityRequirementsSchema = z
  .object({
    actionHumanQuorum: nonNegativeSafeIntegerSchema.max(255),
    agentBookQuorum: nonNegativeSafeIntegerSchema.max(255),
    companySubjectQuorum: nonNegativeSafeIntegerSchema.max(255),
    roles: z
      .array(
        z
          .object({
            count: positiveSafeIntegerSchema.max(255),
            role: nonEmptyBoundedStringSchema,
          })
          .strict(),
      )
      .min(1)
      .max(255),
  })
  .strict()
  .superRefine((authority, context) => {
    const roleNames = authority.roles.map(({ role }) => role);
    const slots = authority.roles.reduce((sum, { count }) => sum + count, 0);
    if (
      !isSortedUnique(roleNames) ||
      authority.actionHumanQuorum !== slots ||
      authority.agentBookQuorum !== slots ||
      authority.companySubjectQuorum !== slots
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'human authority roles must be sorted, unique, and equal every quorum',
      });
    }
  });

export const paymentPolicyConfigV1Schema = z
  .object({
    humanAuthority: authorityRequirementsSchema,
    humanEvidencePolicy: evidencePolicyReferenceSchema,
    humanVerificationMode: verificationModeSchema,
    policy: policyReferenceSchema,
    schemaVersion: schemaVersionV1Schema,
  })
  .strict();

const purchaseOrderEvaluationSchema = z
  .object({
    mode: z.enum([
      'NOT_REQUIRED',
      'EXACT_REFERENCE',
      'EXACT_REFERENCE_AND_TOTAL',
    ]),
    result: z.enum([
      'NOT_REQUIRED',
      'EXACT_REFERENCE_MATCH',
      'EXACT_REFERENCE_AND_TOTAL_MATCH',
      'MISMATCH',
      'UNKNOWN',
    ]),
  })
  .strict();

const mandatePolicyInputSchema = z
  .object({
    activeStatus: z.enum(['ACTIVE', 'PAUSED', 'EXPIRED', 'REVOKED']),
    evidencePolicy: evidencePolicyReferenceSchema,
    exactContainment: z.boolean(),
    periodCapAvailable: z.boolean(),
    reference: z
      .object({
        mandateDigest: sha256DigestSchema,
        mandateId: uuidV7Schema,
        mandateVersion: positiveSafeIntegerSchema,
      })
      .strict(),
    sourceRequirement: z
      .object({
        mode: z.enum([
          'AUTHENTICATED_STRUCTURED_ONLY',
          'AUTHENTICATED_OR_INDEPENDENTLY_CONFIRMED',
        ]),
      })
      .strict(),
    verificationMode: verificationModeSchema,
  })
  .strict();

export const paymentPolicyInputV1Schema = z
  .object({
    actionCoreDigest: sha256DigestSchema,
    actionCreatedAt: utcInstantSchema,
    actionExpiresAt: utcInstantSchema,
    amountStatus: z.enum([
      'WITHIN_MANDATE',
      'ABOVE_AUTOMATION_CAP',
      'INVALID',
      'INDETERMINATE',
    ]),
    assetStatus: z.enum(['SUPPORTED', 'UNSUPPORTED', 'INDETERMINATE']),
    beneficiaryStatus: z.enum([
      'EXACT_MATCH',
      'CHANGED',
      'MISSING',
      'INDETERMINATE',
    ]),
    duplicateStatus: z.enum([
      'CLEAR',
      'SUSPECTED',
      'ALREADY_PAID',
      'OBLIGATION_SETTLED',
      'INDETERMINATE',
    ]),
    evaluatedAt: utcInstantSchema,
    extractionConflict: z.boolean(),
    fieldsIndependentlyConfirmed: z.boolean(),
    mandate: mandatePolicyInputSchema.nullable(),
    mappingPolicyStatus: z.enum(['SUPPORTED', 'UNSUPPORTED']),
    networkStatus: z.enum(['SUPPORTED', 'UNSUPPORTED']),
    policyEnabled: z.boolean(),
    purchaseOrder: purchaseOrderEvaluationSchema,
    schemaVersion: schemaVersionV1Schema,
    sourceTrustClass: z.enum([
      'UNTRUSTED_UNSTRUCTURED',
      'AUTHENTICATED_STRUCTURED',
    ]),
    supplierFirstPayment: z.boolean(),
    supplierMatch: z.enum(['EXACT', 'NEW', 'INDETERMINATE']),
    supplierStatus: z.enum(['ACTIVE', 'INACTIVE', 'REVOKED']),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.actionCreatedAt > input.evaluatedAt ||
      input.evaluatedAt >= input.actionExpiresAt
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'policy evaluation must occur within the frozen action time window',
        path: ['evaluatedAt'],
      });
    }
  });

export const policyInputManifestCoreV1Schema = z
  .object({
    configDigest: sha256DigestSchema,
    evaluator: z
      .object({
        id: z.literal('invoiceguard.policy'),
        version: schemaVersionV1Schema,
      })
      .strict(),
    inputDigest: sha256DigestSchema,
    schemaVersion: schemaVersionV1Schema,
  })
  .strict();

export const policyInputManifestV1Schema =
  policyInputManifestCoreV1Schema.safeExtend({
    inputRoot: sha256DigestSchema,
  });

export const paymentPolicyEvaluationRequestV1Schema = z
  .object({
    config: paymentPolicyConfigV1Schema,
    input: paymentPolicyInputV1Schema,
  })
  .strict();

export type PaymentPolicyConfigV1 = z.infer<typeof paymentPolicyConfigV1Schema>;
export type PaymentPolicyInputV1 = z.infer<typeof paymentPolicyInputV1Schema>;
export type PolicyInputManifestV1 = z.infer<typeof policyInputManifestV1Schema>;
export type PaymentPolicyEvaluationRequestV1 = z.infer<
  typeof paymentPolicyEvaluationRequestV1Schema
>;
