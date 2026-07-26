/**
 * The demo — the authorization path, end to end, against live networks.
 *
 * Nothing here re-implements the product. The policy route, the action digest
 * and the approval quorum all come from the shipped packages:
 *
 *   evaluatePaymentPolicy   @remit/protocol   the 990/10 split
 *   digestCanonicalValue    @remit/protocol   the action digest
 *   validateApprovalQuorum  @remit/domain     distinct-human quorum
 *
 * Hedera and World are reached directly, because a gate should exercise the
 * dependency rather than our wrapper around it.
 *
 * What this deliberately does NOT claim:
 *
 *   - Act 1's transfer is a direct HBAR payment, not an integrated settlement.
 *     `packages/hedera-settlement-adapter` is an empty stub on main.
 *   - Act 3's x402 PAYMENT is real and settles on Hedera. The beneficiary
 *     verification service is NOT: there is no such service, so the demo
 *     stands one in with a generated keypair and a fixed answer. Those lines
 *     are marked [SIMULATED]. It also speaks x402 directly rather than
 *     through `packages/hedera-x402-adapter`, so the payment is protocol-real
 *     but not adapter-bound.
 *   - Act 4's HTS token is an audit marker. It is NOT payment authority and
 *     its burn does NOT prevent replay — see docs/evidence/README.md. Replay
 *     is refused by the approval layer in Act 5.
 *
 *   pnpm demo                     full live run
 *   pnpm demo -- --simulate-humans   rehearse before AgentBook registration
 *   pnpm demo -- --offline           narration practice, no network
 */

import { createSign, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateApprovalQuorum } from '@remit/domain';
import { paymentActionCoreV1Schema } from '@remit/protocol';
import {
  digestCanonicalValue,
  digestDomains,
  evaluatePaymentPolicy,
} from '@remit/protocol/hashing';
import { createAgentBookVerifier } from '@worldcoin/agentkit';
import { x402Facilitator } from '@x402/core/facilitator';
import {
  createClientHederaSigner,
  createHederaClient,
  createHederaPreflightTransfer,
  createHederaSignAndSubmitTransaction,
  createHederaVerifyPayerSignature,
  toFacilitatorHederaSigner,
  HEDERA_TESTNET_CAIP2,
  PrivateKey as X402PrivateKey,
} from '@x402/hedera';
import { ExactHederaScheme as ClientScheme } from '@x402/hedera/exact/client';
import { ExactHederaScheme as FacilitatorScheme } from '@x402/hedera/exact/facilitator';
import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TokenBurnTransaction,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenSupplyType,
  TokenType,
  TransferTransaction,
} from '@hiero-ledger/sdk';

import {
  actionBinding,
  approvalFact,
  DEMO_NOW,
  changedBeneficiaryAction,
  humanAuthority,
  policyInputFor,
  routineAction,
  type DemoApprover,
} from './lib/demo-fixture.js';
import {
  auditPayableMarkerSnapshot,
  payableMarkerMetadata,
  PAYABLE_MARKER_NAME,
  PAYABLE_MARKER_SYMBOL,
  type PayableMarkerAudit,
} from './lib/hedera-payable-marker.js';

/* ── presentation ────────────────────────────────────────────────────── */

const C = {
  dim: (s: string) => `[2m${s}[0m`,
  bold: (s: string) => `[1m${s}[0m`,
  green: (s: string) => `[32m${s}[0m`,
  red: (s: string) => `[31m${s}[0m`,
  yellow: (s: string) => `[33m${s}[0m`,
  cyan: (s: string) => `[36m${s}[0m`,
};

const SIMULATE_HUMANS = process.argv.includes('--simulate-humans');
const OFFLINE = process.argv.includes('--offline');

function act(n: number, title: string): void {
  const pad = '─'.repeat(Math.max(0, 56 - title.length));
  console.log(`\n${C.bold(`─── ACT ${n} ${pad} ${title}`)}\n`);
}
const step = (text: string): void => console.log(`  ${text}`);
const pass = (text: string): void => console.log(`  ${C.green('✓')} ${text}`);
const refuse = (text: string): void =>
  console.log(`  ${C.red('✗ REFUSED')}  ${text}`);
