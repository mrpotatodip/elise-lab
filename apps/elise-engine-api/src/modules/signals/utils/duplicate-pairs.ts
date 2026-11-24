export type PairFinding = { fingerprint: string; class: string | null; file: string | null };

export type FindingPair = { fingerprint: string; other: string };

export const duplicatePairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const related = (a: PairFinding, b: PairFinding) =>
  (a.class !== null && a.class === b.class) || (a.file !== null && a.file === b.file);

const byFingerprint = (x: PairFinding, y: PairFinding) => x.fingerprint.localeCompare(y.fingerprint);

export const duplicatePairsOf = (
  fresh: readonly PairFinding[],
  open: readonly PairFinding[],
  known: ReadonlySet<string>,
  cap: number,
) => {
  const seen = new Set<string>(known);
  const all: FindingPair[] = [];
  const sortedOpen = open.toSorted(byFingerprint);
  for (const a of fresh.toSorted(byFingerprint)) {
    for (const b of sortedOpen) {
      if (a.fingerprint === b.fingerprint || !related(a, b)) continue;
      const key = duplicatePairKey(a.fingerprint, b.fingerprint);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ fingerprint: a.fingerprint, other: b.fingerprint });
    }
  }
  return { asked: all.slice(0, cap), skipped: Math.max(0, all.length - cap) };
};
