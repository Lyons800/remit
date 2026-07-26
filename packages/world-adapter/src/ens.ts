import { createPublicClient, defineChain, http, isAddress } from 'viem';
import { normalize } from 'viem/ens';

/**
 * ENS names for agent wallets.
 *
 * This is a third identity fact, and it is deliberately orthogonal to the other
 * two the product already separates:
 *
 *   ENS         what an agent is called, and how you find it
 *   AgentBook   which human stands behind it
 *   the company what that person is allowed to approve
 *
 * A name is not a human and a human is not a role. An ENS name proves nothing
 * about personhood — anyone can register one, and one person can register a
 * hundred — so resolution here is presentation and discovery only. It never
 * feeds the quorum decision. Conflating a readable name with a verified human
 * is precisely the mistake the rest of this system exists to refuse.
 *
 * Resolution is live against Ethereum mainnet; nothing is hardcoded.
 */

const DEFAULT_RPC_URL = 'https://ethereum-rpc.publicnode.com';
const LOOKUP_TIMEOUT_MS = 6_000;
const ETHEREUM_MAINNET = defineChain({
  blockExplorers: {
    default: {
      name: 'Etherscan',
      url: 'https://etherscan.io',
    },
  },
  id: 1,
  name: 'Ethereum',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [DEFAULT_RPC_URL],
    },
  },
});

export interface EnsIdentity {
  readonly address: string;
  /** Reverse record, when the owner has set one. */
  readonly name: string | null;
}

export interface EnsResolutionOptions {
  readonly rpcUrl?: string;
  readonly timeoutMs?: number;
}

function client(rpcUrl: string) {
  return createPublicClient({
    chain: ETHEREUM_MAINNET,
    transport: http(rpcUrl),
  });
}

async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

/**
 * Reverse-resolve agent wallets to their ENS names.
 *
 * A wallet with no reverse record, or an unreachable resolver, yields null. The
 * roster still functions on raw addresses — a naming outage must never make an
 * approver unusable.
 */
export async function resolveAgentNames(
  addresses: readonly string[],
  options: EnsResolutionOptions = {},
): Promise<readonly EnsIdentity[]> {
  const rpc = client(options.rpcUrl ?? DEFAULT_RPC_URL);
  const timeoutMs = options.timeoutMs ?? LOOKUP_TIMEOUT_MS;

  return Promise.all(
    addresses.map(async (address): Promise<EnsIdentity> => {
      if (!isAddress(address)) return { address, name: null };
      try {
        const name = await withTimeout(
          rpc.getEnsName({ address }),
          timeoutMs,
          null,
        );
        return { address, name };
      } catch {
        return { address, name: null };
      }
    }),
  );
}

/**
 * Forward-resolve an ENS name to the address it points at.
 *
 * Lets an administrator add an approver by name rather than by pasting forty
 * hex characters, which is the step where a mistyped address silently becomes
 * a wallet nobody controls.
 */
export async function resolveEnsName(
  name: string,
  options: EnsResolutionOptions = {},
): Promise<string | null> {
  const rpc = client(options.rpcUrl ?? DEFAULT_RPC_URL);
  const timeoutMs = options.timeoutMs ?? LOOKUP_TIMEOUT_MS;

  let normalized: string;
  try {
    normalized = normalize(name.trim());
  } catch {
    return null;
  }

  try {
    return await withTimeout(
      rpc.getEnsAddress({ name: normalized }),
      timeoutMs,
      null,
    );
  } catch {
    return null;
  }
}

/** Does this look like an ENS name rather than an address? */
export function looksLikeEnsName(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed.startsWith('0x') && trimmed.includes('.');
}
