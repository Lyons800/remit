import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { paymentActionCoreV1Schema } from '@remit/protocol';
import { digestCanonicalValue, digestDomains } from '@remit/protocol/hashing';
import {
  authorizeAgentkitRequest,
  createAgentkitApprovalChallenge,
  signAgentkitApprovalChallenge,
  WORLD_AGENT_SIGNATURE_CHAIN_ID,
} from '@remit/world-adapter';
import { getAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { changedBeneficiaryAction } from './lib/demo-fixture.js';

function readEnvironment(): Readonly<Record<string, string>> {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  } catch {
    throw new Error('No .env.local found. See .env.example.');
  }

  const environment: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator > 0) {
      environment[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
    }
  }
  return environment;
}

function requireValue(
  environment: Readonly<Record<string, string>>,
  name: string,
): string {
  const value = environment[name] ?? process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main(): Promise<void> {
  const environment = readEnvironment();
  const configuredAddress = getAddress(
    requireValue(environment, 'AGENT_A1_ADDRESS'),
  );
  const privateKey = requireValue(environment, 'AGENT_A1_PRIVATE_KEY') as Hex;
  const account = privateKeyToAccount(privateKey);

  if (account.address !== configuredAddress) {
    throw new Error('AGENT_A1_PRIVATE_KEY does not match AGENT_A1_ADDRESS');
  }

  const actionDigest = digestCanonicalValue(
    digestDomains.paymentActionCore,
    paymentActionCoreV1Schema,
    changedBeneficiaryAction(),
  );
  const challenge = createAgentkitApprovalChallenge({
    actionDigest,
    agentAddress: account.address,
    organizationId: 'remit-demo-company',
    publicOrigin: 'https://remithq.xyz',
  });
  const header = await signAgentkitApprovalChallenge(challenge, {
    address: account.address,
    chainId: WORLD_AGENT_SIGNATURE_CHAIN_ID,
    type: 'eip191',
    signMessage: (message) => account.signMessage({ message }),
  });

  const consumed = new Set<string>();
  const commitAuthorization = async (claim: {
    readonly challengeId: string;
  }): Promise<boolean> => {
    if (consumed.has(claim.challengeId)) return false;
    consumed.add(claim.challengeId);
    return true;
  };
  const request = {
    bodyByteLength: 0,
    challenge,
    header,
    method: 'POST' as const,
    pathActionDigest: actionDigest,
    requestUri: challenge.approvalUri,
    storedActionDigest: actionDigest,
  };

  const first = await authorizeAgentkitRequest(request, {
    commitAuthorization,
  });
  if (!first.ok) {
    throw new Error(`unchanged AgentKit request refused: ${first.reason}`);
  }

  const substituted = await authorizeAgentkitRequest(
    { ...request, pathActionDigest: 'f'.repeat(64) },
    { commitAuthorization },
  );
  if (substituted.ok || substituted.reason !== 'PATH_DIGEST_MISMATCH') {
    throw new Error('substituted action digest was not refused');
  }

  const replay = await authorizeAgentkitRequest(request, {
    commitAuthorization,
  });
  if (replay.ok || replay.reason !== 'CHALLENGE_ALREADY_CONSUMED') {
    throw new Error('replayed AgentKit request was not refused');
  }

  console.log('\nWorld AgentKit exact-action gate\n');
  console.log(`  agent key matches configured wallet       PASS`);
  console.log(`  action digest signed through AgentKit     PASS`);
  console.log(`  unchanged request authorized once         PASS`);
  console.log(
    `  substituted digest refused                PATH_DIGEST_MISMATCH`,
  );
  console.log(
    `  exact replay refused                      CHALLENGE_ALREADY_CONSUMED`,
  );
  console.log(
    '\nThis proves local AgentKit signing, strict verification and one-use',
  );
  console.log(
    'admission. It is not World ID, Human-in-the-Loop or a World Chain write.\n',
  );
}

main().catch((error: unknown) => {
  console.error(
    '\nWorld AgentKit gate failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
