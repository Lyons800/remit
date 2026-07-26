import { createHash } from 'node:crypto';

import { createAgentBookVerifier } from '@worldcoin/agentkit';
import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  isAddress,
} from 'viem';

import {
  WORLD_AGENTBOOK_ADAPTER_ID,
  WORLD_AGENTBOOK_ADAPTER_VERSION,
  WORLD_AGENTBOOK_ADDRESS,
  WORLD_AGENTBOOK_BACKING_RECORD_SOURCE,
  WORLD_AGENTBOOK_CHAIN_ID,
  WORLD_AGENTBOOK_NUMERIC_CHAIN_ID,
  WORLD_AGENTBOOK_REGISTRY_ID,
} from './constants.js';
import {
  createWorldPrincipalKeyring,
  deriveAgentTenantPrincipalAliases,
  type ScopedWorldPrincipal,
  type VersionedScopedWorldPrincipal,
  type WorldPrincipalDerivationVersion,
  type WorldPrincipalKeyring,
} from './privacy.js';

const AGENTBOOK_ABI = [
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'lookupHuman',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Keep this definition local instead of importing `worldchain` from the
// `viem/chains` barrel. In Next development that barrel pulls every chain
// definition into the server compiler just to make one AgentBook read.
const WORLD_CHAIN = defineChain({
  blockExplorers: {
    default: {
      name: 'Worldscan',
      url: 'https://worldscan.org',
    },
  },
  id: WORLD_AGENTBOOK_NUMERIC_CHAIN_ID,
  name: 'World Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://worldchain-mainnet.g.alchemy.com/public'],
    },
  },
});

export type WorldAgentBookResolverObservation = Readonly<{
  agentBookAdapterId: typeof WORLD_AGENTBOOK_ADAPTER_ID;
  agentBookAdapterVersion: typeof WORLD_AGENTBOOK_ADAPTER_VERSION;
  backingRecordSource: typeof WORLD_AGENTBOOK_BACKING_RECORD_SOURCE;
  observedNetworkId: string | null;
  observedNumericChainId: number | null;
  registryAddress: typeof WORLD_AGENTBOOK_ADDRESS;
  registryId: typeof WORLD_AGENTBOOK_REGISTRY_ID;
}>;

export type AgentBookResolution = WorldAgentBookResolverObservation &
  (
    | Readonly<{
        agentAddress: `0x${string}`;
        backingRecordId: string;
        status: 'backed';
        tenantPrincipal: ScopedWorldPrincipal;
        tenantPrincipalAliases: readonly VersionedScopedWorldPrincipal[];
        tenantPrincipalDerivationVersion: WorldPrincipalDerivationVersion;
      }>
    | Readonly<{
        agentAddress: `0x${string}`;
        status: 'unregistered';
      }>
    | Readonly<{
        agentAddress: `0x${string}`;
        reason: 'LOOKUP_INDETERMINATE' | 'RPC_UNAVAILABLE' | 'WRONG_CHAIN';
        status: 'unavailable';
      }>
  );

type AgentBookPrincipalResolverDependencies = Readonly<{
  getChainId: () => Promise<number>;
  lookupHuman: (agentAddress: `0x${string}`) => Promise<string | null>;
  probeHuman: (agentAddress: `0x${string}`) => Promise<bigint>;
}>;

type AgentBookPrincipalResolverOptions = Readonly<{
  key?: Uint8Array;
  keyring?: WorldPrincipalKeyring;
  organizationId: string;
}>;

export type AgentBookPrincipalResolver = Readonly<{
  resolve: (agentAddress: string) => Promise<AgentBookResolution>;
}>;

function requireAddress(value: string): `0x${string}` {
  if (!isAddress(value, { strict: false })) {
    throw new Error('agentAddress must be a valid EVM address.');
  }

  return getAddress(value);
}

