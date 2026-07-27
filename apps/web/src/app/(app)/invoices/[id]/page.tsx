import { getInvoice } from '@remit/persistence';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { Badge } from '../../../../components/ui/badge';
import { db, resolveOrganizationId } from '../../../../lib/workspace.server';
import { WorldApproval } from '../../approvals/[id]/world-approval';

/**
 * One uploaded invoice: what the AI read, what the checks found, and — when
 * blocked — the World approval that is the only way it gets paid.
 */

export const dynamic = 'force-dynamic';

type PageProperties = Readonly<{ params: Promise<{ id: string }> }>;

const SEVERITY_VARIANT = {
  critical: 'destructive',
  info: 'default',
  warning: 'warning',
} as const;

function euro(cents: number | null, currency: string | null): string {
  if (cents === null) return '—';
  return `${(cents / 100).toLocaleString('en-IE', { minimumFractionDigits: 2 })} ${currency ?? ''}`;
}

export default async function InvoicePage({ params }: PageProperties) {
  const { id } = await params;
  const { organizationId } = await resolveOrganizationId(await headers());
  const invoice = await getInvoice(db(), organizationId, id);
  if (invoice === undefined) notFound();

  const extraction = invoice.extraction as {
    iban?: { value: string | null; confidence: string };
    supplierTaxId?: { value: string | null };
    issueDate?: { value: string | null };
    vatRatePercent?: number | null;
  } | null;

  const settlement = invoice.settlement as {
    transactionId?: string;
    hashscanUrl?: string;
    consensusStatus?: string;
  } | null;

  const facts: readonly (readonly [string, string])[] = [
    ['Supplier', invoice.supplierName ?? '—'],
    ['Tax ID', extraction?.supplierTaxId?.value ?? '—'],
    ['Invoice number', invoice.invoiceNumber ?? '—'],
    ['Issued', extraction?.issueDate?.value ?? '—'],
    ['Due', invoice.dueDate ?? '—'],
    ['Amount', euro(invoice.totalCents, invoice.currency)],
    ['IBAN on invoice', invoice.iban ?? '— not found —'],
    ['File', invoice.originalFilename],
  ];

  const blockers = invoice.findings.filter((f) => f.severity !== 'info');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {invoice.supplierName ?? invoice.originalFilename}
          </h1>
          <Badge
            variant={
              invoice.status === 'settled'
                ? 'default'
                : invoice.status === 'blocked'
                  ? 'destructive'
                  : 'warning'
            }
          >
            {invoice.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {invoice.route === 'STRAIGHT_THROUGH'
            ? 'Clean invoice from a known supplier — settled by the agent under policy.'
            : 'This payment is blocked until a verified human approves it.'}
        </p>
      </div>

      <div className="grid gap-2 border border-border p-5 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label}>
            <p className="microlabel">{label}</p>
            <p className="text-sm">{value}</p>
          </div>
        ))}
      </div>

      {invoice.findings.length > 0 ? (
        <div className="flex flex-col gap-3 border border-border p-5">
          <p className="microlabel">What the checks found</p>
          {invoice.findings.map((finding, index) => (
            <div className="flex items-start gap-3" key={index}>
              <Badge variant={SEVERITY_VARIANT[finding.severity]}>
                {finding.severity}
              </Badge>
              <div>
                <p className="text-sm font-medium">{finding.code}</p>
                <p className="text-sm text-muted-foreground">
                  {typeof finding.detail['message'] === 'string'
                    ? finding.detail['message']
                    : JSON.stringify(finding.detail)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {invoice.status === 'settled' && settlement?.hashscanUrl !== undefined ? (
        <div className="flex flex-col gap-2 border border-border p-5">
          <Badge variant="default">Paid — settled on Hedera</Badge>
          <a
            className="text-xs underline"
            href={settlement.hashscanUrl}
            rel="noreferrer"
            target="_blank"
          >
            View transaction {settlement.transactionId} on HashScan
          </a>
          <p className="text-xs text-muted-foreground">
            Consensus status {settlement.consensusStatus}. The settlement memo
            is bound to this invoice&apos;s action digest.
          </p>
        </div>
      ) : null}

      {invoice.status === 'blocked' && invoice.actionDigest !== null ? (
        <>
          {blockers.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Proceeding anyway means a human takes responsibility for the
              findings above — sometimes the account really did change. That
              decision requires proof of personhood, not a password.
            </p>
          ) : null}
          <WorldApproval
            actionDigest={invoice.actionDigest}
            agentAddress="0xA03F5F37Dcb5A16c317dbf88941c2049B9B96f34"
            approverLabel="A1"
            invoiceId={invoice.invoiceId}
          />
        </>
      ) : null}
    </div>
  );
}
