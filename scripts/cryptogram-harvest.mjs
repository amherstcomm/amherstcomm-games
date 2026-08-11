// Harvest cryptogram passages from public-domain sources. The filters are
// one shared funnel; each source only needs a front end that turns its file
// into { text, author } pairs.
//
//   node scripts/cryptogram-harvest.mjs out.json \
//     bartletts=path/pg27889.txt inaugurals=path/pg4938.txt proverbs=path/pg39281.txt
//
// Sources, all Project Gutenberg:
//   bartletts   #27889 — Familiar Quotations, 10th ed. (1919). The Victorian
//               editor did the curation; entries are quote blocks under
//               ALL-CAPS author headers, with FOOTNOTES sections of
//               cross-references that are skipped wholesale.
//   inaugurals  #4938 — U.S. Presidential Inaugural Addresses. Works of the
//               federal government carry no copyright regardless of date, so
//               this is the one legitimately *modern* vein. Speeches are
//               prose, not aphorisms, so sentences are extracted and the
//               context-dangling ones (starting "And", "It", "This"...)
//               dropped before the funnel sees them.
//   proverbs    #39281 — A Dictionary of English Proverbs (Ray's 1670
//               collection and successors). Proverbs have no author and no
//               copyright; entries read "N. HEADWORD. text".
//
// A passage survives when a modern player could actually deduce it: every
// word in the dictionary (archaic spellings out), no proper-noun usage
// (SHAKESPEARE can't be deduced from letter patterns), a length band that
// fits a board, and enough letter repetition to give the cipher a way in.
// Duplicates keep their first source's attribution, so run Bartlett's first —
// a named author beats "English proverb" for the same line.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const [, , outPath, ...sourceArgs] = process.argv;
const sources = Object.fromEntries(sourceArgs.map((a) => a.split('=')));
if (!outPath || !Object.keys(sources).length) {
  console.error(
    'usage: node scripts/cryptogram-harvest.mjs <out.json> bartletts=<txt> [inaugurals=<txt>] [proverbs=<txt>]'
  );
  process.exit(1);
}

// strip the Gutenberg boilerplate so licence text can't be mistaken for content
function gutenbergBody(path) {
  const text = readFileSync(path, 'latin1');
  const start = text.search(/\*\*\* ?START OF .*?\*\*\*/);
  const end = text.search(/\*\*\* ?END OF .*?\*\*\*/);
  return text.slice(start >= 0 ? text.indexOf('\n', start) : 0, end >= 0 ? end : undefined);
}

// ---------------------------------------------------------------------------
// The dictionary a player deduces against: every SCOWL band we ship, three
// spelling varieties — Bartlett's and the proverbs are British at heart.
// ---------------------------------------------------------------------------
const dictionary = new Set();
for (const variety of ['english', 'american', 'british']) {
  for (const level of [10, 20, 35, 40, 50, 55, 60, 70]) {
    for (const raw of require(`wordlist-english/${variety}-words-${level}.json`)) {
      const w = String(raw).toLowerCase();
      if (/^[a-z]+$/.test(w)) dictionary.add(w);
    }
  }
}

const blocked = new Set(
  JSON.parse(readFileSync(new URL('./blocked-words.json', import.meta.url), 'utf8')).words.map(
    (w) => w.word
  )
);

