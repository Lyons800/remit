import { createHash, randomUUID } from 'node:crypto';

import { findInvoiceByContentSha, insertInvoice } from '@remit/persistence';
import { headers } from 'next/headers';

import { db, resolveOrganizationId } from '../../../../lib/workspace.server';
import { WorkspaceAccessError } from '../../../../lib/workspace-access';
import {
  isExtractionConfigured,
  isSupportedInvoiceContentType,
} from '../../../../lib/invoice-extraction.server';
import { processUploadedInvoice } from '../../../../lib/invoice-pipeline.server';

/**
 * Upload one invoice document and run it through the pipeline:
 * extract → check → route → (settle | block for human approval).
 *
 * The identical document is refused per organisation by content digest —
 * re-uploading the same PDF cannot create a second payable.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAXIMUM_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!isExtractionConfigured()) {
    return Response.json(
      {
        error:
          'Invoice extraction is not configured — set ANTHROPIC_API_KEY in the environment.',
      },
      { status: 501 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: 'expected multipart form data with a "file" field' },
      { status: 400 },
    );
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'a "file" field is required' }, { status: 400 });
  }
  const contentType = file.type || 'application/octet-stream';
  if (!isSupportedInvoiceContentType(contentType)) {
    return Response.json(
      { error: `unsupported file type ${contentType} — upload a PDF or image` },
      { status: 415 },
    );
  }
  if (file.size === 0 || file.size > MAXIMUM_UPLOAD_BYTES) {
    return Response.json(
      { error: 'file must be between 1 byte and 15 MB' },
      { status: 413 },
    );
  }

  const content = new Uint8Array(await file.arrayBuffer());
  const contentSha256 = createHash('sha256').update(content).digest('hex');

  try {
    const { organizationId } = await resolveOrganizationId(await headers());
    const sql = db();

    const existing = await findInvoiceByContentSha(
      sql,
      organizationId,
      contentSha256,
    );
    if (existing !== undefined) {
      return Response.json(
        {
          error: 'This exact document has already been uploaded.',
          existingInvoiceId: existing,
        },
        { status: 409 },
      );
    }

    const invoiceId = randomUUID();
    await insertInvoice(sql, {
      content,
      contentSha256,
      contentType,
      invoiceId,
      organizationId,
      originalFilename: file.name || 'invoice',
    });

    const processed = await processUploadedInvoice(sql, {
      content,
      contentSha256,
      contentType,
      invoiceId,
      organizationId,
    });

    return Response.json(
      {
        actionDigest: processed.actionDigest,
        decision: processed.decision,
        findings: processed.findings,
        invoiceId,
        settlement: processed.settlement,
        status: processed.status,
        success: true,
      },
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
      {
        error:
          error instanceof Error
            ? `Invoice processing failed: ${error.message}`
            : 'Invoice processing failed.',
      },
      { status: 502 },
    );
  }
}
