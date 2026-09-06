// Can a themed word list actually build Boxed, Bridge or Squares?
//
// Asked before building three generators, because the answer decides whether
// they are worth building and what shape each one takes. Run it against a real
// list rather than reasoning about it:
//
//   node scripts/feasibility.mjs path/to/words.txt
//
// with one word per line, or no argument for the sample used to size the work.
//
// What it measures, and why each is the question it is:
//
//   Boxed    is twelve letters. The first version asked whether two *theme*
//            words could solve it, which is not what a themed box is — Ray's
//            correction. The question is how many theme words a twelve-letter
//            box can hold, since those are the words a player finds; the
//            solution is a guarantee, not the theme.
//   Bridge   the themed thing is not the middle answer, it is the compounds
//            either side of it — nonprofit and profitable give non · profit ·
//            able. So it needs theme words that are compounds sharing a stem,
//            which is why it is thin.
//   Squares  needs a themed word to head a double word square — every row and
//            every column a word.
//
// The finding that mattered, once the question was the right one: a twelve
// letter box holding *nine* theme words exists, and it takes three ordinary
// words to solve rather than two. So Boxed is buildable and the cost is the
// two-word guarantee, which is a difficulty choice rather than a rule of the
// game.
//
// The search over letter sets is greedy — one box per seed word — so a count
// here is a lower bound on what exists, never a proof that nothing better
// does.
import { readFileSync } from 'node:fs';

const SAMPLE = [
  'shares', 'dividend', 'esop', 'vesting', 'buyout', 'equity', 'profit', 'capital',
  'worker', 'owner', 'stake', 'payout', 'reward', 'target', 'metrics', 'bonus',
  'split', 'trustee', 'voting', 'member', 'growth', 'value', 'invest', 'earned',
  'shared', 'stock', 'payroll', 'pension', 'benefit', 'culture', 'meeting',
  'ballot', 'tenure', 'salary', 'budget', 'company', 'employee', 'ownership',
  'partner', 'surplus', 'share', 'vote', 'risk', 'team', 'goal', 'plan', 'fund',
  'wage', 'cash', 'gain', 'earn',
];

const file = process.argv[2];
const theme = (
  file
    ? readFileSync(file, 'utf8').split(/[^A-Za-z]+/)
    : SAMPLE
)
  .map((w) => w.toLowerCase())
  .filter((w) => /^[a-z]{3,}$/.test(w));

const band = (b) => JSON.parse(readFileSync(`src/wordbands/${b}.json`, 'utf8')).words;
const generatable = band('band-20').filter((w) => /^[a-z]+$/.test(w));
const accepted = new Set(
  ['band-10', 'band-20', 'band-35', 'band-55'].flatMap(band).filter((w) => /^[a-z]+$/.test(w))
);

console.log(`theme: ${theme.length} words · dictionary: ${accepted.size} accepted\n`);

// --------------------------------------------------------------------- Boxed
// How many theme words a twelve-letter box can hold, and what it costs to solve.
const noDouble = (w) => !/(.)/.test(w);

const spellable = (w, sideOf) => {
  if (![...w].every((c) => c in sideOf)) return false;
  for (let i = 1; i < w.length; i++) if (sideOf[w[i - 1]] === sideOf[w[i]]) return false;
  return true;
};

/** Twelve letters into four sides of three, so every word in `must` is
 *  spellable — no word may step twice on one side. */
function layout(letters, must) {
  const adj = new Set();
  for (const w of must) {
    for (let i = 1; i < w.length; i++) {
      adj.add(w[i - 1] + w[i]);
      adj.add(w[i] + w[i - 1]);
    }
  }
  const degree = (c) => [...letters].filter((x) => adj.has(c + x)).length;
  const order = [...letters].sort((a, b) => degree(b) - degree(a));
  const sides = [[], [], [], []];
  const bt = (i) => {
    if (i === order.length) return true;
    for (let s = 0; s < 4; s++) {
      if (sides[s].length >= 3) continue;
      if (sides[s].some((x) => adj.has(x + order[i]))) continue;
      sides[s].push(order[i]);
      if (bt(i + 1)) return true;
      sides[s].pop();
    }
    return false;
  };
  if (!bt(0)) return null;
  const sideOf = {};
  sides.forEach((side, i) => side.forEach((c) => { sideOf[c] = i; }));
  return { sides: sides.map((x) => x.join('')), sideOf };
}

/** The shortest chain of words covering every letter, up to `maxWords`. */
function solve(pool, letters, maxWords) {
  const need = [...letters];
  const seen = new Set();
  let frontier = pool.map((w) => ({ chain: [w], covered: new Set(w), last: w.at(-1) }));
  for (let depth = 1; depth <= maxWords; depth += 1) {
    const next = [];
    for (const st of frontier) {
      if (need.every((c) => st.covered.has(c))) return st.chain;
      const key = st.last + [...st.covered].sort().join('');
      if (seen.has(key)) continue;
      seen.add(key);
      for (const w of pool) {
        if (w[0] !== st.last) continue;
        next.push({ chain: [...st.chain, w], covered: new Set([...st.covered, ...w]), last: w.at(-1) });
      }
    }
    // Bounded: this answers "is there one", and an unbounded frontier on a
    // twelve-letter box grows past patience without changing the answer.
    frontier = next.length > 60_000 ? next.slice(0, 60_000) : next;
  }
  return null;
}

