/**
 * The workspace roster.
 *
 * Three facts decide whether an approval counts, and this file is where two of
 * them are administered:
 *
 *   human backing    — World AgentBook says a unique human stands behind the
 *                      agent wallet. Not ours to grant, only to read.
 *   company role     — this organisation says the person is a treasury or
 *                      finance approver. Entirely ours to grant.
 *   action permission — policy over the digest, decided per action.
 *
 * Granting a role to an agent nobody has vouched for produces exactly nothing.
 * That is the point: neither fact is authority on its own.
 */

export const APPROVER_ROLES = [
  'FINANCE_APPROVER',
  'TREASURY_APPROVER',
] as const;

export type ApproverRole = (typeof APPROVER_ROLES)[number];

/** `null` means the person is in the workspace but cannot approve anything. */
export type PersonRole = ApproverRole | null;

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly agentAddress: string;
  readonly role: PersonRole;
}

/**
 * Which people share a human with someone else.
 *
 * Two agents backed by one person can never form a quorum together, and an
 * administrator should learn that here rather than from a refused payment.
 * People whose agent is unregistered are excluded — an unknown human is not
 * evidence of a shared one.
 */
export function findHumanCollisions(
  people: readonly Person[],
  humanByAddress: ReadonlyMap<string, string | null>,
): ReadonlyMap<string, readonly string[]> {
  const byHuman = new Map<string, string[]>();

  for (const person of people) {
    const humanId = humanByAddress.get(person.agentAddress.toLowerCase());
    if (humanId === null || humanId === undefined) continue;
    const existing = byHuman.get(humanId);
    if (existing) existing.push(person.id);
    else byHuman.set(humanId, [person.id]);
  }

  const collisions = new Map<string, readonly string[]>();
  for (const ids of byHuman.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      collisions.set(
        id,
        ids.filter((other) => other !== id),
      );
    }
  }
  return collisions;
}

/** How many approvals this roster can actually field for a given requirement. */
export function distinctApprovingHumans(
  people: readonly Person[],
  humanByAddress: ReadonlyMap<string, string | null>,
): number {
  const humans = new Set<string>();
  for (const person of people) {
    if (person.role === null) continue;
    const humanId = humanByAddress.get(person.agentAddress.toLowerCase());
    if (humanId === null || humanId === undefined) continue;
    humans.add(humanId);
  }
  return humans.size;
}
