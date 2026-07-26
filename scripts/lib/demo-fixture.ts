/**
 * Demo fixtures — valid product objects, nothing bespoke.
 *
 * Every value here is parsed by the shipped schemas before it reaches the
 * demo, so a fixture that drifts out of contract fails loudly rather than
 * quietly demonstrating something the product does not actually do.
 *
 * Timestamps are fixed rather than derived from the clock: the demo has to
 * produce the same digests on every run so a recorded video and a live run
 * can be compared line for line.
 */

import type { ApprovalRequirement } from '@remit/domain';
import { createAdapterVerifiedApprovalFact } from '@remit/domain';
import { paymentActionCoreV1Schema } from '@remit/protocol';
import type { PaymentActionCoreV1 } from '@remit/protocol';

export interface DemoApprover {
  readonly label: string;
  readonly address: string;
  readonly role: string;
  readonly subject: string;
  readonly humanPrincipal: string;
  readonly simulated: boolean;
}

/* ── stable identifiers ──────────────────────────────────────────────── */

const ID_PREFIX = '019f939b-fe5e-7e92-b72e-8d45319';

/** Deterministic UUIDv7-shaped identifier; `slot` must be 5 hex characters. */
const id = (slot: string): string => `${ID_PREFIX}${slot}`;

const IDS = {
  action: id('58c30'),
  invoiceRevision: id('58c35'),
  obligation: id('58c32'),
  organization: id('58c33'),
  supplier: id('58c34'),
} as const;

const hex64 = (fill: string): string => fill.repeat(64).slice(0, 64);

const KNOWN_ACCOUNT = 'hedera:296:0.0.1000';
const ATTACKER_ACCOUNT = 'hedera:296:0.0.777777';

const CREATED_AT = '2026-07-26T00:00:00.000Z';
const EXPIRES_AT = '2026-07-26T23:00:00.000Z';
const EVALUATED_AT = '2026-07-26T00:00:01.000Z';
const VERIFIED_AT = '2026-07-26T01:00:00.000Z';
const NOW = '2026-07-26T02:00:00.000Z';

/* ── the two invoices ────────────────────────────────────────────────── */

function action(
  proposedAccount: string,
  amountAtoms: string,
  nonce: string,
): PaymentActionCoreV1 {
  return paymentActionCoreV1Schema.parse({
    actionId: IDS.action,
    beneficiary: {
      approved: { accountId: KNOWN_ACCOUNT, kind: 'CAIP_10' },
      proposed: { accountId: proposedAccount, kind: 'CAIP_10' },
    },
    createdAt: CREATED_AT,
    evidenceRoot: hex64('1'),
    expiresAt: EXPIRES_AT,
    nonce,
    organizationId: IDS.organization,
    policy: { id: 'routine-invoice-policy', version: 1 },
    requestType: 'SUPPLIER_INVOICE_PAYMENT',
    schemaVersion: 1,
    settlement: {
      amountAtoms,
      assetId: 'hedera:296/hts:0.0.9001',
      beneficiary: proposedAccount,
      mappingPolicyHash: hex64('2'),
      networkId: 'hedera:296',
    },
    sourceInvoice: {
      amountAtoms,
      assetId: 'iso4217:EUR',
      digest: hex64('3'),
      invoiceRevisionId: IDS.invoiceRevision,
      obligationId: IDS.obligation,
    },
    supplierId: IDS.supplier,
    supplierSnapshotDigest: hex64('8'),
  });
}

/**
 * Nonces are exported because an approval binds to the action's nonce, not to
 * a constant. Binding approvals to the wrong nonce would let an approval of
 * one action look valid against another.
 */
export const ROUTINE_NONCE = '0123456789abcdef0123456789abcdef';
export const CHANGED_NONCE = 'fedcba9876543210fedcba9876543210';

/** INV-2026-0911 — known supplier, unchanged account, EUR 480.00. */
export const routineAction = (): PaymentActionCoreV1 =>
  action(KNOWN_ACCOUNT, '48000', ROUTINE_NONCE);

/** INV-2026-0912 — same supplier, new account, EUR 25,000.00. */
export const changedBeneficiaryAction = (
  account: string = ATTACKER_ACCOUNT,
): PaymentActionCoreV1 =>
  action(
    account.startsWith('hedera:') ? account : `hedera:296:${account}`,
    '2500000',
    CHANGED_NONCE,
  );

/* ── policy ──────────────────────────────────────────────────────────── */

const POLICY_CONFIG = {
  executorAuthority: {
    adapterId: 'world-agentbook-adapter',
    agentBookRegistry: 'world-agentbook:eip155:480',
    audience: 'remit:settlement',
    grant: { digest: hex64('7'), id: 'payment-executor-grant', version: 1 },
    requiredRole: 'PAYMENT_EXECUTOR',
    requiredScope: 'payments:execute',
    subjectBinding: 'AGENT_ID',
    tenantBinding: 'ACTION_ORGANIZATION',
  },
  humanAuthority: {
    actionHumanQuorum: 2,
    agentBookQuorum: 2,
    companySubjectQuorum: 2,
    roles: [
      { count: 1, role: 'FINANCE_APPROVER' },
      { count: 1, role: 'TREASURY_APPROVER' },
    ],
  },
  humanEvidencePolicy: {
    digest: hex64('9'),
    id: 'changed-beneficiary-v1',
    serviceId: 'supplier-verifier-v1',
    serviceKeyId: 'supplier-verifier-key-1',
    serviceNetworkId: 'hedera:296',
    version: 1,
  },
  humanVerificationMode: 'REQUIRED',
  policy: { id: 'routine-invoice-policy', version: 1 },
  schemaVersion: 1,
} as const;

