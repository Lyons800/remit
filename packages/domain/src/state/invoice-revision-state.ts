import { accept, refuse, type DomainResult } from '../result.js';

export const invoiceRevisionStates = [
  'DRAFT',
  'NEEDS_REVIEW',
  'READY',
  'ACTION_FROZEN',
  'HELD',
  'VOID',
  'SUPERSEDED',
] as const;

export const invoiceRevisionEvents = [
  'REQUEST_REVIEW',
  'MARK_READY',
  'HOLD',
  'VOID',
  'FREEZE_ACTION',
  'SUPERSEDE',
] as const;

export type InvoiceRevisionEvent = (typeof invoiceRevisionEvents)[number];
export type InvoiceRevisionState = (typeof invoiceRevisionStates)[number];

const terminalStates: ReadonlySet<InvoiceRevisionState> = new Set([
  'ACTION_FROZEN',
  'HELD',
  'VOID',
  'SUPERSEDED',
]);

const transitions: Readonly<
  Record<
    InvoiceRevisionState,
    Readonly<Partial<Record<InvoiceRevisionEvent, InvoiceRevisionState>>>
  >
> = {
  ACTION_FROZEN: {},
  DRAFT: {
    HOLD: 'HELD',
    MARK_READY: 'READY',
    REQUEST_REVIEW: 'NEEDS_REVIEW',
    SUPERSEDE: 'SUPERSEDED',
    VOID: 'VOID',
  },
  HELD: {},
  NEEDS_REVIEW: {
    HOLD: 'HELD',
    MARK_READY: 'READY',
    SUPERSEDE: 'SUPERSEDED',
    VOID: 'VOID',
  },
  READY: {
    FREEZE_ACTION: 'ACTION_FROZEN',
    HOLD: 'HELD',
    SUPERSEDE: 'SUPERSEDED',
  },
  SUPERSEDED: {},
  VOID: {},
};

export function isTerminalInvoiceRevisionState(
  state: InvoiceRevisionState,
): boolean {
  return terminalStates.has(state);
}

export function transitionInvoiceRevision(
  state: InvoiceRevisionState,
  event: InvoiceRevisionEvent,
): DomainResult<InvoiceRevisionState> {
  if (isTerminalInvoiceRevisionState(state)) {
    return refuse('TERMINAL_STATE');
  }

  const next = transitions[state][event];
  return next === undefined ? refuse('INVALID_STATE_TRANSITION') : accept(next);
}
