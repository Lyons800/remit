import type { MandateContainment } from './mandate-containment.js';
import { accept, refuse, type DomainResult } from '../result.js';
import { parsePositiveAtoms } from '../values/atoms.js';
import {
  isNonEmptyBoundedString,
  isPositiveSafeInteger,
  isRecord,
  isSha256Digest,
} from '../values/validation.js';

export type MandateReservationStatus = 'RELEASED' | 'RESERVED' | 'SETTLED';

export type MandateReservationEntry = Readonly<{
  actionDigest: string;
  amountAtoms: string;
  status: MandateReservationStatus;
}>;

export type MandateReservationLedger = Readonly<{
  entries: readonly MandateReservationEntry[];
  mandateDigest: string;
  mandateId: string;
  mandateVersion: number;
  periodCapAtoms: string;
  periodKey: string;
}>;

export type MandateReservationClaim = MandateContainment;

export type MandateReservationTotals = Readonly<{
  releasedAtoms: string;
  reservedAtoms: string;
  settledAtoms: string;
}>;

export type MandateReservationMutation = Readonly<{
  ledger: MandateReservationLedger;
  reservation: MandateReservationEntry;
  totals: MandateReservationTotals;
}>;

const CLAIM_KEYS = [
  'actionDigest',
  'mandateDigest',
  'mandateId',
  'mandateVersion',
  'periodCapAtoms',
  'periodKey',
  'settlementAmountAtoms',
] as const;
const ENTRY_KEYS = ['actionDigest', 'amountAtoms', 'status'] as const;
const LEDGER_KEYS = [
  'entries',
  'mandateDigest',
  'mandateId',
  'mandateVersion',
  'periodCapAtoms',
  'periodKey',
] as const;
const PERIOD_KEY_PATTERN =
  /^(?:UTC_DAY:\d{4}-\d{2}-\d{2}|UTC_MONTH:\d{4}-\d{2})$/u;

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function parseClaim(input: unknown): MandateReservationClaim | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, CLAIM_KEYS) ||
    !isSha256Digest(input.actionDigest) ||
    !isSha256Digest(input.mandateDigest) ||
    !isNonEmptyBoundedString(input.mandateId) ||
    !isPositiveSafeInteger(input.mandateVersion) ||
    !PERIOD_KEY_PATTERN.test(
      typeof input.periodKey === 'string' ? input.periodKey : '',
    ) ||
    parsePositiveAtoms(input.periodCapAtoms) === null ||
    parsePositiveAtoms(input.settlementAmountAtoms) === null
  ) {
    return null;
  }

  return Object.freeze({
    actionDigest: input.actionDigest,
    mandateDigest: input.mandateDigest,
    mandateId: input.mandateId,
    mandateVersion: input.mandateVersion,
    periodCapAtoms: input.periodCapAtoms as string,
    periodKey: input.periodKey as string,
    settlementAmountAtoms: input.settlementAmountAtoms as string,
  });
}

function parseEntry(input: unknown): MandateReservationEntry | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ENTRY_KEYS) ||
    !isSha256Digest(input.actionDigest) ||
    parsePositiveAtoms(input.amountAtoms) === null ||
    (input.status !== 'RESERVED' &&
      input.status !== 'SETTLED' &&
      input.status !== 'RELEASED')
  ) {
    return null;
  }

  return Object.freeze({
    actionDigest: input.actionDigest,
    amountAtoms: input.amountAtoms as string,
    status: input.status,
  });
}

function calculateTotals(
  entries: readonly MandateReservationEntry[],
): Readonly<{
  released: bigint;
  reserved: bigint;
  settled: bigint;
}> {
  let released = 0n;
  let reserved = 0n;
  let settled = 0n;

  for (const entry of entries) {
    const amount = BigInt(entry.amountAtoms);
    if (entry.status === 'RESERVED') {
      reserved += amount;
    } else if (entry.status === 'SETTLED') {
      settled += amount;
    } else {
      released += amount;
    }
  }

  return Object.freeze({ released, reserved, settled });
}