/** What the company's approval rules demand once an action escalates. */
export const humanAuthority: ApprovalRequirement = POLICY_CONFIG.humanAuthority;

const STANDING_MANDATE = {
  activeStatus: 'ACTIVE',
  evidencePolicy: {
    digest: hex64('9'),
    id: 'routine-supplier-v1',
    serviceId: 'supplier-verifier-v1',
    serviceKeyId: 'supplier-verifier-key-1',
    serviceNetworkId: 'hedera:296',
    version: 1,
  },
  exactContainment: true,
  periodCapAvailable: true,
  reference: {
    mandateDigest: hex64('5'),
    mandateId: id('58c31'),
    mandateVersion: 1,
  },
  sourceRequirement: { mode: 'AUTHENTICATED_OR_INDEPENDENTLY_CONFIRMED' },
  verificationMode: 'NOT_REQUIRED',
} as const;

/**
 * Build a policy evaluation request.
 *
 * `EXACT_MATCH` keeps the standing mandate in play and routes straight
 * through; `CHANGED` withdraws it, which is what forces human authority.
 */
export function policyInputFor(
  actionCoreDigest: string,
  beneficiaryStatus: 'CHANGED' | 'EXACT_MATCH',
): unknown {
  return {
    config: POLICY_CONFIG,
    input: {
      actionCoreDigest,
      actionCreatedAt: CREATED_AT,
      actionExpiresAt: EXPIRES_AT,
      amountStatus: 'WITHIN_MANDATE',
      assetStatus: 'SUPPORTED',
      beneficiaryStatus,
      duplicateStatus: 'CLEAR',
      evaluatedAt: EVALUATED_AT,
      extractionConflict: false,
      fieldsIndependentlyConfirmed: false,
      mandate: beneficiaryStatus === 'EXACT_MATCH' ? STANDING_MANDATE : null,
      mappingPolicyStatus: 'SUPPORTED',
      networkStatus: 'SUPPORTED',
      policyEnabled: true,
      purchaseOrder: {
        mode: 'EXACT_REFERENCE_AND_TOTAL',
        result: 'EXACT_REFERENCE_AND_TOTAL_MATCH',
      },
      schemaVersion: 1,
      sourceTrustClass: 'AUTHENTICATED_STRUCTURED',
      supplierFirstPayment: false,
      supplierMatch: 'EXACT',
      supplierStatus: 'ACTIVE',
    },
  };
}

/* ── approvals ───────────────────────────────────────────────────────── */

export interface DemoBinding {
  readonly actionDigest: string;
  readonly actionId: string;
  readonly invoiceRevisionId: string;
  readonly minimumVerifiedAt: string;
  readonly nonce: string;
  readonly obligationId: string;
  readonly organizationId: string;
}

/** The instant the demo evaluates quorum at. */
export const DEMO_NOW = NOW;

/**
 * The binding every approval of this action must match exactly.
 *
 * These seven keys are checked with `hasExactKeys`, so nothing may be added
 * here — an eighth field is rejected as a malformed binding rather than
 * ignored.
 */
export function actionBinding(
  actionDigest: string,
  nonce: string = CHANGED_NONCE,
): DemoBinding {
  return {
    actionDigest,
    actionId: IDS.action,
    invoiceRevisionId: IDS.invoiceRevision,
    minimumVerifiedAt: CREATED_AT,
    nonce,
    obligationId: IDS.obligation,
    organizationId: IDS.organization,
  };
}

/**
 * One approver's verified approval of one exact action.
 *
 * `slot` makes every single-use identifier distinct. Reusing a slot reproduces
 * a replayed approval, which the quorum validator refuses — that is act five.
 */
export function approvalFact(
  approver: DemoApprover,
  actionDigest: string,
  slot: number,
  nonce: string = CHANGED_NONCE,
): unknown {
  const s = String(slot);
  return createAdapterVerifiedApprovalFact({
    actionDigest,
    actionHumanPrincipal: approver.humanPrincipal,
    actionId: IDS.action,
    adapterId: 'world-agentbook-adapter',
    agentBackingRecordId: `agent-backing-${s}`,
    agentBackingStatus: 'CURRENT',
    agentTenantPrincipal: approver.address.toLowerCase(),
    agentKitChallengeId: `challenge-${s}`,
    approvalId: `approval-${s}`,
    approvalSessionId: `session-${s}`,
    companyRoleStatus: 'CURRENT',
    consumptionClaimId: `consumption-${s}`,
    decision: 'APPROVE',
    decisionId: `decision-${s}`,
    expiresAt: EXPIRES_AT,
    humanDecisionStatus: 'VERIFIED',
    invoiceRevisionId: IDS.invoiceRevision,
    kind: 'APPROVAL_FACT',
    nonce,
    obligationId: IDS.obligation,
    organizationId: IDS.organization,
    role: approver.role,
    roleCredentialId: `role-credential-${approver.subject}`,
    signedProofDigest: hex64(s),
    subjectId: approver.subject,
    verifiedAt: VERIFIED_AT,
    worldProofId: `world-proof-${s}`,
  });
}
