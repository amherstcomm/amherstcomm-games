// Whether a word list is rich enough to make puzzles out of.
//
// The Weave calculator answers "does this theme fill a board". These answer the
// same question for the other two games a list could drive, while somebody is
// still writing the list — which is the only time the answer is useful. A list
// finished in September and found to make one puzzle in October is a list
// nobody can fix.
//
// The arithmetic is here rather than in the panel because each of these is a
// small search with an edge, and none of them needs a browser to be wrong.
// scripts/feasibility.mjs asks the same questions from the command line against
// the same rules.

/** No consecutive repeat: a box cannot spell one, because the second letter
 *  would step on the same side as the first. */
const noDouble = (w: string) => !/(\w)\1/.test(w);

export const BOX_LETTERS = 12;

export type Box = {
  /** the theme words whose letters make it, in the order they chain — which is
   *  also the order that solves it */
  from: string[];
  /** four sides of three */
  sides: string[];
  /** every theme word the finished box can spell — the words a player finds */
  holds: string[];
  /** the chain of the theme's own words that solves it, which is the chain it
   *  was built from — a solution, and the shortest one made of your words */
  solution: string[];
  /** a shorter route through ordinary words, where the day accepts them and one
   *  exists: a themed chain of three beside an ordinary pair is a board
   *  solvable in two, and saying three would be wrong */
  ordinary: string[] | null;
  /** how few words it takes — the shortest anybody could do under what the day
   *  accepts */
  par: number;
};

const spellable = (word: string, sideOf: Record<string, number>) => {
  if (![...word].every((c) => c in sideOf)) return false;
  for (let i = 1; i < word.length; i += 1) {
    if (sideOf[word[i - 1]] === sideOf[word[i]]) return false;
  }
  return true;
};

/** Twelve letters into four sides of three, so every word in `must` is
 *  spellable. Null when no arrangement does. */
export function assignSides(must: string[]): { sides: string[]; sideOf: Record<string, number> } | null {
  const letters = [...new Set(must.join(''))];
  const adjacent = new Set<string>();
  for (const word of must) {
    for (let i = 1; i < word.length; i += 1) {
      adjacent.add(word[i - 1] + word[i]);
      adjacent.add(word[i] + word[i - 1]);
    }
  }
  // Most-constrained letter first, or the search wanders.
  const degree = (c: string) => letters.filter((x) => adjacent.has(c + x)).length;
  letters.sort((a, b) => degree(b) - degree(a));

  const sides: string[][] = [[], [], [], []];
  const place = (i: number): boolean => {
    if (i === letters.length) return true;
    for (const side of sides) {
      if (side.length >= 3) continue;
      if (side.some((x) => adjacent.has(x + letters[i]))) continue;
      side.push(letters[i]);
      if (place(i + 1)) return true;
      side.pop();
    }
    return false;
  };
  if (!place(0)) return null;

  const sideOf: Record<string, number> = {};
  sides.forEach((side, i) => side.forEach((c) => { sideOf[c] = i; }));
  return { sides: sides.map((s) => s.join('')), sideOf };
}

/** Every box that two of these words can make.
 *
 *  Two theme words whose letters are exactly twelve distinct: those letters are
 *  the box, and both words are then findable in it. They do *not* have to chain
 *  — that was the mistake in the first version of this search, and theme words
 *  essentially never chain. The two-word solution the daily guarantees comes
 *  from the dictionary instead, which is what `dictionary` is for; pass none and
 *  `guaranteed` is simply unknown rather than false.
 */
const bits = (mask: number) => {
  let n = 0;
  for (let m = mask; m !== 0; m &= m - 1) n += 1;
  return n;
};

/** The dictionary prepared once for the search below: each word a bitmask of
 *  its letters, so a box rejects almost everything with one integer operation.
 *  A doubled letter is dropped here — the second always lands on the side the
 *  first is on, whatever the layout. */
type Indexed = { word: string; mask: number; last: string };

function indexed(dictionary: string[]): Indexed[] {
  const out: Indexed[] = [];
  for (const word of dictionary) {
    if (word.length < 3 || !noDouble(word)) continue;
    let mask = 0;
    let ok = true;
    for (let i = 0; i < word.length; i += 1) {
      const bit = word.charCodeAt(i) - 97;
      if (bit < 0 || bit > 25) {
        ok = false;
        break;
      }
      mask |= 1 << bit;
    }
    if (ok) out.push({ word, mask, last: word[word.length - 1] });
  }
  return out;
}

