import { describe, expect, it, vi } from 'vitest';

import {
  createAgentBookPrincipalResolver,
  createWorldPrincipalKeyring,
  createWorldChainAgentBookResolver,
  deriveActionHumanDisplayTag,
  deriveActionHumanPrincipal,
  deriveActionHumanPrincipalAliases,
  deriveAgentTenantPrincipal,
  deriveAgentTenantPrincipalAliases,
  WORLD_AGENTBOOK_NUMERIC_CHAIN_ID,
} from '../src/index.js';

const AGENT_ADDRESS = '0x8fd379246834eac74B8419FfdA202CF8051F7A03';
const ACTION_DIGEST = 'a'.repeat(64);
const KEY = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
const ROTATED_KEY = Uint8Array.from(
  { length: 32 },
  (_value, index) => 255 - index,
);
const ORGANIZATION_ID = 'synthetic-acme';
const RAW_HUMAN_ID = '0x1234abcd';
const RAW_NULLIFIER = '0xabcdef1234';
const WORLD_ACTION_ID = 'invoiceguard-approval-v1-synthetic';

function resolverWith(
  overrides: Partial<{
    getChainId: () => Promise<number>;
    lookupHuman: (address: `0x${string}`) => Promise<string | null>;
    probeHuman: (address: `0x${string}`) => Promise<bigint>;
  }> = {},
) {
  const dependencies = {
    getChainId: vi.fn(async () => WORLD_AGENTBOOK_NUMERIC_CHAIN_ID),
    lookupHuman: vi.fn(async () => RAW_HUMAN_ID),
    probeHuman: vi.fn(async () => 0n),
    ...overrides,
  };

  return {
    dependencies,
    resolver: createAgentBookPrincipalResolver(
      { key: KEY, organizationId: ORGANIZATION_ID },
      dependencies,
    ),
  };
}

