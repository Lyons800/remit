import {
  lookupAgentHumanBackings,
  resolveAgentNames,
} from '@invoiceguard/world-adapter';

/**
 * Resolve the identity facts about a set of agent wallets.
 *
 * Two facts, from two different chains, deliberately never merged into one
 * notion of "identity":
 *
 *   humanId  which anonymous human backs this agent   — World AgentBook
 *   ensName  what this agent is called                — ENS, Ethereum mainnet
 *
 * A name proves nothing about personhood: anyone can register one, and one
 * person can register a hundred. Only the humanId decides quorum. The name is
 * presentation and discovery, and treating it as more than that would be the
 * same mistake as counting accounts instead of people.
 *
 * Neither is persisted. A stored agent-to-human mapping would let anyone who
 * reached our database manufacture a quorum, so both are read live on every
 * request. Either resolver failing yields null rather than an error: an agent
 * nobody has vouched for, or nobody has named, is a legitimate state.
 */

export const dynamic = 'force-dynamic';

const MAX_ADDRESSES = 25;

export interface IdentityResolution {
  readonly address: string;
  readonly humanId: string | null;
  readonly ensName: string | null;
}

export interface IdentityResponse {
  readonly checkedAt: string;
  readonly registry: string;
  readonly resolutions: readonly IdentityResolution[];
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

  // Independent lookups against different chains — one being slow or down must
  // never hide the other.
  const [backings, names] = await Promise.all([
    lookupAgentHumanBackings(wanted),
    resolveAgentNames(wanted),
  ]);

  const nameByAddress = new Map(
    names.map((entry) => [entry.address.toLowerCase(), entry.name]),
  );

  const response: IdentityResponse = {
    checkedAt: new Date().toISOString(),
    registry: 'world-agentbook:eip155:480',
    resolutions: backings.map((backing) => ({
      address: backing.address,
      humanId: backing.humanId,
      ensName: nameByAddress.get(backing.address.toLowerCase()) ?? null,
    })),
  };

  return Response.json(response, {
    headers: { 'cache-control': 'no-store' },
  });
}
