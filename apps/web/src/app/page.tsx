import Link from 'next/link';

import { HederaEvidenceSummary } from '../components/hedera-evidence';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { auditEvents, dayInvoices, initialQueue } from '../lib/demo';
import { loadHederaEvidence } from '../lib/mirror-evidence.server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const evidence = await loadHederaEvidence();
  const scenario = [...dayInvoices, ...initialQueue];
  const held = scenario.filter(
    (invoice) => invoice.status === 'review_required',
  );
  const eligible = scenario.filter(
    (invoice) => invoice.status === 'policy_eligible',
  );
  const evidenceLabel = {
    mismatch: 'Mismatch',
    unavailable: 'Unavailable',
    verified: 'Live',
  }[evidence.status];
  const kpis = [
    {
      hint: 'clearly labelled fixtures',
      label: 'Scenario invoices',
      value: String(scenario.length),
    },
    {
      hint: 'no payment initiated',
      label: 'Policy eligible',
      value: String(eligible.length),
    },
    {
      hint: 'awaiting scenario review',
      label: 'Review required',
      value: String(held.length),
    },
    {
      hint: 'public Mirror Node',
      label: 'Live evidence',
      value: evidence.status === 'verified' ? 'Verified' : evidenceLabel,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            A product scenario beside independently verified public evidence.
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
          <div>
            <CardTitle>Needs a decision</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Synthetic product scenario · no live authority or payment
            </p>
          </div>
          <Badge variant="destructive">{held.length} review</Badge>
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

      <HederaEvidenceSummary result={evidence} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Scenario control trace</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Illustrative outcomes, not an audit export
              </p>
            </div>
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
        <Card>
          <CardHeader>
            <CardTitle>What is connected today</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <StatusRow label="Hedera x402 transfer" status={evidenceLabel} />
            <StatusRow label="HTS marker lifecycle" status={evidenceLabel} />
            <StatusRow label="World authority" status="Offline contract" />
            <StatusRow label="Supplier settlement" status="Not demonstrated" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  status,
}: Readonly<{ label: string; status: string }>) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <span>{label}</span>
      <Badge
        variant={
          status === 'Live'
            ? 'default'
            : status === 'Mismatch'
              ? 'destructive'
              : 'outline'
        }
      >
        {status}
      </Badge>
    </div>
  );
}