describe('AgentBook principal resolution', () => {
  it('reduces a backed human identifier before it leaves the adapter', async () => {
    const { dependencies, resolver } = resolverWith();

    const result = await resolver.resolve(AGENT_ADDRESS.toLowerCase());

    expect(result).toEqual({
      agentAddress: AGENT_ADDRESS,
      status: 'backed',
      tenantPrincipal: expect.stringMatching(
        /^hmac-sha256:[A-Za-z0-9_-]{43}$/u,
      ),
      tenantPrincipalAliases: [
        {
          derivationVersion: 'v1',
          principal: expect.stringMatching(/^hmac-sha256:[A-Za-z0-9_-]{43}$/u),
        },
      ],
      tenantPrincipalDerivationVersion: 'v1',
    });
    expect(JSON.stringify(result)).not.toContain(RAW_HUMAN_ID.slice(2));
    expect(dependencies.probeHuman).not.toHaveBeenCalled();
    expect(dependencies.getChainId).toHaveBeenCalledOnce();
  });

  it('returns current and migration aliases during HMAC key rotation', async () => {
    const dependencies = {
      getChainId: vi.fn(async () => WORLD_AGENTBOOK_NUMERIC_CHAIN_ID),
      lookupHuman: vi.fn(async () => RAW_HUMAN_ID),
      probeHuman: vi.fn(async () => 0n),
    };
    const resolver = createAgentBookPrincipalResolver(
      {
        keyring: createWorldPrincipalKeyring(
          { key: ROTATED_KEY, version: 'v2' },
          [{ key: KEY, version: 'v1' }],
        ),
        organizationId: ORGANIZATION_ID,
      },
      dependencies,
    );

    const result = await resolver.resolve(AGENT_ADDRESS);

    expect(result).toMatchObject({
      status: 'backed',
      tenantPrincipalAliases: [
        { derivationVersion: 'v2' },
        { derivationVersion: 'v1' },
      ],
      tenantPrincipalDerivationVersion: 'v2',
    });

    if (result.status !== 'backed') {
      throw new Error('Synthetic AgentBook resolution must be backed.');
    }

    expect(result.tenantPrincipal).toBe(
      result.tenantPrincipalAliases[0]?.principal,
    );
    expect(result.tenantPrincipalAliases[0]?.principal).not.toBe(
      result.tenantPrincipalAliases[1]?.principal,
    );
  });

  it('uses an independent contract probe to classify an unregistered wallet', async () => {
    const { dependencies, resolver } = resolverWith({
      lookupHuman: vi.fn(async () => null),
      probeHuman: vi.fn(async () => 0n),
    });

    await expect(resolver.resolve(AGENT_ADDRESS)).resolves.toEqual({
      agentAddress: AGENT_ADDRESS,
      status: 'unregistered',
    });
    expect(dependencies.probeHuman).toHaveBeenCalledOnce();
    expect(dependencies.getChainId).toHaveBeenCalledOnce();
  });

  it.each([296, '480'])(
    'fails closed before lookup when the RPC reports chain %s',
    async (chainId) => {
      const { dependencies, resolver } = resolverWith({
        getChainId: vi.fn(async () => chainId as unknown as number),
      });

      await expect(resolver.resolve(AGENT_ADDRESS)).resolves.toEqual({
        agentAddress: AGENT_ADDRESS,
        reason: 'WRONG_CHAIN',
        status: 'unavailable',
      });
      expect(dependencies.lookupHuman).not.toHaveBeenCalled();
      expect(dependencies.probeHuman).not.toHaveBeenCalled();
    },
  );

  it('fails closed when the helper and direct contract read disagree', async () => {
    const { resolver } = resolverWith({
      lookupHuman: vi.fn(async () => null),
      probeHuman: vi.fn(async () => 99n),
    });

    await expect(resolver.resolve(AGENT_ADDRESS)).resolves.toEqual({
      agentAddress: AGENT_ADDRESS,
      reason: 'LOOKUP_INDETERMINATE',
      status: 'unavailable',
    });
  });

  it('distinguishes an indeterminate lookup from an unavailable RPC', async () => {
    const probeError = new Error('synthetic contract read failure');
    const healthy = resolverWith({
      lookupHuman: vi.fn(async () => null),
      probeHuman: vi.fn(async () => Promise.reject(probeError)),
    }).resolver;
    const unavailable = resolverWith({
      getChainId: vi
        .fn()
        .mockResolvedValueOnce(WORLD_AGENTBOOK_NUMERIC_CHAIN_ID)
        .mockRejectedValueOnce(new Error('synthetic RPC outage')),
      lookupHuman: vi.fn(async () => null),
      probeHuman: vi.fn(async () => Promise.reject(probeError)),
    }).resolver;

    await expect(healthy.resolve(AGENT_ADDRESS)).resolves.toEqual({
      agentAddress: AGENT_ADDRESS,
      reason: 'LOOKUP_INDETERMINATE',
      status: 'unavailable',
    });
    await expect(unavailable.resolve(AGENT_ADDRESS)).resolves.toEqual({
      agentAddress: AGENT_ADDRESS,
      reason: 'RPC_UNAVAILABLE',
      status: 'unavailable',
    });
  });

  it('does not let an unexpected helper exception become authorization', async () => {
    const { resolver } = resolverWith({
      lookupHuman: vi.fn(async () =>
        Promise.reject(new Error('synthetic helper error')),
      ),
      probeHuman: vi.fn(async () => 0n),
    });

    await expect(resolver.resolve(AGENT_ADDRESS)).resolves.toEqual({
      agentAddress: AGENT_ADDRESS,
      status: 'unregistered',
    });
  });

  it('rejects invalid addresses and unsafe principal configuration', async () => {
    const { resolver } = resolverWith();

    await expect(resolver.resolve('0x1234')).rejects.toThrow(
      'valid EVM address',
    );
    expect(() =>
      createAgentBookPrincipalResolver(
        {
          key: new Uint8Array(31),
          organizationId: ORGANIZATION_ID,
        },
        {
          getChainId: async () => WORLD_AGENTBOOK_NUMERIC_CHAIN_ID,
          lookupHuman: async () => null,
          probeHuman: async () => 0n,
        },
      ),
    ).toThrow('at least 32 bytes');
  });

  it('requires HTTPS for a non-local World RPC', () => {
    expect(() =>
      createWorldChainAgentBookResolver({
        key: KEY,
        organizationId: ORGANIZATION_ID,
        rpcUrl: 'http://rpc.example.com',
      }),
    ).toThrow('must use HTTPS');
  });

  it('allows an HTTP World RPC only for local development', () => {
    expect(
      createWorldChainAgentBookResolver({
        key: KEY,
        organizationId: ORGANIZATION_ID,
        rpcUrl: 'http://127.0.0.1:8545',
      }),
    ).toMatchObject({
      resolve: expect.any(Function),
    });
  });
});