/** The shortest chain of ordinary words that solves the box — two or three — or
 *  null when neither does.
 *
 *  The board has more solutions than the one it was built from, and on a day
 *  that accepts the dictionary a player can reach them. A themed chain of three
 *  beside an ordinary pair is a board solvable in two.
 */
export function ordinarySolution(
  sideOf: Record<string, number>,
  boxMask: number,
  dictionary: Indexed[]
): string[] | null {
  const usable = dictionary.filter(
    (e) => (e.mask & ~boxMask) === 0 && spellable(e.word, sideOf)
  );
  const byFirst = new Map<string, Indexed[]>();
  for (const e of usable) {
    const list = byFirst.get(e.word[0]);
    if (list) list.push(e);
    else byFirst.set(e.word[0], [e]);
  }

  const states = new Map<string, string[]>();
  for (const first of usable) {
    for (const second of byFirst.get(first.last) ?? []) {
      const covered = first.mask | second.mask;
      if (bits(covered) === BOX_LETTERS) return [first.word, second.word];
      states.set(`${second.last} ${covered}`, [first.word, second.word]);
    }
  }
  for (const [state, pair] of states) {
    const [letter, covered] = state.split(' ');
    const left = ~Number(covered) & boxMask;
    for (const e of byFirst.get(letter) ?? []) {
      if ((left & ~e.mask) === 0) return [...pair, e.word];
    }
  }
  return null;
}

export const MAX_SEED_WORDS = 4;

/** How many boards a search will find before it stops. A themed list makes
 *  hundreds; a pasted document makes tens of thousands and takes most of a
 *  minute, which is the case this is for. */
export const BOARD_BUDGET = 2000;

/** Every chain of the theme's own words covering exactly twelve distinct
 *  letters: two of them, or three, or four.
 *
 *  A chain, not a set — each word starts with the last letter of the one
 *  before, because the chain is the answer to the board its letters make.
 *
 *  Two bounds, both measured rather than guessed. `budget` stops the walk after
 *  that many boards: a list of sixty words makes three hundred, and one of
 *  fifteen hundred makes sixty-eight thousand and takes forty-three seconds,
 *  which is a pasted document rather than a theme but is a thing somebody can
 *  paste. `must` keeps only chains containing a word it likes, which is how a
 *  filter typed on the page searches the whole list instead of a page of it —
 *  the cap that only trimmed the *results* was worse than useless, because a
 *  board that existed could not be found.
 */
export function seedChains(
  words: string[],
  {
    maxSeeds = MAX_SEED_WORDS,
    budget = BOARD_BUDGET,
    must,
  }: { maxSeeds?: number; budget?: number; must?: (word: string) => boolean } = {}
): string[][] {
  const seeds = [...new Set(words.map((w) => w.trim().toLowerCase()))]
    .filter((w) => /^[a-z]{3,}$/.test(w) && noDouble(w))
    .sort();
  const masks = new Map(
    seeds.map((w) => {
      let mask = 0;
      for (const c of w) mask |= 1 << (c.charCodeAt(0) - 97);
      return [w, mask] as const;
    })
  );

  const found = new Map<number, string[]>();
  const chain: string[] = [];
  const walk = (mask: number) => {
    const size = bits(mask);
    if (size > BOX_LETTERS) return;
    if (size === BOX_LETTERS && chain.length >= 2) {
      if (!must || chain.some(must)) {
        const had = found.get(mask);
        if (!had || had.length > chain.length) found.set(mask, [...chain]);
      }
      return;
    }
    if (found.size >= budget) return;
    if (chain.length >= maxSeeds) return;
    for (const word of seeds) {
      if (chain.includes(word)) continue;
      // The chain: this word has to start where the last one ended.
      if (chain.length > 0 && chain[chain.length - 1].at(-1) !== word[0]) continue;
      chain.push(word);
      walk(mask | masks.get(word)!);
      chain.pop();
    }
  };
  walk(0);
  return [...found.values()];
}

/** Every box these words can make, best first — best being how many of the
 *  theme's own words the finished board spells, since that is what a player
 *  finds, and then the shortest chain.
 *
 *  The seed chain is the guarantee and needs no dictionary. `dictionary` is for
 *  the other question — what else solves the board, and in how few words, on a
 *  day that accepts more than the theme. Pass none, as a themed-only day would,
 *  and the answer is the chain the board was made of.
 */
