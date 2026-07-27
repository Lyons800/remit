import type postgres from 'postgres';

import { mapPostgresError } from './errors.js';

/**
 * Invoices, their findings, and supplier baselines.
 *
 * The invoice row is the working record of the pipeline: original bytes in,
 * extraction and findings attached, then status moves
 * received → checked → blocked | approved → settled. The supplier baseline is
 * updated only when an invoice settles — an unpaid invoice must never teach
 * the system a new bank account.
 */

export const INVOICE_STATUSES = [
  'approved',
  'blocked',
  'checked',
  'failed',
  'received',
  'settled',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type InvoiceRoute = 'HUMAN_APPROVAL' | 'STRAIGHT_THROUGH';

export type FindingSeverity = 'critical' | 'info' | 'warning';

export interface InvoiceFinding {
  readonly code: string;
  readonly severity: FindingSeverity;
  readonly detail: Record<string, unknown>;
}

export interface InvoiceSummary {
  readonly invoiceId: string;
  readonly organizationId: string;
  readonly originalFilename: string;
  readonly supplierName: string | null;
  readonly invoiceNumber: string | null;
  readonly currency: string | null;
  readonly totalCents: number | null;
  readonly iban: string | null;
  readonly dueDate: string | null;
  readonly actionDigest: string | null;
  readonly status: InvoiceStatus;
  readonly route: InvoiceRoute | null;
  readonly settlement: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export interface InvoiceRecord extends InvoiceSummary {
  readonly extraction: Record<string, unknown> | null;
  readonly supplierKey: string | null;
  readonly findings: readonly InvoiceFinding[];
}

export interface SupplierBaseline {
  readonly supplierKey: string;
  readonly displayName: string;
  readonly taxId: string | null;
  readonly iban: string | null;
  readonly invoiceCount: number;
  readonly totalCents: number;
}

interface InvoiceRow {
  readonly invoice_id: string;
  readonly organization_id: string;
  readonly original_filename: string;
  readonly supplier_key: string | null;
  readonly supplier_name: string | null;
  readonly invoice_number: string | null;
  readonly currency: string | null;
  readonly total_cents: string | null;
  readonly iban: string | null;
  readonly due_date: string | null;
  readonly action_digest: string | null;
  readonly status: string;
  readonly route: string | null;
  readonly settlement: Record<string, unknown> | null;
  readonly extraction: Record<string, unknown> | null;
  readonly created_at: Date;
}

function toSummary(row: InvoiceRow): InvoiceSummary {
  return {
    actionDigest: row.action_digest,
    createdAt: row.created_at,
    currency: row.currency,
    dueDate: row.due_date,
    iban: row.iban,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    organizationId: row.organization_id,
    originalFilename: row.original_filename,
    route: row.route as InvoiceRoute | null,
    settlement: row.settlement,
    status: row.status as InvoiceStatus,
    supplierName: row.supplier_name,
    totalCents: row.total_cents === null ? null : Number(row.total_cents),
  };
}

const SUMMARY_COLUMNS = `
  invoice_id, organization_id, original_filename, supplier_key, supplier_name,
  invoice_number, currency, total_cents::text AS total_cents, iban,
  due_date::text AS due_date, action_digest, status, route, settlement,
  extraction, created_at
`;

export async function insertInvoice(
  sql: postgres.Sql,
  input: {
    readonly invoiceId: string;
    readonly organizationId: string;
    readonly originalFilename: string;
    readonly contentType: string;
    readonly content: Uint8Array;
    readonly contentSha256: string;
  },
): Promise<void> {
  try {
    await sql`
      INSERT INTO invoices
        (invoice_id, organization_id, original_filename, content_type,
         content, content_sha256)
      VALUES
        (${input.invoiceId}, ${input.organizationId},
         ${input.originalFilename}, ${input.contentType},
         ${Buffer.from(input.content)}, ${input.contentSha256})
    `;
  } catch (error) {
    throw mapPostgresError(error);
  }
}

export async function findInvoiceByContentSha(
  sql: postgres.Sql,
  organizationId: string,
  contentSha256: string,
): Promise<string | undefined> {
  const rows = await sql<readonly Readonly<{ invoice_id: string }>[]>`
    SELECT invoice_id FROM invoices
    WHERE organization_id = ${organizationId}
      AND content_sha256 = ${contentSha256}
  `;
  return rows[0]?.invoice_id;
}

export async function findInvoiceByNumber(
  sql: postgres.Sql,
  input: {
    readonly organizationId: string;
    readonly supplierKey: string;
    readonly invoiceNumber: string;
    readonly excludeInvoiceId: string;
  },
): Promise<string | undefined> {
  const rows = await sql<readonly Readonly<{ invoice_id: string }>[]>`
    SELECT invoice_id FROM invoices
    WHERE organization_id = ${input.organizationId}
      AND supplier_key = ${input.supplierKey}
      AND invoice_number = ${input.invoiceNumber}
      AND invoice_id <> ${input.excludeInvoiceId}
    LIMIT 1
  `;
  return rows[0]?.invoice_id;
}

/** Attach extraction results and the derived fields the checks depend on. */
export async function recordInvoiceExtraction(
  sql: postgres.Sql,
  input: {
    readonly invoiceId: string;
    readonly extraction: Record<string, unknown>;
    readonly supplierKey: string | null;
    readonly supplierName: string | null;
    readonly invoiceNumber: string | null;
    readonly currency: string | null;
    readonly totalCents: number | null;
    readonly iban: string | null;
    readonly dueDate: string | null;
    readonly actionDigest: string | null;
  },
): Promise<void> {
  await sql`
    UPDATE invoices SET
      extraction = ${sql.json(input.extraction as never)},
      supplier_key = ${input.supplierKey},
      supplier_name = ${input.supplierName},
      invoice_number = ${input.invoiceNumber},
      currency = ${input.currency},
      total_cents = ${input.totalCents},
      iban = ${input.iban},
      due_date = ${input.dueDate},
      action_digest = ${input.actionDigest},
      updated_at = transaction_timestamp()
    WHERE invoice_id = ${input.invoiceId}
  `;
}

export async function replaceInvoiceFindings(
  sql: postgres.Sql,
  invoiceId: string,
  findings: readonly InvoiceFinding[],
): Promise<void> {
  await sql.begin(async (transaction) => {
    await transaction`
      DELETE FROM invoice_findings WHERE invoice_id = ${invoiceId}
    `;
    for (const [index, finding] of findings.entries()) {
      await transaction`
        INSERT INTO invoice_findings
          (invoice_id, finding_index, code, severity, detail)
        VALUES
          (${invoiceId}, ${index}, ${finding.code}, ${finding.severity},
           ${transaction.json(finding.detail as never)})
      `;
    }
  });
}

export async function setInvoiceOutcome(
  sql: postgres.Sql,
  input: {
    readonly invoiceId: string;
    readonly status: InvoiceStatus;
    readonly route?: InvoiceRoute;
    readonly settlement?: Record<string, unknown>;
  },
): Promise<void> {
  await sql`
    UPDATE invoices SET
      status = ${input.status},
      route = COALESCE(${input.route ?? null}, route),
      settlement = COALESCE(${
        input.settlement === undefined
          ? null
          : sql.json(input.settlement as never)
      }, settlement),
      updated_at = transaction_timestamp()
    WHERE invoice_id = ${input.invoiceId}
  `;
}

export async function listInvoices(
  sql: postgres.Sql,
  organizationId: string,
): Promise<readonly InvoiceSummary[]> {
  const rows = await sql.unsafe<InvoiceRow[]>(
    `SELECT ${SUMMARY_COLUMNS} FROM invoices
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [organizationId],
  );
  return rows.map(toSummary);
}

export async function getInvoice(
  sql: postgres.Sql,
  organizationId: string,
  invoiceId: string,
): Promise<InvoiceRecord | undefined> {
  const rows = await sql.unsafe<InvoiceRow[]>(
    `SELECT ${SUMMARY_COLUMNS} FROM invoices
     WHERE organization_id = $1 AND invoice_id = $2`,
    [organizationId, invoiceId],
  );
  const row = rows[0];
  if (row === undefined) return undefined;

  const findingRows = await sql<
    readonly Readonly<{
      code: string;
      severity: string;
      detail: Record<string, unknown>;
    }>[]
  >`
    SELECT code, severity, detail
    FROM invoice_findings
    WHERE invoice_id = ${invoiceId}
    ORDER BY finding_index
  `;

  return {
    ...toSummary(row),
    extraction: row.extraction,
    findings: findingRows.map((finding) => ({
      code: finding.code,
      detail: finding.detail,
      severity: finding.severity as FindingSeverity,
    })),
    supplierKey: row.supplier_key,
  };
}

export async function getSupplierBaseline(
  sql: postgres.Sql,
  organizationId: string,
  supplierKey: string,
): Promise<SupplierBaseline | undefined> {
  const rows = await sql<
    readonly Readonly<{
      supplier_key: string;
      display_name: string;
      tax_id: string | null;
      iban: string | null;
      invoice_count: number;
      total_cents: string;
    }>[]
  >`
    SELECT supplier_key, display_name, tax_id, iban, invoice_count,
           total_cents::text AS total_cents
    FROM suppliers
    WHERE organization_id = ${organizationId}
      AND supplier_key = ${supplierKey}
  `;
  const row = rows[0];
  return row === undefined
    ? undefined
    : {
        displayName: row.display_name,
        iban: row.iban,
        invoiceCount: row.invoice_count,
        supplierKey: row.supplier_key,
        taxId: row.tax_id,
        totalCents: Number(row.total_cents),
      };
}

/**
 * Teach the baseline from a settled invoice.
 *
 * First settlement establishes the account; later settlements only accumulate
 * stats. A deliberate approval of a changed IBAN updates the baseline because
 * the human decision is exactly what makes the new account trustworthy.
 */
export async function recordSettledSupplierInvoice(
  sql: postgres.Sql,
  input: {
    readonly organizationId: string;
    readonly supplierKey: string;
    readonly displayName: string;
    readonly taxId: string | null;
    readonly iban: string | null;
    readonly totalCents: number;
  },
): Promise<void> {
  await sql`
    INSERT INTO suppliers
      (organization_id, supplier_key, display_name, tax_id, iban,
       invoice_count, total_cents)
    VALUES
      (${input.organizationId}, ${input.supplierKey}, ${input.displayName},
       ${input.taxId}, ${input.iban}, 1, ${input.totalCents})
    ON CONFLICT (organization_id, supplier_key) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      tax_id = COALESCE(EXCLUDED.tax_id, suppliers.tax_id),
      iban = COALESCE(EXCLUDED.iban, suppliers.iban),
      invoice_count = suppliers.invoice_count + 1,
      total_cents = suppliers.total_cents + EXCLUDED.total_cents,
      updated_at = transaction_timestamp()
  `;
}
