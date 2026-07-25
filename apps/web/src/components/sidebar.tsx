'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '../lib/utils';

const items = [
  { href: '/', label: 'Overview' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/approvals/INV-2026-0912', label: 'Approvals', match: '/approvals' },
  { href: '/suppliers', label: 'Suppliers' },
  { href: '/payments', label: 'Payments' },
  { href: '/audit', label: 'Audit log' },
  { href: '/policies', label: 'Policies' },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-48 shrink-0 py-6 pr-6 md:block">
      <div className="mb-10 px-2">
        <p className="text-sm font-semibold tracking-tight">InvoiceGuard</p>
        <p className="microlabel mt-1">Padel Peru, Lda</p>
      </div>
      <nav className="flex flex-col text-sm">
        {items.map((item) => {
          const active =
            'match' in item
              ? pathname.startsWith(item.match)
              : pathname === item.href;
          return (
            <Link
              className={cn(
                'border-l px-3 py-2 text-muted-foreground transition-colors hover:text-foreground',
                active
                  ? 'border-foreground text-foreground'
                  : 'border-border',
              )}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <p className="microlabel mt-10 px-3 leading-relaxed">
        policy acme-policy-3
        <br />
        hedera testnet
      </p>
    </aside>
  );
}
