import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createAdapterVerifiedApprovalFact,
  createMandateReservationLedger,
  createPaymentHistoryProjection,
  deriveMandateReservationTotals,
  releaseMandateReservation,
  reserveMandateCapacity,
  settleMandateReservation,
  validateActiveMandateReservation,
  validateApprovalQuorum,
  validateDigestBindings,
  validateInvoiceActionBinding,
  validateInvoiceRevisionLineage,
  validateMandateVersionBinding,
  validateNewPaymentActionEligibility,
  validatePaymentHistory,
  validateSettlementClaim,
  type AdapterVerifiedApprovalFact,
  type AdapterVerifiedApprovalFactCore,
  type MandateReservationClaim,
  type MandateReservationLedger,
} from '../src/index.js';

const ACTION_DIGEST = 'a'.repeat(64);
const APPROVAL_NOW = '2026-07-25T10:00:00.000Z';
const APPROVAL_BINDING = {
  actionDigest: ACTION_DIGEST,
  actionId: 'action-1',
  invoiceRevisionId: 'invoice-revision-1',
  minimumVerifiedAt: '2026-07-25T09:58:00.000Z',
  nonce: '0123456789abcdef0123456789abcdef',
  obligationId: 'obligation-1',
  organizationId: 'organization-1',
} as const;

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
  createAdapterVerifiedApprovalFact({
    actionDigest: ACTION_DIGEST,
    actionHumanPrincipal: 'human-1',
    actionId: APPROVAL_BINDING.actionId,
    adapterId: 'world-adapter',
    agentBackingRecordId: 'agent-backing-1',
    agentBackingStatus: 'CURRENT',
    agentTenantPrincipal: 'agent-1',
    agentKitChallengeId: 'agentkit-challenge-1',
    approvalId: 'approval-1',
    approvalSessionId: 'approval-session-1',
    companyRoleStatus: 'CURRENT',
    consumptionClaimId: 'approval-consumption-1',
    decision: 'APPROVE',
    decisionId: 'decision-1',
    expiresAt: '2026-07-25T10:05:00.000Z',
    humanDecisionStatus: 'VERIFIED',
    invoiceRevisionId: APPROVAL_BINDING.invoiceRevisionId,
    kind: 'APPROVAL_FACT',
    nonce: APPROVAL_BINDING.nonce,
    obligationId: APPROVAL_BINDING.obligationId,
    organizationId: APPROVAL_BINDING.organizationId,
    role: 'FINANCE_APPROVER',
    roleCredentialId: 'role-credential-1',
    signedProofDigest: '1'.repeat(64),
    subjectId: 'subject-1',
    verifiedAt: '2026-07-25T09:59:00.000Z',
    worldProofId: 'world-proof-1',
  }),
  createAdapterVerifiedApprovalFact({
    actionDigest: ACTION_DIGEST,
    actionHumanPrincipal: 'human-2',
    actionId: APPROVAL_BINDING.actionId,
    adapterId: 'world-adapter',
    agentBackingRecordId: 'agent-backing-2',
    agentBackingStatus: 'CURRENT',
    agentTenantPrincipal: 'agent-2',
    agentKitChallengeId: 'agentkit-challenge-2',
    approvalId: 'approval-2',
    approvalSessionId: 'approval-session-2',
    companyRoleStatus: 'CURRENT',
    consumptionClaimId: 'approval-consumption-2',
    decision: 'APPROVE',
    decisionId: 'decision-2',
    expiresAt: '2026-07-25T10:05:00.000Z',
    humanDecisionStatus: 'VERIFIED',
    invoiceRevisionId: APPROVAL_BINDING.invoiceRevisionId,
    kind: 'APPROVAL_FACT',
    nonce: APPROVAL_BINDING.nonce,
    obligationId: APPROVAL_BINDING.obligationId,
    organizationId: APPROVAL_BINDING.organizationId,
    role: 'TREASURY_APPROVER',
    roleCredentialId: 'role-credential-2',
    signedProofDigest: '2'.repeat(64),
    subjectId: 'subject-2',
    verifiedAt: '2026-07-25T09:59:00.000Z',
    worldProofId: 'world-proof-2',
  }),
] as const;

function mutateApproval(
  fact: AdapterVerifiedApprovalFact,
  overrides: Partial<AdapterVerifiedApprovalFactCore>,
): AdapterVerifiedApprovalFact {
  const { recordDigest, ...core } = fact;
  void recordDigest;
  return createAdapterVerifiedApprovalFact({ ...core, ...overrides });
}

