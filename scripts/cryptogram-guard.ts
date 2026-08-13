// The ambiguity guard for harvested passages.
//
//   npx vite-node scripts/cryptogram-guard.ts -- <in.json> <out.json>
//
// A short passage can have more than one answer. Not "more than one way to
// arrive at the answer" — more than one English sentence that the same
// ciphertext decodes to, both of them made of ordinary words. Measured over
// the 35-49 letter harvest, 58% of candidates admitted a second common-word
// reading, against 31% at 50-100. A player who finds one of those is not
// wrong, but the answer check compares against the passage we stored, so they
// are told they are. That is the failure this stage exists to prevent.
//
// The set of alternative readings belongs to the passage, not to the cipher: if
// two plaintexts fit one ciphertext, they fit under every key, since a key is
// only a relabelling. So one encipherment settles it, and the seed below is
// fixed to make the run reproducible.
//
// The dictionary is the common tier, because the question is what a *person*
// would write. An alternative spelled out of band-80 is not a reading anyone
// would hand in.
//
// It is deliberately conservative. A passage is kept only when the search
// proves there is nothing else there — either it found no complete reading at
// all (nothing in common words fits, so no alternative can), or it found
// exactly one and that one is the passage. A search that ran out of budget
// proves nothing and is dropped, which costs some good passages and keeps no
// bad ones.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildPatternIndex, solveCryptogram } from '../src/cryptogramSolver';

type Passage = { text: string; author: string; source?: string; review?: boolean; band?: string };

// Two jobs, and they want opposite defaults.
//
// Harvesting decides what to *add*, so anything it cannot prove safe is left
// out — cheap, because the candidates are free and there are thousands.
//
// Auditing decides what to *remove* from a pool a human has already curated,
// where the same rule would delete hundreds of good passages for the crime of
// containing an apostrophe. Adding demands proof of safety; removing demands
// proof of harm. So `audit` drops only what is shown to have another answer.
const args = process.argv.slice(2);
const audit = args.includes('--audit');
const [inPath, outPath] = args.filter((a) => !a.startsWith('-'));
if (!inPath || !outPath) {
  console.error(
    'usage: vite-node scripts/cryptogram-guard.ts -- [--audit] <in.json> <out.json>'
  );
  process.exit(1);
}
console.log(audit ? 'auditing: drop only what is proven ambiguous\n' : 'harvesting: keep only what is proven unambiguous\n');

// The tier a player writes from — the same three bands the client calls
// `common`.
const COMMON_BANDS = ['band-10', 'band-20', 'band-35'];
const words: string[] = [];
const rank = new Map<string, number>();
COMMON_BANDS.forEach((band, i) => {
  const parsed = JSON.parse(readFileSync(`src/wordbands/${band}.json`, 'utf8')) as {
    words: string[];
  };
  for (const w of parsed.words) {
    words.push(w);
    if (!rank.has(w)) rank.set(w, i);
  }
});
const index = buildPatternIndex(words, rank);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0x0c0ffee);

function encipher(text: string): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const slots = [...alphabet];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return text.replace(/[a-z]/gi, (c) => slots[c.toLowerCase().charCodeAt(0) - 97]);
}

const letters = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '');

// solveCryptogram splits on runs of letters, so a contraction arrives as two
// words and the orphaned "s" or "d" becomes a one-letter word — which can only
// read as "a" or "i", and usually contradicts. The passage then reports no
// reading, and would be kept as proven safe when nothing was proven: measured,
// 80% of contraction-bearing candidates survived that way against 35% overall.
// They are not verifiable here, and unverifiable is not the same as safe.
//
// Any apostrophe, not just one between letters: Bartlett's prints some
// contractions spaced — "Here 's my hand", "'t is" — which splits exactly the
// same way while looking nothing like a contraction.
const APOSTROPHE = /'/;

const input = JSON.parse(readFileSync(inPath, 'utf8')) as { quotes: Passage[] };
const kept: Passage[] = [];
const tally = { unique: 0, notFound: 0, ambiguous: 0, decoy: 0, gaveUp: 0, contraction: 0, other: 0 };
const examples: string[] = [];

input.quotes.forEach((q, i) => {
  if (APOSTROPHE.test(q.text)) {
    tally.contraction++;
    if (audit) kept.push(q);
    return;
  }
  const outcome = solveCryptogram(encipher(q.text), index);
  if (!outcome.ok) {
    // nothing in common words completes it, so no alternative exists there
    if (outcome.reason === 'not found') {
      tally.notFound++;
      kept.push(q);
    } else if (outcome.reason === 'gave up') {
      tally.gaveUp++;
      if (audit) kept.push(q);
    } else {
      tally.other++;
      if (audit) kept.push(q);
    }
  } else if (outcome.result.readings > 1) {
    tally.ambiguous++;
    if (examples.length < 6)
      examples.push(
        `  ${outcome.result.readings} readings: ${JSON.stringify(q.text)}\n` +
          `      one of them: ${JSON.stringify(outcome.result.text)}`
      );
  } else if (letters(outcome.result.text) !== letters(q.text)) {
    // exactly one reading, and it is not the passage: the only answer a
    // player can reach is a different sentence
    tally.decoy++;
    if (examples.length < 6)
      examples.push(
        `  sole reading is not the passage: ${JSON.stringify(q.text)}\n` +
          `      solves as: ${JSON.stringify(outcome.result.text)}`
      );
  } else {
    tally.unique++;
    kept.push(q);
  }
  if ((i + 1) % 200 === 0) console.log(`  ${i + 1}/${input.quotes.length}...`);
});

console.log(`\nin  ${input.quotes.length}`);
console.log(`  kept, one reading and it is the passage   ${tally.unique}`);
console.log(`  kept, no common-word reading exists       ${tally.notFound}`);
console.log(`  dropped, more than one reading            ${tally.ambiguous}`);
console.log(`  dropped, sole reading is a different text ${tally.decoy}`);
console.log(`  dropped, search ran out of budget         ${tally.gaveUp}`);
console.log(`  dropped, contraction — not verifiable     ${tally.contraction}`);
console.log(`  dropped, unusable                         ${tally.other}`);
console.log(`out ${kept.length} (${((kept.length / input.quotes.length) * 100).toFixed(0)}%)`);
if (examples.length) console.log(`\nwhat was dropped:\n${examples.join('\n')}`);

writeFileSync(outPath, JSON.stringify({ quotes: kept }, null, 1));
console.log(`\nwrote ${kept.length} to ${outPath}`);