function parseLedger(input: unknown): MandateReservationLedger | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, LEDGER_KEYS) ||
    !Array.isArray(input.entries) ||
    !isSha256Digest(input.mandateDigest) ||
    !isNonEmptyBoundedString(input.mandateId) ||
    !isPositiveSafeInteger(input.mandateVersion) ||
    !PERIOD_KEY_PATTERN.test(
      typeof input.periodKey === 'string' ? input.periodKey : '',
    ) ||
    parsePositiveAtoms(input.periodCapAtoms) === null
  ) {
    return null;
  }

  const entries: MandateReservationEntry[] = [];
  for (const candidate of input.entries) {
    const entry = parseEntry(candidate);
    if (entry === null) {
      return null;
    }
    const previous = entries.at(-1);
    if (previous !== undefined && previous.actionDigest >= entry.actionDigest) {
      return null;
    }
    entries.push(entry);
  }

  const totals = calculateTotals(entries);
  const cap = BigInt(input.periodCapAtoms as string);
  if (totals.reserved + totals.settled > cap) {
    return null;
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    mandateDigest: input.mandateDigest,
    mandateId: input.mandateId,
    mandateVersion: input.mandateVersion,
    periodCapAtoms: input.periodCapAtoms as string,
    periodKey: input.periodKey as string,
  });
}

function sameLedgerKey(
  ledger: MandateReservationLedger,
  claim: MandateReservationClaim,
): boolean {
  return (
    ledger.mandateId === claim.mandateId &&
    ledger.mandateVersion === claim.mandateVersion &&
    ledger.mandateDigest === claim.mandateDigest &&
    ledger.periodKey === claim.periodKey &&
    ledger.periodCapAtoms === claim.periodCapAtoms
  );
}

function compareActionDigests(
  left: MandateReservationEntry,
  right: MandateReservationEntry,
): number {
  return left.actionDigest < right.actionDigest
    ? -1
    : left.actionDigest > right.actionDigest
      ? 1
      : 0;
}

function replaceEntry(
  ledger: MandateReservationLedger,
  replacement: MandateReservationEntry,
): MandateReservationLedger {
  return Object.freeze({
    ...ledger,
    entries: Object.freeze(
      ledger.entries
        .map((entry) =>
          entry.actionDigest === replacement.actionDigest ? replacement : entry,
        )
        .sort(compareActionDigests),
    ),
  });
}

function createMutation(
  ledger: MandateReservationLedger,
  reservation: MandateReservationEntry,
): MandateReservationMutation {
  const totals = calculateTotals(ledger.entries);
  return Object.freeze({
    ledger,
    reservation,
    totals: Object.freeze({
      releasedAtoms: totals.released.toString(),
      reservedAtoms: totals.reserved.toString(),
      settledAtoms: totals.settled.toString(),
    }),
  });
}

function validateInputs(
  ledgerInput: unknown,
  claimInput: unknown,
): DomainResult<
  Readonly<{
    claim: MandateReservationClaim;
    ledger: MandateReservationLedger;
  }>
> {
  const ledger = parseLedger(ledgerInput);
  const claim = parseClaim(claimInput);
  if (ledger === null || claim === null) {
    return refuse('MANDATE_RESERVATION_CONFLICT');
  }
  if (!sameLedgerKey(ledger, claim)) {
    return refuse('MANDATE_RESERVATION_KEY_MISMATCH');
  }
  return accept(Object.freeze({ claim, ledger }));
}

export function createMandateReservationLedger(
  claimInput: unknown,
): DomainResult<MandateReservationLedger> {
  const claim = parseClaim(claimInput);
  if (claim === null) {
    return refuse('MANDATE_RESERVATION_CONFLICT');
  }

  return accept(
    Object.freeze({
      entries: Object.freeze([]),
      mandateDigest: claim.mandateDigest,
      mandateId: claim.mandateId,
      mandateVersion: claim.mandateVersion,
      periodCapAtoms: claim.periodCapAtoms,
      periodKey: claim.periodKey,
    }),
  );
}

export function deriveMandateReservationTotals(
  ledgerInput: unknown,
): DomainResult<MandateReservationTotals> {
  const ledger = parseLedger(ledgerInput);
  if (ledger === null) {
    return refuse('MANDATE_RESERVATION_CONFLICT');
  }

  const totals = calculateTotals(ledger.entries);
  return accept(
    Object.freeze({
      releasedAtoms: totals.released.toString(),
      reservedAtoms: totals.reserved.toString(),
      settledAtoms: totals.settled.toString(),
    }),
  );
}

