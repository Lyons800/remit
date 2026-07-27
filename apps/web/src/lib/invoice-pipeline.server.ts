import 'server-only';

import { createHash, randomUUID } from 'node:crypto';

import { paymentActionCoreV1Schema } from '@remit/protocol';
import { digestCanonicalValue, digestDomains } from '@remit/protocol/hashing';
import {
  findInvoiceByNumber,
  getSupplierBaseline,
  recordInvoiceExtraction,
  recordSettledSupplierInvoice,
  replaceInvoiceFindings,
  setInvoiceOutcome,
  type InvoiceFinding,
  type SupplierBaseline,
} from '@remit/persistence';
import type postgres from 'postgres';

import {
  routeInvoice,
  runInvoiceChecks,
  type InvoiceRouteDecision,
} from './invoice-checks';
import {
  extractInvoice,
  type InvoiceExtraction,
} from './invoice-extraction.server';
import {
  executeSupplierSettlement,
  isHederaPaymentConfigured,
  type SettlementReceipt,
} from './hedera-payment.server';

/**
 * The pipeline one uploaded invoice moves through.
 *
 * extract → check → route. A clean, small invoice from a known supplier
 * settles straight through; anything flagged is blocked with its findings and
 * waits for a World-verified human. The action digest is derived from the
 * canonical payment action built out of the extracted fields, so what a human
 * later approves on their phone is bound to this document and no other.
 */

const DEMO_SUPPLIER_ACCOUNT = 'hedera:296:0.0.1000';

