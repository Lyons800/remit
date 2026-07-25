import { accept, refuse, type DomainResult } from '../result.js';

export const sourceObservationStates = [
  'RECEIVED',
  'STORED',
  'EXTRACTING',
  'EXTRACTED',
  'QUARANTINED',
  'ATTACHED',
] as const;

export const sourceObservationEvents = [
  'STORE',
  'START_EXTRACTION',
  'ACCEPT_EXTRACTION',
  'QUARANTINE',
  'ATTACH',
  'RELEASE',
] as const;

export type SourceObservationEvent = (typeof sourceObservationEvents)[number];
export type SourceObservationState = (typeof sourceObservationStates)[number];

const transitions: Readonly<
  Record<
    SourceObservationState,
    Readonly<Partial<Record<SourceObservationEvent, SourceObservationState>>>
  >
> = {
  ATTACHED: {},
  EXTRACTED: { ATTACH: 'ATTACHED' },
  EXTRACTING: {
    ACCEPT_EXTRACTION: 'EXTRACTED',
    QUARANTINE: 'QUARANTINED',
  },
  QUARANTINED: { RELEASE: 'STORED' },
  RECEIVED: { STORE: 'STORED' },
  STORED: { START_EXTRACTION: 'EXTRACTING' },
};

export function isTerminalSourceObservationState(
  state: SourceObservationState,
): boolean {
  return state === 'ATTACHED';
}

export function transitionSourceObservation(
  state: SourceObservationState,
  event: SourceObservationEvent,
): DomainResult<SourceObservationState> {
  if (isTerminalSourceObservationState(state)) {
    return refuse('TERMINAL_STATE');
  }

  const next = transitions[state][event];
  return next === undefined ? refuse('INVALID_STATE_TRANSITION') : accept(next);
}
