// Harvest word-ladder pairs: two words the same length, related in a way a
// player would recognise, with a ladder between them.
//
//   node scripts/ladder-harvest.mjs scripts/ladder-pairs.json
//
// The ladder itself is free — any two same-length words in the dictionary are
// either connected or they aren't, and breadth-first search settles it. What
// costs something is the *pair*. COLD to WARM is a puzzle; ACTS to DIMS is an
// exercise, and a search cannot tell them apart because both are just two
// words at a distance.
//
// So the pair comes from WordNet, which is already a dependency (build-words
// reads its noun file for the domains map). Its pointers say how two words are
// related, and most of them read as something:
//
//   cause        jump/leap    lift/rise    drop/fall
//   also see     cold/cool    fair/just    lean/thin
//   entailment   veto/vote    kick/move    burn/sear
//   meronym      beef/cows    hemp/rope    book/text
//   antonym      east/west    give/take    head/tail
//
// One pointer is deliberately left out, and it is the largest. Hypernymy and
// its inverse would add some 2,000 pairs and they read as nonsense: `goat` to
// `soul`, `crab` to `soul`, `bull` to `soul`, because WordNet files *soul* as
// a synonym of *person* and every creature hangs off it. A true relation and a
// meaningless pair, which is worse than an arbitrary one — it looks like it
// was trying to mean something.
import { readFileSync, writeFileSync } from 'node:fs';
import { blockedSet } from './blocked.mjs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const outPath = process.argv[2];
if (!outPath) {
  console.error('usage: node scripts/ladder-harvest.mjs <out.json>');
  process.exit(1);
}

const wordnet = require('wordnet-db').path;

// ---------------------------------------------------------------------------
// The rungs: what a player is allowed to step through
// ---------------------------------------------------------------------------
// The common tier, so every rung is a word anyone would know — a ladder is no
// fun if the only route runs through `esne`. Blocked words come out of the
// graph entirely rather than just off the ends: a route that has to pass
// through a slur is not a route we can offer, and par has to be measured over
// the words the player may actually use.
const BANDS = ['band-10', 'band-20', 'band-35'];
const blocked = blockedSet();
const rungs = new Set();
for (const b of BANDS) {
  for (const w of JSON.parse(readFileSync(new URL(`../src/wordbands/${b}.json`, import.meta.url), 'utf8')).words) {
    if (/^[a-z]+$/.test(w) && !blocked.has(w)) rungs.add(w);
  }
}

// ---------------------------------------------------------------------------
// The pairs: WordNet's own account of how two words are related
// ---------------------------------------------------------------------------
const RELATIONS = {
  '!': 'antonym',
  '&': 'similar',
  '^': 'also see',
  '*': 'entailment',
  '>': 'cause',
  $: 'verb group',
  '=': 'attribute',
  '#m': 'part of',
  '#s': 'part of',
  '#p': 'part of',
  '%m': 'has part',
  '%s': 'has part',
  '%p': 'has part',
};

const POS_OF = (p) =>
  p === 'a' || p === 's' ? 'adj' : p === 'n' ? 'noun' : p === 'v' ? 'verb' : 'adv';

