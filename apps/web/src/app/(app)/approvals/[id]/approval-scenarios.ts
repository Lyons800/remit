export type ApprovalFact = readonly [
  label: string,
  value: string,
  changed?: boolean,
];

export type ApprovalScenario = Readonly<{
  actionDigest: string;
  amount: string;
  changedActionDigest: string;
  facts: readonly ApprovalFact[];
  invoiceId: string;
  reason: string;
  supplier: string;
}>;

const scenarios: Readonly<Record<string, ApprovalScenario>> = {
  'INV-2026-0910': {
    actionDigest:
      '0a4362390ff58417da5e2e1bb59b558a7e92c0b97d535339e4e3a65ddf65460f',
    amount: '€4,118.75',
    changedActionDigest:
      '1e936cb8d797eca4a6872065bce28ab6339b5e88ff83622c3f568e5e2c534ae5',
    facts: [
      ['Supplier', 'Sport Import Iberia (SUP-5512)'],
      ['Amount', '€4,118.75'],
      ['Account on file', '— no approved baseline —'],
      ['Account on invoice', 'ES91 2100 0418 …1332', true],
      ['Reference', 'New ball shipment — July'],
      ['Expires', '24 Aug 2026'],
    ],
    invoiceId: 'INV-2026-0910',
    reason:
      'No approved supplier payment baseline exists; this is the first illustrative payment.',
    supplier: 'Sport Import Iberia',
  },
  'INV-2026-0912': {
    actionDigest:
      '9c41f2ab6d0e33175c08b4be21d67a90e5f4c2d81a7b30964efc1259ade0e7b2',
    amount: '€25,000.00',
    changedActionDigest:
      '3e78d90c145ab2f6e01c74d3982bf6541da0c8e26b95f31708ecd44a1f52c903',
    facts: [
      ['Supplier', 'Padel Surfaces Lda (SUP-4471)'],
      ['Amount', '€25,000.00'],
      ['Account on file', 'PT50 0002 0123 …9015 4'],
      ['Account on invoice', 'LT12 1000 1111 …1000', true],
      ['Reference', 'Court resurfacing — final'],
      ['Expires', '24 Aug 2026'],
    ],
    invoiceId: 'INV-2026-0912',
    reason:
      'The proposed account differs from the supplier baseline used by 14 illustrative history records.',
    supplier: 'Padel Surfaces Lda',
  },
};

export function findApprovalScenario(
  invoiceId: string,
): ApprovalScenario | undefined {
  return scenarios[invoiceId];
}
