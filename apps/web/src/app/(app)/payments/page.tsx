import { listInvoices } from '@remit/persistence';
import { headers } from 'next/headers';
import Link from 'next/link';

import { HederaEvidenceDetail } from '../../../components/hedera-evidence';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { loadHederaEvidence } from '../../../lib/mirror-evidence.server';
import { db, resolveOrganizationId } from '../../../lib/workspace.server';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const [evidence, settled] = await Promise.all([
    loadHederaEvidence(),
    (async () => {
      const { organizationId } = await resolveOrganizationId(await headers());
      const invoices = await listInvoices(db(), organizationId);
      return invoices.filter((invoice) => invoice.status === 'settled');
    })(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Payments & ledger evidence
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every settlement below is a real Hedera Testnet transaction,
          memo-bound to the invoice&apos;s action digest and publicly checkable
          on HashScan. Amounts settle as fixed testnet sums — the euro figures
          are the invoices&apos; face values.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settled invoices</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {settled.length === 0 ? (
            <p className="text-muted-foreground">No settlements yet.</p>
          ) : (
            settled.map((invoice) => {
              const receipt = invoice.settlement as {
                hashscanUrl?: string;
                transactionId?: string;
              } | null;
              return (
                <div
                  className="flex flex-wrap items-center justify-between gap-3"
                  key={invoice.invoiceId}
                >
                  <Link className="underline" href={`/invoices/${invoice.invoiceId}`}>
                    {invoice.supplierName ?? invoice.originalFilename}
                    {invoice.invoiceNumber === null
                      ? ''
                      : ` · ${invoice.invoiceNumber}`}
                  </Link>
                  <span className="tabular">
                    {invoice.totalCents === null
                      ? '—'
                      : `${(invoice.totalCents / 100).toLocaleString('en-IE', { minimumFractionDigits: 2 })} ${invoice.currency ?? ''}`}
                  </span>
                  {receipt?.hashscanUrl === undefined ? null : (
                    <a
                      className="text-xs underline"
                      href={receipt.hashscanUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {receipt.transactionId} on HashScan
                    </a>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <HederaEvidenceDetail result={evidence} />
    </div>
  );
}
