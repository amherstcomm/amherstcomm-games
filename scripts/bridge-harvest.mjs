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
//   3. The whole is not derived from either part. WordNet's `+` pointer is
//      the derivationally-related-form link and it is exactly the right tool:
//      action from act, censorship from censor, bothersome from bother,
//      flatten from flat. Each of those is a suffix that happens to also be a
//      word, and no amount of length or frequency filtering separates them.
//   4. One answer only. A prompt with two legal bridges is not a puzzle, and
//      the player who finds the other one is right.
//
// What survives all four and still is not a compound is coincidence — `carrot`
// really is car+rot and `mandate` really is man+date, both are base forms,
// neither is derived from its parts. Morphology cannot see the difference;
// only meaning can, and WordNet does not carry it in a form that helps. Those
// come out by hand, the way the cryptogram passages did.
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
  if ((pos ?? '').split('|').some((t) => ['n', 'v', 'aj', 'a'].includes(t))) content.add(word);
}

// ------------------------------------------------- derivationally related
// A synset line is: offset lex_filenum ss_type w_cnt [word lex_id]... p_cnt
// [ptr_symbol offset pos source/target]... | gloss. The source/target field is
// four hex digits, source word then target word, and 0000 means the pointer is
// between whole synsets rather than between two words.
const synWords = new Map();
const pending = [];
for (const pos of ['noun', 'verb', 'adj', 'adv']) {
  for (const line of readFileSync(join(DICT, `data.${pos}`), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const cut = line.indexOf('|');
    const head = line.slice(0, cut < 0 ? line.length : cut).trim().split(/\s+/);
    const offset = head[0];
    // adjective satellites are filed as 's' but live in the adjective file
    const type = head[2] === 's' ? 'a' : head[2];
    const wCnt = parseInt(head[3], 16);
    const words = [];
    for (let i = 0; i < wCnt; i++) words.push(head[4 + i * 2].toLowerCase().replace(/\(.*\)/, ''));
    synWords.set(type + offset, words);
    let at = 4 + wCnt * 2;
    const pCnt = Number(head[at++]);
    for (let i = 0; i < pCnt; i++, at += 4) {
      if (head[at] === '+') pending.push([head[at + 1], head[at + 2], head[at + 3], words]);
    }
  }
}
const derived = new Set();
for (const [offset, pos, slots, words] of pending) {
  const target = synWords.get((pos === 's' ? 'a' : pos) + offset);
  if (!target) continue;
  const from = parseInt(slots.slice(0, 2), 16);
  const to = parseInt(slots.slice(2), 16);
  const a = from === 0 ? words : [words[from - 1]];
  const b = to === 0 ? target : [target[to - 1]];
  for (const x of a) for (const y of b) {
    if (x && y) derived.add(x < y ? `${x}|${y}` : `${y}|${x}`);
  }
}
const isDerived = (a, b) => derived.has(a < b ? `${a}|${b}` : `${b}|${a}`);

// ------------------------------------------------------------- the prompts
// Difficulty is how hard the answer is to reach, not how obscure the puzzle
// is. The first pass got this backwards — extreme opened the compound band to
// 70 and produced BULL · ACE · RATE and SUB · PAR · BUCKLE, which are not
// harder, only stranger. Nobody fails to bridge those for want of thinking;
// they fail because `bullace` is a plum nobody has heard of.
//
// So the two ends stay familiar at every tier: they are the clue, and a clue
// made of words the player does not know is a worse clue, not a harder one.
// What moves is the band the *answer* is drawn from, which is the one thing
// the player has to produce.
//
// Difficulty is the answer's *productivity*, not its rarity or the compound's.
// Two earlier attempts got this wrong in opposite directions. Widening the
// compound band made extreme stranger rather than harder — BULL · ACE · RATE.
// Banding by how rare the answer is inverted the pool instead, 19,644 easy
// against 64 extreme, because bridge answers are overwhelmingly common words:
// OUT, OVER, SIDE, HEAD, WATER. A rare word rarely bridges anything, so there
// is no supply out there to find.
//
// What actually makes OUT easy is that it is the usual suspect — it bridges
// dozens of pairs, so a player who knows the game tries it first. A word that
// bridges two pairs has to be reached from the clue itself. So the tier is how
// many compounds the answer takes part in, and every tier keeps the familiar
// bands that read well.
const XY_BAND = 35;
const ANSWER_BAND = 35;
const WHOLE_BAND = 35;
// degree = how many distinct compounds the answer forms, either side
const TIERS = [
  { tier: 'easy', min: 12, max: Infinity },
  { tier: 'hard', min: 5, max: 11 },
  { tier: 'extreme', min: 2, max: 4 },
];

const funnel = [];
const seen = new Set();
const pool = { easy: [], hard: [], extreme: [] };

for (const { tier, min, max } of TIERS) {
  const answer = ANSWER_BAND;
  const whole = WHOLE_BAND;
  const ok = (w, l, band) =>
    l <= band && w.length >= 3 && base.has(w) && content.has(w) && !blocked.has(w);
  // the two ends the player reads
  const ends = new Set([...level].filter(([w, l]) => ok(w, l, XY_BAND)).map(([w]) => w));
  // the word they have to come up with
  const answers = new Set([...level].filter(([w, l]) => ok(w, l, answer)).map(([w]) => w));
  const parts = new Set([...ends, ...answers]);
  const wholes = [...level].filter(([w, l]) => l <= whole && base.has(w)).map(([w]) => w);

  const after = new Map();
  const before = new Map();
  let splits = 0;
  let dropped = 0;
  for (const w of wholes) {
    if (w.length < 6 || w.length > 14) continue;
    for (let i = 3; i <= w.length - 3; i++) {
      const a = w.slice(0, i);
      const b = w.slice(i);
      if (!parts.has(a) || !parts.has(b)) continue;
      if (blocked.has(w)) continue;
      if (isDerived(w, a) || isDerived(w, b)) {
        dropped++;
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
    const degree = xs.size + ys.size;
    if (degree < min || degree > max) continue;
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

  let one = 0;
  for (const [k, ms] of byPrompt) {
    if (ms.size !== 1) continue;
    one++;
    // the tiers are disjoint by answer band, so this only catches a prompt
    // whose two ends bridge in more than one band — still one answer per tier,
    // but two different puzzles wearing the same clue
    if (seen.has(k)) continue;
    seen.add(k);
    const [x, y] = k.split('|');
    const m = [...ms][0];
    pool[tier].push({ x, m, y, left: x + m, right: m + y });
  }
  funnel.push(
    `${tier.padEnd(7)} degree ${String(min).padStart(2)}-${String(max === Infinity ? 99 : max).padEnd(2)} wholes<=${String(whole).padEnd(2)}  splits ${String(splits).padStart(5)}  derived-dropped ${String(dropped).padStart(4)}  prompts ${String(byPrompt.size).padStart(6)}  one-answer ${String(one).padStart(6)}  new ${String(pool[tier].length).padStart(6)}`
  );
}

console.log(`derivational pairs: ${derived.size.toLocaleString()}`);
console.log(funnel.join('\n'));

// Read a spread rather than the head of the list: the first N of anything
// sorted is the least representative sample available.
for (const tier of ['easy', 'hard', 'extreme']) {
  const list = pool[tier];
  console.log(`\n${tier} (${list.length.toLocaleString()}):`);
  const step = Math.max(1, Math.floor(list.length / 12));
  for (let i = 0, n = 0; i < list.length && n < 12; i += step, n++) {
    const p = list[i];
    console.log(
      `  ${p.x.toUpperCase()} · ${p.m.toUpperCase()} · ${p.y.toUpperCase()}   (${p.left}, ${p.right})`
    );
  }
}

// The junk that survives everything above concentrates in the least productive
// answers, and that is not bad luck: a word that genuinely joins to things
// joins to many things, so a two-compound "answer" is disproportionately an
// accident — massacre as mass+acre, campus as cam+pus, justice as just+ice.
// Flagged rather than dropped, and held out of play until a person clears
// them, which is the convention the cryptogram pool and the ladder pairs both
// use: the judgment is not reproducible by a re-run, so it cannot live here.
const REVIEW_TAIL = /^(less|able|age|ice|ion|ary|ery|ous|ure|ant|ent|ist|ism|ity|ive)$/;
let flagged = 0;
for (const tier of Object.keys(pool)) {
  for (const p of pool[tier]) {
    if (REVIEW_TAIL.test(p.y) || REVIEW_TAIL.test(p.x)) {
      p.review = true;
      flagged++;
    }
  }
}
console.log(`\nflagged for review: ${flagged}`);
for (const tier of Object.keys(pool)) {
  const live = pool[tier].filter((p) => !p.review).length;
  console.log(`  ${tier.padEnd(7)} ${String(live).padStart(5)} live of ${pool[tier].length}`);
}

writeFileSync(outPath, JSON.stringify(pool, null, 1) + '\n');
console.log(
  `\nwrote ${outPath}: ${Object.values(pool).reduce((n, l) => n + l.length, 0).toLocaleString()} prompts`
);
