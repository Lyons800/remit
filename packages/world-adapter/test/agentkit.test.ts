import { describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';

import {
  authorizeAgentkitRequest,
  createAgentkitApprovalChallenge,
  REMIT_AGENTKIT_STATEMENT,
  signAgentkitApprovalChallenge,
  WORLD_AGENT_SIGNATURE_CHAIN_ID,
  type AgentkitApprovalChallenge,
  type AgentkitRefusalReason,
} from '../src/index.js';

const ACTION_DIGEST = 'a'.repeat(64);
const OTHER_ACTION_DIGEST = 'b'.repeat(64);
const ORGANIZATION_ID = 'synthetic-acme';
const PRIVATE_KEY =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_PRIVATE_KEY =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const FIXTURE_ISSUED_AT = new Date('2026-07-25T20:00:00.000Z');
const FIXTURE_NOW = new Date('2026-07-25T20:00:30.000Z');
const account = privateKeyToAccount(PRIVATE_KEY);
const otherAccount = privateKeyToAccount(OTHER_PRIVATE_KEY);

interface MutableAgentkitChallenge {
  actionDigest: string;
  agentAddress: string;
  approvalUri: string;
  domain: string;
  expiresAt: string;
  extension: {
    info: {
      statement?: string;
    };
  };
  issuedAt: string;
  nonce: string;
  organizationId: string;
  statement: string;
}

function createFixtureChallenge(
  overrides: Partial<
    Parameters<typeof createAgentkitApprovalChallenge>[0]
  > = {},
): AgentkitApprovalChallenge {
  return createAgentkitApprovalChallenge({
    actionDigest: ACTION_DIGEST,
    agentAddress: account.address,
    issuedAt: FIXTURE_ISSUED_AT,
    nonce: '0123456789abcdef',
    organizationId: ORGANIZATION_ID,
    publicOrigin: 'http://localhost:4100',
    ...overrides,
  });
}

function createSigner(selectedAccount = account) {
  return {
    address: selectedAccount.address,
    chainId: WORLD_AGENT_SIGNATURE_CHAIN_ID,
    type: 'eip191' as const,
    signMessage: (message: string) => selectedAccount.signMessage({ message }),
  };
}

async function signFixtureChallenge(
  challenge: AgentkitApprovalChallenge,
): Promise<string> {
  return signAgentkitApprovalChallenge(challenge, createSigner());
}

function rewriteHeader(
  header: string,
  mutate: (payload: Record<string, unknown>) => void,
): string {
  const payload = JSON.parse(
    Buffer.from(header, 'base64').toString('utf8'),
  ) as Record<string, unknown>;
  mutate(payload);
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function requestInput(challenge: AgentkitApprovalChallenge, header: string) {
  return {
    bodyByteLength: 0,
    challenge,
    header,
    method: 'POST',
    now: FIXTURE_NOW,
    pathActionDigest: challenge.actionDigest,
    requestUri: challenge.approvalUri,
    storedActionDigest: challenge.actionDigest,
  };
}

function mutateChallenge(
  challenge: AgentkitApprovalChallenge,
  mutate: (value: MutableAgentkitChallenge) => void,
): AgentkitApprovalChallenge {
  const snapshot = structuredClone(
    challenge,
  ) as unknown as MutableAgentkitChallenge;
  mutate(snapshot);
  return snapshot as unknown as AgentkitApprovalChallenge;
}

async function withFixtureClock<T>(operation: () => Promise<T>): Promise<T> {
  const realDate = globalThis.Date;
  const fixedDate = new Proxy(realDate, {
    construct(target, argumentsList) {
      return Reflect.construct(
        target,
        argumentsList.length === 0 ? [FIXTURE_NOW.getTime()] : argumentsList,
      );
    },
    get(target, property, receiver) {
      if (property === 'now') {
        return () => FIXTURE_NOW.getTime();
      }

      return Reflect.get(target, property, receiver);
    },
  });

  vi.stubGlobal('Date', fixedDate);

  try {
    return await operation();
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('AgentKit exact-action challenge', () => {
  it('constructs the exact short-lived free-mode EIP-191 challenge', () => {
    const challenge = createFixtureChallenge();

    expect(challenge.approvalUri).toBe(
      `http://localhost:4100/v1/orgs/${ORGANIZATION_ID}/payments/${ACTION_DIGEST}/decisions/approve`,
    );
    expect(challenge.extension.info).toEqual({
      domain: 'localhost',
      expirationTime: challenge.expiresAt,
      issuedAt: challenge.issuedAt,
      nonce: '0123456789abcdef',
      resources: [challenge.approvalUri],
      statement: REMIT_AGENTKIT_STATEMENT,
      uri: challenge.approvalUri,
      version: '1',
    });
    expect(challenge.extension.supportedChains).toEqual([
      {
        chainId: 'eip155:296',
        type: 'eip191',
      },
    ]);
    expect(
      Date.parse(challenge.expiresAt) - Date.parse(challenge.issuedAt),
    ).toBe(90_000);
  });

  it('uses the released SDK to sign and verify the unchanged request', async () => {
    const challenge = createFixtureChallenge();
    const header = await signFixtureChallenge(challenge);
    const commitAuthorization = vi.fn(async () => true);

    const result = await withFixtureClock(() =>
      authorizeAgentkitRequest(requestInput(challenge, header), {
        commitAuthorization,
      }),
    );

    expect(result).toEqual({
      claim: {
        actionDigest: ACTION_DIGEST,
        agentAddress: account.address,
        approvalUri: challenge.approvalUri,
        challengeId: expect.stringMatching(/^world-agentkit:[0-9a-f]{64}$/u),
        expiresAt: challenge.expiresAt,
        issuedAt: challenge.issuedAt,
        nonce: challenge.nonce,
        organizationId: ORGANIZATION_ID,
        signedProofDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      ok: true,
    });
    expect(commitAuthorization).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain('signature');
  });

  it.each<
    readonly [
      string,
      AgentkitRefusalReason,
      (
        input: ReturnType<typeof requestInput>,
        rewrite: (mutate: (payload: Record<string, unknown>) => void) => void,
      ) => void,
    ]
  >([
    [
      'method',
      'METHOD_MISMATCH',
      (input) => {
        input.method = 'GET';
      },
    ],
    [
      'body',
      'REQUEST_BODY_NOT_EMPTY',
      (input) => {
        input.bodyByteLength = 2;
      },
    ],
    [
      'request URL',
      'REQUEST_URI_MISMATCH',
      (input) => {
        input.requestUri = `${input.requestUri}?substituted=true`;
      },
    ],
    [
      'path digest',
      'PATH_DIGEST_MISMATCH',
      (input) => {
        input.pathActionDigest = OTHER_ACTION_DIGEST;
      },
    ],
    [
      'stored digest',
      'STORED_DIGEST_MISMATCH',
      (input) => {
        input.storedActionDigest = OTHER_ACTION_DIGEST;
      },
    ],
    [
      'signed URI path',
      'REQUEST_URI_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.uri = `http://localhost:4100/v1/other/${ACTION_DIGEST}`;
        });
      },
    ],
    [
      'sole resource',
      'RESOURCE_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.resources = [payload.uri, 'http://localhost:4100/v1/other'];
        });
      },
    ],
    [
      'statement',
      'STATEMENT_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.statement = 'Approve something else';
        });
      },
    ],
    [
      'domain',
      'DOMAIN_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.domain = 'example.com';
        });
      },
    ],
    [
      'version',
      'VERSION_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.version = '2';
        });
      },
    ],
    [
      'chain',
      'WRONG_SIGNATURE_CHAIN',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.chainId = 'eip155:480';
        });
      },
    ],
    [
      'signature type',
      'SIGNATURE_TYPE_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.type = 'eip1271';
        });
      },
    ],
    [
      'signature scheme',
      'SIGNATURE_SCHEME_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.signatureScheme = 'eip6492';
        });
      },
    ],
    [
      'unsigned not-before time',
      'NOT_BEFORE_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.notBefore = FIXTURE_ISSUED_AT.toISOString();
        });
      },
    ],
    [
      'unsigned request ID',
      'REQUEST_ID_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.requestId = 'synthetic-request-0001';
        });
      },
    ],
    [
      'nonce',
      'NONCE_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.nonce = 'fedcba9876543210';
        });
      },
    ],
    [
      'issued time',
      'ISSUED_AT_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.issuedAt = new Date(
            FIXTURE_ISSUED_AT.getTime() - 2_000,
          ).toISOString();
        });
      },
    ],
    [
      'expiration',
      'EXPIRATION_MISMATCH',
      (_input, rewrite) => {
        rewrite((payload) => {
          payload.expirationTime = new Date(
            FIXTURE_NOW.getTime() + 100_000,
          ).toISOString();
        });
      },
    ],
  ])('rejects one-field substitution of %s', async (_label, reason, mutate) => {
    const challenge = createFixtureChallenge();
    const originalHeader = await signFixtureChallenge(challenge);
    const input = requestInput(challenge, originalHeader);
    const rewrite = (
      update: (payload: Record<string, unknown>) => void,
    ): void => {
      input.header = rewriteHeader(input.header, update);
    };
    mutate(input, rewrite);
    const commitAuthorization = vi.fn(async () => true);

    await expect(
      authorizeAgentkitRequest(input, { commitAuthorization }),
    ).resolves.toEqual({ ok: false, reason });
    expect(commitAuthorization).not.toHaveBeenCalled();
  });

  it('rejects malformed and invalid signatures', async () => {
    const challenge = createFixtureChallenge();
    const header = await signFixtureChallenge(challenge);
    const invalidSignatureHeader = rewriteHeader(header, (payload) => {
      payload.signature = `0x${'00'.repeat(65)}`;
    });
    const commitAuthorization = vi.fn(async () => true);

    await expect(
      authorizeAgentkitRequest(requestInput(challenge, 'not-base64'), {
        commitAuthorization,
      }),
    ).resolves.toEqual({ ok: false, reason: 'MALFORMED_HEADER' });
    await expect(
      withFixtureClock(() =>
        authorizeAgentkitRequest(
          requestInput(challenge, invalidSignatureHeader),
          { commitAuthorization },
        ),
      ),
    ).resolves.toEqual({ ok: false, reason: 'SIGNATURE_INVALID' });
    expect(commitAuthorization).not.toHaveBeenCalled();
  });

  it('rejects a different enrolled signer before commit', async () => {
    const challenge = createFixtureChallenge({
      agentAddress: otherAccount.address,
    });
    const challengeForSigner = createFixtureChallenge();
    const header = await signFixtureChallenge(challengeForSigner);
    const commitAuthorization = vi.fn(async () => true);

    await expect(
      authorizeAgentkitRequest(requestInput(challenge, header), {
        commitAuthorization,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'SIGNER_ADDRESS_MISMATCH',
    });
  });

  it('fails expired and not-yet-valid challenges closed', async () => {
    const expired = createFixtureChallenge({
      issuedAt: new Date(FIXTURE_NOW.getTime() - 121_000),
      ttlSeconds: 60,
    });
    const future = createFixtureChallenge({
      issuedAt: new Date(FIXTURE_NOW.getTime() + 5_000),
    });
    const expiredHeader = await signFixtureChallenge(expired);
    const futureHeader = await signFixtureChallenge(future);
    const commitAuthorization = vi.fn(async () => true);

    await expect(
      authorizeAgentkitRequest(requestInput(expired, expiredHeader), {
        commitAuthorization,
      }),
    ).resolves.toEqual({ ok: false, reason: 'CHALLENGE_EXPIRED' });
    await expect(
      authorizeAgentkitRequest(requestInput(future, futureHeader), {
        commitAuthorization,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'CHALLENGE_NOT_YET_VALID',
    });
  });

  it('allows an atomic commit boundary to consume a challenge once', async () => {
    const challenge = createFixtureChallenge();
    const header = await signFixtureChallenge(challenge);
    let consumed = false;
    const commitAuthorization = async (): Promise<boolean> => {
      await Promise.resolve();

      if (consumed) {
        return false;
      }

      consumed = true;
      return true;
    };

    const results = await withFixtureClock(() =>
      Promise.all([
        authorizeAgentkitRequest(requestInput(challenge, header), {
          commitAuthorization,
        }),
        authorizeAgentkitRequest(requestInput(challenge, header), {
          commitAuthorization,
        }),
      ]),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: 'CHALLENGE_ALREADY_CONSUMED' },
    ]);
  });

  it('does not translate a transaction failure into authorization', async () => {
    const challenge = createFixtureChallenge();
    const header = await signFixtureChallenge(challenge);

    await expect(
      withFixtureClock(() =>
        authorizeAgentkitRequest(requestInput(challenge, header), {
          commitAuthorization: () => {
            throw new Error('synthetic database outage');
          },
        }),
      ),
    ).resolves.toEqual({ ok: false, reason: 'COMMIT_FAILED' });
  });

  it.each([
    [
      'action digest',
      (challenge: MutableAgentkitChallenge) => {
        challenge.actionDigest = OTHER_ACTION_DIGEST;
      },
    ],
    [
      'organization',
      (challenge: MutableAgentkitChallenge) => {
        challenge.organizationId = 'another-organization';
      },
    ],
    [
      'canonical address',
      (challenge: MutableAgentkitChallenge) => {
        challenge.agentAddress = account.address.toLowerCase();
      },
    ],
    [
      'nonce',
      (challenge: MutableAgentkitChallenge) => {
        challenge.nonce = 'short';
      },
    ],
    [
      'issued time',
      (challenge: MutableAgentkitChallenge) => {
        challenge.issuedAt = '2026-07-25T20:00:00Z';
      },
    ],
    [
      'lifetime',
      (challenge: MutableAgentkitChallenge) => {
        challenge.expiresAt = new Date(
          Date.parse(challenge.issuedAt) + 121_000,
        ).toISOString();
      },
    ],
    [
      'statement',
      (challenge: MutableAgentkitChallenge) => {
        challenge.statement = 'Approve another operation';
      },
    ],
    [
      'approval path',
      (challenge: MutableAgentkitChallenge) => {
        challenge.approvalUri = challenge.approvalUri.replace(
          '/decisions/approve',
          '/decisions/reject',
        );
      },
    ],
    [
      'approval domain',
      (challenge: MutableAgentkitChallenge) => {
        challenge.domain = 'example.com';
      },
    ],
    [
      'extension statement',
      (challenge: MutableAgentkitChallenge) => {
        challenge.extension.info.statement = 'Approve another operation';
      },
    ],
  ])(
    'rejects a deserialized challenge with mutated %s',
    async (_label, mutate) => {
      const challenge = createFixtureChallenge();
      const header = await signFixtureChallenge(challenge);
      const forged = mutateChallenge(challenge, mutate);
      const commitAuthorization = vi.fn(async () => true);

      await expect(
        authorizeAgentkitRequest(requestInput(forged, header), {
          commitAuthorization,
        }),
      ).resolves.toEqual({ ok: false, reason: 'CHALLENGE_INVALID' });
      expect(commitAuthorization).not.toHaveBeenCalled();
    },
  );

  it('fails closed when released SDK validation or verification throws', async () => {
    const challenge = createFixtureChallenge();
    const header = await signFixtureChallenge(challenge);
    const commitAuthorization = vi.fn(async () => true);

    await expect(
      authorizeAgentkitRequest(requestInput(challenge, header), {
        commitAuthorization,
        validateMessage: async () => {
          throw new Error('synthetic validator failure');
        },
      }),
    ).resolves.toEqual({ ok: false, reason: 'SDK_VALIDATION_FAILED' });
    await expect(
      authorizeAgentkitRequest(requestInput(challenge, header), {
        commitAuthorization,
        validateMessage: async () => ({ valid: true }),
        verifySignature: async () => {
          throw new Error('synthetic verifier failure');
        },
      }),
    ).resolves.toEqual({ ok: false, reason: 'SIGNATURE_INVALID' });
    expect(commitAuthorization).not.toHaveBeenCalled();
  });

  it.each([{ valid: 'true' }, undefined])(
    'rejects malformed AgentKit validation output %#',
    async (output) => {
      const challenge = createFixtureChallenge();
      const header = await signFixtureChallenge(challenge);
      const commitAuthorization = vi.fn(async () => true);

      await expect(
        authorizeAgentkitRequest(requestInput(challenge, header), {
          commitAuthorization,
          validateMessage: async () => output as unknown,
        }),
      ).resolves.toEqual({
        ok: false,
        reason: 'SDK_VALIDATION_FAILED',
      });
      expect(commitAuthorization).not.toHaveBeenCalled();
    },
  );

  it.each([
    { address: account.address, valid: 'true' },
    { address: otherAccount.address, valid: true },
    undefined,
  ])('rejects malformed AgentKit signature output %#', async (output) => {
    const challenge = createFixtureChallenge();
    const header = await signFixtureChallenge(challenge);
    const commitAuthorization = vi.fn(async () => true);

    await expect(
      authorizeAgentkitRequest(requestInput(challenge, header), {
        commitAuthorization,
        validateMessage: async () => ({ valid: true }),
        verifySignature: async () => output as unknown,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'SIGNATURE_INVALID',
    });
    expect(commitAuthorization).not.toHaveBeenCalled();
  });

  it.each(['true', undefined])(
    'rejects malformed AgentKit commit output %s',
    async (output) => {
      const challenge = createFixtureChallenge();
      const header = await signFixtureChallenge(challenge);

      await expect(
        authorizeAgentkitRequest(requestInput(challenge, header), {
          commitAuthorization: async () => output as unknown,
          validateMessage: async () => ({ valid: true }),
          verifySignature: async () => ({
            address: account.address,
            valid: true,
          }),
        }),
      ).resolves.toEqual({
        ok: false,
        reason: 'COMMIT_FAILED',
      });
    },
  );
});

describe('AgentKit challenge input validation', () => {
  it.each([
    ['uppercase digest', { actionDigest: 'A'.repeat(64) }],
    ['ambiguous organization', { organizationId: 'acme/other' }],
    ['insecure origin', { publicOrigin: 'http://example.com' }],
    ['origin with path', { publicOrigin: 'https://example.com/base' }],
    ['short nonce', { nonce: 'too-short' }],
    ['short lifetime', { ttlSeconds: 59 }],
    ['long lifetime', { ttlSeconds: 121 }],
    ['invalid address', { agentAddress: '0x1234' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => createFixtureChallenge(overrides)).toThrow();
  });

  it('refuses to sign a challenge with another wallet', async () => {
    const challenge = createFixtureChallenge();

    await expect(
      signAgentkitApprovalChallenge(challenge, createSigner(otherAccount)),
    ).rejects.toThrow('signer address does not match');
  });

  it('refuses to sign a mutated serialized challenge', async () => {
    const challenge = createFixtureChallenge();
    const forged = mutateChallenge(challenge, (value) => {
      value.statement = 'Approve another operation';
    });

    await expect(
      signAgentkitApprovalChallenge(forged, createSigner()),
    ).rejects.toThrow('challenge is invalid');
  });
});
