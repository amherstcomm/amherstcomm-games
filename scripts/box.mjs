// Letter Boxed, built out of a theme.
//
// The ordinary daily takes two chainable words whose letters are exactly twelve
// distinct, and lays the sides so neither word steps twice on one side. That
// construction hands over the two-word solution for free: the board was made
// out of it.
//
// A themed box is the same twelve letters from the theme's own words — two of
// them, or three, or four, because a box needs twelve distinct letters and two
// six-letter words rarely have twelve between them. They do
// not chain — theme words essentially never do, and requiring it reported zero
// pairs from a list with twenty-one. The chaining rule is not relaxed by that:
// it is the game. What changes is that the answer is no longer inherited from
// the construction, so it has to be found — words that chain, each starting
// with the last letter of the one before, covering all twelve between them.
//
// Two is preferred; three is allowed and is a real answer rather than a
// consolation, and the board says which it takes. A box that can be solved in
// neither is not published, because a board whose promise is false is worse
// than an unthemed one.
//
// The same search runs in the browser (src/themeCalculators.ts) to tell
// somebody writing a list what it can make. Two implementations of one rule,
// asserted against each other by tests/unit/themeCalculators.test.ts.

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

/** The dictionary prepared once: each word a bitmask of its letters, so a box
 *  rejects almost every word with one integer operation. Words with a doubled
 *  letter are dropped here — the second one always lands on the side the first
 *  is on, whatever the layout. */
function indexed(dictionary) {
  const out = [];
  for (const word of dictionary) {
    if (word.length < 3 || !noDouble(word)) continue;
    let mask = 0;
    let ok = true;
    for (let i = 0; i < word.length; i++) {
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

const bits = (mask) => {
  let n = 0;
  for (let m = mask; m !== 0; m &= m - 1) n++;
  return n;
};

/** In how few ordinary words the box can be solved: 2, 3, or null for neither.
 *
 *  Two is what an ordinary daily promises, because it is built out of a
 *  chaining pair and inherits the answer. A themed box has to earn the promise
 *  instead, and three is a real answer rather than a consolation — Letter Boxed
 *  itself sets boards that take three, and a board made of the company's own
 *  words is worth the extra rung. Two is still preferred where it exists.
 *
 *  Four is not offered. Past three the board stops being a puzzle with a shape
 *  and becomes a word hunt, and the number on screen stops meaning anything a
 *  player can aim at.
 */
export function solvableIn(sideOf, boxMask, dictionary, max = 3) {
  const usable = dictionary.filter((e) => (e.mask & ~boxMask) === 0 && spellable(e.word, sideOf));
  const byFirst = new Map();
  for (const e of usable) {
    const list = byFirst.get(e.word[0]);
    if (list) list.push(e);
    else byFirst.set(e.word[0], [e]);
  }
  // Distinct masks per starting letter: the third word is only ever asked
  // "does anything starting here cover what is left", and a thousand words
  // that cover the same letters answer that once.
  const masksByFirst = new Map();
  for (const [letter, list] of byFirst) {
    masksByFirst.set(letter, [...new Set(list.map((e) => e.mask))]);
  }

  // Two, and every pair that fails becomes a state for three: what is covered
  // so far, and which letter the next word has to start with. Collapsed by
  // (letter, covered) — the words that got there do not matter afterwards.
  const states = new Set();
  for (const first of usable) {
    for (const second of byFirst.get(first.last) ?? []) {
      const covered = first.mask | second.mask;
      if (bits(covered) === BOX_LETTERS) return 2;
      if (max >= 3) states.add(`${second.last} ${covered}`);
    }
  }
  if (max < 3) return null;

  for (const state of states) {
    const [letter, covered] = state.split(' ');
    const left = ~Number(covered) & boxMask;
    for (const mask of masksByFirst.get(letter) ?? []) {
      if ((left & ~mask) === 0) return 3;
    }
  }
  return null;
}

/** Every box two of these theme words can make.
 *
 *  Ordered the way a day should choose: the boards that can be solved in two
 *  first, then the ones that take three, and within each by how many of the
 *  theme's own words the finished board spells — which is what a player finds.
 *
 *  `dictionary` is the pool the board will accept. Pass none and `par` is null,
 *  meaning unknown rather than unsolvable. */
export const MAX_SEED_WORDS = 4;

/** Every set of theme words whose letters are exactly twelve distinct: two of
 *  them, or three, or four.
 *
 *  Pairs alone leave most of a list unused — a box needs twelve distinct
 *  letters and two six-letter words rarely have twelve between them, while
 *  `vote` + `gain` + `shared` do. Measured on a 66-word list: 52 boards from
 *  pairs, 4,388 from sets of up to four, and the bigger seeds spell far more of
 *  the theme (sixteen of its own words against three).
 *
 *  Depth first with the letters carried along, so a branch is abandoned the
 *  moment it passes twelve rather than after the whole combination is built.
 *  Two word sets that make the same twelve letters are the same board: the
 *  fewest words wins, so the answer does not depend on the order the search
 *  reached them in.
 */
export function seedSets(themeWords, maxSeeds = MAX_SEED_WORDS) {
  const seeds = [
    ...new Set((themeWords ?? []).map((w) => w.trim().toLowerCase())),
  ]
    .filter((w) => /^[a-z]+$/.test(w) && w.length >= 3 && noDouble(w))
    .sort();
  const masks = new Map(
    seeds.map((w) => {
      let mask = 0;
      for (const c of w) mask |= 1 << (c.charCodeAt(0) - 97);
      return [w, mask];
    })
  );

  const found = new Map();
  const chosen = [];
  const walk = (from, mask) => {
    const size = bits(mask);
    if (size > BOX_LETTERS) return;
    if (size === BOX_LETTERS && chosen.length >= 2) {
      const had = found.get(mask);
      if (!had || had.length > chosen.length) found.set(mask, [...chosen]);
      return;
    }
    if (chosen.length >= maxSeeds) return;
    for (let i = from; i < seeds.length; i++) {
      chosen.push(seeds[i]);
      walk(i + 1, mask | masks.get(seeds[i]));
      chosen.pop();
    }
  };
  walk(0, 0);
  return [...found];
}

/** Every box those sets can make, best first.
 *
 *  `limit` stops once that many boards have been laid and measured. The
 *  generator wants them all — it deals three a day out of the best of them —
 *  but the admin page only needs to say what a list can make, and measuring
 *  four thousand boards takes ten seconds. The enumeration order is
 *  deterministic, so a limited answer is a stable prefix rather than a sample.
 */
export function themedBoxes(themeWords, dictionary, { maxSeeds = MAX_SEED_WORDS, limit = Infinity } = {}) {
  const words = [...new Set((themeWords ?? []).map((w) => w.trim().toLowerCase()))];
  const all = words.filter((w) => /^[a-z]{3,}$/.test(w));
  const pool = dictionary ? indexed(dictionary) : null;

  const out = [];
  for (const [boxMask, from] of seedSets(words, maxSeeds)) {
    const laid = assignThemedSides(from);
    // Not every set can be laid out: four sides of three, and no word may step
    // twice on one side. More seed words is more constraints, so this refuses
    // more often than a pair does.
    if (!laid) continue;
    out.push({
      from,
      sides: laid.sides,
      holds: all.filter((w) => spellable(w, laid.sideOf)),
      par: pool ? solvableIn(laid.sideOf, boxMask, pool) : null,
    });
    if (out.length >= limit) break;
  }
  return out.sort(
    (x, y) =>
      (x.par ?? 9) - (y.par ?? 9) ||
      y.holds.length - x.holds.length ||
      x.from.length - y.from.length
  );
}
