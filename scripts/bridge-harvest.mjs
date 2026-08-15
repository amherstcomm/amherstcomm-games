// Harvest Bridge prompts: SNOW · ? · BALL, where the answer joins to both
// sides.
//
//   node scripts/bridge-harvest.mjs scripts/bridge-prompts.json
//
// Finding splits is trivial and almost entirely useless: run every word past
// every cut point and the dictionary hands back thousands of pairs, most of
// which are not compounds at all. `carpet` splits as car+pet, `therapist` as
// the+rapist, `hastens` as has+tens. A player asked to bridge HAS and ION is
// not solving a word puzzle, they are reverse-engineering a string operation.
//
// So the work is all in the filtering, and it runs in four stages.
//
//   1. Both parts are base forms. Nearly all the junk is an inflection: the
//      -s and -ing that make hastens, mandates, wagering, bookmarks. The
//      words table already carries a lemma column, and a word that is its own
//      lemma is not a stem wearing a suffix.
//   2. Both parts are content words. This is what removes `per`, tagged pp,
//      which otherwise bridges HAM and CENT via percent.
//   3. The break does not fuse. This is the only place pronunciation gets a
//      vote, and it gets one because the rule for this game is *spelling*: X+M
//      and M+Y have to be words, and nothing requires them to be compounds.
//      `reddish` is red+dish and `grimace` is grim+ace — neither is a compound
//      and both are fair prompts, because a solver who thinks of the answer
//      can check it. An earlier version filtered on WordNet's
//      derivationally-related-form pointer, which answers a question the game
//      does not ask: it threw out booklet, childhood, scholarship and coverage,
//      all clean breaks and all perfectly good.
//
//      What is left is the case where the letters at the seam stop being the
//      letters they were. In `abduction`, `suggestion`, `distortion`, the t or
//      s merges with -ion into a single sound, so the split exists on paper and
//      nowhere else. Ideally every break is clean by ear; this removes the ones
//      that are not clean by any reading.
//   4. One answer only. A prompt with two legal bridges is not a puzzle, and
//      the player who finds the other one is right.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const outPath = process.argv[2];
if (!outPath) {
  console.error('usage: node scripts/bridge-harvest.mjs <out.json>');
  process.exit(1);
}
const DICT = require('wordnet-db').path;

// A blocked word is never shown, and here that has to cover the compounds as
// well as the parts: CHICKEN and HEAD are both perfectly ordinary, and the
// prompt still built itself out of a word we do not publish. Anything the
// player reads or has to type gets checked.
const blocked = new Set(
  JSON.parse(readFileSync(new URL('./blocked-words.json', import.meta.url), 'utf8')).words.map(
    (w) => w.word
  )
);

// ---------------------------------------------------------------- the words
const rows = readFileSync('scripts/words.csv', 'utf8').trim().split('\n').slice(1);
const level = new Map();
const base = new Set();
const content = new Set();
for (const line of rows) {
  const [word, , , lvl, pos, lemma] = line.split(',');
  if (!/^[a-z]+$/.test(word)) continue;
  level.set(word, Math.min(Number(lvl), level.get(word) ?? 99));
  if (!lemma) base.add(word);
  // 'aj' is adjective; 'a' is *article*, which is why THE was turning up as a
  // clue word. A determiner is a word and is not a clue.
  if ((pos ?? '').split('|').some((t) => ['n', 'v', 'aj'].includes(t))) content.add(word);
}

// ------------------------------------------------------------- the prompts
// One pool, with each prompt carrying the answer's degree — how many compounds
// that word appears in.
//
// It used to be three pools split on that number, and the split was circular.
// Degree IS prompt count: an answer in d compounds pairs them into about
// (d/2)^2 prompts, so binning by degree bins by prompt count, and picking
// high-degree answers for "easy" picks exactly the answers that generate the
// most prompts. English has about two dozen that productive, so easy came out
// as 2,414 prompts across 24 answers — not a fact about the language, just the
// tier definition restated. Difficulty is a hint budget now (three, one, none),
// which leaves the whole pool available at every tier and makes supply and
// difficulty independent.
//
// Degree stays on each prompt because it is a real signal, just not a wall: a
// board can favour productive answers without the pools being disjoint.
//
// Bands: ends and answers at 35, compounds at 50. Opening the answer band buys
// nothing — bridge answers are common words already — while the compound band
// is the dial that matters, because what limits variety is which compounds
// happen to exist rather than which words can join. At 35 the pool is 226
// answers; at 55 it is 561 but the tail is prompts like MAR · TEN · ABILITY,
// where marten and tenability are both real and neither is reachable. 50 keeps
// most of the range and drops that tail.
const XY_BAND = Number(process.env.BRIDGE_XY ?? 35);
const ANSWER_BAND = Number(process.env.BRIDGE_ANSWER ?? 35);
const WHOLE_BAND = Number(process.env.BRIDGE_WHOLE ?? 50);

// The seam where the sound changes. -ion after t or s is the whole of it in
// practice: the other fusing endings (-ial, -ious, -ure) are not words, so they
// never appear as a part in the first place.
const FUSES = /^ion$/;

const ok = (w, l, band) =>
  l <= band && w.length >= 3 && base.has(w) && content.has(w) && !blocked.has(w);
const ends = new Set([...level].filter(([w, l]) => ok(w, l, XY_BAND)).map(([w]) => w));
const answers = new Set([...level].filter(([w, l]) => ok(w, l, ANSWER_BAND)).map(([w]) => w));
const parts = new Set([...ends, ...answers]);
const wholes = [...level].filter(([w, l]) => l <= WHOLE_BAND && base.has(w)).map(([w]) => w);

