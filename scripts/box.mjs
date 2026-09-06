// Letter Boxed, built out of a theme.
//
// The ordinary daily takes two chainable words whose letters are exactly twelve
// distinct, and lays the sides so neither word steps twice on one side. That
// construction hands over the two-word solution for free: the board was made
// out of it.
//
// A themed box is the same twelve letters from two *theme* words, and they do
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
export function themedBoxes(themeWords, dictionary) {
  const words = [...new Set((themeWords ?? []).map((w) => w.trim().toLowerCase()))];
  const seeds = words.filter((w) => /^[a-z]+$/.test(w) && w.length >= 4 && noDouble(w));
  const all = words.filter((w) => /^[a-z]{3,}$/.test(w));
  const pool = dictionary ? indexed(dictionary) : null;
  const out = [];

  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const a = seeds[i];
      const b = seeds[j];
      if (new Set(a + b).size !== BOX_LETTERS) continue;
      const laid = assignThemedSides([a, b]);
      if (!laid) continue;
      let boxMask = 0;
      for (const c of a + b) boxMask |= 1 << (c.charCodeAt(0) - 97);
      out.push({
        from: [a, b],
        sides: laid.sides,
        holds: all.filter((w) => spellable(w, laid.sideOf)),
        par: pool ? solvableIn(laid.sideOf, boxMask, pool) : null,
      });
    }
  }
  return out.sort((x, y) => (x.par ?? 9) - (y.par ?? 9) || y.holds.length - x.holds.length);
}
