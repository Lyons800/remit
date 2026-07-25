/**
 * Demo data + the client-side state machine for the approval theatre.
 *
 * Synthetic and clearly labelled as such in the UI. The transitions mirror
 * packages/protocol's lifecycle; when the sponsor adapters go live these
 * fixtures are replaced by control-api reads, and the buttons by real calls.
 */

export type QueueStatus = 'paid' | 'held' | 'queued';

export interface QueueInvoice {
  readonly id: string;
  readonly supplier: string;
  readonly amount: string;
  readonly status: QueueStatus;
  readonly handledBy: string;
}

export const HELD_INVOICE_ID = 'INV-2026-0912';

export const initialQueue: readonly QueueInvoice[] = [
  { amount: '€312.40', handledBy: 'Agent — no review needed', id: 'INV-2026-0916', status: 'paid', supplier: 'Águas do Sado' },
  { amount: '€1,840.06', handledBy: 'Agent — no review needed', id: 'INV-2026-0915', status: 'paid', supplier: 'EDP Comercial' },
  { amount: '€25,000.00', handledBy: 'Bank account changed — 2 distinct approvers required', id: HELD_INVOICE_ID, status: 'held', supplier: 'Padel Surfaces Lda' },
  { amount: '€4,118.75', handledBy: 'First payment to this supplier — 2 distinct approvers required', id: 'INV-2026-0910', status: 'held', supplier: 'Sport Import Iberia' },
];

/** Invoices streamed in by the "Run the day" beat. */
export const dayInvoices: readonly QueueInvoice[] = [
  { amount: '€960.00', handledBy: 'Agent — no review needed', id: 'INV-2026-0914', status: 'paid', supplier: 'CleanCourt Serviços' },
  { amount: '€214.90', handledBy: 'Agent — no review needed', id: 'INV-2026-0913', status: 'paid', supplier: 'NovaRede Telecom' },
  { amount: '€733.12', handledBy: 'Agent — no review needed', id: 'INV-2026-0911', status: 'paid', supplier: 'Iberdrola Clientes' },
  { amount: '€1,102.30', handledBy: 'Agent — no review needed', id: 'INV-2026-0909', status: 'paid', supplier: 'LimpoSete Facilities' },
  { amount: '€89.99', handledBy: 'Agent — no review needed', id: 'INV-2026-0908', status: 'paid', supplier: 'MB Way Serviços' },
];

/* ── approval theatre ──────────────────────────────────────────────── */

export type ApproverId = 'A1' | 'A2' | 'B1';

export interface Approver {
  readonly id: ApproverId;
  readonly label: string;
  readonly detail: string;
  /** Anonymous human backer — A1 and A2 share one on purpose. */
  readonly humanId: 'human-1' | 'human-2';
}

export const approvers: readonly Approver[] = [
  { detail: 'Treasury · agent A1', humanId: 'human-1', id: 'A1', label: 'Ana Ferreira' },
  { detail: 'Treasury · agent A2 (Ana’s second agent)', humanId: 'human-1', id: 'A2', label: 'Ana Ferreira' },
  { detail: 'Finance · agent B1', humanId: 'human-2', id: 'B1', label: 'Miguel Santos' },
];

export type Phase =
  | 'QUORUM_PENDING'
  | 'VERIFYING'
  | 'SETTLING'
  | 'CONSUMED'
  | 'VOIDED';

export interface TheatreState {
  readonly phase: Phase;
  /** Approvals that counted, in order. */
  readonly counted: readonly ApproverId[];
  /** Refusals shown in the log, newest last. */
  readonly log: readonly string[];
  readonly digest: string;
  readonly tampered: boolean;
}

export const ORIGINAL_DIGEST =
  '0x9c41f2ab6d0e33175c08b4be21d67a90e5f4c2d81a7b30964efc1259ade0e7b2';
export const TAMPERED_DIGEST =
  '0x3e78d90c145ab2f6e01c74d3982bf6541da0c8e26b95f31708ecd44a1f52c903';

export const initialTheatre: TheatreState = {
  counted: [],
  digest: ORIGINAL_DIGEST,
  log: [],
  phase: 'QUORUM_PENDING',
  tampered: false,
};

export type TheatreAction =
  | { type: 'approve'; approver: ApproverId }
  | { type: 'tamper' }
  | { type: 'replay' }
  | { type: 'advance' }; // VERIFYING -> SETTLING -> CONSUMED, driven by timers

export function theatreReducer(
  state: TheatreState,
  action: TheatreAction,
): TheatreState {
  switch (action.type) {
    case 'approve': {
      if (state.phase !== 'QUORUM_PENDING' || state.tampered) return state;
      const approver = approvers.find((a) => a.id === action.approver);
      if (!approver || state.counted.includes(approver.id)) return state;

      const alreadyCountedHuman = state.counted.some(
        (id) => approvers.find((a) => a.id === id)?.humanId === approver.humanId,
      );
      if (alreadyCountedHuman) {
        return {
          ...state,
          log: [
            ...state.log,
            `${approver.id} declined — same person as an existing approval. Quorum unchanged (${state.counted.length}/2).`,
          ],
        };
      }

      const counted = [...state.counted, approver.id];
      const quorumMet = counted.length >= 2;
      return {
        ...state,
        counted,
        log: [
          ...state.log,
          `${approver.id} signed — distinct human verified. Quorum ${counted.length}/2.`,
        ],
        phase: quorumMet ? 'VERIFYING' : 'QUORUM_PENDING',
      };
    }
    case 'advance': {
      if (state.phase === 'VERIFYING') {
        return {
          ...state,
          log: [
            ...state.log,
            'Beneficiary check paid by agent (HTTP 402 → HBAR) — signed result bound to digest.',
          ],
          phase: 'SETTLING',
        };
      }
      if (state.phase === 'SETTLING') {
        return {
          ...state,
          log: [
            ...state.log,
            'Settled once on Hedera Testnet. Payable token burned — identifier consumed.',
          ],
          phase: 'CONSUMED',
        };
      }
      return state;
    }
    case 'tamper': {
      if (state.phase === 'CONSUMED') return state;
      return {
        ...state,
        digest: TAMPERED_DIGEST,
        log: [
          ...state.log,
          'Beneficiary altered by one character — new identifier. All approvals void. Nothing can settle.',
        ],
        phase: 'VOIDED',
        tampered: true,
      };
    }
    case 'replay': {
      if (state.phase !== 'CONSUMED') return state;
      return {
        ...state,
        log: [
          ...state.log,
          'Replay refused — identifier already consumed; the payable token no longer exists on the ledger.',
        ],
      };
    }
    default:
      return state;
  }
}
