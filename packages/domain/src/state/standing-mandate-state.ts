import { accept, refuse, type DomainResult } from '../result.js';
import { isCanonicalUtcInstant } from './temporal.js';

export const standingMandateStates = [
  'ISSUED',
  'ACTIVE',
  'PAUSED',
  'REVOKED',
  'EXPIRED',
] as const;

export const standingMandateEventTypes = [
  'ACTIVATE',
  'PAUSE',
  'RESUME',
  'REVOKE',
  'EXPIRE',
] as const;

type MandateTimeWindow = Readonly<{
  expiresAt: string;
  notBefore: string;
  now: string;
}>;

export type StandingMandateEvent =
  | (MandateTimeWindow & Readonly<{ type: 'ACTIVATE' }>)
  | Readonly<{ type: 'PAUSE' }>
  | (MandateTimeWindow & Readonly<{ type: 'RESUME' }>)
  | Readonly<{ type: 'REVOKE' }>
  | (MandateTimeWindow & Readonly<{ type: 'EXPIRE' }>);
export type StandingMandateEventType = StandingMandateEvent['type'];
export type StandingMandateState = (typeof standingMandateStates)[number];

const transitions: Readonly<
  Record<
    StandingMandateState,
    Readonly<Partial<Record<StandingMandateEventType, StandingMandateState>>>
  >
> = {
  ACTIVE: {
    EXPIRE: 'EXPIRED',
    PAUSE: 'PAUSED',
    REVOKE: 'REVOKED',
  },
  EXPIRED: {},
  ISSUED: {
    ACTIVATE: 'ACTIVE',
    REVOKE: 'REVOKED',
  },
  PAUSED: {
    EXPIRE: 'EXPIRED',
    RESUME: 'ACTIVE',
    REVOKE: 'REVOKED',
  },
  REVOKED: {},
};

export function isTerminalStandingMandateState(
  state: StandingMandateState,
): boolean {
  return state === 'REVOKED' || state === 'EXPIRED';
}

function hasValidWindow(window: MandateTimeWindow): boolean {
  return (
    window.notBefore < window.expiresAt &&
    isCanonicalUtcInstant(window.notBefore) &&
    isCanonicalUtcInstant(window.expiresAt) &&
    isCanonicalUtcInstant(window.now)
  );
}

function validateEventGuard(
  event: StandingMandateEvent,
): DomainResult<StandingMandateEvent> {
  if (
    event.type !== 'ACTIVATE' &&
    event.type !== 'RESUME' &&
    event.type !== 'EXPIRE'
  ) {
    return accept(event);
  }

  if (!hasValidWindow(event)) {
    return refuse('MANDATE_TIME_INVALID');
  }

  if (
    (event.type === 'ACTIVATE' || event.type === 'RESUME') &&
    (event.now < event.notBefore || event.now >= event.expiresAt)
  ) {
    return refuse('MANDATE_NOT_ACTIVE');
  }

  if (event.type === 'EXPIRE' && event.now < event.expiresAt) {
    return refuse('MANDATE_NOT_EXPIRED');
  }

  return accept(event);
}

export function transitionStandingMandate(
  state: StandingMandateState,
  event: StandingMandateEvent,
): DomainResult<StandingMandateState> {
  if (isTerminalStandingMandateState(state)) {
    return refuse('TERMINAL_STATE');
  }

  const next = transitions[state][event.type];
  if (next === undefined) {
    return refuse('INVALID_STATE_TRANSITION');
  }

  const guard = validateEventGuard(event);
  return guard.ok ? accept(next) : guard;
}
