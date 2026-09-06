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
// The chain is *a* solution and the shortest one made of the theme's own words,
// because the search keeps the shortest chain per set of twelve letters. It is
// not the only one: a board is a board, and other pairs and longer chains solve
// it too. Which of them a player may use is the day's business — see the word
// policy — so the par the board promises is the shortest solution available
// under what that day accepts. On a day that takes the dictionary as well, two
// ordinary words often beat a chain of three of yours.
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

/** The dictionary prepared once for the search below: each word a bitmask of
 *  its letters, so a box rejects almost everything with one integer operation.
 *  A doubled letter is dropped here — the second one always lands on the side
 *  the first is on, whatever the layout. */
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

/** The shortest chain of ordinary words that solves the box — two of them or
 *  three — or null when neither does.
 *
 *  The board has more solutions than the one it was built from, and on a day
 *  that accepts the dictionary a player can reach them. So this is what decides
 *  what the board promises: a themed chain of three beside an ordinary pair is
 *  a board solvable in two, and saying three would be wrong.
 */
export function ordinarySolution(sideOf, boxMask, dictionary) {
  const usable = dictionary.filter((e) => (e.mask & ~boxMask) === 0 && spellable(e.word, sideOf));
  const byFirst = new Map();
  for (const e of usable) {
    const list = byFirst.get(e.word[0]);
    if (list) list.push(e);
    else byFirst.set(e.word[0], [e]);
  }

  const states = new Map();
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
  themeWords,
  { maxSeeds = MAX_SEED_WORDS, budget = BOARD_BUDGET, must } = {}
) {
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
      walk(mask | masks.get(word));
      chain.pop();
    }
  };
  walk(0);
  return [...found.values()];
}

/** Every box the theme can make, best first — best being how many of the
 *  theme's own words the finished board spells, since that is what a player
 *  finds, and then the shortest solution.
 *
 *  The seed chain is the guarantee and needs no dictionary. `dictionary` is for
 *  the other question: what else solves the board, and in how few words, for a
 *  day that accepts more than the theme. Pass none — a themed-only day — and
 *  the answer is the chain the board was made of.
 */
export function themedBoxes(
  themeWords,
  { dictionary = null, maxSeeds = MAX_SEED_WORDS, budget = BOARD_BUDGET, must } = {}
) {
  const words = [...new Set((themeWords ?? []).map((w) => w.trim().toLowerCase()))];
  const all = words.filter((w) => /^[a-z]{3,}$/.test(w));
  const pool = dictionary ? indexed(dictionary) : null;
  const out = [];

  for (const from of seedChains(words, { maxSeeds, budget, must })) {
    const laid = assignThemedSides(from);
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
      // The chain the board was built from: a solution, and the shortest made
      // of the theme's own words.
      solution: from,
      // The shortest an ordinary player could find on a day that accepts the
      // dictionary, where there is one shorter than the theme's own chain.
      ordinary: ordinary && ordinary.length < from.length ? ordinary : null,
      // What the board promises, which is the shortest anybody could do.
      par: ordinary ? Math.min(from.length, ordinary.length) : from.length,
    });
  }
  return out.sort((x, y) => y.holds.length - x.holds.length || x.par - y.par);
}
