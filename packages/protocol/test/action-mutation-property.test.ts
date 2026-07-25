import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { PaymentActionCoreV1 } from '../src/index.js';
import { hashPaymentActionCore } from '../src/hashing.js';
import { vectorActionCore } from './fixtures/payment-action.js';

type CoreMutation = Readonly<{
  label: string;
  mutate: (core: PaymentActionCoreV1) => PaymentActionCoreV1;
}>;

const mutations = [
  {
    label: 'action identifier',
    mutate: (core) => ({
      ...core,
      actionId: '019f939b-fe5e-7e92-b72e-8d4531958c35',
    }),
  },
  {
    label: 'approved beneficiary',
    mutate: (core) => ({
      ...core,
      beneficiary: {
        ...core.beneficiary,
        approved: {
          accountId: 'hedera:296:0.0.1002',
          kind: 'CAIP_10',
        },
      },
    }),
  },
  {
    label: 'proposed beneficiary',
    mutate: (core) => ({
      ...core,
      beneficiary: {
        ...core.beneficiary,
        proposed: {
          accountId: 'hedera:296:0.0.1002',
          kind: 'CAIP_10',
        },
      },
    }),
  },
  {
    label: 'creation time',
    mutate: (core) => ({
      ...core,
      createdAt: '2026-07-25T10:00:00.001Z',
    }),
  },
  {
    label: 'evidence root',
    mutate: (core) => ({ ...core, evidenceRoot: '9'.repeat(64) }),
  },
  {
    label: 'expiry',
    mutate: (core) => ({
      ...core,
      expiresAt: '2026-07-25T10:59:59.999Z',
    }),
  },
  {
    label: 'nonce',
    mutate: (core) => ({
      ...core,
      nonce: 'fedcba9876543210fedcba9876543210',
    }),
  },
  {
    label: 'organization',
    mutate: (core) => ({
      ...core,
      organizationId: '019f939b-fe5e-7e92-b72e-8d4531958c36',
    }),
  },
  {
    label: 'policy identifier',
    mutate: (core) => ({
      ...core,
      policy: { ...core.policy, id: 'exception-invoice-policy' },
    }),
  },
  {
    label: 'policy version',
    mutate: (core) => ({
      ...core,
      policy: { ...core.policy, version: core.policy.version + 1 },
    }),
  },
  {
    label: 'settlement amount',
    mutate: (core) => ({
      ...core,
      settlement: { ...core.settlement, amountAtoms: '2500001' },
    }),
  },
  {
    label: 'settlement asset',
    mutate: (core) => ({
      ...core,
      settlement: {
        ...core.settlement,
        assetId: 'hedera:296/hts:0.0.9002',
      },
    }),
  },
  {
    label: 'settlement beneficiary',
    mutate: (core) => ({
      ...core,
      settlement: {
        ...core.settlement,
        beneficiary: 'hedera:296:0.0.1002',
      },
    }),
  },
  {
    label: 'mapping policy',
    mutate: (core) => ({
      ...core,
      settlement: { ...core.settlement, mappingPolicyHash: '8'.repeat(64) },
    }),
  },
  {
    label: 'source amount',
    mutate: (core) => ({
      ...core,
      sourceInvoice: { ...core.sourceInvoice, amountAtoms: '2500001' },
    }),
  },
  {
    label: 'source asset',
    mutate: (core) => ({
      ...core,
      sourceInvoice: { ...core.sourceInvoice, assetId: 'iso4217:USD' },
    }),
  },
  {
    label: 'invoice digest',
    mutate: (core) => ({
      ...core,
      sourceInvoice: { ...core.sourceInvoice, digest: '7'.repeat(64) },
    }),
  },
  {
    label: 'obligation',
    mutate: (core) => ({
      ...core,
      sourceInvoice: {
        ...core.sourceInvoice,
        obligationId: '019f939b-fe5e-7e92-b72e-8d4531958c37',
      },
    }),
  },
  {
    label: 'supplier',
    mutate: (core) => ({
      ...core,
      supplierId: '019f939b-fe5e-7e92-b72e-8d4531958c38',
    }),
  },
  {
    label: 'supplier snapshot',
    mutate: (core) => ({
      ...core,
      supplierSnapshotDigest: '6'.repeat(64),
    }),
  },
] as const satisfies readonly CoreMutation[];

describe('payment-action field mutation properties', () => {
  it.each(mutations)('changes the core digest for $label', ({ mutate }) => {
    expect(hashPaymentActionCore(mutate(vectorActionCore))).not.toBe(
      hashPaymentActionCore(vectorActionCore),
    );
  });

  it('binds every arbitrary positive source amount', () => {
    fc.assert(
      fc.property(
        fc
          .bigInt({ max: (1n << 128n) - 1n, min: 1n })
          .filter(
            (amount) =>
              amount.toString() !== vectorActionCore.sourceInvoice.amountAtoms,
          ),
        (amount) => {
          const mutated = {
            ...vectorActionCore,
            sourceInvoice: {
              ...vectorActionCore.sourceInvoice,
              amountAtoms: amount.toString(),
            },
          };
          expect(hashPaymentActionCore(mutated)).not.toBe(
            hashPaymentActionCore(vectorActionCore),
          );
        },
      ),
    );
  });
});
