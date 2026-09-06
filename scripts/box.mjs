// Letter Boxed, built out of a theme.
//
// The ordinary daily takes two chainable words whose letters are exactly twelve
// distinct, and lays the sides so neither word steps twice on one side. That
// construction hands over the two-word solution for free: the board was made
// out of it.
//
// A themed box is the same twelve letters from two *theme* words, and they do
// not chain — theme words essentially never do, and requiring it reported zero
// pairs from a list with twenty-one. So the guarantee has to be found rather
// than assumed: some two ordinary words that chain and cover all twelve. A
// themed box without one is a board whose promise ("solvable in 2") is false,
// which is worse than an unthemed board, so it is not used.
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

/** Whether two ordinary words chain and cover every letter of the box. */
function finishable(sideOf, boxMask, dictionary) {
  const usable = dictionary.filter((e) => (e.mask & ~boxMask) === 0 && spellable(e.word, sideOf));
  const byFirst = new Map();
  for (const e of usable) {
    const list = byFirst.get(e.word[0]);
    if (list) list.push(e);
    else byFirst.set(e.word[0], [e]);
  }
  for (const first of usable) {
    for (const second of byFirst.get(first.last) ?? []) {
      if (bits(first.mask | second.mask) === BOX_LETTERS) return true;
    }
  }
  return false;
}

/** Every box two of these theme words can make, best first — best being how
 *  many of the theme's own words the finished board can spell, since that is
 *  what a player finds.
 *
 *  `dictionary` is the pool the board will accept. Pass none and `guaranteed`
 *  is simply unknown rather than false. */
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
        guaranteed: pool ? finishable(laid.sideOf, boxMask, pool) : false,
      });
    }
  }
  return out.sort((x, y) => y.holds.length - x.holds.length);
}
