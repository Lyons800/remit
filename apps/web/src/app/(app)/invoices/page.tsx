'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import {
  dayInvoices,
  HELD_INVOICE_ID,
  initialQueue,
  type QueueInvoice,
} from '../../../lib/demo';

export default function QueuePage() {
  const [rows, setRows] = useState<readonly QueueInvoice[]>(initialQueue);
  const loaded = rows.length > initialQueue.length;
  const eligible = rows.filter(
    (row) => row.status === 'policy_eligible',
  ).length;
  const held = rows.filter((row) => row.status === 'review_required').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
          <p className="text-sm text-muted-foreground">
            Synthetic AP records show which lane deterministic policy would
            select. No row is a live payment.
          </p>
        </div>
        <Button
          disabled={loaded}
          onClick={() => setRows([...dayInvoices, ...initialQueue])}
        >
          {loaded ? 'Scenario batch loaded' : 'Load full scenario'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Policy eligible</p>
            <p className="tabular text-2xl font-semibold">{eligible}</p>
            <p className="text-xs text-muted-foreground">
              payment not initiated
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Review required</p>
            <p className="tabular text-2xl font-semibold">{held}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">
              Live supplier payments
            </p>
            <p className="tabular text-2xl font-semibold">0</p>
            <p className="text-xs text-muted-foreground">none demonstrated</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Invoices</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Synthetic scenario · browser state only
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Handled by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  className={
                    row.status === 'review_required' ? 'bg-destructive/5' : ''
                  }
                  key={row.id}
                >
                  <TableCell className="font-medium">
                    {row.id === HELD_INVOICE_ID ? (
                      <Link
                        className="text-primary underline-offset-2 hover:underline"
                        href={`/approvals/${row.id}`}
                      >
                        {row.id}
                      </Link>
                    ) : (
                      row.id
                    )}
                  </TableCell>
                  <TableCell>{row.supplier}</TableCell>
                  <TableCell className="tabular text-right">
                    {row.amount}
                  </TableCell>
                  <TableCell>
                    {row.status === 'policy_eligible' ? (
                      <Badge>Policy eligible</Badge>
                    ) : (
                      <Badge variant="destructive">Review required</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.handledBy}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
