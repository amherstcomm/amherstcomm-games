// Word squares generator: an N×N grid where every row *and* every column is a
// real word, with some letters given and the rest to fill in.
//
// Two things worth knowing before changing the numbers here.
//
// Plain backtracking with prefix pruning is enough — 4×4 solves on every seed
// in a few milliseconds, 5×5 on roughly four seeds in five. 6×6 falls off a
// cliff and the words it does find are obscure, which is why the sizes stop
// at five.
//
// And uniqueness is a check, not a goal. Word squares are so tightly
// constrained that a 5×5 stays mathematically unique down to about three
// given letters — but nobody deduces ten words from three letters. Difficulty
// comes from GIVEN_TARGET; uniqueness is then verified at that count and only
// forces extra letters when it has to.
//
// Fully deterministic for a given rng.

function shuffled(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** words of one length, plus every prefix of them, so a partial column can be
 *  abandoned the moment no word can finish it */
export function indexWords(words, n) {
  const pool = [];
  const byPrefix = new Set();
  for (const w of words) {
    if (w.length !== n) continue;
    pool.push(w);
    for (let k = 1; k <= n; k++) byPrefix.add(w.slice(0, k));
  }
  return { pool, byPrefix };
}

/** the column prefixes committed by the rows placed so far */
function columnPrefixes(rows, n) {
  const pre = [];
  for (let c = 0; c < n; c++) {
    let p = '';
    for (const r of rows) p += r[c];
    pre.push(p);
  }
  return pre;
}

/** A row fits when every column it extends still spells the start of some
 *  word. At the last row those prefixes are full length, so this is also what
 *  proves the finished columns are words. */
function fits(w, pre, byPrefix, n) {
  for (let c = 0; c < n; c++) if (!byPrefix.has(pre[c] + w[c])) return false;
  return true;
}

export function buildSquare({ pool, byPrefix }, n, rng, nodeBudget = 4_000_000) {
  const order = shuffled(pool, rng);
  const rows = [];
  const used = new Set();
  let nodes = 0;

  function place(depth) {
    if (depth === n) {
      // Ten different words, not five read twice. Nothing above forbids a
      // symmetric square — where column c spells the same as row c — and it
      // halves the puzzle while looking like a full one.
      const seen = [];
      for (let c = 0; c < n; c++) {
        let w = '';
        for (const r of rows) w += r[c];
        if (used.has(w) || seen.includes(w)) return false;
        seen.push(w);
      }
      return true;
    }
    if (nodes > nodeBudget) return false;
    const pre = columnPrefixes(rows, n);
    for (const w of order) {
      // a repeated row makes for a poor puzzle even though it's legal
      if (used.has(w)) continue;
      if (++nodes > nodeBudget) return false;
      if (!fits(w, pre, byPrefix, n)) continue;
      rows.push(w);
      used.add(w);
      if (place(depth + 1)) return true;
      rows.pop();
      used.delete(w);
    }
    return false;
  }

  return place(0) ? rows : null;
}

/** How many ways the blanks can be filled, counting no further than `cap`.
 *  Duplicate rows are allowed here on purpose: the game accepts any grid whose
 *  rows and columns are all words, so a second answer counts even if we'd
 *  never have generated it. */
export function countSolutions({ pool, byPrefix }, grid, n, cap = 2) {
  const rows = [];
  let found = 0;

  function place(depth) {
    if (depth === n) return ++found >= cap;
    const pre = columnPrefixes(rows, n);
    for (const w of pool) {
      let ok = true;
      for (let c = 0; c < n; c++) {
        const given = grid[depth * n + c];
        if (given !== null && given !== w[c]) {
          ok = false;
          break;
        }
      }
      if (!ok || !fits(w, pre, byPrefix, n)) continue;
      rows.push(w);
      if (place(depth + 1)) return true;
      rows.pop();
    }
    return false;
  }

  place(0);
  return found;
}

/** Letters to show at the start.
 *
 *  Take them away rather than build them up. Which cells are shown matters as
 *  much as how many — a well-chosen six can pin a 4×4 where a badly-chosen
 *  thirteen leave it ambiguous — and adding letters to a random subset until
 *  it happens to become unique ends up showing nearly the whole grid. Removing
 *  from the full square keeps the answer unique at every step, so we can stop
 *  the moment we hit the target and know the puzzle is still sound.
 *
 *  Every row and column keeps at least one letter: a line with nothing in it
 *  is a word pulled out of thin air rather than deduced. */
export function chooseGiven(rows, n, rng, target, valIndex) {
  const flat = rows.join('').split('');
  const given = new Set([...Array(n * n).keys()]);
  const rowLeft = Array(n).fill(n);
  const colLeft = Array(n).fill(n);
  const gridOf = () => flat.map((ch, i) => (given.has(i) ? ch : null));

  for (const cell of shuffled([...Array(n * n).keys()], rng)) {
    if (given.size <= target) break;
    const r = Math.floor(cell / n);
    const c = cell % n;
    if (rowLeft[r] <= 1 || colLeft[c] <= 1) continue;
    given.delete(cell);
    if (countSolutions(valIndex, gridOf(), n) === 1) {
      rowLeft[r]--;
      colLeft[c]--;
    } else {
      given.add(cell);
    }
  }

  return [...given].sort((a, b) => a - b);
}

/**
 * @param rng        seeded random source
 * @param n          grid size (4 or 5)
 * @param genWords   list the square is built from — keep this the common tier,
 *                   since these words are the answer and have to be fair
 * @param valWords   list the answer is checked for uniqueness against; use the
 *                   same list the game accepts typing against, or "unique"
 *                   means something different to us than to the player
 * @param target     how many letters to show
 */
export function generateSquare(rng, n, genWords, valWords, target, attempts = 40) {
  const gen = indexWords(genWords, n);
  const val = indexWords(valWords, n);
  for (let i = 0; i < attempts; i++) {
    const rows = buildSquare(gen, n, rng);
    if (!rows) continue;
    const given = chooseGiven(rows, n, rng, target, val);
    return { rows, given };
  }
  return null;
}

/** how many letters each size starts with — the difficulty dial */
export const GIVEN_TARGET = { 4: 6, 5: 10 };

/** A square whose top row is a word you chose, and whose other rows and every
 *  column come from the dictionary.
 *
 *  This is what theming a square means, and measuring the wrong thing is what
 *  made it look impossible. Asking whether an *unseeded* square happens to
 *  contain a theme word answers no — 0 of 200 at 4x4 — because a square is ten
 *  words drawn from tens of thousands. Asking whether a theme word can *head*
 *  one answers yes almost always: 22 of 23 ordinary four-letter words did, and
 *  12 of 20 five-letter ones.
 *
 *  Null when the word cannot head one, which is the honest answer for a word
 *  whose letters no column can follow.
 */
export function squareHeadedBy(first, n, words, rng, nodeBudget = 2_000_000) {
  if (!first || first.length !== n) return null;
  const { pool, byPrefix } = indexWords(words, n);
  const order = shuffled(pool, rng);
  const rows = [first];
  let nodes = 0;

  const fitsHere = (w) => {
    for (let c = 0; c < n; c++) {
      let prefix = '';
      for (const r of rows) prefix += r[c];
      if (!byPrefix.has(prefix + w[c])) return false;
    }
    return true;
  };

  const place = () => {
    if (rows.length === n) {
      // Every column a word, and ten different words rather than five read
      // twice — the same rule the unseeded builder holds itself to.
      const seen = [];
      for (let c = 0; c < n; c++) {
        let w = '';
        for (const r of rows) w += r[c];
        if (!byPrefix.has(w) || seen.includes(w) || rows.includes(w)) return false;
        seen.push(w);
      }
      return true;
    }
    if (nodes > nodeBudget) return false;
    for (const w of order) {
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

/** The theme's own words that could head a square of this size, with the square
 *  each one makes — so a page can say which of them work rather than how many
 *  might. */
export function themedSquares(themeWords, n, words, rng) {
  const seeds = [...new Set((themeWords ?? []).map((w) => w.trim().toLowerCase()))]
    .filter((w) => w.length === n && /^[a-z]+$/.test(w))
    .sort();
  const out = [];
  for (const first of seeds) {
    const rows = squareHeadedBy(first, n, words, rng);
    if (rows) out.push({ first, rows });
  }
  return out;
}
