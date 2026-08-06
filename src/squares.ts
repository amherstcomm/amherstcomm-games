// Filling a word square in the browser: the same backtracking the daily
// generator uses, minus the puzzle-making half.
//
// Deliberately a second copy of the algorithm rather than a shared module —
// scripts/ runs in Node against the raw word lists, src/ runs against the
// dictionaries the app already has loaded, and the two have never needed to
// agree on anything but the rule. If they drift, the rule is: every row and
// every column is a word of the grid's size.

export type Square = (string | null)[];

type Index = { pool: string[]; byPrefix: Set<string> };

/** words of one length, plus every prefix, so a partial column can be
 *  abandoned the moment no word can finish it */
export function indexWords(words: string[], n: number): Index {
  const pool: string[] = [];
  const byPrefix = new Set<string>();
  for (const w of words) {
    if (w.length !== n) continue;
    pool.push(w);
    for (let k = 1; k <= n; k++) byPrefix.add(w.slice(0, k));
  }
  return { pool, byPrefix };
}

function columnPrefixes(rows: string[], n: number): string[] {
  const pre: string[] = [];
  for (let c = 0; c < n; c++) {
    let p = '';
    for (const r of rows) p += r[c];
    pre.push(p);
  }
  return pre;
}

/**
 * Every way to fill `grid` so all rows and columns are words, up to `limit`.
 *
 * `grid` is row-major, one entry per cell: a letter to fix it, null to leave
 * it free. Returns arrays of rows.
 *
 * The node budget stops an unconstrained grid hanging the tab, but it has to
 * be generous or it lies: at 2 million an empty 5×5 comes back with nothing
 * after 52ms, which reads as "no such square" when it means "gave up". At 8
 * million the same grid answers in about 110ms having actually searched, and a
 * 4×4 finishes in one. `exhausted` is false when the budget ran out, so a
 * caller can say "none found so far" rather than "none exist".
 */
export function solveSquare(
  words: string[],
  grid: Square,
  n: number,
  limit = 5,
  nodeBudget = 8_000_000
): { solutions: string[][]; exhausted: boolean } {
  const { pool, byPrefix } = indexWords(words, n);
  const solutions: string[][] = [];
  const rows: string[] = [];
  let nodes = 0;
  let exhausted = true;

  function place(depth: number): boolean {
    if (depth === n) {
      solutions.push([...rows]);
      return solutions.length >= limit;
    }
    if (nodes > nodeBudget) {
      exhausted = false;
      return true; // stop, but don't claim we finished
    }
    const pre = columnPrefixes(rows, n);
    for (const w of pool) {
      if (++nodes > nodeBudget) {
        exhausted = false;
        return true;
      }
      let ok = true;
      for (let c = 0; c < n; c++) {
        const fixed = grid[depth * n + c];
        if (fixed !== null && fixed !== w[c]) {
          ok = false;
          break;
        }
        if (!byPrefix.has(pre[c] + w[c])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      rows.push(w);
      if (place(depth + 1)) return true;
      rows.pop();
    }
    return false;
  }

  place(0);
  return { solutions, exhausted };
}
