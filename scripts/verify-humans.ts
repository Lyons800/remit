/**
 * The AgentBook gate.
 *
 * InvoiceGuard's central claim is that two agent wallets backed by one person
 * cannot fake maker-checker approval. That claim holds only if World AgentBook
 * actually resolves A1 and A2 to the same anonymous human.
 *
 * This proves it or kills it in about ten seconds, with no application code
 * involved. It talks to AgentBook directly rather than through
 * `@invoiceguard/world-adapter` on purpose: a gate should exercise the
 * dependency, not our wrapper around it.
 *
 * A failure here is not a bug to debug — it means World cannot support the
 * claim, and the honest response is to drop the World prize claim rather than
 * describe the guarantee as if it held.
 *
 *   pnpm gate:agentbook
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createAgentBookVerifier } from '@worldcoin/agentkit';

function readEnvLocal(): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  } catch {
    console.error('No .env.local found. See .env.example.');
    process.exit(1);
  }

  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

function requireAddress(env: Record<string, string>, label: string): string {
  const value = env[`AGENT_${label}_ADDRESS`];
  if (value === undefined || value === '') {
    console.error(`Missing AGENT_${label}_ADDRESS in .env.local`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const env = readEnvLocal();
  const addresses = {
    A1: requireAddress(env, 'A1'),
    A2: requireAddress(env, 'A2'),
    B1: requireAddress(env, 'B1'),
  };

  // Always resolves against the canonical AgentBook on World Chain
  // (eip155:480). There is no testnet deployment, so these must be real
  // mainnet registrations.
  const agentBook = createAgentBookVerifier();

  console.log('\nResolving humans from AgentBook (World Chain)...\n');

  const results: Record<string, string | null> = {};
  for (const [label, address] of Object.entries(addresses)) {
    const humanId = await agentBook.lookupHuman(address);
    results[label] = humanId;
    console.log(`  ${label}  ${address}`);
    console.log(`      -> ${humanId ?? 'NOT REGISTERED'}\n`);
  }

  const unregistered = Object.entries(results)
    .filter(([, humanId]) => humanId === null)
    .map(([label]) => label);

  if (unregistered.length > 0) {
    console.error(
      `INCOMPLETE — not yet registered: ${unregistered.join(', ')}\n` +
        `Register each with:\n` +
        `  npx @worldcoin/agentkit-cli register <address>\n` +
        `then wait for the transaction to confirm and re-run.\n`,
    );
    process.exit(2);
  }

  const sameHumanCollapses = results.A1 === results.A2;
  const secondHumanIsDistinct = results.B1 !== results.A1;

  console.log('─'.repeat(62));
  console.log(
    `  A1 === A2  (one human, two agents must collapse) : ${sameHumanCollapses ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `  B1 !== A1  (second human must be distinct)       : ${secondHumanIsDistinct ? 'PASS' : 'FAIL'}`,
  );
  console.log('─'.repeat(62));

  if (sameHumanCollapses && secondHumanIsDistinct) {
    console.log(`
GATE PASSED. The claim holds:
  - one person cannot manufacture a second approval
  - a genuinely different person can

Record this output. It is the evidence behind ACTION_HUMAN_NOT_DISTINCT.
`);
    return;
  }

  console.error(`
GATE FAILED. AgentBook does not support the distinct-human claim.

Do not paper over this. Remove the World prize claim and describe the
quorum as counting company subjects rather than proven humans.
`);
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(
    '\nLookup failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
