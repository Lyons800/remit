import { listSuppliers } from '@remit/persistence';
import { headers } from 'next/headers';

import { Badge } from '../../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { db, resolveOrganizationId } from '../../../lib/workspace.server';

/**
 * Supplier baselines, taught only by settled invoices. The IBAN shown here is
 * what every future invoice from the supplier is checked against.
 */

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const { organizationId } = await resolveOrganizationId(await headers());
  const suppliers = await listSuppliers(db(), organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="text-sm text-muted-foreground">
          Baselines are established by settled invoices, never by uploads. A
          later invoice naming a different account is flagged against what you
          see here.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Supplier</TableHead>
            <TableHead>Tax ID</TableHead>
            <TableHead>Baseline IBAN</TableHead>
            <TableHead className="text-right">Settled invoices</TableHead>
            <TableHead className="text-right">Total settled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suppliers.length === 0 ? (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={5}>
                No baselines yet — the first settled invoice from a supplier
                creates one.
              </TableCell>
            </TableRow>
          ) : (
            suppliers.map((supplier) => (
              <TableRow key={supplier.supplierKey}>
                <TableCell className="font-medium">
                  {supplier.displayName}{' '}
                  {supplier.invoiceCount >= 3 ? (
                    <Badge>established</Badge>
                  ) : (
                    <Badge variant="warning">new</Badge>
                  )}
                </TableCell>
                <TableCell>{supplier.taxId ?? '—'}</TableCell>
                <TableCell className="font-mono text-xs">
                  {supplier.iban ?? '—'}
                </TableCell>
                <TableCell className="tabular text-right">
                  {supplier.invoiceCount}
                </TableCell>
                <TableCell className="tabular text-right">
                  {(supplier.totalCents / 100).toLocaleString('en-IE', {
                    minimumFractionDigits: 2,
                  })}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