// How ordinary a sense is. WordNet's index files list each word's synsets in
// sense order, most familiar first, and the tail is where the strange
// readings live: `honk` means vomit down there, `dash` means pall, `bone`
// means cram. A relation drawn from one of those is true and unrecognisable —
// the player sees two words with no connection, which is the same failure as
// hypernymy in a quieter voice. Only the leading senses count.
const LEADING_SENSES = Number(process.env.LADDER_SENSES ?? 3);
const leading = new Set(); // "word|synsetKey" for senses near the front
for (const pos of ['adj', 'noun', 'verb', 'adv']) {
  for (const line of readFileSync(join(wordnet, `index.${pos}`), 'utf8').split('\n')) {
    if (line.startsWith('  ') || !line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    const word = parts[0].toLowerCase();
    const senses = parseInt(parts[2], 10);
    const pointerCount = parseInt(parts[3], 10);
    if (!Number.isFinite(senses) || !Number.isFinite(pointerCount)) continue;
    // word pos synset_cnt p_cnt [ptr_symbol...] sense_cnt tagsense_cnt [offset...]
    const offsets = parts.slice(4 + pointerCount + 2, 4 + pointerCount + 2 + senses);
    for (const off of offsets.slice(0, LEADING_SENSES)) leading.add(`${word}|${pos}${off}`);
  }
}

const synset = new Map();
const heads = new Map();
for (const pos of ['adj', 'noun', 'verb', 'adv']) {
  for (const line of readFileSync(join(wordnet, `data.${pos}`), 'utf8').split('\n')) {
    if (line.startsWith('  ') || !line.trim()) continue;
    const cut = line.indexOf('|');
    const head = line.slice(0, cut < 0 ? line.length : cut).trim().split(/\s+/);
    const count = parseInt(head[3], 16);
    const words = [];
    for (let i = 0; i < count; i++) words.push(head[4 + i * 2].toLowerCase().replace(/\(.*\)/, ''));
    synset.set(pos + head[0], words);
    heads.set(pos + head[0], head);
  }
}

/** "a b" -> the relations that say so.
 *
 *  Both sides have to be a leading sense of their own word, or the pair is
 *  related in a way only a lexicographer can see. */
const related = new Map();
const note = (a, aKey, b, bKey, name) => {
  if (!a || !b || a === b) return;
  if (!/^[a-z]+$/.test(a) || !/^[a-z]+$/.test(b)) return;
  if (!leading.has(`${a}|${aKey}`) || !leading.has(`${b}|${bKey}`)) return;
  const key = [a, b].sort().join(' ');
  if (!related.has(key)) related.set(key, new Set());
  related.get(key).add(name);
};

for (const [key, head] of heads) {
  const words = synset.get(key);
  // sharing a synset is the relation WordNet does not spell as a pointer
  for (let i = 0; i < words.length; i++)
    for (let j = i + 1; j < words.length; j++) note(words[i], key, words[j], key, 'synonym');

  const count = parseInt(head[3], 16);
  let at = 4 + count * 2;
  const pointers = parseInt(head[at++], 10);
  if (!Number.isFinite(pointers)) continue;
  for (let p = 0; p < pointers; p++) {
    const sym = head[at], offset = head[at + 1], pos = head[at + 2], slots = head[at + 3];
    at += 4;
    const name = RELATIONS[sym];
    if (!name) continue;
    const targetKey = POS_OF(pos) + offset;
    const target = synset.get(targetKey);
    if (!target) continue;
    // a lexical pointer names one word on each side; a semantic one means the
    // whole synset
    const from = parseInt(slots.slice(0, 2), 16);
    const to = parseInt(slots.slice(2), 16);
    for (const a of from ? [words[from - 1]] : words)
      for (const b of to ? [target[to - 1]] : target) note(a, key, b, targetKey, name);
  }
}

// ---------------------------------------------------------------------------
// The ladder: breadth-first, over same-length rungs
// ---------------------------------------------------------------------------
const byLength = new Map();
for (const w of rungs) {
  if (!byLength.has(w.length)) byLength.set(w.length, new Set());
  byLength.get(w.length).add(w);
}

const seenFrom = new Map();
function parFrom(word) {
  if (seenFrom.has(word)) return seenFrom.get(word);
  const pool = byLength.get(word.length) ?? new Set();
  const dist = new Map([[word, 0]]);
  const queue = [word];
  for (let i = 0; i < queue.length; i++) {
    const w = queue[i];
    const d = dist.get(w);
    if (d >= MAX_PAR) continue;
    for (let p = 0; p < w.length; p++) {
      for (let c = 97; c < 123; c++) {
        const next = w.slice(0, p) + String.fromCharCode(c) + w.slice(p + 1);
        if (next !== w && pool.has(next) && !dist.has(next)) {
          dist.set(next, d + 1);
          queue.push(next);
        }
      }
    }
  }
  seenFrom.set(word, dist);
  return dist;
}

// Three is the shortest ladder worth setting — one or two steps is a
// observation rather than a puzzle. Eight is where the search space stops
// being something a person enjoys walking.
const MIN_PAR = 3;
const MAX_PAR = 8;
const MIN_LEN = 3;
const MAX_LEN = Number(process.env.LADDER_MAX_LEN ?? 6);

const funnel = [];
const stage = (name, n) => funnel.push([name, n]);

let pairs = [...related].map(([key, rels]) => {
  const [a, b] = key.split(' ');
  return { a, b, rel: [...rels].sort() };
});
stage('related pairs in WordNet', pairs.length);

pairs = pairs.filter((p) => p.a.length === p.b.length);
stage('same length', pairs.length);

pairs = pairs.filter((p) => p.a.length >= MIN_LEN && p.a.length <= MAX_LEN);
stage(`${MIN_LEN}-${MAX_LEN} letters`, pairs.length);

pairs = pairs.filter((p) => rungs.has(p.a) && rungs.has(p.b));
stage('both ends a common word', pairs.length);

for (const p of pairs) p.par = parFrom(p.a).get(p.b) ?? 0;
pairs = pairs.filter((p) => p.par >= MIN_PAR && p.par <= MAX_PAR);
stage(`a ladder of ${MIN_PAR}-${MAX_PAR} steps`, pairs.length);

// The blocklist takes out what is never shown. This is the other thing: pairs
// that are merely crude, or that read oddly enough to want a person's eye
// before they go out as a daily. Flagged rather than dropped, and held out of
// play until someone unflags them — the same convention the cryptogram pool
// uses, for the same reason: the judgment is not reproducible by a re-run.
const REVIEW = /^(gutter|toilet|spew|puke|piss|crap|turd|slob|booze|drunk|butt|bosom|groin|corpse|morgue|noose|gore)$/;
for (const p of pairs) if (REVIEW.test(p.a) || REVIEW.test(p.b)) p.review = true;
stage('flagged for review', pairs.filter((p) => p.review).length);

pairs.sort((x, y) => x.par - y.par || x.a.localeCompare(y.a));

for (const [name, n] of funnel) console.log(`${name.padEnd(30)} ${n}`);

const byPar = new Map();
for (const p of pairs) byPar.set(p.par, (byPar.get(p.par) ?? 0) + 1);
console.log('\nby par:');
for (const k of [...byPar.keys()].sort((a, b) => a - b)) console.log(`  ${k} steps: ${byPar.get(k)}`);

const byRel = new Map();
for (const p of pairs) for (const r of p.rel) byRel.set(r, (byRel.get(r) ?? 0) + 1);
console.log('\nby relation:');
for (const [r, n] of [...byRel].sort((a, b) => b[1] - a[1])) console.log(`  ${r.padEnd(12)} ${n}`);

writeFileSync(outPath, JSON.stringify({ rungs: BANDS, pairs }, null, 1) + '\n');
console.log(`\nwrote ${pairs.length} pairs to ${outPath}`);

console.log('\na taste:');
for (let i = 0; i < pairs.length; i += Math.max(1, Math.floor(pairs.length / 12))) {
  const p = pairs[i];
  console.log(`  ${p.a} -> ${p.b}  (${p.par} steps, ${p.rel.join('/')})`);
}
