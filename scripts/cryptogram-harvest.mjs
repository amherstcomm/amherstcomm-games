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
//
// The CURATED pool lives in scripts/cryptogram-passages.json — this script's
// output plus the human review, where `review: true` means held out of play.
// Those flags are hand-made judgments a re-run cannot reproduce: merge fresh
// harvests into that file, never overwrite it.

import { readFileSync, writeFileSync } from 'node:fs';
import { blockedSet } from './blocked.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Length bands
// ---------------------------------------------------------------------------
// Two bands, because length is a difficulty dial in its own right: less text
// means less for frequency analysis to bite on. `standard` is the original
// 50-100 and is what every tier has always drawn from; `short` is a separate,
// tagged pool for the hardest boards.
//
// The floor is 35 and not lower for a reason that isn't taste. The unicity
// distance of a simple substitution cipher — the length below which more than
// one plaintext fits the ciphertext, so the puzzle stops having one answer —
// is about 28 letters for English. 35 clears it with a little room; 30 would
// not, reliably.
//
// The repetition rule has to move with the band. `letters / distinct >= 3` is
// not a constant a shorter passage can meet: distinct letters climb fast and
// then flatten near 20, so the ratio is mostly just length in disguise. At
// 50-100 letters 3.0 is a real filter; at 35-49 it would reject everything
// English can produce. Each band gets the threshold that means the same thing
// at its own length.
const BANDS = {
  standard: { min: 50, max: 100, ratio: 3.0 },
  short: { min: 35, max: 49, ratio: 2.2 },
};

const [, , outPath, ...rawArgs] = process.argv;
const args = Object.fromEntries(rawArgs.map((a) => a.split('=')));
const bandName = args.band ?? 'standard';
delete args.band;
const sources = args;
const BAND = BANDS[bandName];
if (!outPath || !Object.keys(sources).length || !BAND) {
  console.error(
    'usage: node scripts/cryptogram-harvest.mjs <out.json> [band=standard|short] ' +
      'bartletts=<txt> [inaugurals=<txt>] [proverbs=<txt>]'
  );
  process.exit(1);
}
console.log(`band ${bandName}: ${BAND.min}-${BAND.max} letters, repetition >= ${BAND.ratio}\n`);

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

const blocked = blockedSet();

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
  // An author header is a name in capitals followed by dates. Both halves are
  // messier than they look, and when the line fails to match the parser does
  // not skip a quote — it keeps the *previous* author and attributes the whole
  // run to them. That silence is what made this worth being careful about:
  // 61 headers were missed, and 98 quotes went out under the wrong name.
  //
  //   WILLIAM WORDSWORTH.[465-1] 1770-1850.   a footnote marker after the name
  //   THOMAS MIDDLETON. ---- -1626.           birth year unknown
  //   OLIVER WENDELL HOLMES. 1809- ----.      still living in 1919
  //   SIR HENRY TAYLOR. 1800-18--.            death year partly unknown
  //
  // So: an optional footnote, and a date field of digits and dashes that has
  // to contain at least one digit. Commas are excluded from the dates on
  // purpose — it is what keeps index lines ("SOUTHEY, ROBERT    506, 853")
  // from reading as headers and inventing an author.
  const AUTHOR =
    /^([A-Z][A-Z .,'&()-]{2,60}?)\.?(?:\[[\d-]+\])?\s+(?:_?Circa_?\s+)?(?=[^\d]*\d)[\d– .-]{3,}\s*$/;

  // Some headers carry no dates at all — BARTHOLOMEW DOWLING, COLONEL BLACKER,
  // FRANCIS M. FINCH. Requiring dates missed them, and the quotes underneath
  // went out under whoever came before.
  const DATELESS = /^([A-Z][A-Z .,'&()-]{2,60})\.\s*$/;
  // The same shape is used for the book's own divisions, and a quote filed
  // under one of these has no author to name. Better to drop it than to invent
  // an attribution or, worse, keep the previous one.
  const SECTIONS = new Set([
    'BY JOHN BARTLETT',
    'ANONYMOUS BOOKS CITED',
    'MISCELLANEOUS',
    'MISCELLANEOUS TRANSLATIONS',
    'OF UNKNOWN AUTHORSHIP',
    'FOOTNOTES',
    'INDEX',
    'CONTENTS',
    'PREFACE',
    'APPENDIX',
  ]);
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

  const titleCase = (name) =>
    name
      .toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
      .replace(/\b(De|La|Le|Von|Van|Of|The|And)\b/g, (w) => w.toLowerCase())
      .trim();

  for (const line of lines) {
    const m = line.match(AUTHOR) ?? line.match(DATELESS);
    if (m) {
      flush();
      // A division of the book, not a person: drop the author entirely so the
      // quotes beneath it are skipped rather than credited to the last name
      // seen.
      author = SECTIONS.has(m[1].trim()) ? null : titleCase(m[1]);
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
  // Three header shapes, and the same silent failure as Bartlett's: an
  // unmatched header leaves the previous president's name on everything that
  // follows. Obama's addresses are titled the other way round and carry no
  // date, which is how two of his lines went out as George W. Bush.
  //
  //   Ronald Reagan First Inaugural Address Tuesday, January 20, 1981
  //   Bill Clinton Second Inaugural Address January 20, 1997     (no weekday)
  //   Franklin D. Roosevelt Second Inaugural Address Wednesday, January 20,
  //                                                    (year wrapped to next line)
  //   Inaugural Address by President Barack Obama       (name last, no date)
  const HEADER =
    /^(.{3,60}?)\s+(?:First|Second|Third|Fourth)?\s*Inaugural Address\b(?:\s+(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,)?\s*(?:[A-Z][a-z]+ \d{1,2},?\s*(?:\d{4})?)?\s*$/;
  // "Inaugural Address by President Barack Obama", and the newspaper-style
  // "Text of President Barack Obama's second inaugural address".
  const HEADER_BY =
    /^(?:Text of )?(?:Inaugural Address by )?President ([A-Z][^']{2,40}?)(?:'s)?(?:\s+(?:first|second))?\s*(?:inaugural address\b.*)?$/i;
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
    if (/^\S/.test(line) && /inaugural address/i.test(line)) {
      const m = line.match(HEADER) ?? line.match(HEADER_BY);
      if (m) {
        flush();
        author = m[1].trim();
        continue;
      }
      // Better to stop than to keep silently crediting the last president.
      // The front matter mentions the phrase in passing, so only lines that
      // look like a title count.
      if (/^(Text of |Inaugural Address by )/i.test(line))
        throw new Error(`unparsed inaugural header: ${line}`);
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

// Gutenberg's plain-text emphasis and editorial marks survive every filter
// above, because they are ASCII and they sit outside the words: "_Sir To._ Dost
// thou think", "*all* the authority", "[History] hath triumphed". None of it is
// part of the quote, and on a board it is neither cipher nor punctuation — just
// characters the player is left to wonder about.
stage('no editorial markup', (q) => !/[_*[\]{}<>|\\/]/.test(q.text));

stage(`${BAND.min}–${BAND.max} letters`, (q) => {
  const letters = q.text.replace(/[^A-Za-z]/g, '').length;
  return letters >= BAND.min && letters <= BAND.max;
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
  return distinct >= 8 && letters.length / distinct >= BAND.ratio;
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

// Only the non-default band is written, so a passage with no `band` is a
// standard one — which keeps the 2,674 already-curated entries untouched when
// a short harvest is merged in.
if (bandName !== 'standard') for (const q of pool) q.band = bandName;
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