export function boxesFrom(
  words: string[],
  {
    dictionary,
    maxSeeds = MAX_SEED_WORDS,
    budget = BOARD_BUDGET,
    must,
  }: {
    dictionary?: string[];
    maxSeeds?: number;
    budget?: number;
    must?: (word: string) => boolean;
  } = {}
): Box[] {
  const all = [...new Set(words.map((w) => w.trim().toLowerCase()))].filter((w) =>
    /^[a-z]{3,}$/.test(w)
  );
  const pool = dictionary ? indexed(dictionary) : null;
  const out: Box[] = [];

  for (const from of seedChains(words, { maxSeeds, budget, must })) {
    const laid = assignSides(from);
    // Not every chain can be laid out: four sides of three, and no word may
    // step twice on one side. More words is more constraints.
    if (!laid) continue;
    let boxMask = 0;
    for (const c of from.join('')) boxMask |= 1 << (c.charCodeAt(0) - 97);
    const ordinary = pool ? ordinarySolution(laid.sideOf, boxMask, pool) : null;
    out.push({
      from,
      sides: laid.sides,
      holds: all.filter((w) => spellable(w, laid.sideOf)),
      solution: from,
      ordinary: ordinary && ordinary.length < from.length ? ordinary : null,
      par: ordinary ? Math.min(from.length, ordinary.length) : from.length,
    });
  }
  return out.sort((x, y) => y.holds.length - x.holds.length || x.par - y.par);
}

export type BridgePrompt = { x: string; middle: string; y: string; from: [string, string] };

/** Every bridge these words can make between them.
 *
 *  The themed thing is the compounds, not the answer between them: `nonprofit`
 *  and `profitable` share `profit`, which gives non · profit · able. So this
 *  needs theme words that are compounds sharing a stem, and a list of plain
 *  nouns makes none — which is the answer, and worth seeing before an evening
 *  is spent on it.
 */
