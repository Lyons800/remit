import { lookupAgentHumanBackings } from '@remit/world-adapter/agentbook';
import { resolveAgentNames } from '@remit/world-adapter/ens';
import { listWorkspacePeople } from '@remit/persistence';

import { headers } from 'next/headers';

import { redactHumanBackings } from '../../../lib/identity-redaction';
import { db, resolveOrganizationId } from '../../../lib/workspace.server';

/**
 * Resolve the identity facts about a set of agent wallets.
 *
 * Two facts, from two different chains, deliberately never merged into one
 * notion of "identity":
 *
 *   backing  whether World AgentBook backs this agent — World AgentBook
 *   ensName  what this agent is called                — ENS, Ethereum mainnet
 *
 * A name proves nothing about personhood: anyone can register one, and one
 * person can register a hundred. Only same-human equality decides quorum. The
 * raw AgentBook identifier is reduced to a response-local class before leaving
 * the server. The name is presentation and discovery, and treating it as more
 * than that would be the same mistake as counting accounts instead of people.
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
  readonly ensName: string | null;
  readonly humanClass: string | null;
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
  const normalizedWanted = wanted.map((address) => address.toLowerCase());

  let allowedAddresses: ReadonlySet<string>;
  try {
    const { organizationId } = await resolveOrganizationId(await headers());
    const people = await listWorkspacePeople(db(), organizationId);
    allowedAddresses = new Set(
      people.map((person) => person.agentAddress.toLowerCase()),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'roster unavailable' },
      { status: 503 },
    );
  }

  if (
    normalizedWanted.some((address) => !allowedAddresses.has(address)) ||
    new Set(normalizedWanted).size !== normalizedWanted.length
  ) {
    return Response.json(
      { error: 'identity lookups are limited to the selected company roster' },
      { status: 403 },
    );
  }

  // Independent lookups against different chains — one being slow or down must
  // never hide the other.
  const [backings, names] = await Promise.all([
    lookupAgentHumanBackings(wanted),
    resolveAgentNames(wanted),
  ]);

  const nameByAddress = new Map(
    names.map((entry) => [entry.address.toLowerCase(), entry.name]),
  );
  const redactedBackings = redactHumanBackings(backings);

  const response: IdentityResponse = {
    checkedAt: new Date().toISOString(),
    registry: 'world-agentbook:eip155:480',
    resolutions: redactedBackings.map((backing) => ({
      address: backing.address,
      humanClass: backing.humanClass,
      ensName: nameByAddress.get(backing.address.toLowerCase()) ?? null,
    })),
  };

  return Response.json(response, {
    headers: { 'cache-control': 'no-store' },
  });
}
