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
//   Boxed    needs two chainable words covering *exactly* twelve distinct
//            letters with no doubles, and sides assignable so no adjacent pair
//            shares one. Both from the theme, or one themed and one ordinary.
//   Bridge   needs x + M and M + y to both be words, with M the themed answer.
//   Squares  needs a themed word to head a double word square — every row and
//            every column a word.
//
// The finding that mattered: from a forty-word list, *zero* pairs of theme
// words can build a Boxed board, and 621 can if the second word is an ordinary
// one. That is the difference between "not worth building" and "build it this
// way", and no amount of reading the generator would have said which.
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
const noDouble = (w) => !/(.)\1/.test(w);
const distinct = (s) => new Set(s).size;

function assignable(w1, w2) {
  const letters = [...new Set(w1 + w2)];
  const adj = new Set();
  for (const w of [w1, w2]) {
    for (let i = 1; i < w.length; i++) {
      adj.add(w[i - 1] + w[i]);
      adj.add(w[i] + w[i - 1]);
    }
  }
  const sides = [[], [], [], []];
  const bt = (i) => {
    if (i === letters.length) return true;
    const c = letters[i];
    for (let s = 0; s < 4; s++) {
      if (sides[s].length >= 3) continue;
      if (sides[s].some((x) => adj.has(x + c))) continue;
      sides[s].push(c);
      if (bt(i + 1)) return true;
      sides[s].pop();
    }
    return false;
  };
  return bt(0);
}

const boxable = theme.filter((w) => w.length >= 4 && noDouble(w));
const boxPool = generatable.filter((w) => w.length >= 4 && noDouble(w));
const byFirst = new Map();
for (const w of boxPool) {
  if (!byFirst.has(w[0])) byFirst.set(w[0], []);
  byFirst.get(w[0]).push(w);
}

const count = (second) => {
  let pairs = 0;
  const covered = new Set();
  const eg = [];
  for (const a of boxable) {
    for (const b of second(a)) {
      if (a === b || distinct(a + b) !== 12 || !assignable(a, b)) continue;
      pairs += 1;
      covered.add(a);
      if (eg.length < 3) eg.push(`${a} → ${b}`);
    }
  }
  return { pairs, covered: covered.size, eg };
};

const bothThemed = count((a) => boxable.filter((b) => b[0] === a[a.length - 1]));
const oneThemed = count((a) => byFirst.get(a[a.length - 1]) ?? []);
console.log('Boxed — two chainable words, exactly 12 distinct letters');
console.log(`  both from the theme: ${bothThemed.pairs} pairs, ${bothThemed.covered}/${boxable.length} words`);
console.log(`  themed + ordinary:   ${oneThemed.pairs} pairs, ${oneThemed.covered}/${boxable.length} words`);
if (oneThemed.eg.length) console.log(`  e.g. ${oneThemed.eg.join(', ')}`);

// -------------------------------------------------------------------- Bridge
const parts = [...accepted].filter((w) => w.length >= 3 && w.length <= 6);
let prompts = 0;
const bridged = new Set();
const bridgeEg = [];
for (const m of theme) {
  const lefts = parts.filter((x) => accepted.has(x + m));
  if (lefts.length === 0) continue;
  const rights = parts.filter((y) => accepted.has(m + y));
  if (rights.length === 0) continue;
  bridged.add(m);
  prompts += lefts.length * rights.length;
  if (bridgeEg.length < 4) bridgeEg.push(`${lefts[0]} · ${m} · ${rights[0]}`);
}
console.log('\nBridge — x + answer and answer + y are both words');
console.log(`  ${bridged.size}/${theme.length} theme words can be an answer (${prompts} prompts)`);
if (bridgeEg.length) console.log(`  e.g. ${bridgeEg.join(' | ')}`);

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
