// Letter Boxed, built out of a theme.
//
// The ordinary daily takes two chainable words whose twelve distinct letters
// become the board, and lays the sides so neither word steps twice on one side.
// The two-word solution is then free: the board was made out of it.
//
// A themed box is the same construction with the theme's own words — and the
// same rule, which two versions of this got wrong by dropping. The seed words
// must **chain**: each starts with the last letter of the one before, and
// between them they cover exactly twelve distinct letters. That chain is the
// answer. `acquire + negotiations` was never one — e does not lead to n — and a
// board whose seed does not solve it is a board seeded by nothing in
// particular.
//
// Two words rarely manage it, which is what sent the first version wrong: it
// measured pairs, got zero, and dropped the chain rather than the pair.
// Measured on a 66-word list, chains of two give three boards, of three a
// hundred and sixty, and of four three hundred and twenty-nine. So the seed is
// a chain of two to four words rather than a pair of them.
//
// The same search runs in the browser (src/themeCalculators.ts) to say what a
// list can make and to offer the boards a day can be pinned to. Two
// implementations of one rule, asserted against each other by
// tests/unit/themeCalculators.test.ts.

const noDouble = (w) => !/(\w)\1/.test(w);

export const BOX_LETTERS = 12;

const spellable = (word, sideOf) => {
  for (const c of word) if (!(c in sideOf)) return false;
  for (let i = 1; i < word.length; i++) {
    if (sideOf[word[i - 1]] === sideOf[word[i]]) return false;
  }
  return true;
};

/** Twelve letters onto four sides of three, so every word in `must` can be
 *  spelled. Deterministic on purpose: the day's variety comes from which pair
 *  is chosen, and a layout that depended on a shuffle would be one more thing
 *  the browser and the generator could disagree about. */
export function assignThemedSides(must) {
  const letters = [...new Set(must.join(''))];
  const adjacent = new Set();
  for (const word of must) {
    for (let i = 1; i < word.length; i++) {
      adjacent.add(word[i - 1] + word[i]);
      adjacent.add(word[i] + word[i - 1]);
    }
  }
  const degree = (c) => letters.filter((x) => adjacent.has(c + x)).length;
  letters.sort((a, b) => degree(b) - degree(a));

  const sides = [[], [], [], []];
  const place = (i) => {
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

  const sideOf = {};
  sides.forEach((side, i) => side.forEach((c) => { sideOf[c] = i; }));
  return { sides: sides.map((s) => s.join('')), sideOf };
}

const bits = (mask) => {
  let n = 0;
  for (let m = mask; m !== 0; m &= m - 1) n++;
  return n;
};

export const MAX_SEED_WORDS = 4;

/** Every chain of the theme's own words covering exactly twelve distinct
 *  letters: two of them, or three, or four.
 *
 *  A chain, not a set — each word starts with the last letter of the one
 *  before, because the chain is the answer to the board its letters make.
 *
 *  Depth first with the letters carried along, so a branch is abandoned the
 *  moment it passes twelve. Two chains covering the same twelve letters are the
 *  same board: the shortest wins, so the answer does not depend on the order
 *  the search happened to reach them in.
 */
export function seedChains(themeWords, maxSeeds = MAX_SEED_WORDS) {
  const seeds = [...new Set((themeWords ?? []).map((w) => w.trim().toLowerCase()))]
    .filter((w) => /^[a-z]{3,}$/.test(w) && noDouble(w))
    .sort();
  const masks = new Map(
    seeds.map((w) => {
      let mask = 0;
      for (const c of w) mask |= 1 << (c.charCodeAt(0) - 97);
      return [w, mask];
    })
  );

  const found = new Map();
  const chain = [];
  const walk = (mask) => {
    const size = bits(mask);
    if (size > BOX_LETTERS) return;
    if (size === BOX_LETTERS && chain.length >= 2) {
      const had = found.get(mask);
      if (!had || had.length > chain.length) found.set(mask, [...chain]);
      return;
    }
    if (chain.length >= maxSeeds) return;
    for (const word of seeds) {
      if (chain.includes(word)) continue;
      // The chain: this word has to start where the last one ended.
      if (chain.length > 0 && chain[chain.length - 1].at(-1) !== word[0]) continue;
      chain.push(word);
      walk(mask | masks.get(word));
      chain.pop();
    }
  };
  walk(0);
  return [...found.values()];
}

/** Every box the theme can make, best first — best being how many of the
 *  theme's own words the finished board spells, since that is what a player
 *  finds, and then the shortest chain.
 *
 *  No dictionary: the seed chain *is* the solution, so the guarantee comes from
 *  the construction rather than from a search. `limit` stops early for a caller
 *  that wants a page of them rather than all of them.
 */
export function themedBoxes(themeWords, { maxSeeds = MAX_SEED_WORDS, limit = Infinity } = {}) {
  const words = [...new Set((themeWords ?? []).map((w) => w.trim().toLowerCase()))];
  const all = words.filter((w) => /^[a-z]{3,}$/.test(w));
  const out = [];

  for (const from of seedChains(words, maxSeeds)) {
    const laid = assignThemedSides(from);
    // Not every chain can be laid out: four sides of three, and no word may
    // step twice on one side. More words is more constraints.
    if (!laid) continue;
    out.push({
      from,
      sides: laid.sides,
      holds: all.filter((w) => spellable(w, laid.sideOf)),
      // The chain the board was built from, which is the chain that solves it.
      solution: from,
      par: from.length,
    });
    if (out.length >= limit) break;
  }
  return out.sort((x, y) => y.holds.length - x.holds.length || x.par - y.par);
}
