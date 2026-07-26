export type HumanBacking = Readonly<{
  address: string;
  humanId: string | null;
}>;

export type RedactedHumanBacking = Readonly<{
  address: string;
  humanClass: string | null;
}>;

/**
 * Preserve only the equality relationship needed by the roster UI.
 *
 * The returned labels are assigned per response and reveal no AgentBook
 * identifier. They are sufficient to show that two wallets share a human and
 * to count distinct humans, which is the only information an administrator
 * needs here.
 */
export function redactHumanBackings(
  backings: readonly HumanBacking[],
): readonly RedactedHumanBacking[] {
  const classByHuman = new Map<string, string>();

  return backings.map(({ address, humanId }) => {
    if (humanId === null) return { address, humanClass: null };

    let humanClass = classByHuman.get(humanId);
    if (humanClass === undefined) {
      humanClass = `human-${String(classByHuman.size + 1)}`;
      classByHuman.set(humanId, humanClass);
    }

    return { address, humanClass };
  });
}
