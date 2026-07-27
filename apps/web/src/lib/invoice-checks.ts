import type { InvoiceFinding, SupplierBaseline } from '@remit/persistence';

import type { InvoiceExtraction } from './invoice-extraction.server';

/**
 * Deterministic invoice checks.
 *
 * Pure functions over the extraction and the organisation's own records — no
 * network, no model. The AI reads the document; whether the document is
 * *acceptable* is decided here, reproducibly. Every rule produces a finding a
 * human can act on, with the evidence in `detail`.
 *
 * Severity is what routing consumes: any critical or warning finding blocks
 * the invoice pending human approval; info findings are annotations.
 */

export interface CheckContext {
  readonly baseline: SupplierBaseline | undefined;
  readonly duplicateInvoiceId: string | undefined;
  readonly now: Date;
}

/** Rounding slack for per-line and VAT arithmetic, in cents. */
const ROUNDING_TOLERANCE_CENTS = 2;
/** A total this many times the supplier's historical average is anomalous. */
const AMOUNT_ANOMALY_FACTOR = 3;

const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

/** ISO 13616 mod-97 checksum. */
export function validateIban(iban: string): boolean {
  const normalized = iban.replaceAll(/\s+/gu, '').toUpperCase();
  if (!IBAN_SHAPE.test(normalized)) return false;

  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const value =
      character >= 'A' && character <= 'Z'
        ? String(character.charCodeAt(0) - 55)
        : character;
    for (const digit of value) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

export function runInvoiceChecks(
  extraction: InvoiceExtraction,
  context: CheckContext,
): readonly InvoiceFinding[] {
  const findings: InvoiceFinding[] = [];
  const finding = (
    code: string,
    severity: InvoiceFinding['severity'],
    detail: Record<string, unknown>,
  ) => findings.push({ code, detail, severity });

  if (!extraction.isInvoice) {
    finding('NOT_AN_INVOICE', 'critical', {
      message: 'The uploaded document does not appear to be an invoice.',
    });
    return findings;
  }

  /* ── required fields ─────────────────────────────────────────────── */
  const missing: string[] = [];
  if (extraction.supplierName.value === null) missing.push('supplier name');
  if (extraction.totalCents.value === null) missing.push('total amount');
  if (extraction.iban.value === null) missing.push('IBAN');
  if (extraction.invoiceNumber.value === null) missing.push('invoice number');
  if (missing.length > 0) {
    finding('MISSING_FIELD', 'critical', {
      fields: missing,
      message: `Required fields could not be found: ${missing.join(', ')}.`,
    });
  }

  /* ── extraction confidence ───────────────────────────────────────── */
  const shaky = (
    [
      ['IBAN', extraction.iban],
      ['total amount', extraction.totalCents],
      ['supplier name', extraction.supplierName],
      ['invoice number', extraction.invoiceNumber],
    ] as const
  ).filter(([, field]) => field.value !== null && field.confidence === 'low');
  if (shaky.length > 0) {
    finding('UNREADABLE_FIELD', 'warning', {
      fields: shaky.map(([label]) => label),
      message: `These fields could not be read reliably and need human eyes: ${shaky
        .map(([label]) => label)
        .join(', ')}.`,
    });
  }

  /* ── arithmetic ──────────────────────────────────────────────────── */
  const itemTotals = extraction.lineItems
    .map((item) => item.totalCents)
    .filter((cents): cents is number => cents !== null);
  const subtotal = extraction.subtotalCents.value;
  if (itemTotals.length === extraction.lineItems.length && itemTotals.length > 0 && subtotal !== null) {
    const sum = itemTotals.reduce((accumulator, cents) => accumulator + cents, 0);
    const slack = ROUNDING_TOLERANCE_CENTS * Math.max(1, itemTotals.length);
    if (Math.abs(sum - subtotal) > slack) {
      finding('LINE_ITEMS_SUM_MISMATCH', 'critical', {
        lineItemSumCents: sum,
        message: `Line items sum to ${String(sum)} cents but the subtotal says ${String(subtotal)}.`,
        subtotalCents: subtotal,
      });
    }
  }

  const vat = extraction.vatAmountCents.value;
  const rate = extraction.vatRatePercent;
  if (subtotal !== null && vat !== null && rate !== null) {
    const expectedVat = Math.round((subtotal * rate) / 100);
    if (Math.abs(expectedVat - vat) > ROUNDING_TOLERANCE_CENTS) {
      finding('VAT_MISMATCH', 'critical', {
        expectedVatCents: expectedVat,
        message: `${String(rate)}% VAT on ${String(subtotal)} cents should be ${String(expectedVat)}, the invoice says ${String(vat)}.`,
        statedVatCents: vat,
      });
    }
  }

  const total = extraction.totalCents.value;
  if (subtotal !== null && vat !== null && total !== null) {
    if (Math.abs(subtotal + vat - total) > ROUNDING_TOLERANCE_CENTS) {
      finding('TOTAL_MISMATCH', 'critical', {
        message: `Subtotal plus VAT is ${String(subtotal + vat)} cents but the total says ${String(total)}.`,
        statedTotalCents: total,
        subtotalPlusVatCents: subtotal + vat,
      });
    }
  }

  /* ── IBAN ────────────────────────────────────────────────────────── */
  const iban = extraction.iban.value;
  if (iban !== null && !validateIban(iban)) {
    finding('IBAN_INVALID', 'critical', {
      iban,
      message: 'The payee IBAN fails its checksum — it is not a real account number.',
    });
  }

  /* ── supplier baseline ───────────────────────────────────────────── */
  if (context.baseline === undefined) {
    finding('NEW_SUPPLIER', 'info', {
      message:
        'First invoice from this supplier — no payment baseline exists yet. Settling it establishes one.',
    });
  } else {
    const baselineIban = context.baseline.iban;
    if (baselineIban !== null && iban !== null && baselineIban !== iban) {
      finding('IBAN_CHANGED', 'critical', {
        baselineIban,
        invoiceCount: context.baseline.invoiceCount,
        invoiceIban: iban,
        message: `The account differs from the one used by ${String(context.baseline.invoiceCount)} settled invoices from this supplier. This is the classic invoice-fraud vector — verify with the supplier out of band.`,
      });
    }

    if (total !== null && context.baseline.invoiceCount > 0) {
      const average = context.baseline.totalCents / context.baseline.invoiceCount;
      if (average > 0 && total > average * AMOUNT_ANOMALY_FACTOR) {
        finding('AMOUNT_ANOMALY', 'warning', {
          averageCents: Math.round(average),
          message: `This invoice is ${(total / average).toFixed(1)}× the supplier's historical average.`,
          totalCents: total,
        });
      }
    }
  }

  /* ── duplicates ──────────────────────────────────────────────────── */
  if (context.duplicateInvoiceId !== undefined) {
    finding('DUPLICATE_INVOICE_NUMBER', 'critical', {
      existingInvoiceId: context.duplicateInvoiceId,
      message: 'An invoice with this supplier and number is already in the system.',
    });
  }

  /* ── dates ───────────────────────────────────────────────────────── */
  const dueDate = extraction.dueDate.value;
  if (dueDate !== null) {
    const due = Date.parse(`${dueDate}T23:59:59Z`);
    if (Number.isFinite(due) && due < context.now.getTime()) {
      finding('PAST_DUE', 'info', {
        dueDate,
        message: 'The due date has already passed.',
      });
    }
  }

  return findings;
}

export type InvoiceRouteDecision = Readonly<{
  route: 'HUMAN_APPROVAL' | 'STRAIGHT_THROUGH';
  reasons: readonly string[];
}>;

/** Amounts above this always need a human, findings or not. */
const STRAIGHT_THROUGH_LIMIT_CENTS = 50_000;

export function routeInvoice(
  extraction: InvoiceExtraction,
  findings: readonly InvoiceFinding[],
  context: CheckContext,
): InvoiceRouteDecision {
  const reasons: string[] = [];
  const blocking = findings.filter((f) => f.severity !== 'info');
  if (blocking.length > 0) {
    reasons.push(...blocking.map((f) => f.code));
  }
  if (context.baseline === undefined) {
    reasons.push('FIRST_INVOICE_FROM_SUPPLIER');
  }
  const total = extraction.totalCents.value;
  if (total === null || total > STRAIGHT_THROUGH_LIMIT_CENTS) {
    reasons.push('ABOVE_STRAIGHT_THROUGH_LIMIT');
  }
  return reasons.length > 0
    ? { reasons, route: 'HUMAN_APPROVAL' }
    : { reasons: ['CLEAN_KNOWN_SUPPLIER_UNDER_LIMIT'], route: 'STRAIGHT_THROUGH' };
}