const after = new Map();
const before = new Map();
let splits = 0;
let dropped = 0;
const droppedList = [];
for (const w of wholes) {
  if (w.length < 6 || w.length > 14) continue;
  if (blocked.has(w)) continue;
  for (let i = 3; i <= w.length - 3; i++) {
    const a = w.slice(0, i);
    const b = w.slice(i);
    if (!parts.has(a) || !parts.has(b)) continue;
    if (FUSES.test(b)) {
      dropped++;
      if (process.env.BRIDGE_SHOW_DROPPED) droppedList.push(`${a}+${b} = ${w}`);
      continue;
    }
    splits++;
    if (!after.has(a)) after.set(a, new Set());
    if (!before.has(b)) before.set(b, new Set());
    after.get(a).add(b);
    before.get(b).add(a);
  }
}

const byPrompt = new Map();
for (const m of answers) {
  const xs = before.get(m);
  const ys = after.get(m);
  if (!xs || !ys) continue;
  for (const x of xs) {
    for (const y of ys) {
      if (x === y || x === m || y === m) continue;
      // a prompt is only readable if both ends are words people know
      if (!ends.has(x) || !ends.has(y)) continue;
      const k = `${x}|${y}`;
      if (!byPrompt.has(k)) byPrompt.set(k, new Set());
      byPrompt.get(k).add(m);
    }
  }
}

const pool = [];
for (const [k, ms] of byPrompt) {
  // a prompt with two legal bridges is not a puzzle, and whoever finds the
  // other one is right
  if (ms.size !== 1) continue;
  const [x, y] = k.split('|');
  const m = [...ms][0];
  pool.push({
    x,
    m,
    y,
    left: x + m,
    right: m + y,
    degree: (before.get(m)?.size ?? 0) + (after.get(m)?.size ?? 0),
  });
}

console.log(
  `splits ${splits.toLocaleString()}  fused-seam dropped ${dropped.toLocaleString()}  prompts ${byPrompt.size.toLocaleString()}  one-answer ${pool.length.toLocaleString()}`
);
if (process.env.BRIDGE_SHOW_DROPPED) {
  const step = Math.max(1, Math.floor(droppedList.length / 30));
  console.log('dropped for a fused seam, a spread:');
  for (let i = 0, n = 0; i < droppedList.length && n < 30; i += step, n++) console.log('   ' + droppedList[i]);
}

// Read a spread rather than the head of the list: the first N of anything
// sorted is the least representative sample available. Sampled by degree band,
// because that is what a board will weight on.
const BANDS = [
  ['productive', (p) => p.degree >= 12],
  ['middling', (p) => p.degree >= 7 && p.degree < 12],
  ['sparse', (p) => p.degree < 7],
];

// The junk that survives every filter above is coincidence — massacre as
// mass+acre, campus as cam+pus, justice as just+ice — and it cannot be seen by
// morphology, only by meaning. Suffix-shaped ends are the part that IS
// mechanical, so those are flagged; the rest is a reading job. Flagged rather
// than dropped, and held out of play until a person clears them, the same
// convention the cryptogram pool and the ladder pairs use.
const REVIEW_TAIL = /^(less|able|age|ice|ion|ary|ery|ous|ure|ant|ent|ist|ism|ity|ive)$/;
let flagged = 0;
for (const p of pool) {
  if (REVIEW_TAIL.test(p.y) || REVIEW_TAIL.test(p.x)) {
    p.review = true;
    flagged++;
  }
}

// Nothing a player reads or types may be a blocked word: the two ends, the
// answer, and both compounds. The filters above already do this, and asserting
// it separately is the point — a filter that stops being applied fails
// silently, and a bigger pool is indistinguishable from a better harvest unless
// something checks the output rather than the intent.
if (!process.env.BRIDGE_SKIP_GUARD) {
  for (const p of pool) {
    for (const w of [p.x, p.m, p.y, p.left, p.right]) {
      if (blocked.has(w)) throw new Error(`blocked word ${w} in ${p.x} · ${p.m} · ${p.y}`);
    }
  }
}

const live = pool.filter((p) => !p.review);
const liveAnswers = new Set(live.map((p) => p.m));
console.log(
  `
flagged for review: ${flagged}   live ${live.length.toLocaleString()} across ${liveAnswers.size} answers`
);

// Prompt count is the wrong measure of supply and the reason is circular: an
// answer in d compounds pairs them into about (d/2)^2 prompts, so a count of
// prompts is mostly a count of how productive its answers happen to be.
// Answers is the number that is not self-referential.
for (const [name, test] of BANDS) {
  const band = live.filter(test);
  const ans = new Set(band.map((p) => p.m));
  console.log(`  ${name.padEnd(11)} ${String(band.length).padStart(6)} prompts across ${String(ans.size).padStart(4)} answers`);
  const step = Math.max(1, Math.floor(band.length / 6));
  for (let i = 0, n = 0; i < band.length && n < 6; i += step, n++) {
    const p = band[i];
    console.log(
      `      ${p.x.toUpperCase()} · ${p.m.toUpperCase()} · ${p.y.toUpperCase()}   (${p.left}, ${p.right})`
    );
  }
}

writeFileSync(outPath, JSON.stringify({ prompts: pool }, null, 1) + '\n');
console.log(`\nwrote ${outPath}: ${pool.length.toLocaleString()} prompts`);
