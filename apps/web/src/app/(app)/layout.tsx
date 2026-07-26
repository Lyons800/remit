import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import { Sidebar } from '../../components/sidebar';
import { resolveOrganizationId } from '../../lib/workspace.server';

/**
 * The workspace chrome.
 *
 * Everything under this group is the product operating inside one
 * organisation. The marketing group deliberately does not get the sidebar, so
 * a first-time visitor lands on an explanation rather than inside someone
 * else's ledger.
 */
export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: ReactNode }>): Promise<ReactNode> {
  const workspace = await resolveOrganizationId(await headers());

  return (
    <>
      <Sidebar />
      <main className="min-h-screen pb-16 md:ml-[70px] md:pb-0">
        <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8">
          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border border-border px-3 py-2">
            <p className="microlabel text-foreground">
              {workspace.isDemo
                ? 'Public demo · read-only roster · synthetic AP records'
                : 'Company workspace · private roster · synthetic AP records'}
            </p>
            <span className="hidden h-3 w-px bg-border sm:block" />
            <p className="microlabel">
              Live evidence · public Hedera Testnet facts only · no real funds
            </p>
          </div>
          {children}
        </div>
      </main>
    </>
  );
}