function observation(chainId: unknown): WorldAgentBookResolverObservation {
  const observedNumericChainId =
    typeof chainId === 'number' && Number.isSafeInteger(chainId)
      ? chainId
      : null;
  return Object.freeze({
    agentBookAdapterId: WORLD_AGENTBOOK_ADAPTER_ID,
    agentBookAdapterVersion: WORLD_AGENTBOOK_ADAPTER_VERSION,
    backingRecordSource: WORLD_AGENTBOOK_BACKING_RECORD_SOURCE,
    observedNetworkId:
      observedNumericChainId === null
        ? null
        : `eip155:${observedNumericChainId}`,
    observedNumericChainId,
    registryAddress: WORLD_AGENTBOOK_ADDRESS,
    registryId: WORLD_AGENTBOOK_REGISTRY_ID,
  });
}

function unavailable(
  agentAddress: `0x${string}`,
  reason: 'LOOKUP_INDETERMINATE' | 'RPC_UNAVAILABLE' | 'WRONG_CHAIN',
  chainId: unknown,
): AgentBookResolution {
  return Object.freeze({
    ...observation(chainId),
    agentAddress,
    reason,
    status: 'unavailable',
  });
}

function backingRecordId(
  agentAddress: `0x${string}`,
  tenantPrincipal: ScopedWorldPrincipal,
): string {
  const hash = createHash('sha256');
  for (const field of [
    'invoiceguard:world-agentbook-backing-record:v1',
    WORLD_AGENTBOOK_CHAIN_ID,
    WORLD_AGENTBOOK_ADDRESS,
    WORLD_AGENTBOOK_BACKING_RECORD_SOURCE,
    agentAddress,
    tenantPrincipal,
  ]) {
    hash.update(String(Buffer.byteLength(field, 'utf8')));
    hash.update(':');
    hash.update(field, 'utf8');
  }
  return `world-agentbook-record:${hash.digest('hex')}`;
}

function requireRpcUrl(value: string): string {
  const rpcUrl = new URL(value);
  const isLocal =
    rpcUrl.hostname === 'localhost' ||
    rpcUrl.hostname === '127.0.0.1' ||
    rpcUrl.hostname === '[::1]';

  if (
    rpcUrl.protocol !== 'https:' &&
    !(rpcUrl.protocol === 'http:' && isLocal)
  ) {
    throw new Error('World RPC URL must use HTTPS except on localhost.');
  }

  if (rpcUrl.username !== '' || rpcUrl.password !== '' || rpcUrl.hash !== '') {
    throw new Error(
      'World RPC URL must not contain credentials or a fragment.',
    );
  }

  return rpcUrl.toString();
}

export function createAgentBookPrincipalResolver(
  { key, keyring, organizationId }: AgentBookPrincipalResolverOptions,
  {
    getChainId,
    lookupHuman,
    probeHuman,
  }: AgentBookPrincipalResolverDependencies,
): AgentBookPrincipalResolver {
  if ((key === undefined) === (keyring === undefined)) {
    throw new Error('Configure exactly one World principal key or keyring.');
  }

  if (organizationId.length === 0) {
    throw new Error('organizationId must not be empty.');
  }

  const principalKeyring =
    keyring ??
    createWorldPrincipalKeyring({
      key: key as Uint8Array,
      version: 'v1',
    });

  return Object.freeze({
    async resolve(rawAgentAddress: string): Promise<AgentBookResolution> {
      const agentAddress = requireAddress(rawAgentAddress);
      let chainId: number;

      try {
        chainId = await getChainId();
      } catch {
        return unavailable(agentAddress, 'RPC_UNAVAILABLE', null);
      }

      if (chainId !== WORLD_AGENTBOOK_NUMERIC_CHAIN_ID) {
        return unavailable(agentAddress, 'WRONG_CHAIN', chainId);
      }

      let humanId: string | null;

      try {
        humanId = await lookupHuman(agentAddress);
      } catch {
        humanId = null;
      }

      if (humanId !== null) {
        try {
          const aliases = deriveAgentTenantPrincipalAliases({
            humanId,
            keyring: principalKeyring,
            organizationId,
          });
          const current = aliases[0];

          if (current === undefined) {
            return unavailable(agentAddress, 'LOOKUP_INDETERMINATE', chainId);
          }

          return Object.freeze({
            ...observation(chainId),
            agentAddress,
            backingRecordId: backingRecordId(agentAddress, current.principal),
            status: 'backed',
            tenantPrincipal: current.principal,
            tenantPrincipalAliases: aliases,
            tenantPrincipalDerivationVersion: current.derivationVersion,
          });
        } catch {
          return unavailable(agentAddress, 'LOOKUP_INDETERMINATE', chainId);
        }
      }

      try {
        const probedHuman = await probeHuman(agentAddress);

        if (probedHuman === 0n) {
          return Object.freeze({
            ...observation(chainId),
            agentAddress,
            status: 'unregistered',
          });
        }

        return unavailable(agentAddress, 'LOOKUP_INDETERMINATE', chainId);
      } catch {
        try {
          const currentChainId = await getChainId();

          if (currentChainId !== WORLD_AGENTBOOK_NUMERIC_CHAIN_ID) {
            return unavailable(agentAddress, 'WRONG_CHAIN', currentChainId);
          }

          return unavailable(
            agentAddress,
            'LOOKUP_INDETERMINATE',
            currentChainId,
          );
        } catch {
          return unavailable(agentAddress, 'RPC_UNAVAILABLE', null);
        }
      }
    },
  });
}

