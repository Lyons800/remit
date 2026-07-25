import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  releaseMandateReservation,
  reserveMandateCapacity,
  settleMandateReservation,
  validateApprovalQuorum,
  validateDigestBindings,
  validateInvoiceActionBinding,
  validateInvoiceRevisionLineage,
  validateNewPaymentActionEligibility,
  validatePaymentHistory,
  validateSettlementClaim,
} from '../src/index.js';

const ACTION_DIGEST = 'a'.repeat(64);

const approvalRequirement = {
  actionHumanQuorum: 2,
  agentBookQuorum: 2,
  companySubjectQuorum: 2,
  roles: [
    { count: 1, role: 'FINANCE_APPROVER' },
    { count: 1, role: 'TREASURY_APPROVER' },
  ],
} as const;

const approvals = [
  {
    actionDigest: ACTION_DIGEST,
    actionHumanPrincipal: 'human-1',
    agentTenantPrincipal: 'agent-1',
    role: 'FINANCE_APPROVER',
    subjectId: 'subject-1',
  },
  {
    actionDigest: ACTION_DIGEST,
    actionHumanPrincipal: 'human-2',
    agentTenantPrincipal: 'agent-2',
    role: 'TREASURY_APPROVER',
    subjectId: 'subject-2',
  },
] as const;

describe('approval quorum', () => {
  it('accepts exact, independently distinct approvals', () => {
    expect(
      validateApprovalQuorum(ACTION_DIGEST, approvalRequirement, approvals),
    ).toEqual({ ok: true, value: approvals });
  });

  it('does not let a duplicate approval fill a role slot', () => {
    const requirement = {
      actionHumanQuorum: 3,
      agentBookQuorum: 3,
      companySubjectQuorum: 3,
      roles: [
        { count: 2, role: 'FINANCE_APPROVER' },
        { count: 1, role: 'TREASURY_APPROVER' },
      ],
    } as const;
    const polluted = [
      approvals[0],
      approvals[0],
      approvals[1],
      {
        ...approvals[1],
        actionHumanPrincipal: 'human-3',
        agentTenantPrincipal: 'agent-3',
        subjectId: 'subject-3',
      },
    ];

    expect(
      validateApprovalQuorum(ACTION_DIGEST, requirement, polluted),
    ).toMatchObject({
      error: { code: 'SUBJECT_NOT_DISTINCT' },
      ok: false,
    });
  });

  it('rejects cross-action approvals and invalid requirements', () => {
    expect(
      validateApprovalQuorum(ACTION_DIGEST, approvalRequirement, [
        { ...approvals[0], actionDigest: 'b'.repeat(64) },
        approvals[1],
      ]),
    ).toMatchObject({
      error: { code: 'ACTION_DIGEST_MISMATCH' },
      ok: false,
    });

    expect(
      validateApprovalQuorum(
        ACTION_DIGEST,
        { ...approvalRequirement, actionHumanQuorum: -1 },
        approvals,
      ),
    ).toMatchObject({
      error: { code: 'APPROVAL_REQUIREMENT_INVALID' },
      ok: false,
    });
  });
});

