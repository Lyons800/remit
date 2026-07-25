import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Sidebar } from '../components/sidebar';

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
          <Sidebar />
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