function knownWord(token) {
  const t = token.toLowerCase();
  if (dictionary.has(t)) return true;
  for (const suffix of ["'s", "'ll", "'d", "'ve", "'re", "'m", "n't"]) {
    if (t.endsWith(suffix) && dictionary.has(t.slice(0, -suffix.length))) return true;
  }
  // Bartlett's spaces some contractions: "'t is", "there 's"
  if (t === "'t" || t === "'s") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Front ends
// ---------------------------------------------------------------------------

function parseBartletts(path) {
  const lines = gutenbergBody(path).split(/\r?\n/);
  const AUTHOR = /^([A-Z][A-Z .,'&()-]{2,60}?)\.?\s+(?:_?Circa_?\s+)?\d{3,4}[-–]?\d{0,4}\.?\s*$/;
  const out = [];
  let author = null;
  let inFootnotes = false;
  let block = [];

  const flush = () => {
    if (author && block.length) {
      const quote = block.join(' ').replace(/\[\d+-\d+\]/g, '').replace(/\s+/g, ' ').trim();
      if (quote) out.push({ text: quote, author });
    }
    block = [];
  };

  for (const line of lines) {
    const m = line.match(AUTHOR);
    if (m) {
      flush();
      author = m[1]
        .toLowerCase()
        .replace(/\b[a-z]/g, (c) => c.toUpperCase())
        .replace(/\b(De|La|Le|Von|Van|Of|The)\b/g, (w) => w.toLowerCase())
        .trim();
      inFootnotes = false;
      continue;
    }
    if (/^FOOTNOTES:\s*$/.test(line)) {
      flush();
      inFootnotes = true;
      continue;
    }
    if (inFootnotes) continue;
    if (/^\s{2,}\S/.test(line)) block.push(line.trim());
    else flush();
  }
  flush();
  return out;
}

function parseInaugurals(path) {
  const lines = gutenbergBody(path).split(/\r?\n/);
  const HEADER =
    /^(.{3,60}?)\s+(?:First|Second|Third|Fourth)?\s*Inaugural Address\s+(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,.*\b(\d{4})\s*$/;
  // a sentence that leans on its neighbours reads as a fragment once alone
  const DANGLING =
    /^(And|But|Or|Nor|Yet|So|For|That|This|These|Those|It|Its|They|Their|He|His|She|Her|There(fore)?|Thus|Hence|Moreover|Nevertheless|Instead|Finally|Second|Third)\b/;
  const out = [];
  let author = null;
  let paragraph = [];

  const flush = () => {
    if (author && paragraph.length) {
      const prose = paragraph.join(' ').replace(/\s+/g, ' ').trim();
      for (const s of prose.split(/(?<=[.!?]["']?)\s+/)) {
        const sentence = s.trim();
        if (sentence && !DANGLING.test(sentence)) out.push({ text: sentence, author });
      }
    }
    paragraph = [];
  };

  for (const line of lines) {
    const m = line.match(HEADER);
    if (m && /^\S/.test(line)) {
      flush();
      author = m[1].trim();
      continue;
    }
    if (/^\s*$/.test(line)) flush();
    else if (author) paragraph.push(line.trim());
  }
  flush();
  return out;
}

function parseProverbs(path) {
  const lines = gutenbergBody(path).split(/\r?\n/);
  const ENTRY = /^\d+\.\s+([A-Z][A-Z' ()-]*)\.\s*(.*)$/;
  const out = [];
  let current = null;

  const flush = () => {
    if (current) {
      const text = current.join(' ').replace(/\s+/g, ' ').trim();
      if (text) out.push({ text, author: 'English proverb' });
    }
    current = null;
  };

  for (const line of lines) {
    const m = line.match(ENTRY);
    if (m) {
      flush();
      current = m[2] ? [m[2]] : [];
      continue;
    }
    if (current === null) continue;
    if (/^\s*$/.test(line)) continue; // verse entries resume after a blank
    if (/^[A-Z][A-Za-z ]+\.?\s*$/.test(line) && !/^\s/.test(line)) {
      // a section heading (INDEX and friends) ends the entries
      flush();
      current = null;
      continue;
    }
    current.push(line.trim());
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// One funnel for everything, with per-source accounting
// ---------------------------------------------------------------------------
const PARSERS = { bartletts: parseBartletts, inaugurals: parseInaugurals, proverbs: parseProverbs };
const ORDER = ['bartletts', 'proverbs', 'inaugurals'];

let pool = [];
for (const name of ORDER) {
  if (!sources[name]) continue;
  const parsed = PARSERS[name](sources[name]).map((q) => ({ ...q, source: name }));
  console.log(`${name}: parsed ${parsed.length}`);
  pool = pool.concat(parsed);
}

const funnel = [['all sources', pool.length]];
function stage(name, keep) {
  pool = pool.filter(keep);
  funnel.push([name, pool.length]);
}

stage('ascii only', (q) => /^[\x20-\x7e]+$/.test(q.text));

// digits can't be enciphered, and a sentence ending in a colon is a
// salutation or a list opener, not a thought
stage('no digits, ends like a sentence', (q) => !/\d/.test(q.text) && /[.!?]['"]?$/.test(q.text));

stage('50–100 letters', (q) => {
  const letters = q.text.replace(/[^A-Za-z]/g, '').length;
  return letters >= 50 && letters <= 100;
});

stage('every word in the dictionary', (q) => {
  const tokens = q.text.match(/[A-Za-z']+/g) ?? [];
  return tokens.length > 0 && tokens.every(knownWord);
});

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

stage('letter stats', (q) => {
  const letters = q.text.toLowerCase().replace(/[^a-z]/g, '');
  const distinct = new Set(letters).size;
  return distinct >= 8 && letters.length / distinct >= 3;
});

stage('blocklist', (q) => {
  const tokens = q.text.toLowerCase().match(/[a-z']+/g) ?? [];
  return tokens.every((t) => !blocked.has(t.replace(/'/g, '')));
});

const seen = new Set();
stage('deduplicated', (q) => {
  const key = q.text.toLowerCase().replace(/[^a-z]/g, '');
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// The blocklist catches vulgarity; it cannot catch a period attitude spelled
// in innocent words. These terms don't remove a quote — Congreve's "savage
// breast" and Shylock's "Hath not a Jew eyes" are keepers — they mark it for
// the front of the human skim, where the judgment actually lives.
const REVIEW =
  /\b(slaves?|slavery|savages?|heathens?|negro(es)?|jew(s|ish)?|indians?|pagans?|barbarians?|g[iy]psy|gipsies|gypsies|conquest|wife|wives|wom[ae]n|races?)\b/i;
for (const q of pool) if (REVIEW.test(q.text)) q.review = true;
funnel.push(['flagged for review', pool.filter((q) => q.review).length]);

for (const [name, count] of funnel) console.log(`${name.padEnd(32)} ${count}`);
console.log('');
for (const name of ORDER) {
  if (sources[name]) console.log(`${name.padEnd(12)} kept ${pool.filter((q) => q.source === name).length}`);
}

writeFileSync(outPath, JSON.stringify({ quotes: pool }, null, 1));
console.log(`\nwrote ${pool.length} candidates to ${outPath}`);

// a taste from each source
for (const name of ORDER) {
  const from = pool.filter((q) => q.source === name);
  const step = Math.max(1, Math.floor(from.length / 4));
  for (let i = 0; i < from.length && i < step * 4; i += step) {
    console.log(`\n"${from[i].text}"\n    — ${from[i].author} [${name}]`);
  }
}