describe('approval quorum', () => {
  it('accepts exact, independently distinct approvals', () => {
    expect(
      validateApprovalQuorum(
        APPROVAL_BINDING,
        approvalRequirement,
        approvals,
        APPROVAL_NOW,
      ),
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
      mutateApproval(approvals[1], {
        approvalId: 'approval-3',
        actionHumanPrincipal: 'human-3',
        agentBackingRecordId: 'agent-backing-3',
        agentTenantPrincipal: 'agent-3',
        agentKitChallengeId: 'agentkit-challenge-3',
        consumptionClaimId: 'approval-consumption-3',
        decisionId: 'decision-3',
        approvalSessionId: 'approval-session-3',
        roleCredentialId: 'role-credential-3',
        signedProofDigest: '3'.repeat(64),
        subjectId: 'subject-3',
        worldProofId: 'world-proof-3',
      }),
    ];

    expect(
      validateApprovalQuorum(
        APPROVAL_BINDING,
        requirement,
        polluted,
        APPROVAL_NOW,
      ),
    ).toMatchObject({
      error: { code: 'REPLAY_DETECTED' },
      ok: false,
    });
  });

  it('rejects cross-action approvals and invalid requirements', () => {
    expect(
      validateApprovalQuorum(
        APPROVAL_BINDING,
        approvalRequirement,
        [
          mutateApproval(approvals[0], {
            actionDigest: 'b'.repeat(64),
          }),
          approvals[1],
        ],
        APPROVAL_NOW,
      ),
    ).toMatchObject({
      error: { code: 'ACTION_DIGEST_MISMATCH' },
      ok: false,
    });

    expect(
      validateApprovalQuorum(
        APPROVAL_BINDING,
        { ...approvalRequirement, actionHumanQuorum: -1 },
        approvals,
        APPROVAL_NOW,
      ),
    ).toMatchObject({
      error: { code: 'APPROVAL_REQUIREMENT_INVALID' },
      ok: false,
    });
  });

  it('rejects evidence for a role the policy did not request', () => {
    expect(
      validateApprovalQuorum(
        APPROVAL_BINDING,
        approvalRequirement,
        [
          ...approvals,
          createAdapterVerifiedApprovalFact({
            actionDigest: ACTION_DIGEST,
            actionHumanPrincipal: 'human-3',
            actionId: APPROVAL_BINDING.actionId,
            adapterId: 'world-adapter',
            agentBackingRecordId: 'agent-backing-3',
            agentBackingStatus: 'CURRENT',
            agentTenantPrincipal: 'agent-3',
            agentKitChallengeId: 'agentkit-challenge-3',
            approvalId: 'approval-3',
            approvalSessionId: 'approval-session-3',
            companyRoleStatus: 'CURRENT',
            consumptionClaimId: 'approval-consumption-3',
            decision: 'APPROVE',
            decisionId: 'decision-3',
            expiresAt: '2026-07-25T10:05:00.000Z',
            humanDecisionStatus: 'VERIFIED',
            invoiceRevisionId: APPROVAL_BINDING.invoiceRevisionId,
            kind: 'APPROVAL_FACT',
            nonce: APPROVAL_BINDING.nonce,
            obligationId: APPROVAL_BINDING.obligationId,
            organizationId: APPROVAL_BINDING.organizationId,
            role: 'OBSERVER',
            roleCredentialId: 'role-credential-3',
            signedProofDigest: '3'.repeat(64),
            subjectId: 'subject-3',
            verifiedAt: '2026-07-25T09:59:00.000Z',
            worldProofId: 'world-proof-3',
          }),
        ],
        APPROVAL_NOW,
      ),
    ).toMatchObject({
      error: { code: 'ROLE_UNEXPECTED' },
      ok: false,
    });
  });

  it('rejects malformed, stale, revoked, and unverified approval facts', () => {
    for (const malformed of [
      { ...approvals[0], actionDigest: 'not-a-digest' },
      { ...approvals[0], actionHumanPrincipal: '' },
      { ...approvals[0], agentTenantPrincipal: '' },
      { ...approvals[0], role: '' },
      { ...approvals[0], subjectId: '' },
    ]) {
      expect(
        validateApprovalQuorum(
          APPROVAL_BINDING,
          approvalRequirement,
          [malformed, approvals[1]],
          APPROVAL_NOW,
        ),
      ).toMatchObject({
        error: { code: 'APPROVAL_FACT_INVALID' },
        ok: false,
      });
    }
    expect(
      validateApprovalQuorum(
        APPROVAL_BINDING,
        approvalRequirement,
        [
          mutateApproval(approvals[0], {
            expiresAt: APPROVAL_NOW,
          }),
          approvals[1],
        ],
        APPROVAL_NOW,
      ),
    ).toMatchObject({
      error: { code: 'APPROVAL_STALE' },
      ok: false,
    });
    expect(
      validateApprovalQuorum(
        APPROVAL_BINDING,
        approvalRequirement,
        [
          mutateApproval(approvals[0], {
            companyRoleStatus: 'REVOKED',
          }),
          approvals[1],
        ],
        APPROVAL_NOW,
      ),
    ).toMatchObject({
      error: { code: 'ROLE_REVOKED' },
      ok: false,
    });
    expect(
      validateApprovalQuorum(
        APPROVAL_BINDING,
        approvalRequirement,
        [
          mutateApproval(approvals[0], {
            agentBackingStatus: 'UNVERIFIED',
          }),
          approvals[1],
        ],
        APPROVAL_NOW,
      ),
    ).toMatchObject({
      error: { code: 'AGENT_BACKING_UNVERIFIED' },
      ok: false,
    });
    expect(
      validateApprovalQuorum(
        APPROVAL_BINDING,
        approvalRequirement,
        [
          mutateApproval(approvals[0], {
            humanDecisionStatus: 'REPLAYED',
          }),
          approvals[1],
        ],
        APPROVAL_NOW,
      ),
    ).toMatchObject({
      error: { code: 'REPLAY_DETECTED' },
      ok: false,
    });
  });

  it('caps adapter-verified facts and role requirements', () => {
    expect(
      validateApprovalQuorum(
        APPROVAL_BINDING,
        approvalRequirement,
        Array.from({ length: 256 }, () => approvals[0]),
        APPROVAL_NOW,
      ),
    ).toMatchObject({
      error: { code: 'APPROVAL_FACT_INVALID' },
      ok: false,
    });

    expect(
      validateApprovalQuorum(
        APPROVAL_BINDING,
        {
          ...approvalRequirement,
          roles: Array.from({ length: 256 }, (_, index) => ({
            count: 1,
            role: `ROLE_${index}`,
          })),
        },
        approvals,
        APPROVAL_NOW,
      ),
    ).toMatchObject({
      error: { code: 'APPROVAL_REQUIREMENT_INVALID' },
      ok: false,
    });
  });

  it('rejects approvals verified before the frozen policy evaluation', () => {
    expect(
      validateApprovalQuorum(
        { ...APPROVAL_BINDING, minimumVerifiedAt: APPROVAL_NOW },
        approvalRequirement,
        approvals,
        APPROVAL_NOW,
      ),
    ).toMatchObject({
      error: { code: 'APPROVAL_FACT_INVALID' },
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
    expect(
      validateInvoiceRevisionLineage(
        { ...previous, createdAt: 'not-an-instant' },
        candidate,
      ),
    ).toMatchObject({
      error: { code: 'INVOICE_REVISION_CONFLICT' },
      ok: false,
    });
    expect(
      validateInvoiceRevisionLineage(previous, {
        ...candidate,
        createdAt: '2026-07-25T11:01:00+01:00',
      }),
    ).toMatchObject({
      error: { code: 'INVOICE_REVISION_CONFLICT' },
      ok: false,
    });
  });

  it('separates history validation from new-action and settlement claims', () => {
    const binding = {
      actionDigest: ACTION_DIGEST,
      actionId: 'action-1',
      idempotencyKey: `invoiceguard:settlement:v1:${ACTION_DIGEST}`,
      invoiceRevisionId: 'invoice-revision-1',
      nonce: APPROVAL_BINDING.nonce,
      obligationId: 'obligation-1',
      organizationId: 'organization-1',
    } as const;
    const projection = (
      overrides: Partial<
        Parameters<typeof createPaymentHistoryProjection>[0]
      > = {},
    ) =>
      createPaymentHistoryProjection({
        ...binding,
        adapterId: 'postgres-payment-history',
        consumedIdempotencyKeys: [],
        kind: 'PAYMENT_HISTORY_PROJECTION',
        nonTerminalActionIds: [],
        projectionId: 'payment-history-1',
        settledActionIds: [],
        settledReceiptIds: [],
        verifiedAt: APPROVAL_NOW,
        ...overrides,
      });

    expect(
      validatePaymentHistory(
        binding,
        projection({
          consumedIdempotencyKeys: [binding.idempotencyKey],
          nonTerminalActionIds: [binding.actionId],
          settledActionIds: [binding.actionId],
          settledReceiptIds: ['receipt-1'],
        }),
      ).ok,
    ).toBe(true);

    expect(
      validateNewPaymentActionEligibility(
        binding,
        projection({
          settledActionIds: ['action-previous'],
          settledReceiptIds: ['receipt-previous'],
        }),
      ),
    ).toMatchObject({
      error: { code: 'OBLIGATION_ALREADY_SETTLED' },
      ok: false,
    });

    expect(
      validateSettlementClaim(
        binding,
        projection({
          consumedIdempotencyKeys: [binding.idempotencyKey],
          nonTerminalActionIds: [binding.actionId],
          settledActionIds: [binding.actionId],
          settledReceiptIds: ['receipt-1'],
        }),
      ),
    ).toMatchObject({
      error: { code: 'ACTION_ALREADY_CONSUMED' },
      ok: false,
    });

    const valid = projection();
    expect(
      validatePaymentHistory(binding, {
        ...valid,
        nonTerminalActionIds: ['action-1', 'action-1'],
      }),
    ).toMatchObject({
      error: { code: 'PAYMENT_HISTORY_INVALID' },
      ok: false,
    });

    expect(
      validatePaymentHistory(
        { ...binding, obligationId: 'other-obligation' },
        valid,
      ),
    ).toMatchObject({
      error: { code: 'PAYMENT_HISTORY_BINDING_MISMATCH' },
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
  const claim = (
    actionDigest: string,
    settlementAmountAtoms: string,
    overrides: Partial<MandateReservationClaim> = {},
  ): MandateReservationClaim => ({
    actionDigest,
    mandateDigest: 'd'.repeat(64),
    mandateId: 'mandate-1',
    mandateVersion: 3,
    periodCapAtoms: '100',
    periodKey: 'UTC_MONTH:2026-07',
    settlementAmountAtoms,
    ...overrides,
  });

  function emptyLedger(
    reservationClaim: MandateReservationClaim,
  ): MandateReservationLedger {
    const result = createMandateReservationLedger(reservationClaim);
    if (!result.ok) {
      throw new Error('fixture ledger must be valid');
    }
    return result.value;
  }

  it('rejects a different digest for the same mandate version identity', () => {
    const existing = {
      mandateDigest: 'a'.repeat(64),
      mandateId: 'mandate-1',
      mandateVersion: 3,
      organizationId: 'organization-1',
    } as const;
    expect(validateMandateVersionBinding([existing], existing)).toEqual({
      ok: true,
      value: existing,
    });
    expect(
      validateMandateVersionBinding([existing], {
        ...existing,
        mandateDigest: 'b'.repeat(64),
      }),
    ).toMatchObject({
      error: { code: 'MANDATE_VERSION_DIGEST_CONFLICT' },
      ok: false,
    });
  });

  it('makes exact reserve and terminal retries idempotent', () => {
    const reservationClaim = claim('1'.repeat(64), '25');
    const initial = emptyLedger(reservationClaim);
    const reserved = reserveMandateCapacity(initial, reservationClaim);
    expect(reserved).toMatchObject({
      ok: true,
      value: {
        reservation: { amountAtoms: '25', status: 'RESERVED' },
        totals: {
          releasedAtoms: '0',
          reservedAtoms: '25',
          settledAtoms: '0',
        },
      },
    });
    if (!reserved.ok) {
      throw new Error('fixture reservation must succeed');
    }

    expect(
      reserveMandateCapacity(reserved.value.ledger, reservationClaim),
    ).toEqual(reserved);

    const settled = settleMandateReservation(
      reserved.value.ledger,
      reservationClaim,
    );
    expect(settled).toMatchObject({
      ok: true,
      value: {
        reservation: { amountAtoms: '25', status: 'SETTLED' },
        totals: {
          releasedAtoms: '0',
          reservedAtoms: '0',
          settledAtoms: '25',
        },
      },
    });
    if (!settled.ok) {
      throw new Error('fixture settlement must succeed');
    }

    expect(
      settleMandateReservation(settled.value.ledger, reservationClaim),
    ).toEqual(settled);
    expect(
      releaseMandateReservation(settled.value.ledger, reservationClaim),
    ).toMatchObject({
      error: { code: 'MANDATE_RESERVATION_TERMINAL' },
      ok: false,
    });
  });

  it('proves replaying release A cannot erase reservation B', () => {
    const claimA = claim('1'.repeat(64), '25');
    const claimB = claim('2'.repeat(64), '40');
    const initial = emptyLedger(claimA);
    const reservedA = reserveMandateCapacity(initial, claimA);
    if (!reservedA.ok) {
      throw new Error('reservation A must succeed');
    }
    const reservedB = reserveMandateCapacity(reservedA.value.ledger, claimB);
    if (!reservedB.ok) {
      throw new Error('reservation B must succeed');
    }
    const releasedA = releaseMandateReservation(reservedB.value.ledger, claimA);
    if (!releasedA.ok) {
      throw new Error('release A must succeed');
    }

    const replayedA = releaseMandateReservation(releasedA.value.ledger, claimA);
    expect(replayedA).toEqual(releasedA);
    expect(
      validateActiveMandateReservation(releasedA.value.ledger, claimB),
    ).toEqual({
      ok: true,
      value: {
        actionDigest: claimB.actionDigest,
        amountAtoms: claimB.settlementAmountAtoms,
        status: 'RESERVED',
      },
    });
    expect(deriveMandateReservationTotals(releasedA.value.ledger)).toEqual({
      ok: true,
      value: {
        releasedAtoms: '25',
        reservedAtoms: '40',
        settledAtoms: '0',
      },
    });
  });

  it('rejects conflicting action reuse, wrong keys, and unknown actions', () => {
    const original = claim('1'.repeat(64), '25');
    const reserved = reserveMandateCapacity(emptyLedger(original), original);
    if (!reserved.ok) {
      throw new Error('fixture reservation must succeed');
    }

    expect(
      reserveMandateCapacity(
        reserved.value.ledger,
        claim(original.actionDigest, '26'),
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_RESERVATION_CONFLICT' },
      ok: false,
    });
    expect(
      reserveMandateCapacity(
        reserved.value.ledger,
        claim('2'.repeat(64), '25', { mandateVersion: 4 }),
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_RESERVATION_KEY_MISMATCH' },
      ok: false,
    });
    expect(
      settleMandateReservation(
        reserved.value.ledger,
        claim('2'.repeat(64), '25'),
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_RESERVATION_NOT_FOUND' },
      ok: false,
    });
  });

  it('derives totals and accepts aggregate reservations exactly to the cap', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ max: 100_000n, min: 1n }),
        fc.bigInt({ max: 100_000n, min: 1n }),
        fc.bigInt({ max: 100_000n, min: 1n }),
        (settled, alreadyReserved, candidate) => {
          const cap = settled + alreadyReserved + candidate;
          const shared = { periodCapAtoms: cap.toString() };
          const settledClaim = claim(
            '1'.repeat(64),
            settled.toString(),
            shared,
          );
          const reservedClaim = claim(
            '2'.repeat(64),
            alreadyReserved.toString(),
            shared,
          );
          const candidateClaim = claim(
            '3'.repeat(64),
            candidate.toString(),
            shared,
          );
          const first = reserveMandateCapacity(
            emptyLedger(settledClaim),
            settledClaim,
          );
          if (!first.ok) {
            return false;
          }
          const firstSettled = settleMandateReservation(
            first.value.ledger,
            settledClaim,
          );
          if (!firstSettled.ok) {
            return false;
          }
          const second = reserveMandateCapacity(
            firstSettled.value.ledger,
            reservedClaim,
          );
          if (!second.ok) {
            return false;
          }

          return reserveMandateCapacity(second.value.ledger, candidateClaim).ok;
        },
      ),
    );
  });

  it('refuses a reservation that would exceed the derived period total', () => {
    const firstClaim = claim('1'.repeat(64), '60');
    const secondClaim = claim('2'.repeat(64), '41');
    const first = reserveMandateCapacity(emptyLedger(firstClaim), firstClaim);
    if (!first.ok) {
      throw new Error('fixture reservation must succeed');
    }

    expect(
      reserveMandateCapacity(first.value.ledger, secondClaim),
    ).toMatchObject({
      error: { code: 'MANDATE_CAP_EXCEEDED' },
      ok: false,
    });
  });

  it('returns refusals instead of throwing for arbitrary persisted values', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (ledger, reservationClaim) => {
        expect(() =>
          reserveMandateCapacity(ledger, reservationClaim),
        ).not.toThrow();
        expect(() =>
          settleMandateReservation(ledger, reservationClaim),
        ).not.toThrow();
        expect(() =>
          releaseMandateReservation(ledger, reservationClaim),
        ).not.toThrow();
      }),
    );
  });
});
