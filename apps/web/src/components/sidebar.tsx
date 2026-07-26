'use client';

import {
  ArrowLeftRight,
  Building2,
  LayoutGrid,
  ReceiptText,
  ScrollText,
  Users,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { cn } from '../lib/utils';

/* midday's sidebar recipe: fixed rail, 70px -> 240px on hover, 200ms
   cubic-bezier(0.4,0,0.2,1); icons stay fixed-left, labels reveal. */

const items = [
  { href: '/', icon: LayoutGrid, label: 'Overview' },
  { href: '/invoices', icon: ReceiptText, label: 'Invoices' },
  {
    href: '/approvals/INV-2026-0912',
    icon: ShieldCheck,
    label: 'Approvals',
    match: '/approvals',
  },
  { href: '/people', icon: Users, label: 'People' },
  { href: '/suppliers', icon: Building2, label: 'Suppliers' },
  { href: '/payments', icon: ArrowLeftRight, label: 'Payments' },
  { href: '/audit', icon: ScrollText, label: 'Evidence' },
  { href: '/policies', icon: SlidersHorizontal, label: 'Policies' },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 hidden h-screen shrink-0 flex-col justify-between border-r border-border bg-background pb-4 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] md:flex',
          isExpanded ? 'w-[240px]' : 'w-[70px]',
        )}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <div className="flex h-[70px] shrink-0 items-center border-b border-border">
          <Link className="pl-[23px]" href="/">
            <span className="flex h-6 w-6 items-center justify-center bg-primary font-mono text-xs font-semibold text-primary-foreground">
              IG
            </span>
          </Link>
          <span
            className={cn(
              'ml-3 overflow-hidden text-sm font-semibold whitespace-nowrap transition-opacity duration-200',
              isExpanded ? 'opacity-100' : 'opacity-0',
            )}
          >
            InvoiceGuard
          </span>
        </div>

        <nav className="mb-3 flex w-full flex-1 flex-col gap-1 overflow-hidden border-b border-border pt-4">
          {items.map((item) => {
            const active =
              'match' in item
                ? pathname.startsWith(item.match)
                : pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                className={cn(
                  'relative flex h-[42px] items-center transition-colors',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                href={item.href}
                key={item.href}
              >
                {active ? (
                  <span className="absolute left-0 h-full w-px bg-foreground" />
                ) : null}
                <span className="flex w-[70px] shrink-0 items-center justify-center">
                  <Icon size={20} strokeWidth={1.5} />
                </span>
                <span
                  className={cn(
                    'overflow-hidden text-sm whitespace-nowrap transition-opacity duration-200',
                    isExpanded ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center">
          <span className="flex w-[70px] shrink-0 items-center justify-center">
            <span className="flex h-8 w-8 items-center justify-center border border-border font-mono text-[10px] text-muted-foreground">
              PP
            </span>
          </span>
          <span
            className={cn(
              'overflow-hidden transition-opacity duration-200',
              isExpanded ? 'opacity-100' : 'opacity-0',
            )}
          >
            <span className="block text-xs font-medium whitespace-nowrap">
              Padel Peru, Lda
            </span>
            <span className="microlabel block whitespace-nowrap">
              synthetic scenario
            </span>
          </span>
        </div>
      </aside>

      <nav
        aria-label="Primary navigation"
        className="fixed right-0 bottom-0 left-0 z-50 grid h-14 grid-cols-7 border-t border-border bg-background md:hidden"
      >
        {items.map((item) => {
          const active =
            'match' in item
              ? pathname.startsWith(item.match)
              : pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              className={cn(
                'relative flex items-center justify-center transition-colors',
                active ? 'bg-muted text-foreground' : 'text-muted-foreground',
              )}
              href={item.href}
              key={item.href}
            >
              {active ? (
                <span className="absolute top-0 right-2 left-2 h-px bg-foreground" />
              ) : null}
              <Icon aria-hidden="true" size={18} strokeWidth={1.5} />
              <span className="sr-only">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
