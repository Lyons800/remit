/**
 * Synthetic product scenario for the client-side demonstration.
 *
 * These records illustrate the intended AP workflow. They are not control-API
 * projections, World proofs, sponsor receipts, or evidence of value movement.
 * Live Hedera facts are fetched separately by mirror-evidence.server.ts.
 */

export type QueueStatus = 'policy_eligible' | 'review_required';

export interface QueueInvoice {
  readonly amount: string;
  readonly handledBy: string;
  readonly id: string;
  readonly status: QueueStatus;
  readonly supplier: string;
}

export const HELD_INVOICE_ID = 'INV-2026-0912';

export const initialQueue: readonly QueueInvoice[] = [
  {
    amount: '€312.40',
    handledBy: 'Within the illustrative standing mandate',
    id: 'INV-2026-0916',
    status: 'policy_eligible',
    supplier: 'Águas do Sado',
  },
  {
    amount: '€1,840.06',
    handledBy: 'Within the illustrative standing mandate',
    id: 'INV-2026-0915',
    status: 'policy_eligible',
    supplier: 'EDP Comercial',
  },
  {
    amount: '€25,000.00',
    handledBy: 'Beneficiary changed · two distinct approvers required',
    id: HELD_INVOICE_ID,
    status: 'review_required',
    supplier: 'Padel Surfaces Lda',
  },
  {
    amount: '€4,118.75',
    handledBy: 'First supplier payment · two approvers required',
    id: 'INV-2026-0910',
    status: 'review_required',
    supplier: 'Sport Import Iberia',
  },
];

/** Extra rows added synchronously by the client-side scenario control. */
export const dayInvoices: readonly QueueInvoice[] = [
  {
    amount: '€960.00',
    handledBy: 'Within the illustrative standing mandate',
    id: 'INV-2026-0914',
    status: 'policy_eligible',
    supplier: 'CleanCourt Serviços',
  },
  {
    amount: '€214.90',
    handledBy: 'Within the illustrative standing mandate',
    id: 'INV-2026-0913',
    status: 'policy_eligible',
    supplier: 'NovaRede Telecom',
  },
  {
    amount: '€733.12',
    handledBy: 'Within the illustrative standing mandate',
    id: 'INV-2026-0911',
    status: 'policy_eligible',
    supplier: 'Iberdrola Clientes',
  },
  {
    amount: '€1,102.30',
    handledBy: 'Within the illustrative standing mandate',
    id: 'INV-2026-0909',
    status: 'policy_eligible',
    supplier: 'LimpoSete Facilities',
  },
  {
    amount: '€89.99',
    handledBy: 'Within the illustrative standing mandate',
    id: 'INV-2026-0908',
    status: 'policy_eligible',
    supplier: 'MB Way Serviços',
  },
];

/* Approval simulation. No reducer transition calls a sponsor or moves value. */

export type ApproverId = 'A1' | 'A2' | 'B1';

export interface Approver {
  readonly detail: string;
  readonly humanClass: 'scenario-human-1' | 'scenario-human-2';
  readonly id: ApproverId;
  readonly label: string;
}

export const approvers: readonly Approver[] = [
  {
    detail: 'Illustrative treasury delegate · agent A1',
    humanClass: 'scenario-human-1',
    id: 'A1',
    label: 'Ana Ferreira',
  },
  {
    detail: 'Illustrative second agent backed by Ana',
    humanClass: 'scenario-human-1',
    id: 'A2',
    label: 'Ana Ferreira',
  },
  {
    detail: 'Illustrative finance delegate · agent B1',
    humanClass: 'scenario-human-2',
    id: 'B1',
    label: 'Miguel Santos',
  },
];

export type Phase = 'QUORUM_PENDING' | 'QUORUM_REACHED' | 'VOIDED';

export interface TheatreState {
  readonly counted: readonly ApproverId[];
  readonly digest: string;
  readonly log: readonly string[];
  readonly phase: Phase;
  readonly tampered: boolean;
}

export const ORIGINAL_DIGEST =
  '9c41f2ab6d0e33175c08b4be21d67a90e5f4c2d81a7b30964efc1259ade0e7b2';
export const TAMPERED_DIGEST =
  '3e78d90c145ab2f6e01c74d3982bf6541da0c8e26b95f31708ecd44a1f52c903';

export function createInitialTheatre(
  digest: string = ORIGINAL_DIGEST,
): TheatreState {
  return {
    counted: [],
    digest,
    log: [],
    phase: 'QUORUM_PENDING',
    tampered: false,
  };
}

export const initialTheatre = createInitialTheatre();

export type TheatreAction =
  | { readonly approver: ApproverId; readonly type: 'approve' }
  | { readonly digest: string; readonly type: 'reset' }
  | { readonly digest: string; readonly type: 'tamper' };

