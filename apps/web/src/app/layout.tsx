import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import './styles.css';

export const metadata: Metadata = {
  description:
    'Agentic accounts-payable operations with exact-action controls.',
  title: 'InvoiceGuard · Accounts payable control room',
};

type RootLayoutProperties = Readonly<{ children: ReactNode }>;

export default function RootLayout({
  children,
}: RootLayoutProperties): ReactNode {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-6xl">
          <aside className="hidden w-52 shrink-0 border-r border-border py-6 pr-4 md:block">
            <div className="mb-8 px-2">
              <p className="text-sm font-bold">InvoiceGuard</p>
              <p className="text-xs text-muted-foreground">Padel Peru, Lda</p>
            </div>
            <nav className="flex flex-col gap-1 text-sm">
              <Link
                className="rounded-md px-2 py-1.5 font-medium hover:bg-muted"
                href="/"
              >
                Queue
              </Link>
              <Link
                className="rounded-md px-2 py-1.5 font-medium hover:bg-muted"
                href="/approvals/INV-2026-0912"
              >
                Approvals
              </Link>
              <span className="cursor-not-allowed rounded-md px-2 py-1.5 text-muted-foreground">
                Suppliers
              </span>
              <span className="cursor-not-allowed rounded-md px-2 py-1.5 text-muted-foreground">
                Audit log
              </span>
            </nav>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
            <p className="mb-6 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-semibold tracking-wide text-amber-900 uppercase">
              Synthetic demo data · Hedera Testnet only · no real funds
            </p>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
