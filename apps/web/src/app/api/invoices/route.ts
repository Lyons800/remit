import { listInvoices } from '@remit/persistence';
import { headers } from 'next/headers';

import { db, resolveOrganizationId } from '../../../lib/workspace.server';
import { WorkspaceAccessError } from '../../../lib/workspace-access';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const { organizationId } = await resolveOrganizationId(await headers());
    const invoices = await listInvoices(db(), organizationId);
    return Response.json(
      { invoices },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return Response.json(
        { code: error.code, error: error.message },
        { status: error.status },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'unavailable' },
      { status: 503 },
    );
  }
}
