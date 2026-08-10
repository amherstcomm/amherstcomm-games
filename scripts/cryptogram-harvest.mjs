// Harvest cryptogram passages from Bartlett's Familiar Quotations (10th ed.,
// 1919 — Project Gutenberg #27889, public domain). The Victorian editor did
// the curation; this does the filtering.
//
//   node scripts/cryptogram-harvest.mjs path/to/bartletts.txt out.json
//
// A passage survives when a modern player could actually deduce it: every
// word in the dictionary (archaic spellings out), no proper nouns beyond
// dictionary words (SHAKESPEARE can't be deduced from letter patterns), a
// length band that fits a board, and enough letter repetition to give the
// cipher a way in. Each filter reports what it cut, so the funnel is visible.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node scripts/cryptogram-harvest.mjs <bartletts.txt> <out.json>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The dictionary a player deduces against: every SCOWL band we ship, both
// spellings. A quote whose words are all here reads as English to the person
// solving it; "fallyng" and "queult" do not.
// ---------------------------------------------------------------------------
const DICT_FILES = [];
for (const variety of ['english', 'american', 'british']) {
  for (const level of [10, 20, 35, 40, 50, 55, 60, 70]) {
    DICT_FILES.push(`${variety}-words-${level}`);
  }
}
const dictionary = new Set();
for (const f of DICT_FILES) {
  for (const raw of require(`wordlist-english/${f}.json`)) {
    const w = String(raw).toLowerCase();
    if (/^[a-z]+$/.test(w)) dictionary.add(w);
  }
}

const blocked = new Set(
  JSON.parse(readFileSync(new URL('./blocked-words.json', import.meta.url), 'utf8')).words.map(
    (w) => w.word
  )
);

// a token is "in the dictionary" if it is, or if it's a common contraction
// or possessive of something that is ('t is, wouldst thou — the archaic ones
// fall out on their own because their stems aren't words either)
function knownWord(token) {
  const t = token.toLowerCase();
  if (dictionary.has(t)) return true;
  for (const suffix of ["'s", "'ll", "'d", "'ve", "'re", "'m", "n't"]) {
    if (t.endsWith(suffix) && dictionary.has(t.slice(0, -suffix.length))) return true;
  }
  // Bartlett's spaces some contractions: "'t is", "there 's" — the bare 't/'s
  if (t === "'t" || t === "'s") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Parse: author headers are ALL-CAPS lines with a date range; quotes are the
// indented blocks that follow, each closed by an italic _source_ line; the
// FOOTNOTES sections are cross-references, not primary quotes, and are
// skipped wholesale.
// ---------------------------------------------------------------------------
const text = readFileSync(inPath, 'latin1');
const lines = text.split(/\r?\n/);

const AUTHOR = /^([A-Z][A-Z .,'&()-]{2,60}?)\.?\s+(?:_?Circa_?\s+)?\d{3,4}[-–]?\d{0,4}\.?\s*$/;

function titleCase(caps) {
  return caps
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(De|La|Le|Von|Van|Of|The)\b/g, (m) => m.toLowerCase())
    .trim();
}

const raw = [];
let author = null;
let inFootnotes = false;
let block = [];

function flushBlock() {
  if (!author || !block.length) {
    block = [];
    return;
  }
  const quote = block
    .join(' ')
    .replace(/\[\d+-\d+\]/g, '') // footnote markers
    .replace(/\s+/g, ' ')
    .trim();
  block = [];
  if (quote) raw.push({ text: quote, author });
}

for (const line of lines) {
  const m = line.match(AUTHOR);
  if (m) {
    flushBlock();
    author = titleCase(m[1]);
    inFootnotes = false;
    continue;
  }
  if (/^FOOTNOTES:\s*$/.test(line)) {
    flushBlock();
    inFootnotes = true;
    continue;
  }
  if (inFootnotes) continue;
  if (/^\s{2,}\S/.test(line)) {
    block.push(line.trim());
  } else {
    // a non-indented line ends the quote; the _source_ line is simply dropped
    flushBlock();
  }
}
flushBlock();

// ---------------------------------------------------------------------------
// The funnel. Order matters only for the readout: each stage sees what the
// previous one let through, so the counts say which rule does the work.
// ---------------------------------------------------------------------------
const funnel = [['parsed', raw.length]];
let pool = raw;

function stage(name, keep) {
  pool = pool.filter(keep);
  funnel.push([name, pool.length]);
}

// plain ASCII: accents mean an untranslated fragment or a French proverb
stage('ascii only', (q) => /^[\x20-\x7e]+$/.test(q.text));

// one prose sentence reads best under a cipher; verse line-joins survive fine
// but multi-sentence passages run long and solve slow
stage('50–100 letters', (q) => {
  const letters = q.text.replace(/[^A-Za-z]/g, '').length;
  return letters >= 50 && letters <= 100;
});

// every word deducible: dictionary members only, which also drops archaic
// spellings and any proper noun that isn't an ordinary word
stage('every word in the dictionary', (q) => {
  const tokens = q.text.match(/[A-Za-z']+/g) ?? [];
  return tokens.length > 0 && tokens.every(knownWord);
});

// no capitalised word mid-sentence unless it's the pronoun I — dictionary
// membership already allowed "God" and "Nature" through as lowercase words,
// but a quote that NEEDS the capital (a name used as a name) is unfair
stage('no proper-noun usage', (q) => {
  const words = q.text.split(/\s+/);
  let sentenceStart = true;
  for (const w of words) {
    const core = w.replace(/^[^A-Za-z]+/, '');
    if (!core) continue;
    if (/^[A-Z]/.test(core) && !sentenceStart && !/^I('|$)/.test(core)) {
      const plain = core.replace(/[^A-Za-z]/g, '').toLowerCase();
      if (!dictionary.has(plain)) return false;
    }
    sentenceStart = /[.!?]['"]?$/.test(w);
  }
  return true;
});

// enough repetition for the cipher to have a way in: at least 8 distinct
// letters, and an average of 3+ uses each
stage('letter stats', (q) => {
  const letters = q.text.toLowerCase().replace(/[^a-z]/g, '');
  const distinct = new Set(letters).size;
  return distinct >= 8 && letters.length / distinct >= 3;
});

stage('blocklist', (q) => {
  const tokens = q.text.toLowerCase().match(/[a-z']+/g) ?? [];
  return tokens.every((t) => !blocked.has(t.replace(/'/g, '')));
});

// duplicates: Bartlett's traces sayings across authors, so the same line
// appears more than once — first attribution wins
const seen = new Set();
stage('deduplicated', (q) => {
  const key = q.text.toLowerCase().replace(/[^a-z]/g, '');
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

for (const [name, count] of funnel) console.log(`${name.padEnd(32)} ${count}`);

writeFileSync(outPath, JSON.stringify({ source: 'bartletts-10th-1919', quotes: pool }, null, 1));
console.log(`\nwrote ${pool.length} candidates to ${outPath}`);

// a taste of what survived, spread across the file rather than the top
const step = Math.max(1, Math.floor(pool.length / 12));
for (let i = 0; i < pool.length; i += step) {
  const q = pool[i];
  console.log(`\n"${q.text}"\n    — ${q.author}`);
}
