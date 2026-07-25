'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '../lib/utils';

const items = [
  { href: '/', label: 'Dashboard' },
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
    <aside className="hidden w-52 shrink-0 border-r border-border py-6 pr-4 md:block">
      <div className="mb-8 px-2">
        <p className="text-sm font-bold">InvoiceGuard</p>
        <p className="text-xs text-muted-foreground">Padel Peru, Lda</p>
      </div>
      <nav className="flex flex-col gap-1 text-sm">
        {items.map((item) => {
          const active =
            'match' in item
              ? pathname.startsWith(item.match)
              : pathname === item.href;
          return (
            <Link
              className={cn(
                'rounded-md px-2 py-1.5 font-medium hover:bg-muted',
                active && 'bg-muted text-primary',
              )}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-8 px-2 text-[11px] leading-relaxed text-muted-foreground">
        Policy {`acme-policy-3`} active.
        <br />
        All settlement on Hedera Testnet.
      </p>
    </aside>
  );
}
