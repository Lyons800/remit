import { listInvoices, listSuppliers } from '@remit/persistence';
import { headers } from 'next/headers';
import Link from 'next/link';

import { Badge } from '../../../components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { db, resolveOrganizationId } from '../../../lib/workspace.server';

/** Real numbers only: what came in, what settled, what is waiting on a human. */

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { organizationId } = await resolveOrganizationId(await headers());
  const sql = db();
  const [invoices, suppliers] = await Promise.all([
    listInvoices(sql, organizationId),
    listSuppliers(sql, organizationId),
  ]);

  const blocked = invoices.filter((invoice) => invoice.status === 'blocked');
  const settled = invoices.filter((invoice) => invoice.status === 'settled');
  const settledCents = settled.reduce(
    (sum, invoice) => sum + (invoice.totalCents ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Agents pay the routine invoices; you decide the flagged ones.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Invoices received</p>
            <p className="tabular text-2xl font-semibold">{invoices.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Awaiting your approval</p>
            <p className="tabular text-2xl font-semibold">{blocked.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Settled</p>
            <p className="tabular text-2xl font-semibold">{settled.length}</p>
            <p className="text-xs text-muted-foreground">
              {(settledCents / 100).toLocaleString('en-IE', {
                minimumFractionDigits: 2,
              })}{' '}
              total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Supplier baselines</p>
            <p className="tabular text-2xl font-semibold">{suppliers.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Needs you</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {blocked.length === 0 ? (
            <p className="text-muted-foreground">
              Nothing is waiting on a human right now.{' '}
              <Link className="underline" href="/invoices">
                Upload an invoice
              </Link>{' '}
              to put the pipeline to work.
            </p>
          ) : (
            blocked.map((invoice) => (
              <div
                className="flex items-center justify-between gap-3"
                key={invoice.invoiceId}
              >
                <Link className="underline" href={`/invoices/${invoice.invoiceId}`}>
                  {invoice.supplierName ?? invoice.originalFilename}
                  {invoice.invoiceNumber === null
                    ? ''
                    : ` · ${invoice.invoiceNumber}`}
                </Link>
                <Badge variant="destructive">blocked</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
