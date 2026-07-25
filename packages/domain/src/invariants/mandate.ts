import { accept, refuse, type DomainResult } from '../result.js';
import { parseCanonicalAtoms, parsePositiveAtoms } from '../values/atoms.js';

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

function parseCapacity(
  capacity: ReservedMandateCapacity,
): Readonly<{ cap: bigint; reserved: bigint; settled: bigint }> | null {
  const cap = parsePositiveAtoms(capacity.periodCapAtoms);
  const reserved = parseCanonicalAtoms(capacity.reservedAtoms);
  const settled = parseCanonicalAtoms(capacity.settledAtoms);

  if (
    cap === null ||
    reserved === null ||
    settled === null ||
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
  const candidate = parsePositiveAtoms(capacity.candidateAtoms);

  if (parsed === null || candidate === null) {
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
  const action = parsePositiveAtoms(actionAtoms);

  if (parsed === null || action === null || action > parsed.reserved) {
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
  const action = parsePositiveAtoms(actionAtoms);

  if (parsed === null || action === null || action > parsed.reserved) {
    return refuse('MANDATE_RESERVATION_CONFLICT');
  }

  return accept(
    Object.freeze({
      ...capacity,
      reservedAtoms: (parsed.reserved - action).toString(),
    }),
  );
}
