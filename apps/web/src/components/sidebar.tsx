'use client';

import {
  ArrowLeftRight,
  Building2,
  LayoutGrid,
  LogIn,
  LogOut,
  ReceiptText,
  Users,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '../lib/auth-client';
import { cn } from '../lib/utils';

/* midday's sidebar recipe: fixed rail, 70px -> 240px on hover, 200ms
   cubic-bezier(0.4,0,0.2,1); icons stay fixed-left, labels reveal. */

const items = [
  { href: '/dashboard', icon: LayoutGrid, label: 'Overview' },
  { href: '/invoices', icon: ReceiptText, label: 'Invoices' },
  { href: '/people', icon: Users, label: 'People' },
  { href: '/suppliers', icon: Building2, label: 'Suppliers' },
  { href: '/payments', icon: ArrowLeftRight, label: 'Payments' },
  { href: '/policies', icon: SlidersHorizontal, label: 'Policies' },
] as const;

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function SidebarAccount({ isExpanded }: Readonly<{ isExpanded: boolean }>) {
  const router = useRouter();
  const session = authClient.useSession();
  const activeOrganization = authClient.useActiveOrganization();

  if (session.data === null || session.data === undefined) {
    return (
      <Link className="flex items-center" href="/sign-in">
        <span className="flex w-[70px] shrink-0 items-center justify-center">
          <LogIn aria-hidden="true" size={18} strokeWidth={1.5} />
        </span>
        <span
          className={cn(
            'text-xs font-medium whitespace-nowrap transition-opacity duration-200',
            isExpanded ? 'opacity-100' : 'opacity-0',
          )}
        >
          Company sign in
        </span>
      </Link>
    );
  }

  const organizationName = activeOrganization.data?.name ?? 'Company workspace';

  async function signOut() {
    await authClient.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <div className="flex w-full items-center">
      <span className="flex w-[70px] shrink-0 items-center justify-center">
        <span className="flex h-8 w-8 items-center justify-center border border-border font-mono text-[10px] text-muted-foreground">
          {initials(organizationName) || 'R'}
        </span>
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 overflow-hidden transition-opacity duration-200',
          isExpanded ? 'opacity-100' : 'opacity-0',
        )}
      >
        <span className="block truncate text-xs font-medium">
          {organizationName}
        </span>
        <span className="microlabel block truncate">
          {session.data.user.email}
        </span>
      </span>
      <button
        aria-label="Sign out"
        className={cn(
          'mr-3 text-muted-foreground transition-opacity hover:text-foreground',
          isExpanded ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={signOut}
        type="button"
      >
        <LogOut aria-hidden="true" size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}

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
              R
            </span>
          </Link>
          <span
            className={cn(
              'ml-3 overflow-hidden text-sm font-semibold whitespace-nowrap transition-opacity duration-200',
              isExpanded ? 'opacity-100' : 'opacity-0',
            )}
          >
            Remit
          </span>
        </div>

        <nav className="mb-3 flex w-full flex-1 flex-col gap-1 overflow-hidden border-b border-border pt-4">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
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

        <SidebarAccount isExpanded={isExpanded} />
      </aside>

      <nav
        aria-label="Primary navigation"
        className="fixed right-0 bottom-0 left-0 z-50 grid h-14 grid-cols-6 border-t border-border bg-background md:hidden"
      >
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
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
