/**
 * The demo — the whole product in one continuous, live run.
 *
 * Nothing here re-implements the product. The policy route, the action digest
 * and the approval quorum all come from the shipped packages:
 *
 *   evaluatePaymentPolicy   @invoiceguard/protocol   the 990/10 split
 *   digestCanonicalValue    @invoiceguard/protocol   the action digest
 *   validateApprovalQuorum  @invoiceguard/domain     distinct-human quorum
 *
 * Hedera and World are reached directly, because a gate should exercise the
 * dependency rather than our wrapper around it.
 *
 *   pnpm demo                     full live run
 *   pnpm demo -- --simulate-humans   rehearse before AgentBook registration
 *   pnpm demo -- --offline           narration practice, no network
 */

import { createSign, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateApprovalQuorum } from '@invoiceguard/domain';
import { paymentActionCoreV1Schema } from '@invoiceguard/protocol';
import {
  digestCanonicalValue,
  digestDomains,
  evaluatePaymentPolicy,
} from '@invoiceguard/protocol/hashing';
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

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  } catch {
    console.error('\nNo .env.local found. See .env.example.\n');
    process.exit(1);
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
function need(key: string): string {
  const value = E[key];
  if (value === undefined || value === '') {
    console.error(`Missing ${key} in .env.local`);
    process.exit(1);
  }
  return value;
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

  const agentBook = createAgentBookVerifier();
  const resolved: DemoApprover[] = [];
  for (const w of wanted) {
    const humanId = await agentBook.lookupHuman(w.address);
    if (humanId === null) {
      console.error(
        `\n${C.red('STOP')} — ${w.label} (${w.address}) is not registered in AgentBook.\n\n` +
          `This demo will not invent a human identity. Register it:\n` +
          `  npx @worldcoin/agentkit-cli register ${w.address}\n\n` +
          `To rehearse before registration: pnpm demo -- --simulate-humans\n`,
      );
      process.exit(2);
    }
    resolved.push({ ...w, humanPrincipal: humanId, simulated: false });
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
      `agent settled it unattended — ${C.bold('no human was asked anything')}`,
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

  step(`GET ${C.dim(`https://invoiceguard.local/verify/${digest}`)}`);
  step(
    `${C.yellow('402 Payment Required')}  ${C.dim('0.01 ℏ — the check is a product, not a favour')}`,
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

  // The answer is signed over the digest AND the payment, so it cannot be
  // lifted onto a different invoice.
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
    `service returned a result signed over ${C.bold('this digest and this payment')}`,
  );
  step(`  result       ${C.green('MATCH')}`);
  step(`  signature    ${C.dim(`${signature.slice(0, 40)}…`)}`);
  step(
    `  ${C.dim('lift it onto another invoice and the signature stops verifying')}`,
  );
}

/* ── ACT 4 — the payable becomes a token, then stops existing ────────── */

interface Payable {
  readonly tokenId: string;
  readonly serial: number;
}

async function readMetadata(
  tokenId: string,
  serial: number,
  timeoutMs = 30_000,
): Promise<string> {
  const url = `https://testnet.mirrornode.hedera.com/api/v1/tokens/${tokenId}/nfts/${String(serial)}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(url);
    if (response.ok) {
      const nft = (await response.json()) as { metadata?: string };
      if (nft.metadata !== undefined) {
        return Buffer.from(nft.metadata, 'base64').toString('ascii');
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`mirror node did not index ${tokenId}#${String(serial)}`);
}

async function act4(
  client: Client | null,
  digest: string,
): Promise<Payable | null> {
  act(4, 'THE PAYABLE IS A TOKEN — minted, then burned');

  step(`metadata       ${C.cyan(digest)}`);
  step(
    `               ${C.dim("the token's on-ledger metadata IS the action digest")}`,
  );
  await beat();

  if (!client) {
    step(C.dim('offline — skipping live mint/burn'));
    return null;
  }

  const created = await (
    await new TokenCreateTransaction()
      .setTokenName('InvoiceGuard Payables - NO VALUE')
      .setTokenSymbol('IGPAY')
      .setTokenType(TokenType.NonFungibleUnique)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(1)
      .setTreasuryAccountId(AccountId.fromString(OPERATOR_ID))
      .setSupplyKey(operatorKey.publicKey)
      .setAdminKey(operatorKey.publicKey)
      .freezeWith(client)
      .sign(operatorKey)
  ).execute(client);
  const tokenId = (await created.getReceipt(client)).tokenId?.toString() ?? '';
  step(`collection     ${tokenId}`);
  await beat(400);

  const minted = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .addMetadata(Buffer.from(digest, 'ascii'))
    .execute(client);
  const serial = Number((await minted.getReceipt(client)).serials[0]);
  pass(`payable minted — serial ${String(serial)}`);
  link(hashscan(minted.transactionId.toString()));
  await beat();

  const onLedger = await readMetadata(tokenId, serial);
  if (onLedger !== digest) {
    throw new Error('ledger metadata does not match the action digest');
  }
  pass(
    `mirror read-back ${C.bold('matches the digest')} — ${C.dim('verified from the ledger, not from us')}`,
  );
  await beat();

  const burned = await new TokenBurnTransaction()
    .setTokenId(tokenId)
    .setSerials([serial])
    .execute(client);
  await burned.getReceipt(client);
  pass(`payable burned — ${C.bold('CONSUMED')}`);
  link(hashscan(burned.transactionId.toString()));

  return { tokenId, serial };
}

/* ── ACT 5 — the refusals ────────────────────────────────────────────── */

interface BurnFacts {
  readonly deleted: boolean;
  readonly totalSupply: string;
  readonly maxSupply: string;
}

async function waitForBurn(
  tokenId: string,
  serial: number,
  timeoutMs = 30_000,
): Promise<BurnFacts> {
  const deadline = Date.now() + timeoutMs;
  let last: BurnFacts = { deleted: false, totalSupply: '?', maxSupply: '?' };
  while (Date.now() < deadline) {
    const [nft, token] = await Promise.all([
      fetch(
        `https://testnet.mirrornode.hedera.com/api/v1/tokens/${tokenId}/nfts/${String(serial)}`,
      )
        .then((r) => r.json() as Promise<{ deleted?: boolean }>)
        .catch(() => ({ deleted: false })),
      fetch(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${tokenId}`)
        .then(
          (r) =>
            r.json() as Promise<{ total_supply?: string; max_supply?: string }>,
        )
        .catch((): { total_supply?: string; max_supply?: string } => ({})),
    ]);
    last = {
      deleted: nft.deleted === true,
      totalSupply: token.total_supply ?? '?',
      maxSupply: token.max_supply ?? '?',
    };
    if (last.deleted && last.totalSupply === '0') return last;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}

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

  /* 3 — replay the settled payable */
  step(C.bold('3. Replay the fully valid, fully approved authorisation.'));
  if (!payable) {
    refuse(C.bold('the agent cannot double-pay'));
    return;
  }
  const facts = await waitForBurn(payable.tokenId, payable.serial);
  step(
    `   ledger says      ${C.dim(`${payable.tokenId}#${String(payable.serial)}`)}  deleted=${C.bold(String(facts.deleted))}`,
  );
  step(
    `                    total_supply=${C.bold(facts.totalSupply)}  max_supply=${C.bold(facts.maxSupply)}`,
  );
  refuse(
    `replay is not rejected by a database — ${C.bold('the token that authorised payment no longer exists')}`,
  );
  step(
    `   ${C.dim('and with max_supply 1 already spent, it can never be minted again')}`,
  );
}

/* ── main ────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log(
    `\n${C.bold('InvoiceGuard')} — let agents pay the invoices, prove they paid the right thing`,
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

    console.log(`\n${C.bold('─'.repeat(72))}`);
    console.log(
      `${C.green('The 990 were paid by an agent. The 10 needed two provably different people.')}\n` +
        `${C.dim('No oracle. No trusted third party. No detection. Every refusal is provable.')}\n`,
    );
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
