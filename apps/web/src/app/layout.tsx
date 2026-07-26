import type { Metadata } from 'next';
import { Geist_Mono, Hedvig_Letters_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

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
        {children}
      </body>
    </html>
  );
}
