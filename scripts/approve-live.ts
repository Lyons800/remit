/**
 * Approve one exact invoice from your phone.
 *
 * This is the step the terminal demo fabricates. Here the approval is real:
 * World App is asked to prove a unique human approved *this* payment, and the
 * action digest travels into the proof as the World ID signal — so the proof
 * that comes back is only valid for this invoice. Approve a different one and
 * validation fails with SIGNAL_MISMATCH.
 *
 * Two properties worth noticing:
 *
 *   - the action id is derived per payment, so World itself enforces one
 *     approval per human per invoice; nothing in our database is trusted for
 *     that
 *   - the rp_context is signed locally with the relying-party key, so opening
 *     an approval needs no round trip to World and cannot fail at the booth
 *
 *   pnpm approve:live
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { CredentialRequest, IDKit } from '@worldcoin/idkit-core';
import { signRequest } from '@worldcoin/idkit-core/signing';
import {
  createTrustedWorldDeploymentContext,
  createWorldHumanApprovalBinding,
  createWorldPrincipalKeyring,
  createWorldProofOfHumanRequest,
  deriveAgentTenantPrincipal,
} from '@remit/world-adapter';

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(
    resolve(process.cwd(), '.env.local'),
    'utf8',
  ).split('\n')) {
    const t = line.trim();
    if (t === '' || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}

const E = env();
function need(key: string): string {
  const value = E[key] ?? process.env[key];
  if (value === undefined || value === '') {
    console.error(`Missing ${key} in .env.local`);
    process.exit(1);
  }
  return value;
}

/** The invoice being approved — the same changed-beneficiary action the demo uses. */
const ACTION_DIGEST =
  '8dfc4f58375b0b57e4fbb296732c83e55e61f1c7ce94dea0e0994c1a290f5d1d';
const ORGANIZATION_ID = 'peru-padel';
const AGENT_ADDRESS = need('AGENT_A1_ADDRESS') as `0x${string}`;
/** A1's real human, resolved from AgentBook on World Chain. */
const A1_HUMAN_ID =
  '0x157f9bb0a0a52ceab5931798d421683ae5bff28b5e956c9588b3eea88bb160c0';

async function main(): Promise<void> {
  const deployment = createTrustedWorldDeploymentContext({
    appId: need('WORLD_APP_ID'),
    environment: 'production',
    mode: 'live',
    rpId: need('WORLD_RP_ID'),
  });

  // The agent's tenant-scoped principal. Derived, never stored: two
  // organisations must not be able to correlate the same agent.
  const keyring = createWorldPrincipalKeyring({
    key: Buffer.from(need('WORLD_PRINCIPAL_HMAC_KEY'), 'hex'),
    version: 'v1',
  });
  const agentTenantPrincipal = deriveAgentTenantPrincipal({
    humanId: A1_HUMAN_ID,
    key: keyring.current.key,
    organizationId: ORGANIZATION_ID,
  });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60_000);

  const binding = createWorldHumanApprovalBinding({
    actionDigest: ACTION_DIGEST,
    agentAddress: AGENT_ADDRESS,
    agentTenantPrincipal,
    agentTenantPrincipalDerivationVersion: keyring.current.version,
    approvalSessionId: `approval-${randomUUID()}`,
    createdAt: now,
    decision: 'APPROVE',
    expiresAt,
    organizationId: ORGANIZATION_ID,
    requiredRole: 'TREASURY_APPROVER',
    roleGrantId: 'grant-treasury-1',
    subjectId: 'subject-treasury',
  });

  console.log(`\ninvoice digest   ${ACTION_DIGEST}`);
  console.log(`world action     ${binding.worldActionId}`);
  console.log(`world signal     ${binding.worldSignal.slice(0, 34)}…`);

  // Signed locally with the relying-party key — no network call.
  const signed = signRequest({
    action: binding.worldActionId,
    signingKeyHex: need('RP_SIGNING_KEY'),
  });

  const request = createWorldProofOfHumanRequest({
    binding,
    deployment,
    rpContext: {
      created_at: signed.createdAt,
      expires_at: signed.expiresAt,
      nonce: signed.nonce,
      rp_id: deployment.rpId,
      signature: signed.sig,
    },
  });

  console.log(`expected signal  ${request.expectedSignalHash}`);
  console.log(`\nopening a World App session…`);

  // Session flows take constraints, not presets. Proof of human is the
  // credential; the digest rides along as the signal in the request config.
  const builder = IDKit.createSession(request.config);
  const session = await (
    builder as unknown as { constraints(node: unknown): Promise<unknown> }
  ).constraints(CredentialRequest('proof_of_human'));

  console.log('\nsession created:');
  const record = session as Record<string, unknown>;
  for (const [k, v] of Object.entries(record)) {
    const shown =
      typeof v === 'string' ? v : JSON.stringify(v)?.slice(0, 120);
    console.log(`  ${k}: ${shown}`);
  }
}

main().catch((error: unknown) => {
  console.error(
    '\napproval request failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