describe('World principal privacy', () => {
  it('rejects duplicate HMAC key material assigned to different versions', () => {
    expect(() =>
      createWorldPrincipalKeyring({ key: KEY, version: 'v2' }, [
        { key: Uint8Array.from(KEY), version: 'v1' },
      ]),
    ).toThrow('key material must be unique across versions');
  });

  it.each([
    [
      'AgentBook',
      () =>
        deriveAgentTenantPrincipalAliases({
          humanId: RAW_HUMAN_ID,
          keyring: createWorldPrincipalKeyring({ key: KEY, version: 'v2' }, [
            {
              key: Uint8Array.from([...KEY, 0]),
              version: 'v1',
            },
          ]),
          organizationId: ORGANIZATION_ID,
        }),
    ],
    [
      'action-human',
      () =>
        deriveActionHumanPrincipalAliases({
          actionDigest: ACTION_DIGEST,
          keyring: createWorldPrincipalKeyring({ key: KEY, version: 'v2' }, [
            {
              key: Uint8Array.from([...KEY, 0]),
              version: 'v1',
            },
          ]),
          nullifier: RAW_NULLIFIER,
          organizationId: ORGANIZATION_ID,
          worldActionId: WORLD_ACTION_ID,
        }),
    ],
  ] as const)(
    'rejects %s rotation keys that derive the same principal alias',
    (_label, deriveAliases) => {
      // HMAC zero-pads short keys, so appending a zero byte can leave the
      // effective SHA-256 HMAC key unchanged despite distinct raw key bytes.
      expect(deriveAliases).toThrow(
        'principal aliases must be unique across key versions',
      );
    },
  );

  it('normalizes equivalent identifiers and scopes agent classes by tenant', () => {
    const first = deriveAgentTenantPrincipal({
      humanId: '0x01',
      key: KEY,
      organizationId: ORGANIZATION_ID,
    });
    const equivalent = deriveAgentTenantPrincipal({
      humanId: `0x${'0'.repeat(63)}1`,
      key: KEY,
      organizationId: ORGANIZATION_ID,
    });
    const otherTenant = deriveAgentTenantPrincipal({
      humanId: '0x1',
      key: KEY,
      organizationId: 'another-tenant',
    });

    expect(first).toBe(equivalent);
    expect(first).not.toBe(otherTenant);
  });

  it('scopes action-human classes to the immutable action', () => {
    const input = {
      actionDigest: ACTION_DIGEST,
      key: KEY,
      nullifier: RAW_NULLIFIER,
      organizationId: ORGANIZATION_ID,
      worldActionId: WORLD_ACTION_ID,
    };
    const principal = deriveActionHumanPrincipal(input);
    const displayTag = deriveActionHumanDisplayTag(input);
    const anotherAction = deriveActionHumanPrincipal({
      ...input,
      actionDigest: 'b'.repeat(64),
    });

    expect(principal).toMatch(/^hmac-sha256:[A-Za-z0-9_-]{43}$/u);
    expect(displayTag).toMatch(/^world-[A-Za-z0-9_-]{12}$/u);
    expect(principal).not.toBe(anotherAction);
    expect(JSON.stringify({ displayTag, principal })).not.toContain(
      RAW_NULLIFIER.slice(2),
    );
  });

  it.each([
    ['zero identifier', { humanId: '0x0', key: KEY }],
    ['non-hex identifier', { humanId: 'human-1', key: KEY }],
    ['oversized identifier', { humanId: `0x1${'0'.repeat(64)}`, key: KEY }],
    ['short key', { humanId: '0x1', key: new Uint8Array(31) }],
  ])('rejects %s', (_label, input) => {
    expect(() =>
      deriveAgentTenantPrincipal({
        organizationId: ORGANIZATION_ID,
        ...input,
      }),
    ).toThrow();
  });
});
