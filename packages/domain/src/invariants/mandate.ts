import { accept, refuse, type DomainResult } from '../result.js';

export type MandateCapacity = Readonly<{
  candidateAtoms: string;
  periodCapAtoms: string;
  reservedAtoms: string;
  settledAtoms: string;
}>;

export type ReservedMandateCapacity = Readonly<{
  periodCapAtoms: string;
  reservedAtoms: string;
  settledAtoms: string;
}>;

const MAX_UINT_256 = (1n << 256n) - 1n;
const CANONICAL_ATOMS = /^(?:0|[1-9]\d{0,77})$/u;

function parseAtoms(value: string): bigint | null {
  if (!CANONICAL_ATOMS.test(value)) {
    return null;
  }

  const atoms = BigInt(value);
  return atoms <= MAX_UINT_256 ? atoms : null;
}

function parseCapacity(
  capacity: ReservedMandateCapacity,
): Readonly<{ cap: bigint; reserved: bigint; settled: bigint }> | null {
  const cap = parseAtoms(capacity.periodCapAtoms);
  const reserved = parseAtoms(capacity.reservedAtoms);
  const settled = parseAtoms(capacity.settledAtoms);

  if (
    cap === null ||
    reserved === null ||
    settled === null ||
    cap === 0n ||
    settled + reserved > cap
  ) {
    return null;
  }

  return { cap, reserved, settled };
}

export function reserveMandateCapacity(
  capacity: MandateCapacity,
): DomainResult<ReservedMandateCapacity> {
  const parsed = parseCapacity(capacity);
  const candidate = parseAtoms(capacity.candidateAtoms);

  if (parsed === null || candidate === null || candidate === 0n) {
    return refuse('MANDATE_RESERVATION_CONFLICT');
  }

  const nextReserved = parsed.reserved + candidate;
  if (parsed.settled + nextReserved > parsed.cap) {
    return refuse('MANDATE_CAP_EXCEEDED');
  }

  return accept(
    Object.freeze({
      periodCapAtoms: parsed.cap.toString(),
      reservedAtoms: nextReserved.toString(),
      settledAtoms: parsed.settled.toString(),
    }),
  );
}

export function settleMandateReservation(
  capacity: ReservedMandateCapacity,
  actionAtoms: string,
): DomainResult<ReservedMandateCapacity> {
  const parsed = parseCapacity(capacity);
  const action = parseAtoms(actionAtoms);

  if (
    parsed === null ||
    action === null ||
    action === 0n ||
    action > parsed.reserved
  ) {
    return refuse('MANDATE_RESERVATION_CONFLICT');
  }

  return accept(
    Object.freeze({
      ...capacity,
      reservedAtoms: (parsed.reserved - action).toString(),
      settledAtoms: (parsed.settled + action).toString(),
    }),
  );
}

export function releaseMandateReservation(
  capacity: ReservedMandateCapacity,
  actionAtoms: string,
): DomainResult<ReservedMandateCapacity> {
  const parsed = parseCapacity(capacity);
  const action = parseAtoms(actionAtoms);

  if (
    parsed === null ||
    action === null ||
    action === 0n ||
    action > parsed.reserved
  ) {
    return refuse('MANDATE_RESERVATION_CONFLICT');
  }

  return accept(
    Object.freeze({
      ...capacity,
      reservedAtoms: (parsed.reserved - action).toString(),
    }),
  );
}
