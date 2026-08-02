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

export type BeeInput = {
  center: string; // required letter
  outers: string[]; // the other letters, '' entries ignored
};

export function solveBee(list: string[], input: BeeInput): string[] {
  const { center, outers } = input;
  if (!center) return [];

  const allowed = new Set([center, ...outers.filter(Boolean)]);

  const matches = list.filter((w) => {
    if (w.length < 4) return false; // Spelling Bee minimum
    let hasCenter = false;
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      if (!allowed.has(ch)) return false;
      if (ch === center) hasCenter = true;
    }
    return hasCenter;
  });

  // longest words first, then alphabetical
  return matches.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}

export type BoxedInput = {
  sides: string[][]; // four sides of the box, each holding up to 3 letters
};

export function solveBoxed(list: string[], input: BoxedInput): string[] {
  const sideOf = new Map<string, number>();
  input.sides.forEach((side, i) => {
    for (const c of side) if (c) sideOf.set(c, i);
  });
  // need at least two sides in play for any word to be legal
  if (new Set(sideOf.values()).size < 2) return [];

  const matches = list.filter((w) => {
    if (w.length < 3) return false; // Letter Boxed minimum
    let prev = -1;
    for (let i = 0; i < w.length; i++) {
      const s = sideOf.get(w[i]);
      if (s === undefined || s === prev) return false;
      prev = s;
    }
    return true;
  });

  // longest words first, then alphabetical
  return matches.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}

export type GridInput = {
  cells: string[]; // 16 letters, row-major 4x4
};

// neighbor indices (including diagonals) for each cell of the 4x4 grid
const GRID_NEIGHBORS: number[][] = (() => {
  const out: number[][] = [];
  for (let i = 0; i < 16; i++) {
    const r = Math.floor(i / 4);
    const c = i % 4;
    const adj: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < 4 && cc >= 0 && cc < 4) adj.push(rr * 4 + cc);
      }
    }
    out.push(adj);
  }
  return out;
})();

export function solveGrid(list: string[], input: GridInput): string[] {
  const { cells } = input;
  if (cells.length !== 16 || cells.some((c) => !c)) return [];

  // narrow to words spellable from the grid's alphabet, then prefix-prune the DFS
  const present = new Set(cells);
  const candidates = list.filter((w) => {
    if (w.length < 3 || w.length > 16) return false;
    for (let i = 0; i < w.length; i++) if (!present.has(w[i])) return false;
    return true;
  });
  const wordSet = new Set(candidates);
  const prefixes = new Set<string>();
  for (const w of candidates) for (let i = 1; i <= w.length; i++) prefixes.add(w.slice(0, i));

  const found = new Set<string>();
  const dfs = (pos: number, cur: string, mask: number) => {
    if (!prefixes.has(cur)) return;
    if (cur.length >= 3 && wordSet.has(cur)) found.add(cur);
    for (const nb of GRID_NEIGHBORS[pos]) {
      if (!(mask & (1 << nb))) dfs(nb, cur + cells[nb], mask | (1 << nb));
    }
  };
  for (let i = 0; i < 16; i++) dfs(i, cells[i], 1 << i);

  // longest words first, then alphabetical
  return [...found].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
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
