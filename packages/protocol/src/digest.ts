import { createHash } from 'node:crypto';

import type { z } from 'zod';

import { canonicalizeJson } from './canonical-json.js';
import { sha256DigestSchema } from './primitives.js';
import type { Sha256Digest } from './primitives.js';

export const digestDomains = {
  canonicalInvoice: 'invoiceguard:canonical-invoice:v1',
  digestManifest: 'invoiceguard:digest-manifest:v1',
  invoiceCandidate: 'invoiceguard:invoice-candidate:v1',
  paymentAction: 'invoiceguard:payment-action:v1',
  paymentActionCore: 'invoiceguard:payment-action-core:v1',
  policyConfig: 'invoiceguard:policy-config:v1',
  policyDecision: 'invoiceguard:policy-decision:v1',
  policyInput: 'invoiceguard:policy-input:v1',
  policyInputManifest: 'invoiceguard:policy-input-manifest:v1',
  standingMandate: 'invoiceguard:standing-mandate:v1',
  supplierSnapshot: 'invoiceguard:supplier-snapshot:v1',
} as const;

export type DigestDomain = (typeof digestDomains)[keyof typeof digestDomains];

export function digestCanonicalValue<T>(
  domain: DigestDomain,
  schema: z.ZodType<T>,
  value: unknown,
): Sha256Digest {
  const parsed = schema.parse(value);
  const hash = createHash('sha256');
  hash.update(domain, 'ascii');
  hash.update(Uint8Array.of(0));
  hash.update(canonicalizeJson(parsed), 'utf8');
  return sha256DigestSchema.parse(hash.digest('hex'));
}
