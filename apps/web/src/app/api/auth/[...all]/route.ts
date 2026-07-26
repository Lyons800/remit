import { toNextJsHandler } from 'better-auth/next-js';

import { getAuth } from '../../../../lib/auth.server';

/**
 * Better Auth's HTTP surface.
 *
 * The handler is built per request rather than at module scope. `next build`
 * imports this file while collecting page data, and constructing the auth
 * instance there would make the build itself require production secrets —
 * failing CI, which has none, for no benefit. `getAuth()` memoises, so the
 * cost after the first request is a property read.
 */

export const dynamic = 'force-dynamic';

const handle = (method: 'GET' | 'POST') =>
  async function route(request: Request): Promise<Response> {
    return toNextJsHandler(getAuth())[method](request);
  };

export const GET = handle('GET');
export const POST = handle('POST');
