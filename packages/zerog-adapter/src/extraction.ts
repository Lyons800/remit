import { encodeAbiParameters, keccak256, toHex } from 'viem';

/**
 * Attested invoice extraction — pure logic, no network.
 *
 * The claim this supports is PROVENANCE, not privacy:
 *
 *   "You can prove which model, unmodified, produced the figures that were
 *    approved, and that nothing altered them between reading and approval."
 *
 * It deliberately does not claim confidential compute. 0G's end-to-end
 * encryption client does not yet verify TEE attestations or signatures, so
 * asserting privacy would be asserting something a client cannot check.
 * Provenance is checkable, so provenance is what we claim.
 *
 * Chain of custody:
 *
 *   invoice bytes ──keccak──▶ invoiceHash
 *   invoiceHash + TeeML inference ──▶ extracted fields (strict JSON)
 *   fields + invoiceHash + model + provider + verified ──▶ ExtractionRecord
 *   keccak(record) ──▶ recordHash
 *
 * FAIL CLOSED. Any parse failure, validation failure, or unverified signature
 * yields UNKNOWN with no fields. This module never guesses, and a payment
 * derived from an UNKNOWN reading must escalate to human authority.
 */

export type Hash32 = `0x${string}`;

/** What the model must return. Everything else is rejected. */
export interface ExtractedInvoiceFields {
  /** Supplier legal name as printed. */
  readonly supplierName: string;
  /** Beneficiary IBAN, whitespace removed, upper-case. */
  readonly iban: string;
  /** Total payable in minor units as a decimal string — never a float. */
  readonly amountMinor: string;
  /** ISO 4217 code, e.g. EUR. */
  readonly currency: string;
  /** Invoice reference as printed. */
  readonly invoiceRef: string;
}

export type ExtractionStatus = 'UNKNOWN' | 'UNVERIFIED' | 'VERIFIED';

export interface ExtractionRecord {
  readonly status: ExtractionStatus;
  /** keccak256 of the exact invoice bytes the model saw. */
  readonly invoiceHash: Hash32;
  /** Provider wallet address on 0G. */
  readonly provider: string;
  /** Model identifier as listed in the 0G catalog. */
  readonly model: string;
  /** Present only when status is not UNKNOWN. */
  readonly fields: ExtractedInvoiceFields | null;
  /** keccak256 of the raw model output — lets anyone re-check the parse. */
  readonly outputHash: Hash32;
  /** Chat id returned by the provider; keys the signature lookup. */
  readonly chatId: string;
}

/** Shape check only. This is not bank validation — see the claims boundary. */
const IBAN_PATTERN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const AMOUNT_PATTERN = /^[1-9][0-9]*$/;

export function hashInvoice(invoice: string | Uint8Array): Hash32 {
  return keccak256(typeof invoice === 'string' ? toHex(invoice) : invoice);
}

/**
 * The prompt is part of the audit surface. It is committed to indirectly
 * through the record hash, so "what was the model asked to do" stays
 * answerable after the fact.
 */
export const EXTRACTION_PROMPT_VERSION = 'IG-EXTRACT-V1';

export function buildExtractionPrompt(invoiceText: string): string {
  return [
    `[${EXTRACTION_PROMPT_VERSION}]`,
    'You are an invoice field extractor. Read the invoice below and return',
    'ONLY a JSON object, no prose, with exactly these keys:',
    '{"supplierName": string, "iban": string, "amountMinor": string,',
    ' "currency": string, "invoiceRef": string}',
    'amountMinor is the total payable in minor units (cents) as a decimal',
    'string. iban is the payment IBAN with spaces removed. If any field is',
    'not clearly present, return {"error": "AMBIGUOUS"} instead. Do not guess.',
    '--- INVOICE ---',
    invoiceText,
    '--- END INVOICE ---',
  ].join('\n');
}

/**
 * Strict parse of the model output.
 *
 * Anything short of a fully valid object is null, which the caller maps to
 * UNKNOWN. There are no partial extractions: a half-read invoice is a
 * guess wearing a result's clothing.
 */
