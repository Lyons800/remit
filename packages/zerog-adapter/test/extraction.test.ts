import { describe, expect, it } from 'vitest';

import {
  buildExtractionRecord,
  deriveBeneficiaryReading,
  extractionRecordHash,
  hashInvoice,
  mayAutoSettle,
  parseExtraction,
  type ExtractionRecord,
} from '../src/extraction.js';

const INVOICE = 'INV-2026-0912  Padel Surfaces Lda  PT50 0002 0123 1234 5678 9015 4  EUR 25,000.00';
const ON_FILE = 'PT50 0002 0123 1234 5678 9015 4';

const good = JSON.stringify({
  supplierName: 'Padel Surfaces Lda',
  iban: 'PT50 0002 0123 1234 5678 9015 4',
  amountMinor: '2500000',
  currency: 'EUR',
  invoiceRef: 'INV-2026-0912',
});

function record(rawOutput: string, teeVerified: boolean | null): ExtractionRecord {
  return buildExtractionRecord({
    invoiceHash: hashInvoice(INVOICE),
    provider: '0xprovider',
    model: 'qwen/qwen2.5-omni-7b',
    rawOutput,
    chatId: 'chat-1',
    teeVerified,
  });
}

describe('parsing model output', () => {
  it('accepts a well formed object and normalises the IBAN', () => {
    const fields = parseExtraction(good);
    expect(fields?.iban).toBe('PT50000201231234567890154');
    expect(fields?.amountMinor).toBe('2500000');
  });

  it('tolerates a single markdown fence', () => {
    expect(parseExtraction('```json\n' + good + '\n```')).not.toBeNull();
  });

  it('REFUSES a partial extraction rather than guessing', () => {
    expect(parseExtraction(JSON.stringify({ supplierName: 'X' }))).toBeNull();
  });

  it('REFUSES the model admitting ambiguity', () => {
    expect(parseExtraction(JSON.stringify({ error: 'AMBIGUOUS' }))).toBeNull();
  });

  it('REFUSES a malformed IBAN, a float amount, and prose', () => {
    expect(parseExtraction(JSON.stringify({ ...JSON.parse(good), iban: 'nope' }))).toBeNull();
    expect(parseExtraction(JSON.stringify({ ...JSON.parse(good), amountMinor: '25000.00' }))).toBeNull();
    expect(parseExtraction('The IBAN is PT50...')).toBeNull();
  });
});

describe('fail-closed status', () => {
  it('an unparseable output is UNKNOWN with no fields, even if attested', () => {
    const r = record('garbage', true);
    expect(r.status).toBe('UNKNOWN');
    expect(r.fields).toBeNull();
  });

  it('parsed but unattested is UNVERIFIED, never VERIFIED', () => {
    expect(record(good, null).status).toBe('UNVERIFIED');
    expect(record(good, false).status).toBe('UNVERIFIED');
  });

  it('parsed and attested is VERIFIED', () => {
    expect(record(good, true).status).toBe('VERIFIED');
  });
});

describe('the join into policy', () => {
  it('a matching attested reading may settle unattended', () => {
    const r = record(good, true);
    const reading = deriveBeneficiaryReading(r, ON_FILE);
    expect(reading).toBe('EXACT_MATCH');
    expect(mayAutoSettle(r, reading)).toBe(true);
  });

  it('ATTACK — a changed account is CHANGED and cannot auto-settle', () => {
    const changed = JSON.stringify({ ...JSON.parse(good), iban: 'LT12 1000 1111 0100 1000' });
    const r = record(changed, true);
    const reading = deriveBeneficiaryReading(r, ON_FILE);
    expect(reading).toBe('CHANGED');
    expect(mayAutoSettle(r, reading)).toBe(false);
  });

  it('ATTACK — an unreadable invoice is UNRESOLVED, not a match', () => {
    const r = record('garbage', true);
    expect(deriveBeneficiaryReading(r, ON_FILE)).toBe('UNRESOLVED');
    expect(mayAutoSettle(r, 'UNRESOLVED')).toBe(false);
  });

  it('ATTACK — an unattested reading cannot auto-settle even when it matches', () => {
    const r = record(good, null);
    expect(deriveBeneficiaryReading(r, ON_FILE)).toBe('EXACT_MATCH');
    expect(mayAutoSettle(r, 'EXACT_MATCH')).toBe(false);
  });

  it('a supplier with no account on file is UNRESOLVED', () => {
    expect(deriveBeneficiaryReading(record(good, true), null)).toBe('UNRESOLVED');
  });
});

describe('record hash', () => {
  it('is deterministic and changes when the reading changes', () => {
    const a = record(good, true);
    expect(extractionRecordHash(a)).toBe(extractionRecordHash(record(good, true)));
    expect(extractionRecordHash(a)).not.toBe(extractionRecordHash(record(good, null)));
  });
});