function uuidV7(): string {
  // Random UUID stamped into the v7 shape the protocol schema requires.
  const raw = randomUUID().replaceAll('-', '');
  const time = Date.now().toString(16).padStart(12, '0');
  const uuid = `${time}7${raw.slice(13, 16)}${((parseInt(raw[16] ?? '0', 16) & 0x3) | 0x8).toString(16)}${raw.slice(17, 32)}`;
  return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20, 32)}`;
}

function derivedDigest(seed: string): string {
  return createHash('sha256').update(seed, 'utf8').digest('hex');
}

export function supplierKeyFor(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/gu, '')
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 80);
}

/**
 * Build the canonical payment action for an extracted invoice and digest it.
 *
 * Real values are used wherever they exist — organisation, amount, the
 * document's own content digest. Identifiers for concepts the product does
 * not model yet (obligations, revisions, policy snapshots) are freshly minted
 * or derived from the document, and persist with the invoice so the digest is
 * stable from here on.
 */
export function deriveInvoiceActionDigest(input: {
  readonly organizationId: string;
  readonly contentSha256: string;
  readonly extraction: InvoiceExtraction;
  readonly baseline: SupplierBaseline | undefined;
}): string {
  const total = input.extraction.totalCents.value ?? 0;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60_000);
  const action = paymentActionCoreV1Schema.parse({
    actionId: uuidV7(),
    beneficiary: {
      approved:
        input.baseline?.iban == null
          ? null
          : { accountId: DEMO_SUPPLIER_ACCOUNT, kind: 'CAIP_10' },
      proposed: { accountId: DEMO_SUPPLIER_ACCOUNT, kind: 'CAIP_10' },
    },
    createdAt: createdAt.toISOString(),
    evidenceRoot: input.contentSha256,
    expiresAt: expiresAt.toISOString(),
    nonce: derivedDigest(`nonce:${input.contentSha256}`).slice(0, 32),
    organizationId: input.organizationId,
    policy: { id: 'uploaded-invoice-policy', version: 1 },
    requestType: 'SUPPLIER_INVOICE_PAYMENT',
    schemaVersion: 1,
    settlement: {
      amountAtoms: String(Math.max(1, total)),
      assetId: 'hedera:296/hts:0.0.9001',
      beneficiary: DEMO_SUPPLIER_ACCOUNT,
      mappingPolicyHash: derivedDigest('remit:eur-to-testnet-mapping:v1'),
      networkId: 'hedera:296',
    },
    sourceInvoice: {
      amountAtoms: String(Math.max(1, total)),
      assetId: 'iso4217:EUR',
      digest: input.contentSha256,
      invoiceRevisionId: uuidV7(),
      obligationId: uuidV7(),
    },
    supplierId: uuidV7(),
    supplierSnapshotDigest: derivedDigest(
      `supplier:${input.extraction.supplierName.value ?? 'unknown'}:${input.extraction.iban.value ?? 'no-iban'}`,
    ),
  });
  return digestCanonicalValue(
    digestDomains.paymentActionCore,
    paymentActionCoreV1Schema,
    action,
  );
}

export interface ProcessedInvoice {
  readonly extraction: InvoiceExtraction;
  readonly findings: readonly InvoiceFinding[];
  readonly decision: InvoiceRouteDecision;
  readonly actionDigest: string;
  readonly status: 'blocked' | 'settled' | 'checked';
  readonly settlement: SettlementReceipt | null;
}

export async function processUploadedInvoice(
  sql: postgres.Sql,
  input: {
    readonly invoiceId: string;
    readonly organizationId: string;
    readonly content: Uint8Array;
    readonly contentType: string;
    readonly contentSha256: string;
  },
): Promise<ProcessedInvoice> {
  const extraction = await extractInvoice({
    content: input.content,
    contentType: input.contentType,
  });

  const supplierName = extraction.supplierName.value;
  const supplierKey = supplierName === null ? null : supplierKeyFor(supplierName);

  const baseline =
    supplierKey === null
      ? undefined
      : await getSupplierBaseline(sql, input.organizationId, supplierKey);
  const duplicateInvoiceId =
    supplierKey === null || extraction.invoiceNumber.value === null
      ? undefined
      : await findInvoiceByNumber(sql, {
          excludeInvoiceId: input.invoiceId,
          invoiceNumber: extraction.invoiceNumber.value,
          organizationId: input.organizationId,
          supplierKey,
        });

  const findings = runInvoiceChecks(extraction, {
    baseline,
    duplicateInvoiceId,
    now: new Date(),
  });
  const decision = routeInvoice(extraction, findings, {
    baseline,
    duplicateInvoiceId,
    now: new Date(),
  });
  const actionDigest = deriveInvoiceActionDigest({
    baseline,
    contentSha256: input.contentSha256,
    extraction,
    organizationId: input.organizationId,
  });

  await recordInvoiceExtraction(sql, {
    actionDigest,
    currency: extraction.currency.value,
    dueDate: extraction.dueDate.value,
    extraction: extraction as unknown as Record<string, unknown>,
    iban: extraction.iban.value,
    invoiceId: input.invoiceId,
    invoiceNumber: extraction.invoiceNumber.value,
    supplierKey,
    supplierName,
    totalCents: extraction.totalCents.value,
  });
  await replaceInvoiceFindings(sql, input.invoiceId, findings);

  if (decision.route === 'STRAIGHT_THROUGH' && isHederaPaymentConfigured()) {
    // Clean, small, known supplier: the agent pays it. The refusal paths for
    // everything else are what make this safe to automate.
    const receipt = await executeSupplierSettlement({
      actionDigest,
      invoiceId: input.invoiceId,
    });
    await setInvoiceOutcome(sql, {
      invoiceId: input.invoiceId,
      route: decision.route,
      settlement: { ...receipt },
      status: 'settled',
    });
    if (supplierKey !== null && supplierName !== null) {
      await recordSettledSupplierInvoice(sql, {
        displayName: supplierName,
        iban: extraction.iban.value,
        organizationId: input.organizationId,
        supplierKey,
        taxId: extraction.supplierTaxId.value,
        totalCents: extraction.totalCents.value ?? 0,
      });
    }
    return {
      actionDigest,
      decision,
      extraction,
      findings,
      settlement: receipt,
      status: 'settled',
    };
  }

  const status = decision.route === 'STRAIGHT_THROUGH' ? 'checked' : 'blocked';
  await setInvoiceOutcome(sql, {
    invoiceId: input.invoiceId,
    route: decision.route,
    status,
  });
  return {
    actionDigest,
    decision,
    extraction,
    findings,
    settlement: null,
    status,
  };
}
