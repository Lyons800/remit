/**
 * The 0G gate — a real inference, or an honest refusal.
 *
 * Reads a synthetic invoice through a healthy TeeML provider on 0G Compute and
 * turns the answer into an ExtractionRecord. The record then decides, through
 * the same code the product uses, whether the payment could settle unattended.
 *
 * What a PASS means: 0G read the document, the reading is attested, and the
 * account it found matches the supplier master — so the agent may pay it.
 *
 * What a FAIL means: nothing is broken. An unreadable or unattested invoice
 * escalates to two distinct humans, which is the system behaving correctly.
 * The gate prints which of those happened rather than a bare pass/fail.
 *
 *   pnpm gate:zerog
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveBeneficiaryReading,
  extractionRecordHash,
  mayAutoSettle,
  ZeroGExtractionClient,
} from '@invoiceguard/zerog-adapter';

const ACCOUNT_ON_FILE = 'PT50 0002 0123 1234 5678 9015 4';

/** The document the model actually reads. Deliberately messy, like a real one. */
const INVOICE = `
PADEL SURFACES LDA
Rua da Fabrica 12, 2975-333 Quinta do Conde, Portugal
VAT PT509887221

INVOICE                                    INV-2026-0912
Date: 14 July 2026                         Terms: 30 days

Bill to: Peru Padel, Lda

  Description                        Qty        Amount
  Court resurfacing, courts 3-4        2     18,500.00
  Line marking and primer              1      4,200.00
  Delivery and site prep               1      2,300.00
                                          -----------
                              Subtotal      25,000.00
                              VAT 0%             0.00
                              TOTAL PAYABLE  EUR 25,000.00

Payment by transfer to:
  Account name: Padel Surfaces Lda
  IBAN: PT50 0002 0123 1234 5678 9015 4
  BIC: BPIPPTPL

Queries: contas@padelsurfaces.pt
`.trim();

function privateKey(): string {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '../../.env.local'),
  ];
  for (const path of candidates) {
    try {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('ZEROG_PRIVATE_KEY=')) {
          return trimmed.slice('ZEROG_PRIVATE_KEY='.length);
        }
      }
    } catch {
      /* try the next candidate */
    }
  }
  console.error(
    '\nMissing ZEROG_PRIVATE_KEY in .env.local.\n' +
      'Fund the account first, then add its key.\n',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const client = new ZeroGExtractionClient({
    privateKey: privateKey(),
    network: 'testnet',
    preferredModel: 'qwen/qwen2.5-omni-7b',
  });

  console.log('\n1. selecting a healthy TeeML provider…');
  const picked = await client.pickProvider();
  if (picked === null) {
    console.error('   no healthy TeeML chatbot available on testnet');
    process.exit(1);
  }
  console.log(`   provider  ${picked.provider}`);
  console.log(`   model     ${picked.model}`);

  console.log('\n2. funding the compute ledger if needed…');
  await client.ensureFunded();
  console.log('   ledger ready');

  console.log('\n3. reading the invoice inside the enclave…');
  const record = await client.extractInvoice(INVOICE);

  console.log(`\n   status        ${record.status}`);
  console.log(`   invoiceHash   ${record.invoiceHash}`);
  console.log(`   outputHash    ${record.outputHash}`);
  console.log(`   recordHash    ${extractionRecordHash(record)}`);

  if (record.fields === null) {
    console.log('\n   the model did not return a usable reading');
  } else {
    console.log(`\n   supplier      ${record.fields.supplierName}`);
    console.log(`   iban          ${record.fields.iban}`);
    console.log(
      `   amount        ${record.fields.amountMinor} ${record.fields.currency}`,
    );
    console.log(`   reference     ${record.fields.invoiceRef}`);
  }

  const reading = deriveBeneficiaryReading(record, ACCOUNT_ON_FILE);
  const autoSettle = mayAutoSettle(record, reading);

  console.log(`\n4. what the policy does with it`);
  console.log(`   account on file  ${ACCOUNT_ON_FILE.replace(/\s+/g, '')}`);
  console.log(`   reading          ${reading}`);
  console.log(
    `   route            ${autoSettle ? 'STRAIGHT_THROUGH — the agent may pay it' : 'HUMAN_APPROVAL — two distinct humans required'}`,
  );

  if (autoSettle) {
    console.log(
      `\nGATE PASSED — 0G read the invoice, the reading is attested, and it matches the supplier master.\n`,
    );
    return;
  }

  console.log(
    `\nGATE INCOMPLETE — the reading was ${record.status}/${reading}, so the payment escalates.\n` +
      `That is the fail-closed rule working; it is not an error.\n`,
  );
}

main().catch((error: unknown) => {
  console.error(
    '\n0G gate failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