describe('invoice and obligation invariants', () => {
  const invoice = {
    amountAtoms: '2500000',
    assetId: 'iso4217:EUR',
    digest: 'b'.repeat(64),
    obligationId: 'obligation-1',
    organizationId: 'organization-1',
    supplierId: 'supplier-1',
  } as const;
  const action = {
    organizationId: invoice.organizationId,
    sourceInvoice: {
      amountAtoms: invoice.amountAtoms,
      assetId: invoice.assetId,
      digest: invoice.digest,
      obligationId: invoice.obligationId,
    },
    supplierId: invoice.supplierId,
  } as const;

  it('binds every payable invoice fact to the frozen action', () => {
    expect(validateInvoiceActionBinding(invoice, action)).toEqual({
      ok: true,
      value: action,
    });
    expect(
      validateInvoiceActionBinding(invoice, {
        ...action,
        sourceInvoice: { ...action.sourceInvoice, amountAtoms: '2500001' },
      }),
    ).toMatchObject({
      error: { code: 'INVOICE_ACTION_MISMATCH' },
      ok: false,
    });
  });

  it('requires a contiguous revision with a stable obligation', () => {
    const previous = {
      createdAt: '2026-07-25T10:00:00.000Z',
      invoiceId: 'invoice-1',
      invoiceRevision: 1,
      invoiceRevisionId: 'revision-1',
      obligationId: 'obligation-1',
      organizationId: 'organization-1',
      supersedesInvoiceRevisionId: null,
    } as const;
    const candidate = {
      ...previous,
      createdAt: '2026-07-25T10:01:00.000Z',
      invoiceRevision: 2,
      invoiceRevisionId: 'revision-2',
      supersedesInvoiceRevisionId: previous.invoiceRevisionId,
    } as const;

    expect(validateInvoiceRevisionLineage(previous, candidate)).toEqual({
      ok: true,
      value: candidate,
    });
    expect(
      validateInvoiceRevisionLineage(previous, {
        ...candidate,
        obligationId: 'replacement-payable',
      }),
    ).toMatchObject({
      error: { code: 'INVOICE_REVISION_CONFLICT' },
      ok: false,
    });
    expect(
      validateInvoiceRevisionLineage(previous, {
        ...candidate,
        invoiceRevision: 3,
      }),
    ).toMatchObject({
      error: { code: 'INVOICE_REVISION_CONFLICT' },
      ok: false,
    });
  });

  it('separates history validation from new-action and settlement claims', () => {
    expect(
      validatePaymentHistory({
        nonTerminalActionCountForObligation: 1,
        settlementCountForAction: 1,
        settlementCountForObligation: 1,
      }).ok,
    ).toBe(true);

    expect(
      validateNewPaymentActionEligibility({
        nonTerminalActionCountForObligation: 0,
        settlementCountForAction: 0,
        settlementCountForObligation: 1,
      }),
    ).toMatchObject({
      error: { code: 'OBLIGATION_ALREADY_SETTLED' },
      ok: false,
    });

    expect(
      validateSettlementClaim({
        nonTerminalActionCountForObligation: 1,
        settlementCountForAction: 1,
        settlementCountForObligation: 1,
      }),
    ).toMatchObject({
      error: { code: 'ACTION_ALREADY_CONSUMED' },
      ok: false,
    });

    expect(
      validatePaymentHistory({
        nonTerminalActionCountForObligation: 1.5,
        settlementCountForAction: 0,
        settlementCountForObligation: 0,
      }),
    ).toMatchObject({
      error: { code: 'PAYMENT_HISTORY_INVALID' },
      ok: false,
    });
  });

  it('rejects any digest binding copied from another action', () => {
    expect(
      validateDigestBindings(ACTION_DIGEST, [
        { actionDigest: ACTION_DIGEST, source: 'approval' },
        { actionDigest: 'b'.repeat(64), source: 'verification' },
      ]),
    ).toMatchObject({
      error: { code: 'ACTION_DIGEST_MISMATCH' },
      ok: false,
    });
  });
});

describe('standing-mandate capacity', () => {
  it('reserves, settles, and releases only canonical capacity', () => {
    const reserved = reserveMandateCapacity({
      candidateAtoms: '25',
      periodCapAtoms: '100',
      reservedAtoms: '15',
      settledAtoms: '10',
    });
    expect(reserved).toEqual({
      ok: true,
      value: {
        periodCapAtoms: '100',
        reservedAtoms: '40',
        settledAtoms: '10',
      },
    });
    if (!reserved.ok) {
      throw new Error('fixture reservation must succeed');
    }

    expect(settleMandateReservation(reserved.value, '25')).toEqual({
      ok: true,
      value: {
        periodCapAtoms: '100',
        reservedAtoms: '15',
        settledAtoms: '35',
      },
    });
    expect(releaseMandateReservation(reserved.value, '25')).toEqual({
      ok: true,
      value: {
        periodCapAtoms: '100',
        reservedAtoms: '15',
        settledAtoms: '10',
      },
    });
  });

  it('accepts aggregate reservations exactly up to the period cap', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ max: 1_000_000n, min: 0n }),
        fc.bigInt({ max: 1_000_000n, min: 0n }),
        fc.bigInt({ max: 1_000_000n, min: 1n }),
        (settled, alreadyReserved, candidate) => {
          const cap = settled + alreadyReserved + candidate;
          expect(
            reserveMandateCapacity({
              candidateAtoms: candidate.toString(),
              periodCapAtoms: cap.toString(),
              reservedAtoms: alreadyReserved.toString(),
              settledAtoms: settled.toString(),
            }),
          ).toMatchObject({ ok: true });
        },
      ),
    );
  });

  it('refuses aggregate reservations that exceed the period cap', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ max: 1_000_000n, min: 1n }),
        fc.bigInt({ max: 1_000_000n, min: 0n }),
        fc.bigInt({ max: 1_000_000n, min: 1n }),
        (settled, alreadyReserved, candidate) => {
          const cap = settled + alreadyReserved + candidate - 1n;
          expect(
            reserveMandateCapacity({
              candidateAtoms: candidate.toString(),
              periodCapAtoms: cap.toString(),
              reservedAtoms: alreadyReserved.toString(),
              settledAtoms: settled.toString(),
            }),
          ).toMatchObject({
            error: { code: 'MANDATE_CAP_EXCEEDED' },
            ok: false,
          });
        },
      ),
    );
  });

  it('returns a refusal instead of throwing for arbitrary atom strings', () => {
    fc.assert(
      fc.property(fc.string(), (candidateAtoms) => {
        expect(() =>
          reserveMandateCapacity({
            candidateAtoms,
            periodCapAtoms: '100',
            reservedAtoms: '0',
            settledAtoms: '0',
          }),
        ).not.toThrow();
      }),
    );
  });
});
