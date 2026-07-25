import { z } from 'zod';

import {
  caip2Schema,
  nonEmptyBoundedStringSchema,
  positiveSafeIntegerSchema,
  sha256DigestSchema,
} from '../primitives.js';

export const evidencePolicyReferenceSchema = z
  .object({
    digest: sha256DigestSchema,
    id: nonEmptyBoundedStringSchema,
    serviceId: nonEmptyBoundedStringSchema,
    serviceKeyId: nonEmptyBoundedStringSchema,
    serviceNetworkId: caip2Schema,
    version: positiveSafeIntegerSchema,
  })
  .strict();

export const executorAuthorityPolicySchema = z
  .object({
    agentBookRegistry: nonEmptyBoundedStringSchema,
    audience: nonEmptyBoundedStringSchema,
    grant: z
      .object({
        digest: sha256DigestSchema,
        id: nonEmptyBoundedStringSchema,
        version: positiveSafeIntegerSchema,
      })
      .strict(),
    requiredRole: nonEmptyBoundedStringSchema,
    requiredScope: nonEmptyBoundedStringSchema,
    subjectBinding: z.literal('AGENT_ID'),
    tenantBinding: z.literal('ACTION_ORGANIZATION'),
  })
  .strict();

export type EvidencePolicyReference = z.infer<
  typeof evidencePolicyReferenceSchema
>;
export type ExecutorAuthorityPolicy = z.infer<
  typeof executorAuthorityPolicySchema
>;
