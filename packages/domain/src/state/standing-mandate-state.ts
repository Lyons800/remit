import { verifyStandingMandate } from '@invoiceguard/protocol/hashing';

import type {
  StandingMandateAggregate,
  TrustedTransitionContext,
} from '../payment-context.js';
import { accept, refuse, type DomainResult } from '../result.js';
import { isRecord } from '../values/validation.js';
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

export type StandingMandateEvent =
  | Readonly<{ type: 'ACTIVATE' }>
  | Readonly<{ type: 'PAUSE' }>
  | Readonly<{ type: 'RESUME' }>
  | Readonly<{ type: 'REVOKE' }>
  | Readonly<{ type: 'EXPIRE' }>;
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

function verifyAggregate(
  input: unknown,
): DomainResult<StandingMandateAggregate> {
  if (
    !isRecord(input) ||
    !isRecord(input.record) ||
    !standingMandateStates.includes(input.state as StandingMandateState)
  ) {
    return refuse('MANDATE_RECORD_INVALID');
  }

  try {
    return accept(
      Object.freeze({
        record: verifyStandingMandate(input.record),
        state: input.state as StandingMandateState,
      }),
    );
  } catch {
    return refuse('MANDATE_RECORD_INVALID');
  }
}

function parseEvent(input: unknown): StandingMandateEvent | null {
  if (
    !isRecord(input) ||
    Object.keys(input).length !== 1 ||
    typeof input.type !== 'string' ||
    !standingMandateEventTypes.includes(input.type as StandingMandateEventType)
  ) {
    return null;
  }

  return Object.freeze({ type: input.type as StandingMandateEventType });
}

function validateEventGuard(
  aggregate: StandingMandateAggregate,
  event: StandingMandateEvent,
  context: TrustedTransitionContext,
): DomainResult<StandingMandateEvent> {
  if (
    (event.type === 'ACTIVATE' || event.type === 'RESUME') &&
    (context.now < aggregate.record.notBefore ||
      context.now >= aggregate.record.expiresAt)
  ) {
    return refuse('MANDATE_NOT_ACTIVE');
  }

  if (event.type === 'EXPIRE' && context.now < aggregate.record.expiresAt) {
    return refuse('MANDATE_NOT_EXPIRED');
  }

  return accept(event);
}

export function transitionStandingMandate(
  aggregateInput: unknown,
  eventInput: unknown,
  contextInput: unknown,
): DomainResult<StandingMandateAggregate> {
  const aggregateResult = verifyAggregate(aggregateInput);
  if (!aggregateResult.ok) {
    return aggregateResult;
  }
  const aggregate = aggregateResult.value;

  if (isTerminalStandingMandateState(aggregate.state)) {
    return refuse('TERMINAL_STATE');
  }

  const event = parseEvent(eventInput);
  if (event === null) {
    return refuse('MANDATE_TIME_INVALID');
  }

  const next = transitions[aggregate.state][event.type];
  if (next === undefined) {
    return refuse('INVALID_STATE_TRANSITION');
  }

  if (
    !isRecord(contextInput) ||
    Object.keys(contextInput).length !== 1 ||
    !isCanonicalUtcInstant(
      typeof contextInput.now === 'string' ? contextInput.now : '',
    )
  ) {
    return refuse('MANDATE_TIME_INVALID');
  }
  const context = Object.freeze({
    now: contextInput.now as string,
  });

  const guard = validateEventGuard(aggregate, event, context);
  return guard.ok
    ? accept(Object.freeze({ ...aggregate, state: next }))
    : guard;
}
