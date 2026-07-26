import { lookupAgentHumanBackings } from '@invoiceguard/world-adapter';

/**
 * Resolve agent wallets to the anonymous humans backing them.
 *
 * This is the one fact the product deliberately never stores. Caching "this
 * agent belongs to human X" would mean anyone who reached our database could
 * manufacture a quorum, so it is read from World Chain on every request.
 *
 * An unregistered agent resolves to null rather than erroring. Nobody having
 * vouched for an agent is a legitimate state — it simply cannot carry approval
 * authority.
 */

export const dynamic = 'force-dynamic';

const MAX_ADDRESSES = 25;

export interface AgentBookResolution {
  readonly address: string;
  readonly humanId: string | null;
}

export interface AgentBookResponse {
  readonly checkedAt: string;
  readonly registry: string;
  readonly resolutions: readonly AgentBookResolution[];
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const addresses = (body as { addresses?: unknown }).addresses;
  if (!Array.isArray(addresses) || addresses.length > MAX_ADDRESSES) {
    return Response.json(
      { error: `expected addresses: string[] of at most ${MAX_ADDRESSES}` },
      { status: 400 },
    );
  }

  const wanted = addresses.filter(
    (value): value is string => typeof value === 'string',
  );

  const response: AgentBookResponse = {
    checkedAt: new Date().toISOString(),
    registry: 'world-agentbook:eip155:480',
    resolutions: await lookupAgentHumanBackings(wanted),
  };

  return Response.json(response, {
    headers: { 'cache-control': 'no-store' },
  });
}
