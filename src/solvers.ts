export type PatternInput = {
  length: number;
  known: string[]; // known letters by position, '' for unknown
  contains: string[]; // letters that must appear (multiset)
  excluded: string[]; // letters that must not appear
};

export function solvePattern(list: string[], input: PatternInput): string[] {
  const { length, known, contains, excluded } = input;

  const excludedSet = new Set(excluded.filter(Boolean));
  const containsCounts = new Map<string, number>();
  for (const c of contains) {
    if (c) containsCounts.set(c, (containsCounts.get(c) ?? 0) + 1);
  }

  return list.filter((w) => {
    if (w.length !== length) return false;

    // excluded letters
    for (let i = 0; i < w.length; i++) {
      if (excludedSet.has(w[i])) return false;
    }

    // known positions
    for (let i = 0; i < known.length; i++) {
      const k = known[i];
      if (k && w[i] !== k) return false;
    }

    // must-contain multiset
    for (const [ch, need] of containsCounts) {
      let count = 0;
      for (let i = 0; i < w.length; i++) if (w[i] === ch) count++;
      if (count < need) return false;
    }

    return true;
  });
}

export type DescrambleInput = {
  letters: string[]; // the rack, a-z only
  wildcards: number; // blank tiles that can stand in for any letter
  useAll: boolean; // true = exact anagrams only
  minLength: number;
};

export function solveDescramble(list: string[], input: DescrambleInput): string[] {
  const { letters, wildcards, useAll, minLength } = input;
  const rackSize = letters.length + wildcards;
  if (rackSize === 0) return [];

  const rack = new Map<string, number>();
  for (const c of letters) rack.set(c, (rack.get(c) ?? 0) + 1);

  const matches = list.filter((w) => {
    if (useAll ? w.length !== rackSize : w.length < minLength || w.length > rackSize) {
      return false;
    }
    // every letter of the word must come from the rack, with wildcards covering deficits
    let deficit = 0;
    const used = new Map<string, number>();
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      const n = (used.get(ch) ?? 0) + 1;
      used.set(ch, n);
      if (n > (rack.get(ch) ?? 0)) {
        deficit++;
        if (deficit > wildcards) return false;
      }
    }
    return true;
  });

  // longest words first, then alphabetical
  return matches.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}