export function bridgesFrom(words: string[]): BridgePrompt[] {
  const list = [...new Set(words.map((w) => w.trim().toLowerCase()))].filter((w) =>
    /^[a-z]{5,}$/.test(w)
  );
  const out: BridgePrompt[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    for (const b of list) {
      if (a === b) continue;
      for (let i = 2; i <= a.length - 3; i += 1) {
        const middle = a.slice(i);
        if (middle.length < 3 || !b.startsWith(middle)) continue;
        const x = a.slice(0, i);
        const y = b.slice(middle.length);
        if (x.length < 2 || y.length < 2) continue;
        const key = `${x}|${middle}|${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ x, middle, y, from: [a, b] });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ladders
// ---------------------------------------------------------------------------
// A ladder is two words of the same length and the shortest chain of real words
// between them. The curated pairs are related in WordNet — COLD and WARM — and
// that relation is what makes a pair read as a puzzle somebody set. A themed
// month has a relation of its own, and it only holds when *both* ends are the
// company's own words: `shares → elopes` is a ladder, but it is not a themed
// one, and pairing one theme word with any destination offers sixteen thousand
// of those against twenty-one of the real thing.
//
// Both ends have to be rungs as well. The board checks every rung against the
// common tier and par is the length of the shortest route through the words a
// player may use, so an end the tier does not have is an end nobody can type —
// and this one cannot be fixed by shipping the day's words the way the guess
// board is, because widening what counts as a rung changes par. ESOP does not
// play this game, and the panel says which words were left out.

export const LADDER_MIN_PAR = 3;
export const LADDER_MAX_PAR = 8;

/** Which tier plays which par. The generator's own bands, pinned to
 *  scripts/ladder.mjs by tests/unit/themeCalculators.test.ts. */
export const LADDER_TIERS: Record<string, [number, number]> = {
  easy: [3, 4],
  hard: [5, 6],
  extreme: [7, 8],
};

export type LadderPair = { a: string; b: string; par: number; tier: string };

const tierOf = (par: number) =>
  Object.entries(LADDER_TIERS).find(([, [lo, hi]]) => par >= lo && par <= hi)?.[0] ?? '';

/** Every ladder this list can set: both ends its own, 3 to 8 steps apart
 *  through the common tier.
 *
 *  `rungs` is the same set the board checks against — src/dictionaries.ts
 *  `common` — because par measured over anything else is a par the game will
 *  not agree with. */
export function laddersFrom(words: string[], rungs: Set<string>): LadderPair[] {
  const byLength = new Map<number, Set<string>>();
  for (const w of rungs) {
    let bucket = byLength.get(w.length);
    if (!bucket) byLength.set(w.length, (bucket = new Set()));
    bucket.add(w);
  }
  const usable = [
    ...new Set(words.map((w) => w.trim().toLowerCase())),
  ]
    .filter((w) => rungs.has(w))
    .sort();

  const out: LadderPair[] = [];
  for (let i = 0; i < usable.length; i += 1) {
    // One walk per word rather than one per pair: the distance to every other
    // theme word of that length falls out of the same search.
    const dist = distancesFrom(usable[i], byLength);
    for (let j = i + 1; j < usable.length; j += 1) {
      const b = usable[j];
      if (b.length !== usable[i].length) continue;
      const par = dist.get(b);
      if (par === undefined || par < LADDER_MIN_PAR || par > LADDER_MAX_PAR) continue;
      out.push({ a: usable[i], b, par, tier: tierOf(par) });
    }
  }
  return out;
}

/** How far every same-length rung is from `word`, breadth first, giving up at
 *  the longest par any tier plays. */
function distancesFrom(word: string, byLength: Map<number, Set<string>>): Map<string, number> {
  const pool = byLength.get(word.length) ?? new Set<string>();
  const dist = new Map([[word, 0]]);
  const queue = [word];
  for (let i = 0; i < queue.length; i += 1) {
    const w = queue[i];
    const d = dist.get(w)!;
    if (d >= LADDER_MAX_PAR) continue;
    for (let p = 0; p < w.length; p += 1) {
      for (let c = 97; c < 123; c += 1) {
        const next = w.slice(0, p) + String.fromCharCode(c) + w.slice(p + 1);
        if (next !== w && pool.has(next) && !dist.has(next)) {
          dist.set(next, d + 1);
          queue.push(next);
        }
      }
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Word squares
// ---------------------------------------------------------------------------
// A square is N words across and N down, every one of them real. Ten words
// drawn from tens of thousands will not contain a theme word by accident —
// measured, none of two hundred 4x4 boards did — which is what made this look
// impossible. The question that has an answer is the other one: can a theme
// word *head* a square, with the dictionary filling the rest? At four letters
// almost always, at five seldom.
//
// The same search runs in scripts/squares.mjs for the generator, and
// tests/unit/themeCalculators.test.ts requires the two to agree.

export type ThemedSquare = { first: string; rows: string[] };

/** Words of length n, and every prefix of them, so a partial column can be
 *  abandoned the moment nothing can finish it. */
function squareIndex(words: string[], n: number) {
  const pool: string[] = [];
  const byPrefix = new Set<string>();
  for (const w of words) {
    if (w.length !== n) continue;
    pool.push(w);
    for (let k = 1; k <= n; k += 1) byPrefix.add(w.slice(0, k));
  }
  return { pool, byPrefix };
}

/** A square headed by `first`, or null when that word cannot head one. */
export function squareHeadedBy(
  first: string,
  n: number,
  words: string[],
  nodeBudget = 2_000_000
): string[] | null {
  if (first.length !== n) return null;
  const { pool, byPrefix } = squareIndex(words, n);
  const rows = [first];
  let nodes = 0;

  const fitsHere = (w: string) => {
    for (let c = 0; c < n; c += 1) {
      let prefix = '';
      for (const r of rows) prefix += r[c];
      if (!byPrefix.has(prefix + w[c])) return false;
    }
    return true;
  };

  const place = (): boolean => {
    if (rows.length === n) {
      // Every column a word, and n different words rather than a symmetric
      // square read twice.
      const seen: string[] = [];
      for (let c = 0; c < n; c += 1) {
        let w = '';
        for (const r of rows) w += r[c];
        if (!byPrefix.has(w) || seen.includes(w) || rows.includes(w)) return false;
        seen.push(w);
      }
      return true;
    }
    if (nodes > nodeBudget) return false;
    for (const w of pool) {
      if (rows.includes(w)) continue;
      nodes += 1;
      if (nodes > nodeBudget) return false;
      if (!fitsHere(w)) continue;
      rows.push(w);
      if (place()) return true;
      rows.pop();
    }
    return false;
  };

  return place() ? [...rows] : null;
}

/** Which of these words can head a square of this size, and the square each
 *  makes — the number a page shows, and the board behind it. */
export function squaresFrom(words: string[], n: number, dictionary: string[]): ThemedSquare[] {
  const seeds = [...new Set(words.map((w) => w.trim().toLowerCase()))]
    .filter((w) => w.length === n && /^[a-z]+$/.test(w))
    .sort();
  const out: ThemedSquare[] = [];
  for (const first of seeds) {
    const rows = squareHeadedBy(first, n, dictionary);
    if (rows) out.push({ first, rows });
  }
  return out;
}
