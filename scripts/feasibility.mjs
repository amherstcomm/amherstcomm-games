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
//
// The generator builds a box *from* two chainable words: their twelve distinct
// letters are the box, and the sides are assigned so neither word steps twice
// on one side. The two-word solution is guaranteed because the box was built
// out of it.
//
// Two ways to theme that, both measured, because the first version of this file
// measured a third that answered nothing. It asked whether two theme words
// could be that seed pair — twelve distinct letters *and* chainable — and got
// zero. The zero was the extra constraint: theme words do not chain. Dropping
// it is Ray's proposal, and it works.
//
//   from the theme   two theme words whose letters are twelve distinct. Both
//                    are then spellable, and the guaranteed two-word solution
//                    comes from the dictionary instead of from them.
//   from the pool    keep the ordinary seed pair, and choose among the two
//                    hundred thousand of them by how many theme words the
//                    resulting box happens to spell.
//
// Both keep the guarantee. The second holds more theme words; the first is a
// smaller search and the box is visibly made of the theme.
const noDouble = (w) => !/(\w)\1/.test(w);

const spellable = (w, sideOf) => {
  if (![...w].every((c) => c in sideOf)) return false;
  for (let i = 1; i < w.length; i += 1) if (sideOf[w[i - 1]] === sideOf[w[i]]) return false;
  return true;
};

/** Twelve letters into four sides of three, so every word in `must` is
 *  spellable — no word may step twice on one side. */
function assignSides(must) {
  const letters = [...new Set(must.join(''))];
  const adj = new Set();
  for (const w of must) {
    for (let i = 1; i < w.length; i += 1) {
      adj.add(w[i - 1] + w[i]);
      adj.add(w[i] + w[i - 1]);
    }
  }
  const degree = (c) => letters.filter((x) => adj.has(c + x)).length;
  letters.sort((a, b) => degree(b) - degree(a));
  const sides = [[], [], [], []];
  const bt = (i) => {
    if (i === letters.length) return true;
    for (let sd = 0; sd < 4; sd += 1) {
      if (sides[sd].length >= 3) continue;
      if (sides[sd].some((x) => adj.has(x + letters[i]))) continue;
      sides[sd].push(letters[i]);
      if (bt(i + 1)) return true;
      sides[sd].pop();
    }
    return false;
  };
  if (!bt(0)) return null;
  const sideOf = {};
  sides.forEach((side, i) => side.forEach((c) => { sideOf[c] = i; }));
  return { sides: sides.map((x) => x.join('')), sideOf };
}

const boxPool = generatable.filter((w) => w.length >= 3);
const seedPool = boxPool.filter((w) => w.length >= 4 && noDouble(w));
const seedByFirst = new Map();
for (const w of seedPool) {
  if (!seedByFirst.has(w[0])) seedByFirst.set(w[0], []);
  seedByFirst.get(w[0]).push(w);
}

/** Is there any two ordinary words that finish this box? That is the guarantee
 *  the generator makes, and it has to survive whatever chose the letters. */
const twoWordSolution = (sideOf, size) => {
  const usable = boxPool.filter((w) => spellable(w, sideOf));
  return usable.some((x) =>
    usable.some((y) => y[0] === x.at(-1) && new Set(x + y).size === size)
  );
};

const boxable = theme.filter((w) => w.length >= 4 && noDouble(w));

// --- from the theme
let pairs = 0;
let guaranteed = 0;
let bestThemed = null;
for (let i = 0; i < boxable.length; i += 1) {
  for (let j = i + 1; j < boxable.length; j += 1) {
    const a = boxable[i];
    const b = boxable[j];
    if (new Set(a + b).size !== 12) continue;
    pairs += 1;
    const laid = assignSides([a, b]);
    if (!laid) continue;
    if (!twoWordSolution(laid.sideOf, 12)) continue;
    guaranteed += 1;
    const held = theme.filter((w) => spellable(w, laid.sideOf));
    if (!bestThemed || held.length > bestThemed.held.length) {
      bestThemed = { a, b, laid, held };
    }
  }
}
console.log('Boxed — a box built from two theme words');
console.log(`  ${pairs} theme pairs make twelve distinct letters`);
console.log(`  ${guaranteed} of those still have an ordinary two-word solution`);
if (bestThemed) {
  console.log(`  best: ${bestThemed.a} + ${bestThemed.b} → ${bestThemed.laid.sides.join(' | ')}`);
  console.log(`  spells ${bestThemed.held.length}: ${bestThemed.held.join(', ')}`);
}

// --- from the pool
let candidates = 0;
let bestPool = null;
for (const a of seedPool) {
  for (const b of seedByFirst.get(a.at(-1)) ?? []) {
    if (a === b) continue;
    const letters = new Set(a + b);
    if (letters.size !== 12) continue;
    candidates += 1;
    // Cheap first: a theme word cannot be spelled unless every letter is there.
    const possible = theme.filter((w) => [...w].every((c) => letters.has(c)));
    if (bestPool && possible.length <= bestPool.held.length) continue;
    const laid = assignSides([a, b]);
    if (!laid) continue;
    const held = theme.filter((w) => spellable(w, laid.sideOf));
    if (!bestPool || held.length > bestPool.held.length) bestPool = { a, b, laid, held };
  }
}
console.log('\nBoxed — an ordinary seed pair, chosen by what its box spells');
console.log(`  ${candidates} two-word boxes exist in the pool`);
if (bestPool) {
  console.log(`  best: ${bestPool.a} → ${bestPool.b} → ${bestPool.laid.sides.join(' | ')}`);
  console.log(`  spells ${bestPool.held.length}: ${bestPool.held.join(', ')}`);
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
  '\nWhat each would feel like, which no number settles:' +
    '\n  Boxed   the words a player finds are theme words. The solution that' +
    '\n          guarantees it can be finished is ordinary, and takes three' +
    '\n          words rather than two.' +
    '\n  Bridge  thin: it needs theme words that are compounds sharing a stem,' +
    '\n          and most themes have one or two.' +
    '\n  Squares only the first row is themed, and only with a wide pool.'
);
