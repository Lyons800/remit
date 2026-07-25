'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  dayInvoices,
  HELD_INVOICE_ID,
  initialQueue,
  type QueueInvoice,
} from '../../lib/demo';

export default function QueuePage() {
  const [rows, setRows] = useState<readonly QueueInvoice[]>(initialQueue);
  const [running, setRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const runDay = useCallback(() => {
    if (running) return;
    setRunning(true);
    dayInvoices.forEach((invoice, index) => {
      timers.current.push(
        setTimeout(() => {
          setRows((current) => [invoice, ...current]);
          if (index === dayInvoices.length - 1) setRunning(false);
        }, 700 * (index + 1)),
      );
    });
  }, [running]);

  const paid = rows.filter((row) => row.status === 'paid').length;
  const held = rows.filter((row) => row.status === 'held').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
          <p className="text-sm text-muted-foreground">
            The agent pays routine invoices. Only risky changes wait for people.
          </p>
        </div>
        <Button disabled={running} onClick={runDay}>
          {running ? 'Agent working…' : 'Run the day'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Paid by agent</p>
            <p className="tabular text-2xl font-semibold">{paid}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">
              Held for human authority
            </p>
            <p className="tabular text-2xl font-semibold">{held}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">
              Human minutes on routine invoices
            </p>
            <p className="tabular text-2xl font-semibold">0</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
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
                  className={row.status === 'held' ? 'bg-destructive/5' : ''}
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
                    {row.status === 'paid' ? (
                      <Badge>Paid</Badge>
                    ) : (
                      <Badge variant="destructive">Held</Badge>
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
