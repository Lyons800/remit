import type { Metadata } from 'next';
import { Geist_Mono, Hedvig_Letters_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

import { Sidebar } from '../components/sidebar';

import './styles.css';

/* midday maps its type to hedvig-sans; the open release is Hedvig Letters. */
const hedvig = Hedvig_Letters_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: '400',
});
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

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
    <html className={`${hedvig.variable} ${mono.variable}`} lang="en">
      <body style={{ fontFamily: 'var(--font-sans), sans-serif' }}>
        <div className="mx-auto flex min-h-screen max-w-6xl">
          <Sidebar />
          <main className="min-w-0 flex-1 border-l border-border px-4 py-6 md:px-8">
            <p className="microlabel mb-6 border border-border px-3 py-1.5">
              Synthetic demo data · Hedera testnet only · no real funds
            </p>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
