import { createAgentBookVerifier } from '@worldcoin/agentkit';
import { createPublicClient, getAddress, http, isAddress } from 'viem';
import { worldchain } from 'viem/chains';

import {
  WORLD_AGENTBOOK_ADDRESS,
  WORLD_AGENTBOOK_NUMERIC_CHAIN_ID,
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

export type AgentBookResolution =
  | Readonly<{
      agentAddress: `0x${string}`;
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
    }>;

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

function unavailable(
  agentAddress: `0x${string}`,
  reason: 'LOOKUP_INDETERMINATE' | 'RPC_UNAVAILABLE' | 'WRONG_CHAIN',
): AgentBookResolution {
  return Object.freeze({ agentAddress, reason, status: 'unavailable' });
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
        return unavailable(agentAddress, 'RPC_UNAVAILABLE');
      }

      if (chainId !== WORLD_AGENTBOOK_NUMERIC_CHAIN_ID) {
        return unavailable(agentAddress, 'WRONG_CHAIN');
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
            return unavailable(agentAddress, 'LOOKUP_INDETERMINATE');
          }

          return Object.freeze({
            agentAddress,
            status: 'backed',
            tenantPrincipal: current.principal,
            tenantPrincipalAliases: aliases,
            tenantPrincipalDerivationVersion: current.derivationVersion,
          });
        } catch {
          return unavailable(agentAddress, 'LOOKUP_INDETERMINATE');
        }
      }

      try {
        const probedHuman = await probeHuman(agentAddress);

        if (probedHuman === 0n) {
          return Object.freeze({ agentAddress, status: 'unregistered' });
        }

        return unavailable(agentAddress, 'LOOKUP_INDETERMINATE');
      } catch {
        try {
          const currentChainId = await getChainId();

          if (currentChainId !== WORLD_AGENTBOOK_NUMERIC_CHAIN_ID) {
            return unavailable(agentAddress, 'WRONG_CHAIN');
          }

          return unavailable(agentAddress, 'LOOKUP_INDETERMINATE');
        } catch {
          return unavailable(agentAddress, 'RPC_UNAVAILABLE');
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
    chain: worldchain,
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
