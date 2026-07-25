import Link from 'next/link';

import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { auditEvents, initialQueue, settlements } from '../lib/demo';

const kpis = [
  { hint: 'this month', label: 'Paid by agent', value: '990' },
  { hint: 'awaiting people', label: 'Held for approval', value: '2' },
  { hint: 'on Hedera Testnet', label: 'Settled volume', value: '€142,380' },
  { hint: 'routine invoices', label: 'Human minutes', value: '0' },
] as const;

export default function DashboardPage() {
  const held = initialQueue.filter((invoice) => invoice.status === 'held');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            The agent handles the volume. This page shows what needs you.
          </p>
        </div>
        <Link href="/invoices">
          <Button variant="outline">Open queue</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="tabular text-2xl font-semibold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Needs your decision</CardTitle>
          <Badge variant="destructive">{held.length} held</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Why it stopped</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {held.map((invoice) => (
                <TableRow className="bg-destructive/5" key={invoice.id}>
                  <TableCell className="font-medium">{invoice.id}</TableCell>
                  <TableCell>{invoice.supplier}</TableCell>
                  <TableCell className="tabular text-right">
                    {invoice.amount}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {invoice.handledBy}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/approvals/${invoice.id}`}>
                      <Button size="sm" variant="secondary">
                        Review
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent settlements</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.slice(0, 4).map((settlement) => (
                  <TableRow key={settlement.invoiceId}>
                    <TableCell className="font-medium">
                      {settlement.invoiceId}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {settlement.amount}
                    </TableCell>
                    <TableCell>
                      <Badge>Consumed</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest control decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2 text-sm">
              {auditEvents.slice(0, 4).map((event) => (
                <li
                  className={`border-l-2 pl-3 text-xs leading-relaxed ${
                    event.kind === 'refuse'
                      ? 'border-destructive'
                      : 'border-primary'
                  }`}
                  key={event.text}
                >
                  <span className="text-muted-foreground">{event.at} · </span>
                  {event.text}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
