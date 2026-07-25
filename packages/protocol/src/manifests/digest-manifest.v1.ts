import { z } from 'zod';

import {
  boundedOpaqueStringSchema,
  isSortedUnique,
  schemaVersionV1Schema,
  sha256DigestSchema,
} from '../primitives.js';

export const digestManifestEntrySchema = z
  .object({
    digest: sha256DigestSchema,
    kind: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/u),
    subjectId: boundedOpaqueStringSchema,
  })
  .strict();

export const digestManifestV1Schema = z
  .object({
    entries: z.array(digestManifestEntrySchema).max(256),
    schemaVersion: schemaVersionV1Schema,
  })
  .strict()
  .superRefine(({ entries }, context) => {
    const keys = entries.map(
      ({ digest, kind, subjectId }) =>
        `${kind}\u0000${subjectId}\u0000${digest}`,
    );

    if (!isSortedUnique(keys)) {
      context.addIssue({
        code: 'custom',
        message: 'manifest entries must be sorted and unique',
        path: ['entries'],
      });
    }
  });

export type DigestManifestEntryV1 = z.infer<typeof digestManifestEntrySchema>;
export type DigestManifestV1 = z.infer<typeof digestManifestV1Schema>;
