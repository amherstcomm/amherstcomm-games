// Whether a Weave theme can actually build a board.
//
// Weave tiles the whole grid: the spangram threads corner to corner and the
// rest of the cells are filled exactly by other words from the theme. Nothing
// is left over and nothing overlaps, so the arithmetic is not "enough letters"
// — it is whether some subset of the words sums *exactly* to the cells the
// spangram leaves.
//
// That is a subset-sum question, and it is why a theme can look generous and
// still fail: forty-eight letters in words of six and seven cannot make
// thirty-five, however many of them there are.
//
// Answering it here rather than finding out at three in the morning is the
// whole point. The generator would simply pass the theme over and use a curated
// one, which looks like nothing happening.

/** Cells per board, by difficulty.
 *
 *  Kept in step with WEAVE_SHAPE in scripts/fetch-puzzles.mjs by
 *  tests/unit/weaveFit.test.ts, which reads the generator's own numbers — the
 *  client cannot import the generator, and a second copy of a board size is a
 *  copy to be wrong. */
export const BOARD_CELLS: Record<'easy' | 'hard' | 'extreme', number> = {
  easy: 6 * 8,
  hard: 7 * 9,
  extreme: 8 * 10,
};

/** Weave's own rules about what may go on a board, restated where somebody is
 *  typing one: the spangram is 6 to 16 letters and at least as long as the
 *  board is wide, and every other word is 4 to 10. */
export const SPANGRAM_MIN = 6;
export const SPANGRAM_MAX = 16;
export const WORD_MIN = 4;
export const WORD_MAX = 10;

/** Whether some subset of `lengths` sums to exactly `target`. */
export function canMakeExactly(lengths: number[], target: number): boolean {
  if (target === 0) return true;
  if (target < 0) return false;
  // Plain subset-sum. The numbers are word lengths and the target is a board,
  // so this is a table of at most eighty booleans — reachable sums, built up
  // one word at a time.
  const reachable = new Array<boolean>(target + 1).fill(false);
  reachable[0] = true;
  for (const len of lengths) {
    // Downwards, so each word is used at most once.
    for (let sum = target; sum >= len; sum--) {
      if (reachable[sum - len]) reachable[sum] = true;
    }
  }
  return reachable[target];
}

export type Fit = {
  cells: number;
  /** how many letters the words would have to cover, once the spangram is laid */
  needed: number;
  fits: boolean;
  /** why not, in the words somebody writing a theme would use */
  why: string;
};

/** Whether this theme can fill one board, and what to say if it cannot. */
export function fitsBoard(spangram: string, words: string[], cells: number): Fit {
  const span = spangram.trim().toLowerCase();
  const usable = words
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w !== span && w.length >= WORD_MIN && w.length <= WORD_MAX);
  const needed = cells - span.length;
  const total = usable.reduce((n, w) => n + w.length, 0);

  if (span.length < SPANGRAM_MIN || span.length > SPANGRAM_MAX) {
    return { cells, needed, fits: false, why: `the spangram must be ${SPANGRAM_MIN}–${SPANGRAM_MAX} letters` };
  }
  // The spangram threads corner to corner, so it cannot be shorter than the
  // board is wide. Boards are taller than they are wide, so the width is the
  // smaller side of the shape.
  const width = cells === BOARD_CELLS.easy ? 6 : cells === BOARD_CELLS.hard ? 7 : 8;
  if (span.length < width) {
    return { cells, needed, fits: false, why: `the spangram must reach across ${width} columns` };
  }
  if (total < needed) {
    return { cells, needed, fits: false, why: `${needed - total} letters short` };
  }
  if (!canMakeExactly(usable.map((w) => w.length), needed)) {
    // The one that surprises people: plenty of letters, no exact combination.
    return {
      cells,
      needed,
      fits: false,
      why: `no combination of these words fills exactly ${needed} squares`,
    };
  }
  return { cells, needed, fits: true, why: '' };
}

/** The same for every board, which is what the page shows. */
export function fitsBoards(spangram: string, words: string[]): Record<string, Fit> {
  return Object.fromEntries(
    Object.entries(BOARD_CELLS).map(([tier, cells]) => [tier, fitsBoard(spangram, words, cells)])
  );
}