export function parseExtraction(raw: string): ExtractedInvoiceFields | null {
  let candidate: unknown;
  try {
    // Models wrap JSON in fences with some regularity; strip one layer only.
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    candidate = JSON.parse(stripped);
  } catch {
    return null;
  }

  if (typeof candidate !== 'object' || candidate === null) return null;
  const obj = candidate as Record<string, unknown>;
  if ('error' in obj) return null;

  const { supplierName, iban: rawIban, amountMinor, currency, invoiceRef } = obj;

  if (
    typeof supplierName !== 'string' ||
    supplierName.trim() === '' ||
    typeof rawIban !== 'string' ||
    typeof amountMinor !== 'string' ||
    typeof currency !== 'string' ||
    typeof invoiceRef !== 'string' ||
    invoiceRef.trim() === ''
  ) {
    return null;
  }

  const iban = rawIban.replace(/\s+/g, '').toUpperCase();
  if (!IBAN_PATTERN.test(iban)) return null;
  if (!AMOUNT_PATTERN.test(amountMinor)) return null;
  if (!CURRENCY_PATTERN.test(currency)) return null;

  return {
    supplierName: supplierName.trim(),
    iban,
    amountMinor,
    currency,
    invoiceRef: invoiceRef.trim(),
  };
}

export interface BuildRecordInput {
  readonly invoiceHash: Hash32;
  readonly provider: string;
  readonly model: string;
  readonly rawOutput: string;
  readonly chatId: string;
  /** Result of the provider signature check — null when unavailable. */
  readonly teeVerified: boolean | null;
}

/**
 * Assemble the record, fail-closed:
 *
 *   parse failed         -> UNKNOWN    (no fields, whatever the signature said)
 *   parsed + verified    -> VERIFIED
 *   parsed, unverified   -> UNVERIFIED (readable, but not attested; policy must
 *                                       never treat it as though it were)
 */
export function buildExtractionRecord(
  input: BuildRecordInput,
): ExtractionRecord {
  const fields = parseExtraction(input.rawOutput);
  const outputHash = keccak256(toHex(input.rawOutput));

  if (fields === null) {
    return {
      status: 'UNKNOWN',
      invoiceHash: input.invoiceHash,
      provider: input.provider,
      model: input.model,
      fields: null,
      outputHash,
      chatId: input.chatId,
    };
  }

  return {
    status: input.teeVerified === true ? 'VERIFIED' : 'UNVERIFIED',
    invoiceHash: input.invoiceHash,
    provider: input.provider,
    model: input.model,
    fields,
    outputHash,
    chatId: input.chatId,
  };
}

/**
 * The hash the rest of the system references. Change what was read, who read
 * it, what came out, or whether it was attested, and this changes.
 */
export function extractionRecordHash(record: ExtractionRecord): Hash32 {
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'version', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'invoiceHash', type: 'bytes32' },
        { name: 'provider', type: 'string' },
        { name: 'model', type: 'string' },
        { name: 'outputHash', type: 'bytes32' },
        { name: 'chatId', type: 'string' },
        { name: 'fieldsJson', type: 'string' },
      ],
      [
        EXTRACTION_PROMPT_VERSION,
        record.status,
        record.invoiceHash,
        record.provider,
        record.model,
        record.outputHash,
        record.chatId,
        record.fields === null ? '' : JSON.stringify(record.fields),
      ],
    ),
  );
}

/* ── the link into policy ────────────────────────────────────────────── */

/**
 * What the reading implies about the beneficiary, versus what is on file.
 *
 * This is the join between 0G and the policy engine, and it is where the
 * fail-closed rule earns its keep. `UNRESOLVED` is returned whenever the
 * reading cannot be trusted to answer the question — an unparsed invoice, or
 * a supplier with no account on file — and the policy must treat it exactly
 * as it treats a changed account: escalate to distinct humans.
 *
 * The one thing this must never do is let a failed read look like a match.
 */
export type BeneficiaryReading = 'CHANGED' | 'EXACT_MATCH' | 'UNRESOLVED';

export function deriveBeneficiaryReading(
  record: ExtractionRecord,
  accountOnFile: string | null,
): BeneficiaryReading {
  if (record.fields === null) return 'UNRESOLVED';
  if (accountOnFile === null) return 'UNRESOLVED';

  const onFile = accountOnFile.replace(/\s+/g, '').toUpperCase();
  if (!IBAN_PATTERN.test(onFile)) return 'UNRESOLVED';

  return record.fields.iban === onFile ? 'EXACT_MATCH' : 'CHANGED';
}

/**
 * Whether a reading may be used to settle without a human.
 *
 * Only an attested, matching reading qualifies. An UNVERIFIED reading is a
 * model output nobody vouched for, which is precisely the situation the
 * authorisation layer exists to survive.
 */
export function mayAutoSettle(
  record: ExtractionRecord,
  reading: BeneficiaryReading,
): boolean {
  return record.status === 'VERIFIED' && reading === 'EXACT_MATCH';
}
