import { accept, refuse, type DomainResult } from '../result.js';
import { isCanonicalUtcInstant } from '../state/temporal.js';

export type FrozenInvoiceFacts = Readonly<{
  amountAtoms: string;
  assetId: string;
  digest: string;
  obligationId: string;
  organizationId: string;
  supplierId: string;
}>;

export type PaymentActionInvoiceFacts = Readonly<{
  organizationId: string;
  sourceInvoice: Readonly<{
    amountAtoms: string;
    assetId: string;
    digest: string;
    obligationId: string;
  }>;
  supplierId: string;
}>;

export type InvoiceRevisionIdentity = Readonly<{
  createdAt: string;
  invoiceId: string;
  invoiceRevision: number;
  invoiceRevisionId: string;
  obligationId: string;
  organizationId: string;
  supersedesInvoiceRevisionId: string | null;
}>;

export function validateInvoiceActionBinding(
  invoice: FrozenInvoiceFacts,
  action: PaymentActionInvoiceFacts,
): DomainResult<PaymentActionInvoiceFacts> {
  if (
    action.organizationId !== invoice.organizationId ||
    action.supplierId !== invoice.supplierId ||
    action.sourceInvoice.obligationId !== invoice.obligationId ||
    action.sourceInvoice.digest !== invoice.digest ||
    action.sourceInvoice.amountAtoms !== invoice.amountAtoms ||
    action.sourceInvoice.assetId !== invoice.assetId
  ) {
    return refuse('INVOICE_ACTION_MISMATCH');
  }

  return accept(action);
}

export function validateInvoiceRevisionLineage(
  previous: InvoiceRevisionIdentity,
  candidate: InvoiceRevisionIdentity,
): DomainResult<InvoiceRevisionIdentity> {
  if (
    !Number.isSafeInteger(previous.invoiceRevision) ||
    !Number.isSafeInteger(candidate.invoiceRevision) ||
    previous.invoiceRevision <= 0 ||
    !isCanonicalUtcInstant(previous.createdAt) ||
    !isCanonicalUtcInstant(candidate.createdAt) ||
    candidate.invoiceRevision !== previous.invoiceRevision + 1 ||
    candidate.invoiceRevisionId === previous.invoiceRevisionId ||
    candidate.supersedesInvoiceRevisionId !== previous.invoiceRevisionId ||
    candidate.invoiceId !== previous.invoiceId ||
    candidate.obligationId !== previous.obligationId ||
    candidate.organizationId !== previous.organizationId ||
    candidate.createdAt <= previous.createdAt
  ) {
    return refuse('INVOICE_REVISION_CONFLICT');
  }

  return accept(candidate);
}
