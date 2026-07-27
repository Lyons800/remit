import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

/**
 * Read one uploaded invoice document into structured fields.
 *
 * Every field carries the model's own confidence. Low-confidence values are
 * surfaced in the UI as "couldn't read reliably" and never silently trusted —
 * the deterministic checks downstream treat a low-confidence IBAN or total
 * differently from a confident one.
 *
 * Amounts are integer cents. Asking the model for cents avoids float
 * arithmetic on money and makes the downstream sum checks exact.
 */

const confidence = z.enum(['high', 'medium', 'low']);

const stringField = z.object({
  value: z.string().nullable(),
  confidence,
});

const centsField = z.object({
  value: z.number().int().nullable(),
  confidence,
});

const lineItem = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPriceCents: z.number().int().nullable(),
  totalCents: z.number().int().nullable(),
});

export const invoiceExtractionSchema = z.object({
  isInvoice: z
    .boolean()
    .describe('false when the document is not an invoice at all'),
  supplierName: stringField,
  supplierTaxId: stringField.describe('VAT / tax identifier, e.g. PT NIF'),
  invoiceNumber: stringField,
  issueDate: stringField.describe('YYYY-MM-DD'),
  dueDate: stringField.describe('YYYY-MM-DD'),
  currency: stringField.describe('ISO 4217, e.g. EUR'),
  iban: stringField.describe('payee IBAN with spaces removed'),
  lineItems: z.array(lineItem),
  subtotalCents: centsField.describe('total before VAT, integer cents'),
  vatRatePercent: z.number().nullable(),
  vatAmountCents: centsField,
  totalCents: centsField.describe('grand total payable, integer cents'),
  notes: z
    .string()
    .describe('anything unusual a human reviewer should know, or empty'),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

const EXTRACTION_PROMPT = `Read this supplier invoice and extract its fields.

Rules:
- Report each field with your honest confidence. Use "low" whenever the text is
  ambiguous, partially illegible, or inferred rather than printed — a wrong
  value marked "high" is the worst outcome, a null marked "low" is fine.
- All monetary amounts are integer cents in the invoice's own currency.
- Remove spaces from the IBAN. Do not repair or guess missing characters.
- Dates are YYYY-MM-DD.
- If the document is not an invoice, set isInvoice to false and leave fields null.`;

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function isSupportedInvoiceContentType(contentType: string): boolean {
  return contentType === 'application/pdf' || SUPPORTED_IMAGE_TYPES.has(contentType);
}

export function isExtractionConfigured(): boolean {
  const key = process.env['ANTHROPIC_API_KEY'];
  return key !== undefined && key !== '';
}

export async function extractInvoice(input: {
  readonly content: Uint8Array;
  readonly contentType: string;
}): Promise<InvoiceExtraction> {
  const client = new Anthropic();
  const data = Buffer.from(input.content).toString('base64');

  const documentBlock: Anthropic.ContentBlockParam =
    input.contentType === 'application/pdf'
      ? {
          source: { data, media_type: 'application/pdf', type: 'base64' },
          type: 'document',
        }
      : {
          source: {
            data,
            media_type: input.contentType as
              | 'image/gif'
              | 'image/jpeg'
              | 'image/png'
              | 'image/webp',
            type: 'base64',
          },
          type: 'image',
        };

  const response = await client.messages.parse({
    max_tokens: 16000,
    messages: [
      {
        content: [documentBlock, { text: EXTRACTION_PROMPT, type: 'text' }],
        role: 'user',
      },
    ],
    model: 'claude-opus-5',
    output_config: { format: zodOutputFormat(invoiceExtractionSchema) },
  });

  if (response.stop_reason === 'refusal' || response.parsed_output === null) {
    throw new Error('The document could not be read as an invoice.');
  }
  return response.parsed_output;
}