export function theatreReducer(
  state: TheatreState,
  action: TheatreAction,
): TheatreState {
  switch (action.type) {
    case 'approve': {
      if (state.phase !== 'QUORUM_PENDING' || state.tampered) return state;
      const approver = approvers.find(({ id }) => id === action.approver);
      if (approver === undefined || state.counted.includes(approver.id)) {
        return state;
      }

      const sameHumanAlreadyCounted = state.counted.some(
        (id) =>
          approvers.find((candidate) => candidate.id === id)?.humanClass ===
          approver.humanClass,
      );
      if (sameHumanAlreadyCounted) {
        return {
          ...state,
          log: [
            ...state.log,
            `${approver.id} refused by the simulation: same backing class as an existing approval. Quorum stays ${state.counted.length}/2.`,
          ],
        };
      }

      const counted = [...state.counted, approver.id];
      const quorumReached = counted.length === 2;
      return {
        ...state,
        counted,
        log: [
          ...state.log,
          `${approver.id} counted in the synthetic scenario as backing class ${counted.length}/2.`,
          ...(quorumReached
            ? [
                'Scenario quorum reached. No World proof, x402 call, or supplier payment was executed.',
              ]
            : []),
        ],
        phase: quorumReached ? 'QUORUM_REACHED' : 'QUORUM_PENDING',
      };
    }
    case 'reset':
      return createInitialTheatre(action.digest);
    case 'tamper':
      if (state.phase === 'VOIDED') return state;
      return {
        ...state,
        counted: [],
        digest: action.digest,
        log: [
          ...state.log,
          'Simulation: one beneficiary character changed, producing a new digest. Prior simulated approvals no longer apply; no external effect ran.',
        ],
        phase: 'VOIDED',
        tampered: true,
      };
  }
}

/* Synthetic product fixtures. */

export interface Supplier {
  readonly accountOnFile: string;
  readonly id: string;
  readonly lastScenarioActivity: string;
  readonly name: string;
  readonly scenarioInvoiceCount: number;
  readonly standing: 'flagged' | 'new' | 'trusted';
  readonly unattendedCap: string;
}

export const suppliers: readonly Supplier[] = [
  {
    accountOnFile: 'PT50 ···· ···· 9015 4',
    id: 'SUP-4471',
    lastScenarioActivity: '28 Jun 2026',
    name: 'Padel Surfaces Lda',
    scenarioInvoiceCount: 14,
    standing: 'flagged',
    unattendedCap: '€5,000.00',
  },
  {
    accountOnFile: 'PT44 ···· ···· 2201 8',
    id: 'SUP-1180',
    lastScenarioActivity: '21 Jul 2026',
    name: 'EDP Comercial',
    scenarioInvoiceCount: 31,
    standing: 'trusted',
    unattendedCap: '€2,500.00',
  },
  {
    accountOnFile: 'PT19 ···· ···· 8834 2',
    id: 'SUP-2044',
    lastScenarioActivity: '25 Jul 2026',
    name: 'Águas do Sado',
    scenarioInvoiceCount: 27,
    standing: 'trusted',
    unattendedCap: '€1,000.00',
  },
  {
    accountOnFile: 'PT71 ···· ···· 4472 6',
    id: 'SUP-3308',
    lastScenarioActivity: '24 Jul 2026',
    name: 'CleanCourt Serviços',
    scenarioInvoiceCount: 18,
    standing: 'trusted',
    unattendedCap: '€2,000.00',
  },
  {
    accountOnFile: '— none on file —',
    id: 'SUP-5512',
    lastScenarioActivity: 'never',
    name: 'Sport Import Iberia',
    scenarioInvoiceCount: 0,
    standing: 'new',
    unattendedCap: '€0 until first approval',
  },
  {
    accountOnFile: 'PT02 ···· ···· 6619 3',
    id: 'SUP-2871',
    lastScenarioActivity: '19 Jul 2026',
    name: 'NovaRede Telecom',
    scenarioInvoiceCount: 22,
    standing: 'trusted',
    unattendedCap: '€1,500.00',
  },
];

export interface AuditEvent {
  readonly actor: string;
  readonly at: string;
  readonly kind: 'allow' | 'info' | 'refuse';
  readonly text: string;
}

export const auditEvents: readonly AuditEvent[] = [
  {
    actor: 'policy',
    at: 'step 01',
    kind: 'refuse',
    text: 'Scenario: INV-2026-0912 routes to review because its beneficiary differs from the supplier baseline.',
  },
  {
    actor: 'world',
    at: 'step 02',
    kind: 'refuse',
    text: 'Scenario: A2 would not add quorum because A1 and A2 share one backing class. The World adapter is offline.',
  },
  {
    actor: 'policy',
    at: 'step 03',
    kind: 'allow',
    text: 'Scenario: INV-2026-0916 is eligible under the illustrative standing mandate. No payment is initiated.',
  },
  {
    actor: 'policy',
    at: 'step 04',
    kind: 'refuse',
    text: 'Scenario: INV-2026-0910 routes to review because no supplier payment baseline exists.',
  },
  {
    actor: 'protocol',
    at: 'step 05',
    kind: 'info',
    text: 'Design invariant: a changed beneficiary creates a different bare 64-hex canonical action digest.',
  },
];

export interface PolicyRule {
  readonly outcome: string;
  readonly rationale: string;
  readonly trigger: string;
}

export const POLICY_VERSION = 'scenario-policy-3';

export const policyRules: readonly PolicyRule[] = [
  {
    outcome: 'Review required · two distinct humans',
    rationale:
      'Changing the beneficiary changes where this payment would send value.',
    trigger: 'Beneficiary differs from the supplier snapshot',
  },
  {
    outcome: 'Review required · two distinct humans',
    rationale: 'No governed payment baseline exists yet.',
    trigger: 'Supplier has no prior approved payment baseline',
  },
  {
    outcome: 'Review required · two distinct humans',
    rationale: 'The proposed amount leaves the unattended mandate envelope.',
    trigger: 'Amount exceeds the supplier mandate cap',
  },
  {
    outcome: 'Eligible for unattended execution',
    rationale:
      'Deterministic inputs are contained by the illustrative standing mandate.',
    trigger: 'Known supplier · unchanged beneficiary · within cap',
  },
];
