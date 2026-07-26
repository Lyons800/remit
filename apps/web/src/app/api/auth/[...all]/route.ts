import { authConfigurationState } from '../../../../lib/workspace-access';

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
    const state = authConfigurationState();
    if (state === 'absent') {
      // The public judge demo does not configure company sign-in. Returning an
      // empty session keeps Better Auth's client hooks quiet without creating a
      // pretend user or requiring irrelevant OAuth secrets.
      if (method === 'GET') {
        return Response.json(null, {
          headers: { 'cache-control': 'no-store' },
        });
      }
      return Response.json(
        { error: 'Company sign-in is not configured in this environment.' },
        { status: 503 },
      );
    }
    if (state === 'partial') {
      return Response.json(
        { error: 'Company sign-in is only partially configured.' },
        { status: 503 },
      );
    }

    const [{ toNextJsHandler }, { getAuth }] = await Promise.all([
      import('better-auth/next-js'),
      import('../../../../lib/auth.server'),
    ]);
    return toNextJsHandler(getAuth())[method](request);
  };

export const GET = handle('GET');
export const POST = handle('POST');