const boxable = theme.filter((w) => w.length >= 4 && noDouble(w));
let best = null;
// Greedy, one box per seed: a lower bound on what exists, never a proof that
// nothing better does.
for (const seed of boxable) {
  let letters = new Set(seed);
  const chosen = [seed];
  for (const w of boxable) {
    if (w === seed) continue;
    const merged = new Set([...letters, ...w]);
    if (merged.size > 12) continue;
    letters = merged;
    chosen.push(w);
  }
  if (letters.size !== 12) continue;
  const laid = layout(letters, chosen);
  if (!laid) continue;
  const held = chosen.filter((w) => spellable(w, laid.sideOf));
  if (!best || held.length > best.held.length) best = { letters, held, laid };
}

console.log('Boxed — how many theme words a twelve-letter box holds');
if (!best) {
  console.log('  no twelve-letter box covers a group of these words');
} else {
  console.log(`  ${best.held.length} words: ${best.held.join(', ')}`);
  console.log(`  sides ${best.laid.sides.join(' | ')}`);
  const ordinary = generatable.filter((w) => w.length >= 3 && spellable(w, best.laid.sideOf));
  const themedSolution = solve(best.held, best.letters, 4);
  console.log(`  solvable with theme words alone: ${themedSolution ? themedSolution.join(' → ') : 'no'}`);
  for (const cap of [2, 3]) {
    const sol = solve(ordinary, best.letters, cap);
    console.log(`  in ${cap} ordinary words: ${sol ? sol.join(' → ') : 'no'}`);
  }
}

// -------------------------------------------------------------------- Bridge
// The compounds are the theme, not the answer between them: nonprofit and
// profitable share `profit`, which makes non · profit · able.
const themeSet = new Set(theme);
const prompts = [];
for (const a of themeSet) {
  for (const b of themeSet) {
    if (a === b) continue;
    for (let i = 2; i <= a.length - 3; i += 1) {
      const stem = a.slice(i);
      if (stem.length < 3 || !b.startsWith(stem)) continue;
      const x = a.slice(0, i);
      const y = b.slice(stem.length);
      if (x.length < 2 || y.length < 2) continue;
      prompts.push(`${x} · ${stem} · ${y}  (${a} / ${b})`);
    }
  }
}
console.log(`
Bridge — theme words that are compounds sharing a stem`);
console.log(`  ${prompts.length} prompts`);
for (const p of prompts.slice(0, 6)) console.log(`  ${p}`);

// ------------------------------------------------------------------- Squares
// The pool is the whole story here, which is worth knowing before building
// rather than after. Band 20 alone — what other puzzles are generated from —
// completes nothing at either size; widened to the common tiers it completes
// most. Both are reported, because "can Squares be themed" has no answer that
// is not "depends how wide you let the pool be".
const squaresPools = {
  'band 20': generatable,
  'common tiers': [...new Set(['band-10', 'band-20', 'band-35'].flatMap(band))].filter((w) =>
    /^[a-z]+$/.test(w)
  ),
};

console.log('\nSquares — a themed word heading a double word square');
for (const [poolName, source] of Object.entries(squaresPools))
for (const N of [4, 5]) {
  const pool = source.filter((w) => w.length === N);
  const byPrefix = new Map();
  for (const w of pool) {
    for (let i = 1; i <= N; i++) {
      const p = w.slice(0, i);
      if (!byPrefix.has(p)) byPrefix.set(p, []);
      byPrefix.get(p).push(w);
    }
  }
  const heads = theme.filter((w) => w.length === N);
  let ok = 0;
  const eg = [];
  for (const first of heads) {
    const rows = [first];
    let steps = 0;
    const fits = () =>
      Array.from({ length: N }, (_, c) => rows.map((r) => r[c]).join('')).every((col) =>
        byPrefix.has(col)
      );
    // Bounded: the question is whether one exists, not which is best, and an
    // unbounded search on a bad head runs for minutes to say "no".
    const bt = () => {
      if ((steps += 1) > 400_000) return false;
      if (rows.length === N) return true;
      for (const cand of byPrefix.get(rows.map((r) => r[rows.length]).join('')) ?? []) {
        rows.push(cand);
        if (fits() && bt()) return true;
        rows.pop();
      }
      return false;
    };
    if (fits() && bt()) {
      ok += 1;
      if (eg.length < 2) eg.push(rows.join(' / '));
    }
  }
  console.log(
    `  ${N}×${N}, ${poolName}: ${ok}/${heads.length} themed words (pool ${pool.length})`
  );
  if (eg.length) console.log(`    e.g. ${eg.join('  |  ')}`);
}

console.log(
  '\nOnly one word of each board is themed — the second Boxed word, the two' +
    '\nBridge fragments and every Squares row but the first are ordinary. Whether' +
    "\nthat reads as themed to somebody playing it is a judgement, not a number."
);
