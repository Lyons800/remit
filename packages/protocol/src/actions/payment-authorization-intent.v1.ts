import { z } from 'zod';

import { sha256DigestSchema } from '../primitives.js';
import { paymentActionCoreV1Schema } from './payment-action-core.v1.js';

export const paymentAuthorizationIntentV1Schema = paymentActionCoreV1Schema
  .safeExtend({
    policyDecisionDigest: sha256DigestSchema,
  })
  .strict();

export const paymentActionEnvelopeV1Schema = z
  .object({
    action: paymentAuthorizationIntentV1Schema,
    actionDigest: sha256DigestSchema,
  })
  .strict();

export type PaymentActionEnvelopeV1 = z.infer<
  typeof paymentActionEnvelopeV1Schema
>;
export type PaymentAuthorizationIntentV1 = z.infer<
  typeof paymentAuthorizationIntentV1Schema
>;