const link = (url: string): void => console.log(`     ${C.dim(url)}`);
const beat = async (ms = 800): Promise<void> => {
  if (!OFFLINE) await new Promise((r) => setTimeout(r, ms));
};

/* ── environment ─────────────────────────────────────────────────────── */

/** Values good enough to render the narrative, never good enough to spend. */
const PLACEHOLDERS: Record<string, string> = {
  HEDERA_OPERATOR_ID: '0.0.0',
  HEDERA_SERVICE_ACCOUNT_ID: '0.0.0',
  HEDERA_FACILITATOR_ACCOUNT_ID: '0.0.0',
  HEDERA_OPERATOR_KEY:
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  HEDERA_FACILITATOR_KEY:
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  AGENT_A1_ADDRESS: '0x0000000000000000000000000000000000000a01',
  AGENT_A2_ADDRESS: '0x0000000000000000000000000000000000000a02',
  AGENT_B1_ADDRESS: '0x0000000000000000000000000000000000000b01',
};

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  } catch {
    // A clean clone has no .env.local. Offline runs cope; live runs fail in
    // need() with the specific key that is missing.
    return out;
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (t === '' || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}

const E = env();

/**
 * Environment lookup that tolerates a clean clone.
 *
 * `--offline` is advertised as the no-network path, so it must not demand
 * eight credentials nobody has yet. Offline runs fall back to a documented
 * placeholder; live runs still fail loudly, because a missing key there means
 * the run would silently not be what it claims.
 */
function need(key: string): string {
  const value = E[key] ?? process.env[key];
  if (value !== undefined && value !== '') return value;
  if (OFFLINE) return PLACEHOLDERS[key] ?? `offline-${key.toLowerCase()}`;
  console.error(`Missing ${key} in .env.local (see .env.example)`);
  process.exit(1);
}

const OPERATOR_ID = need('HEDERA_OPERATOR_ID');
const OPERATOR_KEY = need('HEDERA_OPERATOR_KEY');
const SUPPLIER_ID = need('HEDERA_SERVICE_ACCOUNT_ID');
const FACILITATOR_ID = need('HEDERA_FACILITATOR_ACCOUNT_ID');
const FACILITATOR_KEY = need('HEDERA_FACILITATOR_KEY');

const operatorKey = PrivateKey.fromStringECDSA(OPERATOR_KEY.replace(/^0x/, ''));
const operatorKeyX402 = X402PrivateKey.fromStringECDSA(
  OPERATOR_KEY.replace(/^0x/, ''),
);

const hashscan = (transactionId: string): string =>
  `https://hashscan.io/testnet/transaction/${transactionId
    .replace('@', '-')
    .replace(/\.(\d{9})$/, '-$1')}`;

/* ── World: who is actually behind each agent ────────────────────────── */

async function resolveApprovers(): Promise<DemoApprover[]> {
  const wanted = [
    {
      label: 'A1',
      address: need('AGENT_A1_ADDRESS'),
      role: 'FINANCE_APPROVER',
      subject: 'subject-finance',
    },
    {
      label: 'A2',
      address: need('AGENT_A2_ADDRESS'),
      role: 'TREASURY_APPROVER',
      subject: 'subject-treasury',
    },
    {
      label: 'B1',
      address: need('AGENT_B1_ADDRESS'),
      role: 'TREASURY_APPROVER',
      subject: 'subject-treasury',
    },
  ] as const;

  if (OFFLINE || SIMULATE_HUMANS) {
    // A1 and A2 share a human on purpose — that is the attack.
    const simulated: Record<string, string> = {
      A1: 'sim-human-1',
      A2: 'sim-human-1',
      B1: 'sim-human-2',
    };
    return wanted.map((w) => ({
      ...w,
      humanPrincipal: simulated[w.label] ?? 'sim-human-x',
      simulated: true,
    }));
  }

  // Resolution is per-agent, not all-or-nothing. The claim this product exists
  // to prove — that two wallets can be one person — needs only A1 and A2, both
  // registered by the same human. B1 proves the uninteresting direction, that
  // two different people are different, so a run with A1 and A2 real and B1
  // simulated still demonstrates the real thing.
  //
  // Anything unresolved is marked SIMULATED on every line it touches. The demo
  // never presents an invented identity as a real one.
  const agentBook = createAgentBookVerifier();
  const fallback: Record<string, string> = {
    A1: 'sim-human-1',
    A2: 'sim-human-1',
    B1: 'sim-human-2',
  };

  const resolved: DemoApprover[] = [];
  for (const w of wanted) {
    const humanId = await agentBook.lookupHuman(w.address);
    resolved.push(
      humanId === null
        ? {
            ...w,
            humanPrincipal: fallback[w.label] ?? `sim-${w.label}`,
            simulated: true,
          }
        : { ...w, humanPrincipal: humanId, simulated: false },
    );
  }

  const live = resolved.filter((a) => !a.simulated).map((a) => a.label);
  const sim = resolved.filter((a) => a.simulated).map((a) => a.label);
  if (live.length > 0) {
    console.log(
      `  ${C.green('AgentBook live')}: ${live.join(', ')}` +
        (sim.length > 0
          ? `   ${C.yellow(`simulated: ${sim.join(', ')}`)}`
          : ''),
    );
  }

  // The false-quorum refusal is the headline. Say plainly whether it was real.
  const a1 = resolved.find((a) => a.label === 'A1');
  const a2 = resolved.find((a) => a.label === 'A2');
  if (a1 && a2 && !a1.simulated && !a2.simulated) {
    console.log(
      `  ${C.green('the false-quorum refusal below is REAL')} — both wallets resolved on World Chain`,
    );
  }

  return resolved;
}

/* ── ACT 1 — the 990 ─────────────────────────────────────────────────── */

async function act1(client: Client | null): Promise<void> {
  act(1, 'THE 990 — the agent just pays it');

  const action = routineAction();
  const digest = digestCanonicalValue(
    digestDomains.paymentActionCore,
    paymentActionCoreV1Schema,
    action,
  );

  step(`invoice        INV-2026-0911  ${C.dim('court resurfacing materials')}`);
  step(`supplier       known, previously paid, bank account unchanged`);
  step(`amount         EUR 480.00`);
  step(`digest         ${C.cyan(digest)}`);
  await beat();

  const decision = evaluatePaymentPolicy(policyInputFor(digest, 'EXACT_MATCH'));
  console.log();
  step(`policy route   ${C.bold(C.green(decision.route))}`);
  step(
    `               ${C.dim(`reasons: ${decision.reasonCodes.join(', ')}`)}`,
  );
  step(
    `               ${C.dim(`humans required: ${String(decision.requiredAuthority.actionHumanQuorum)}`)}`,
  );
  await beat();

  if (decision.route !== 'STRAIGHT_THROUGH') {
    throw new Error(`routine invoice routed ${decision.route}`);
  }

  console.log();
  if (client) {
    const tx = await new TransferTransaction()
      .addHbarTransfer(
        AccountId.fromString(OPERATOR_ID),
        Hbar.fromTinybars(-100_000),
      )
      .addHbarTransfer(
        AccountId.fromString(SUPPLIER_ID),
        Hbar.fromTinybars(100_000),
      )
      .execute(client);
    const receipt = await tx.getReceipt(client);
    if (receipt.status.toString() !== 'SUCCESS') {
      throw new Error(`transfer ${receipt.status.toString()}`);
    }
    pass(
      `agent paid the supplier on Hedera — ${C.bold('no human was asked anything')}`,
    );
    step(
      `     ${C.dim('a direct HBAR transfer standing in for the EUR payment;')}`,
    );
    step(
      `     ${C.dim('the settlement adapter is not implemented on main yet')}`,
    );
    link(hashscan(tx.transactionId.toString()));
  } else {
    pass(
      `agent settled it unattended — ${C.bold('no human was asked anything')} ${C.dim('(offline)')}`,
    );
  }
  console.log(
    `\n  ${C.dim('This is 99% of the volume, and the part that never needed a person.')}`,
  );
}

/* ── ACT 2 — the 10 ──────────────────────────────────────────────────── */

async function act2(
  approvers: DemoApprover[],
): Promise<{ digest: string; approved: DemoApprover[] }> {
  act(2, 'THE 10 — one digit changed, and everything stops');

  const action = changedBeneficiaryAction();
  const digest = digestCanonicalValue(
    digestDomains.paymentActionCore,
    paymentActionCoreV1Schema,
    action,
  );

  step(
    `invoice        INV-2026-0912  ${C.dim('same supplier, new bank account')}`,
  );
  step(`amount         EUR 25,000.00`);
  step(`digest         ${C.cyan(digest)}`);
  await beat();

  const decision = evaluatePaymentPolicy(policyInputFor(digest, 'CHANGED'));
  console.log();
  step(`policy route   ${C.bold(C.yellow(decision.route))}`);
  step(
    `               ${C.dim(`reasons: ${decision.reasonCodes.join(', ')}`)}`,
  );
  step(
    `               ${C.dim(`verification: ${decision.verificationMode}`)}  ` +
      `${C.dim(`distinct humans required: ${String(decision.requiredAuthority.actionHumanQuorum)}`)}`,
  );
  await beat();

  const binding = actionBinding(digest);
  const [a1, a2, b1] = approvers as [DemoApprover, DemoApprover, DemoApprover];
  const tag = (a: DemoApprover): string =>
    a.simulated ? C.yellow(' [SIMULATED]') : '';

  /* the false-quorum attack: two company accounts, one person */
  console.log(
    `\n  ${C.bold('The attacker holds two company logins, so they approve twice.')}\n`,
  );
  step(`A1 approves    ${C.dim(a1.address)}  role ${a1.role}`);
  step(
    `               AgentBook → human ${C.cyan(a1.humanPrincipal)}${tag(a1)}`,
  );
  await beat(600);
  step(`A2 approves    ${C.dim(a2.address)}  role ${a2.role}`);
  step(
    `               AgentBook → human ${C.cyan(a2.humanPrincipal)}${tag(a2)}`,
  );
  await beat();

  const falseQuorum = validateApprovalQuorum(
    binding,
    humanAuthority,
    [approvalFact(a1, digest, 1), approvalFact(a2, digest, 2)],
    DEMO_NOW,
  );
  console.log();
  step(`company subjects  ${C.bold('2')}   agent wallets ${C.bold('2')}`);
  step(
    `distinct humans   ${C.bold(C.red('1'))} of ${String(humanAuthority.actionHumanQuorum)} required`,
  );
  console.log();
  if (falseQuorum.ok) throw new Error('false quorum was accepted');
  refuse(
    `${C.bold(falseQuorum.error.code)} — ${C.bold('two accounts, two wallets, one person')}`,
  );
  console.log(
    `\n  ${C.dim('Every maker-checker control that counts accounts instead of')}`,
  );
  console.log(
    `  ${C.dim('people is defeated by new Wallet(). This one is not.')}`,
  );
  await beat(1100);

  /* the genuine second human */
  console.log(`\n  ${C.bold('Now a genuinely different person approves.')}\n`);
  step(`B1 approves    ${C.dim(b1.address)}  role ${b1.role}`);
  step(
    `               AgentBook → human ${C.cyan(b1.humanPrincipal)}${tag(b1)}`,
  );
  await beat();

  const met = validateApprovalQuorum(
    binding,
    humanAuthority,
    [approvalFact(a1, digest, 1), approvalFact(b1, digest, 3)],
    DEMO_NOW,
  );
  console.log();
  step(
    `distinct humans   ${C.bold(C.green('2'))} of ${String(humanAuthority.actionHumanQuorum)} required`,
  );
  if (!met.ok) throw new Error(`quorum refused: ${met.error.code}`);
  pass(`quorum met — ${C.bold('and A2 still does not count')}`);

  return { digest, approved: [a1, b1] };
}

/* ── ACT 3 — the agent buys the verification ─────────────────────────── */

async function act3(digest: string): Promise<void> {
  act(3, 'THE AGENT PAYS FOR THE TRUTH — x402 on Hedera');

  if (OFFLINE) {
    step(C.dim('offline — skipping live x402 settlement'));
    return;
  }

  const requirements = {
    scheme: 'exact' as const,
    network: HEDERA_TESTNET_CAIP2,
    asset: '0.0.0',
    payTo: SUPPLIER_ID,
    amount: '1000000',
    maxTimeoutSeconds: 120,
    extra: { actionDigest: digest, feePayer: FACILITATOR_ID },
  };

  step(`GET ${C.dim(`https://remit.local/verify/${digest}`)}`);
  step(
    `${C.yellow('402 Payment Required')}  ${C.dim('0.01 ℏ — the check is a product, not a favour')}` +
      ` ${C.yellow('[SIMULATED challenge]')}`,
  );
  await beat();

  const signer = createClientHederaSigner(OPERATOR_ID, operatorKeyX402, {
    network: HEDERA_TESTNET_CAIP2,
  });
  const built = await new ClientScheme(signer).createPaymentPayload(
    2,
    requirements as never,
  );
  const inner =
    (built as { payload?: Record<string, unknown> }).payload ??
    (built as Record<string, unknown>);
  const paymentPayload = {
    x402Version: 2,
    accepted: requirements,
    payload: inner,
  };
  step('agent signed an exact-scheme payment payload');
  await beat();

  const facilitatorKey = X402PrivateKey.fromStringDer(FACILITATOR_KEY);
  const facilitator = new x402Facilitator().register(
    HEDERA_TESTNET_CAIP2 as never,
    new FacilitatorScheme(
      toFacilitatorHederaSigner({
        getAddresses: () => [FACILITATOR_ID],
        preflightTransfer: createHederaPreflightTransfer(),
        signAndSubmitTransaction: createHederaSignAndSubmitTransaction(
          (network: string) => {
            const c = createHederaClient(network);
            c.setOperator(FACILITATOR_ID, facilitatorKey);
            return c;
          },
          facilitatorKey,
        ),
        verifyPayerSignature: createHederaVerifyPayerSignature(),
      }) as never,
    ) as never,
  );

  const verification = (await facilitator.verify(
    paymentPayload as never,
    requirements as never,
  )) as { isValid?: boolean; payer?: string };
  if (verification.isValid !== true) {
    throw new Error('payment payload failed verification');
  }
  step(
    `facilitator verified the payer signature on-chain → ${C.dim(verification.payer ?? '')}`,
  );
  await beat();

  const settlement = (await facilitator.settle(
    paymentPayload as never,
    requirements as never,
  )) as { success?: boolean; transaction?: string; errorReason?: string };
  if (settlement.success !== true) {
    throw new Error(
      `settlement failed: ${settlement.errorReason ?? 'unknown'}`,
    );
  }
  const txId = settlement.transaction ?? '';
  pass('settled on Hedera, after consensus');
  link(hashscan(txId));
  await beat();

  // The PAYMENT above is real. What follows is not: there is no beneficiary
  // verification service, so the demo stands one in, generating a keypair and
  // signing a fixed answer. It demonstrates the binding — the signature covers
  // the digest and the payment together — but it proves nothing about the
  // beneficiary. Saying otherwise would be the exact overclaim this project
  // spends its README disowning.
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const answer = {
    actionDigest: digest,
    result: 'MATCH',
    paymentTransactionId: txId,
  };
  const signature = createSign('sha256')
    .update(Buffer.from(JSON.stringify(answer)))
    .sign(privateKey, 'base64');
  console.log();
  step(
    `stand-in service returns a result bound to ${C.bold('this digest and this payment')}` +
      ` ${C.yellow('[SIMULATED]')}`,
  );
  step(`  result       ${C.green('MATCH')} ${C.yellow('[SIMULATED]')}`);
  step(`  signature    ${C.dim(`${signature.slice(0, 40)}…`)}`);
  step(
    `  ${C.dim('the binding is real — lift it onto another invoice and it stops verifying —')}`,
  );
  step(
    `  ${C.dim('but no real service answered. The 402 payment above is the part that is live.')}`,
  );
}

/* ── ACT 4 — an operational marker, not an invoice or receivable ─────── */

interface Payable {
  readonly tokenId: string;
  readonly serial: number;
}

async function readMarker(
  tokenId: string,
  serial: number,
  digest: string,
  phase: 'BURNED' | 'MINTED',
  timeoutMs = 30_000,
): Promise<PayableMarkerAudit> {
  const base = 'https://testnet.mirrornode.hedera.com/api/v1';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [tokenResponse, nftResponse] = await Promise.all([
      fetch(`${base}/tokens/${tokenId}`),
      fetch(`${base}/tokens/${tokenId}/nfts/${String(serial)}`),
    ]);
    if (tokenResponse.ok && nftResponse.ok) {
      try {
        return auditPayableMarkerSnapshot(
          await tokenResponse.json(),
          await nftResponse.json(),
          {
            actionDigest: digest,
            phase,
            serial,
            supplyKey: operatorKey.publicKey.toStringRaw(),
            tokenId,
            treasuryAccountId: OPERATOR_ID,
          },
        );
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          !error.message.includes('total_supply') &&
          !error.message.includes('NFT deleted') &&
          !error.message.includes('NFT account_id')
        ) {
          throw error;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(
    `Mirror Node did not confirm ${phase.toLowerCase()} marker ${tokenId}#${String(serial)}`,
  );
}

async function act4(
  client: Client | null,
  digest: string,
): Promise<Payable | null> {
  act(4, 'THE APPROVED ACTION GETS A NO-VALUE LEDGER MARKER');

  step(`metadata       ${C.cyan(digest)}`);
  step(
    `               ${C.dim('a nonce-bound action digest; no invoice fields or legal right')}`,
  );
  step(
    `               ${C.yellow('this marker is evidence, not payment authority')}`,
  );
  step(
    `               ${C.dim('authority came from the quorum in Act 2 — see docs/evidence/README.md')}`,
  );
  await beat();

  if (!client) {
    step(C.dim('offline — skipping live mint/burn'));
    return null;
  }

  const created = await (
    await new TokenCreateTransaction()
      .setTokenName(PAYABLE_MARKER_NAME)
      .setTokenSymbol(PAYABLE_MARKER_SYMBOL)
      .setTokenType(TokenType.NonFungibleUnique)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(1)
      .setTreasuryAccountId(AccountId.fromString(OPERATOR_ID))
      .setSupplyKey(operatorKey.publicKey)
      .freezeWith(client)
      .sign(operatorKey)
  ).execute(client);
  const tokenId = (await created.getReceipt(client)).tokenId?.toString() ?? '';
  step(`collection     ${tokenId}`);
  await beat(400);

  const minted = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .addMetadata(payableMarkerMetadata(digest))
    .execute(client);
  const serial = Number((await minted.getReceipt(client)).serials[0]);
  pass(`marker minted — serial ${String(serial)}`);
  link(hashscan(minted.transactionId.toString()));
  await beat();

  await readMarker(tokenId, serial, digest, 'MINTED');
  pass(
    `mirror read-back ${C.bold('matches the digest')} — ${C.dim('verified from the ledger, not from us')}`,
  );
  pass(
    `configuration sealed — ${C.dim('finite supply 1; supply key only; no admin, wipe, freeze, KYC, fee, metadata, or pause key')}`,
  );
  await beat();

  const burned = await new TokenBurnTransaction()
    .setTokenId(tokenId)
    .setSerials([serial])
    .execute(client);
  await burned.getReceipt(client);
  pass(`marker burned — ${C.bold('lifecycle operation submitted')}`);
  link(hashscan(burned.transactionId.toString()));

  return { tokenId, serial };
}

/* ── ACT 5 — the refusals ────────────────────────────────────────────── */

async function act5(
  digest: string,
  approved: DemoApprover[],
  payable: Payable | null,
): Promise<void> {
  act(5, 'THE REFUSALS — why you can leave it running');

  const binding = actionBinding(digest);
  const [first, second] = approved as [DemoApprover, DemoApprover];

  /* 1 — one changed character */
  const tampered = digestCanonicalValue(
    digestDomains.paymentActionCore,
    paymentActionCoreV1Schema,
    changedBeneficiaryAction('0.0.999999'),
  );
  step(C.bold('1. Change the bank account after approval.'));
  step(`   approved digest  ${C.dim(digest)}`);
  step(`   new digest       ${C.yellow(tampered)}`);
  const carried = validateApprovalQuorum(
    actionBinding(tampered),
    humanAuthority,
    [approvalFact(first, digest, 1), approvalFact(second, digest, 3)],
    DEMO_NOW,
  );
  if (carried.ok) throw new Error('approvals carried across a changed action');
  refuse(
    `${C.bold(carried.error.code)} — ${C.bold('the agent cannot pay something different from what was approved')}`,
  );
  console.log();

  /* 2 — replayed approval */
  step(C.bold('2. Reuse one approval twice to reach quorum.'));
  const replayed = validateApprovalQuorum(
    binding,
    humanAuthority,
    [approvalFact(first, digest, 1), approvalFact(first, digest, 1)],
    DEMO_NOW,
  );
  if (replayed.ok) throw new Error('replayed approval was accepted');
  refuse(
    `${C.bold(replayed.error.code)} — ${C.bold('approvals cannot be manufactured to make the queue move')}`,
  );
  console.log();

  /* 3 — the audit marker lifecycle is public */
  step(C.bold('3. The audit trail is public and cannot be quietly rewritten.'));
  if (!payable) {
    step(`   ${C.dim('offline — no marker was minted')}`);
    return;
  }
  const facts = await readMarker(
    payable.tokenId,
    payable.serial,
    digest,
    'BURNED',
  );
  step(
    `   ledger says      ${C.dim(`${payable.tokenId}#${String(payable.serial)}`)}  deleted=${C.bold(String(facts.deleted))}`,
  );
  step(
    `                    total_supply=${C.bold(facts.totalSupply)}  max_supply=${C.bold(facts.maxSupply)}`,
  );
  step(
    `   ${C.dim('anyone can read the digest back from Mirror Node without asking us')}`,
  );
  console.log();
  step(
    `  ${C.yellow('Being precise:')} ${C.dim('the burn is not settlement and does NOT prevent payment replay.')}`,
  );
  step(
    `  ${C.dim('Replay is refused by the approval layer above — REPLAY_DETECTED and')}`,
  );
  step(
    `  ${C.dim('ACTION_DIGEST_MISMATCH. The marker is independent evidence, nothing more.')}`,
  );
}

/* ── main ────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log(
    `\n${C.bold('Remit')} — let agents pay the invoices, prove they paid the right thing`,
  );
  if (OFFLINE)
    console.log(
      C.yellow('  --offline: no network calls, narration rehearsal only'),
    );
  else if (SIMULATE_HUMANS) {
    console.log(C.yellow('  --simulate-humans: World identities are NOT real'));
  }

  const approvers = await resolveApprovers();
  const client = OFFLINE
    ? null
    : Client.forTestnet().setOperator(OPERATOR_ID, operatorKey);

  try {
    await act1(client);
    const { digest, approved } = await act2(approvers);
    await act3(digest);
    const payable = await act4(client, digest);
    await act5(digest, approved, payable);

    // The closing claim depends on whether the humans were real. Printing
    // "two provably different people" after resolving three invented ones
    // would be the demo lying in its last line.
    const humansWereReal = approvers.every((approver) => !approver.simulated);

    console.log(`\n${C.bold('─'.repeat(72))}`);
    if (humansWereReal) {
      console.log(
        `${C.green('The 990 were paid by an agent. The 10 needed two provably different people.')}\n` +
          `${C.dim('No oracle. No trusted third party. No detection. Every refusal is provable.')}\n`,
      );
    } else {
      console.log(
        `${OFFLINE ? C.yellow('Offline run: no payment was made and no ledger was touched.') : C.green('The 990 were paid by an agent — that payment was real, on Hedera.')}\n` +
          `${C.yellow('The 10 required two distinct humans. The identities here were SIMULATED:')}\n` +
          `${C.yellow('the refusal is the real code path, the humans were not registered.')}\n` +
          `${C.dim('Register them and re-run to see the same refusal on real World identities.')}\n`,
      );
    }
  } finally {
    client?.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    `\n${C.red('demo failed:')}`,
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
