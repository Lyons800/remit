import { z } from 'zod';

import {
  boundedOpaqueStringSchema,
  canonicalMediaTypeSchema,
  nonNegativeSafeIntegerSchema,
  schemaVersionV1Schema,
  sha256DigestSchema,
  utcInstantSchema,
  uuidV7Schema,
} from '../primitives.js';

export const sourceKindSchema = z.enum([
  'UPLOAD',
  'EMAIL',
  'API',
  'ACCOUNTING',
]);

export const sourceTrustClassSchema = z.enum([
  'UNTRUSTED_UNSTRUCTURED',
  'AUTHENTICATED_STRUCTURED',
]);

export const sourceObservationV1Schema = z
  .object({
    actorReference: boundedOpaqueStringSchema,
    byteLength: nonNegativeSafeIntegerSchema.positive(),
    connectionId: uuidV7Schema.nullable(),
    contentSha256: sha256DigestSchema,
    externalEventId: boundedOpaqueStringSchema.nullable(),
    mediaType: canonicalMediaTypeSchema,
    observationId: uuidV7Schema,
    organizationId: uuidV7Schema,
    receivedAt: utcInstantSchema,
    schemaVersion: schemaVersionV1Schema,
    sourceKind: sourceKindSchema,
    sourceTrustClass: sourceTrustClassSchema,
  })
  .strict()
  .superRefine((observation, context) => {
    const connectorSource =
      observation.sourceKind === 'EMAIL' ||
      observation.sourceKind === 'ACCOUNTING';

    if (
      connectorSource &&
      (observation.connectionId === null ||
        observation.externalEventId === null)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'connector observations require connectionId and externalEventId',
      });
    }

    if (
      (observation.sourceKind === 'EMAIL' ||
        observation.sourceKind === 'UPLOAD') &&
      observation.sourceTrustClass !== 'UNTRUSTED_UNSTRUCTURED'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'email and upload observations remain untrusted',
        path: ['sourceTrustClass'],
      });
    }
  });

export type SourceKind = z.infer<typeof sourceKindSchema>;
export type SourceObservationV1 = z.infer<typeof sourceObservationV1Schema>;
export type SourceTrustClass = z.infer<typeof sourceTrustClassSchema>;
