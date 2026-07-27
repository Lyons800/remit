import { describe, expect, it } from 'vitest';

import { runInvoiceChecks, validateIban } from './invoice-checks.js';
import type { InvoiceExtraction } from './invoice-extraction.server.js';

const clean: InvoiceExtraction = {
  currency: { confidence: 'high', value: 'EUR' },
  dueDate: { confidence: 'high', value: '2099-12-31' },
  iban: { confidence: 'high', value: 'PT50000201231234567890154' },
  invoiceNumber: { confidence: 'high', value: 'FT 2026/118' },
  isInvoice: true,
  issueDate: { confidence: 'high', value: '2026-07-01' },
  lineItems: [
    {
      description: 'Court resurfacing',
      quantity: 1,
      totalCents: 100_000,
      unitPriceCents: 100_000,
    },
    { description: 'Materials', quantity: 2, totalCents: 40_000, unitPriceCents: 20_000 },
  ],
  notes: '',
  subtotalCents: { confidence: 'high', value: 140_000 },
  supplierName: { confidence: 'high', value: 'Padel Surfaces Lda' },
  supplierTaxId: { confidence: 'high', value: '519312376' },
  totalCents: { confidence: 'high', value: 172_200 },
  vatAmountCents: { confidence: 'high', value: 32_200 },
  vatRatePercent: 23,
};

const context = {
  baseline: undefined,
  duplicateInvoiceId: undefined,
  now: new Date('2026-07-27T12:00:00Z'),
};

describe('IBAN validation', () => {
  it('accepts a valid Portuguese IBAN', () => {
    expect(validateIban('PT50000201231234567890154')).toBe(true);
  });
  it('accepts a valid German IBAN', () => {
    expect(validateIban('DE89370400440532013000')).toBe(true);
  });
  it('rejects a single-digit typo', () => {
    expect(validateIban('DE89370400440532013001')).toBe(false);
  });
  it('rejects garbage', () => {
    expect(validateIban('NOTANIBAN')).toBe(false);
  });
});

describe('invoice checks', () => {
  it('passes a clean invoice with no findings above info', () => {
    const findings = runInvoiceChecks(clean, context);
    expect(findings.filter((f) => f.severity !== 'info')).toHaveLength(0);
  });

  it('flags a document that is not an invoice', () => {
    const findings = runInvoiceChecks({ ...clean, isInvoice: false }, context);
    expect(findings.some((f) => f.code === 'NOT_AN_INVOICE' && f.severity === 'critical')).toBe(
      true,
    );
  });

  it('catches line items that do not sum to the subtotal', () => {
    const findings = runInvoiceChecks(
      { ...clean, subtotalCents: { confidence: 'high', value: 150_000 } },
      context,
    );
    expect(findings.some((f) => f.code === 'LINE_ITEMS_SUM_MISMATCH')).toBe(true);
  });

  it('catches VAT arithmetic that does not add up', () => {
    const findings = runInvoiceChecks(
      { ...clean, vatAmountCents: { confidence: 'high', value: 20_000 } },
      context,
    );
    expect(findings.some((f) => f.code === 'VAT_MISMATCH')).toBe(true);
    expect(findings.some((f) => f.code === 'TOTAL_MISMATCH')).toBe(true);
  });

  it('tolerates one-cent rounding in VAT', () => {
    const findings = runInvoiceChecks(
      {
        ...clean,
        totalCents: { confidence: 'high', value: 172_199 },
        vatAmountCents: { confidence: 'high', value: 32_199 },
      },
      context,
    );
    expect(findings.some((f) => f.code === 'VAT_MISMATCH')).toBe(false);
    expect(findings.some((f) => f.code === 'TOTAL_MISMATCH')).toBe(false);
  });

  it('flags an invalid IBAN as critical', () => {
    const findings = runInvoiceChecks(
      { ...clean, iban: { confidence: 'high', value: 'PT50000201231234567890155' } },
      context,
    );
    expect(findings.some((f) => f.code === 'IBAN_INVALID' && f.severity === 'critical')).toBe(
      true,
    );
  });

  it('flags an IBAN that differs from the supplier baseline as critical', () => {
    const findings = runInvoiceChecks(clean, {
      ...context,
      baseline: {
        displayName: 'Padel Surfaces Lda',
        iban: 'DE89370400440532013000',
        invoiceCount: 14,
        supplierKey: 'padel-surfaces-lda',
        taxId: null,
        totalCents: 1_000_000,
      },
    });
    expect(findings.some((f) => f.code === 'IBAN_CHANGED' && f.severity === 'critical')).toBe(
      true,
    );
  });

  it('accepts a matching baseline IBAN quietly', () => {
    const findings = runInvoiceChecks(clean, {
      ...context,
      baseline: {
        displayName: 'Padel Surfaces Lda',
        iban: 'PT50000201231234567890154',
        invoiceCount: 14,
        supplierKey: 'padel-surfaces-lda',
        taxId: null,
        totalCents: 1_000_000,
      },
    });
    expect(findings.some((f) => f.code === 'IBAN_CHANGED')).toBe(false);
    expect(findings.some((f) => f.code === 'NEW_SUPPLIER')).toBe(false);
  });

  it('marks a first-time supplier', () => {
    const findings = runInvoiceChecks(clean, context);
    expect(findings.some((f) => f.code === 'NEW_SUPPLIER' && f.severity === 'info')).toBe(true);
  });

  it('flags a duplicate invoice number as critical', () => {
    const findings = runInvoiceChecks(clean, {
      ...context,
      duplicateInvoiceId: 'earlier-invoice-uuid',
    });
    expect(
      findings.some((f) => f.code === 'DUPLICATE_INVOICE_NUMBER' && f.severity === 'critical'),
    ).toBe(true);
  });

  it('flags an amount far outside the supplier history', () => {
    const findings = runInvoiceChecks(
      { ...clean, totalCents: { confidence: 'high', value: 2_000_000 } },
      {
        ...context,
        baseline: {
          displayName: 'Padel Surfaces Lda',
          iban: 'PT50000201231234567890154',
          invoiceCount: 10,
          supplierKey: 'padel-surfaces-lda',
          taxId: null,
          totalCents: 500_000, // average 50_000/invoice
        },
      },
    );
    expect(findings.some((f) => f.code === 'AMOUNT_ANOMALY' && f.severity === 'warning')).toBe(
      true,
    );
  });

  it('flags low-confidence critical fields as unreadable', () => {
    const findings = runInvoiceChecks(
      { ...clean, iban: { confidence: 'low', value: 'PT50000201231234567890154' } },
      context,
    );
    expect(findings.some((f) => f.code === 'UNREADABLE_FIELD' && f.severity === 'warning')).toBe(
      true,
    );
  });

  it('flags missing total and missing IBAN', () => {
    const findings = runInvoiceChecks(
      {
        ...clean,
        iban: { confidence: 'high', value: null },
        totalCents: { confidence: 'high', value: null },
      },
      context,
    );
    expect(findings.some((f) => f.code === 'MISSING_FIELD' && f.severity === 'critical')).toBe(
      true,
    );
  });

  it('notes a due date already in the past', () => {
    const findings = runInvoiceChecks(
      { ...clean, dueDate: { confidence: 'high', value: '2026-01-01' } },
      context,
    );
    expect(findings.some((f) => f.code === 'PAST_DUE')).toBe(true);
  });
});
