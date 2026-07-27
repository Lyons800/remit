'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';

/**
 * The real invoice queue: every row is an uploaded document that went through
 * extract → check → route. Nothing here is synthetic.
 */

interface InvoiceRow {
  readonly invoiceId: string;
  readonly originalFilename: string;
  readonly supplierName: string | null;
  readonly invoiceNumber: string | null;
  readonly currency: string | null;
  readonly totalCents: number | null;
  readonly status: string;
  readonly route: string | null;
  readonly createdAt: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'warning'> = {
  blocked: 'destructive',
  settled: 'default',
};

function amount(row: InvoiceRow): string {
  if (row.totalCents === null) return '—';
  return `${(row.totalCents / 100).toLocaleString('en-IE', {
    minimumFractionDigits: 2,
  })} ${row.currency ?? ''}`;
}

export default function InvoicesPage() {
  const [rows, setRows] = useState<readonly InvoiceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/invoices');
    if (response.ok) {
      const payload = (await response.json()) as { invoices: InvoiceRow[] };
      setRows(payload.invoices);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setMessage(
        `Reading ${file.name}… the agent is extracting and checking it.`,
      );
      try {
        const body = new FormData();
        body.append('file', file);
        const response = await fetch('/api/invoices/upload', {
          body,
          method: 'POST',
        });
        const payload = (await response.json()) as {
          error?: string;
          findings?: readonly { severity: string }[];
          invoiceId?: string;
          status?: string;
        };
        if (!response.ok || payload.invoiceId === undefined) {
          setMessage(payload.error ?? 'Upload failed.');
          return;
        }
        const flagged =
          payload.findings?.filter((finding) => finding.severity !== 'info')
            .length ?? 0;
        setMessage(
          payload.status === 'settled'
            ? 'Clean invoice from a known supplier — settled automatically.'
            : flagged > 0
              ? `${String(flagged)} problem${flagged === 1 ? '' : 's'} found — blocked pending your approval.`
              : 'Invoice processed.',
        );
        await refresh();
      } finally {
        setBusy(false);
        if (fileInput.current) fileInput.current.value = '';
      }
    },
    [refresh],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Upload a supplier invoice. It is read, checked against your own
            records, and either settled or blocked with the reasons.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
            ref={fileInput}
            type="file"
          />
          <Button disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? 'Processing…' : 'Upload invoice'}
          </Button>
        </div>
      </div>

      {message === null ? null : (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Supplier</TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Route</TableHead>
            <TableHead>Uploaded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={6}>
                No invoices yet — upload one to start.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.invoiceId}>
                <TableCell className="font-medium">
                  <Link
                    className="text-primary underline-offset-2 hover:underline"
                    href={`/invoices/${row.invoiceId}`}
                  >
                    {row.supplierName ?? row.originalFilename}
                  </Link>
                </TableCell>
                <TableCell>{row.invoiceNumber ?? '—'}</TableCell>
                <TableCell className="tabular text-right">
                  {amount(row)}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[row.status] ?? 'warning'}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.route ?? '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