type WorldChainAgentBookResolverOptions = Readonly<{
  key?: Uint8Array;
  keyring?: WorldPrincipalKeyring;
  organizationId: string;
  rpcUrl: string;
}>;

export function createWorldChainAgentBookResolver({
  key,
  keyring,
  organizationId,
  rpcUrl: rawRpcUrl,
}: WorldChainAgentBookResolverOptions): AgentBookPrincipalResolver {
  const rpcUrl = requireRpcUrl(rawRpcUrl);
  const client = createPublicClient({
    chain: WORLD_CHAIN,
    transport: http(rpcUrl),
  });
  const verifier = createAgentBookVerifier({
    contractAddress: WORLD_AGENTBOOK_ADDRESS,
    rpcUrl,
  });

  return createAgentBookPrincipalResolver(
    {
      ...(key === undefined ? {} : { key }),
      ...(keyring === undefined ? {} : { keyring }),
      organizationId,
    },
    {
      getChainId: () => client.getChainId(),
      lookupHuman: (agentAddress) => verifier.lookupHuman(agentAddress),
      probeHuman: (agentAddress) =>
        client.readContract({
          abi: AGENTBOOK_ABI,
          address: WORLD_AGENTBOOK_ADDRESS,
          args: [agentAddress],
          functionName: 'lookupHuman',
        }),
    },
  );
}

/** One agent wallet and the anonymous human AgentBook says stands behind it. */
export type AgentHumanBacking = Readonly<{
  address: string;
  humanId: string | null;
}>;

/**
 * Look up who backs each agent wallet, for administrative surfaces.
 *
 * Deliberately plain: it returns the raw AgentBook answer rather than a scoped
 * principal, because the caller's job is to show an operator which agents share
 * a human. Equality between two results is the whole signal.
 *
 * An unregistered agent — or a lookup that fails — resolves to `null`. Absence
 * of a vouching human is a legitimate state, and a failed read must never be
 * mistaken for one, so both fail closed to "cannot carry authority".
 *
 * Nothing here is cached. A stored "this agent is that human" would let anyone
 * who reached our storage manufacture a quorum, which is the attack the whole
 * product exists to prevent.
 */
export async function lookupAgentHumanBackings(
  addresses: readonly string[],
  options: Readonly<{ rpcUrl?: string; timeoutMs?: number }> = {},
): Promise<readonly AgentHumanBacking[]> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const verifier = createAgentBookVerifier(
    options.rpcUrl === undefined
      ? { contractAddress: WORLD_AGENTBOOK_ADDRESS }
      : { contractAddress: WORLD_AGENTBOOK_ADDRESS, rpcUrl: options.rpcUrl },
  );

  return Promise.all(
    addresses.map(async (address): Promise<AgentHumanBacking> => {
      if (!isAddress(address)) return { address, humanId: null };
      try {
        const humanId = await Promise.race([
          verifier.lookupHuman(getAddress(address)),
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), timeoutMs);
          }),
        ]);
        return { address, humanId };
      } catch {
        return { address, humanId: null };
      }
    }),
  );
}
