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
  title: 'Remit · Accounts payable control room',
};

type RootLayoutProperties = Readonly<{ children: ReactNode }>;

export default function RootLayout({
  children,
}: RootLayoutProperties): ReactNode {
  return (
    <html className={`${hedvig.variable} ${mono.variable}`} lang="en">
      <body style={{ fontFamily: 'var(--font-sans), sans-serif' }}>
        <Sidebar />
        <main className="min-h-screen pb-16 md:ml-[70px] md:pb-0">
          <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8">
            <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border border-border px-3 py-2">
              <p className="microlabel text-foreground">
                Product scenario · synthetic AP records
              </p>
              <span className="hidden h-3 w-px bg-border sm:block" />
              <p className="microlabel">
                Live evidence · public Hedera Testnet facts only · no real funds
              </p>
            </div>
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