export function reserveMandateCapacity(
  ledgerInput: unknown,
  claimInput: unknown,
): DomainResult<MandateReservationMutation> {
  const inputs = validateInputs(ledgerInput, claimInput);
  if (!inputs.ok) {
    return inputs;
  }

  const { claim, ledger } = inputs.value;
  const existing = ledger.entries.find(
    (entry) => entry.actionDigest === claim.actionDigest,
  );
  if (existing !== undefined) {
    if (existing.amountAtoms !== claim.settlementAmountAtoms) {
      return refuse('MANDATE_RESERVATION_CONFLICT');
    }
    if (existing.status !== 'RESERVED') {
      return refuse('MANDATE_RESERVATION_TERMINAL');
    }
    return accept(createMutation(ledger, existing));
  }

  const totals = calculateTotals(ledger.entries);
  if (
    totals.reserved + totals.settled + BigInt(claim.settlementAmountAtoms) >
    BigInt(ledger.periodCapAtoms)
  ) {
    return refuse('MANDATE_CAP_EXCEEDED');
  }

  const reservation = Object.freeze({
    actionDigest: claim.actionDigest,
    amountAtoms: claim.settlementAmountAtoms,
    status: 'RESERVED' as const,
  });
  const nextLedger = Object.freeze({
    ...ledger,
    entries: Object.freeze(
      [...ledger.entries, reservation].sort(compareActionDigests),
    ),
  });
  return accept(createMutation(nextLedger, reservation));
}

export function settleMandateReservation(
  ledgerInput: unknown,
  claimInput: unknown,
): DomainResult<MandateReservationMutation> {
  const inputs = validateInputs(ledgerInput, claimInput);
  if (!inputs.ok) {
    return inputs;
  }

  const { claim, ledger } = inputs.value;
  const existing = ledger.entries.find(
    (entry) => entry.actionDigest === claim.actionDigest,
  );
  if (existing === undefined) {
    return refuse('MANDATE_RESERVATION_NOT_FOUND');
  }
  if (existing.amountAtoms !== claim.settlementAmountAtoms) {
    return refuse('MANDATE_RESERVATION_CONFLICT');
  }
  if (existing.status === 'RELEASED') {
    return refuse('MANDATE_RESERVATION_TERMINAL');
  }
  if (existing.status === 'SETTLED') {
    return accept(createMutation(ledger, existing));
  }

  const reservation = Object.freeze({
    ...existing,
    status: 'SETTLED' as const,
  });
  const nextLedger = replaceEntry(ledger, reservation);
  return accept(createMutation(nextLedger, reservation));
}

export function releaseMandateReservation(
  ledgerInput: unknown,
  claimInput: unknown,
): DomainResult<MandateReservationMutation> {
  const inputs = validateInputs(ledgerInput, claimInput);
  if (!inputs.ok) {
    return inputs;
  }

  const { claim, ledger } = inputs.value;
  const existing = ledger.entries.find(
    (entry) => entry.actionDigest === claim.actionDigest,
  );
  if (existing === undefined) {
    return refuse('MANDATE_RESERVATION_NOT_FOUND');
  }
  if (existing.amountAtoms !== claim.settlementAmountAtoms) {
    return refuse('MANDATE_RESERVATION_CONFLICT');
  }
  if (existing.status === 'SETTLED') {
    return refuse('MANDATE_RESERVATION_TERMINAL');
  }
  if (existing.status === 'RELEASED') {
    return accept(createMutation(ledger, existing));
  }

  const reservation = Object.freeze({
    ...existing,
    status: 'RELEASED' as const,
  });
  const nextLedger = replaceEntry(ledger, reservation);
  return accept(createMutation(nextLedger, reservation));
}

export function validateActiveMandateReservation(
  ledgerInput: unknown,
  claimInput: unknown,
): DomainResult<MandateReservationEntry> {
  const inputs = validateInputs(ledgerInput, claimInput);
  if (!inputs.ok) {
    return inputs;
  }

  const { claim, ledger } = inputs.value;
  const existing = ledger.entries.find(
    (entry) => entry.actionDigest === claim.actionDigest,
  );
  if (existing === undefined) {
    return refuse('MANDATE_RESERVATION_NOT_FOUND');
  }
  if (existing.amountAtoms !== claim.settlementAmountAtoms) {
    return refuse('MANDATE_RESERVATION_CONFLICT');
  }
  if (existing.status !== 'RESERVED') {
    return refuse('MANDATE_RESERVATION_TERMINAL');
  }

  return accept(existing);
}
