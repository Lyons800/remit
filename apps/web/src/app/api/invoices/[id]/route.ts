import { getInvoice } from '@remit/persistence';
import { headers } from 'next/headers';

import { db, resolveOrganizationId } from '../../../../lib/workspace.server';
import { WorkspaceAccessError } from '../../../../lib/workspace-access';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const { organizationId } = await resolveOrganizationId(await headers());
    const invoice = await getInvoice(db(), organizationId, id);
    if (invoice === undefined) {
      return Response.json({ error: 'invoice not found' }, { status: 404 });
    }
    return Response.json(
      { invoice },
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
