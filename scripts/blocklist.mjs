// Words we won't publish as puzzle answers.
//
// Two sources, kept in one file. Most entries come from the English Speller
// Database (ESDB, formerly SCOWLv2 — the upstream that wordlist-english is
// built from), which marks words with usage notes. The rest are added by hand,
// and this script preserves those: rerunning it refreshes the ESDB half
// without touching a judgement anyone made.
//
// The `scope` column carries the distinction that matters. Refusing to publish
// a word as an answer is not the same as refusing to accept one a player
// typed — filtering a validation dictionary is where Scunthorpe bites, so
// 'both' stays small and deliberate while 'generation' can be generous.
//
// Run rarely, by hand: npm run blocklist

import { readFileSync, writeFileSync } from 'node:fs';

const OUT = 'scripts/blocked-words.json';
const ESDB =
  'https://raw.githubusercontent.com/en-wl/wordlist/v2/data/scowl-pre.txt';

// A second, cruder source. ESDB's own README says its marking "only covers the
// worst offenders", and it does: it has nigger and coon but not kike or
// wetback. LDNOOBW is broader and less careful, which is the right trade for a
// list that only decides what we won't publish.
const LDNOOBW =
  'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en';

// Everything from LDNOOBW is generation-only, because the list contains sex,
// sexual, intercourse, escort, snatch, scat, tit, nipple and rectum. Refusing
// those when a player types them would be the Scunthorpe problem in plain
// sight. These few are the exception: slurs ESDB happens to miss, treated the
// same way ESDB's own slurs are.
const SLURS_ESDB_MISSES = new Set([
  'darkie',
  'darkies',
  'jigaboo',
  'jigaboos',
  'kike',
  'kikes',
  'spic',
  'spics',
  'wetback',
  'wetbacks',
  'faggot',
  'faggots',
]);

// Slurs and swear words are refused both ways. The mild tier is generation
// only: we won't hand someone "fart" as the answer, but a player typing it is
// their business.
const SCOPE_BY_NOTE = {
  'offensive-1': 'both',
  'offensive-2': 'both',
  'vulgar-1': 'both',
  'vulgar-3': 'generation',
};

// ESDB flags these for their roots rather than themselves — craps is a dice
// game, dickens is an exclamation, dicker is to haggle. Blocking them would be
// the filter failing, not working.
const NOT_REALLY = new Set([
  'craps',
  'dickens',
  'dickenses',
  'dicker',
  'dickered',
  'dickering',
  'dickers',
]);

/** Every form on a flagged entry: the headword plus its inflections. A bare
 *  `-` headword continues the previous entry, which is how ESDB writes
 *  inflection-only lines. */
function parse(text) {
  const found = new Map(); // word -> note
  let last = null;
  for (const raw of text.split('\n')) {
    // Some entries carry a trailing "#! ..." note. The words stop there — left
    // in, the note's own prose gets glued onto the last inflection and enters
    // the list as one long invented word.
    const line = raw.trimEnd().split(/\s#/)[0];
    if (!line) continue;
    const m = line.match(/:\s*(?:[A-Z]:\s*)?(\S+)\s*<[^>]*>\s*(\([^)]*\))?\s*(?::(.*))?$/);
    if (!m) continue;
    const [, head, note, inflections] = m;
    if (head !== '-') last = head;
    const tag = (note || '').match(/(offensive-1|offensive-2|vulgar-1|vulgar-3)/);
    if (!tag) continue;
    const add = (w) => {
      // Strict rather than forgiving. Stripping punctuation out of a token
      // turns a fragment of syntax into a plausible-looking word, which is how
      // "v" and "shat" became "vshat".
      const clean = w.trim().toLowerCase();
      if (!/^[a-z]{2,}$/.test(clean) || NOT_REALLY.has(clean)) return;
      // strongest note wins if a word appears twice
      if (!found.has(clean) || SCOPE_BY_NOTE[tag[1]] === 'both') found.set(clean, tag[1]);
    };
    add(head === '-' ? last || '' : head);
    if (inflections)
      for (const part of inflections.split(/[,|()]/)) add(part.replace(/^[?-]+:?/, '').trim());
  }
  return found;
}

const res = await fetch(ESDB);
if (!res.ok) {
  console.error(`could not fetch ESDB: ${res.status}`);
  process.exit(1);
}
const flagged = parse(await res.text());
if (flagged.size < 20) {
  // the format changed under us, or we fetched something that isn't ESDB
  console.error(`only ${flagged.size} flagged words — refusing to write a suspect list`);
  process.exit(1);
}

// LDNOOBW ships phrases as well as words; only single words can match ours.
const ldRes = await fetch(LDNOOBW);
if (!ldRes.ok) {
  console.error(`could not fetch LDNOOBW: ${ldRes.status}`);
  process.exit(1);
}
const ldnoobw = (await ldRes.text())
  .split(/\r?\n/)
  .map((w) => w.trim().toLowerCase())
  .filter((w) => /^[a-z]{2,}$/.test(w));
if (ldnoobw.length < 100) {
  console.error(`only ${ldnoobw.length} usable LDNOOBW words — refusing a suspect list`);
  process.exit(1);
}

// keep anything a human added
let manual = [];
try {
  manual = JSON.parse(readFileSync(OUT, 'utf8')).words.filter((w) => w.origin === 'manual');
} catch {
  manual = [];
}
const manualWords = new Set(manual.map((w) => w.word));

const derived = [...flagged]
  .filter(([word]) => !manualWords.has(word))
  .map(([word, note]) => ({ word, origin: `esdb:${note}`, scope: SCOPE_BY_NOTE[note] }));

// ESDB first: where both sources have a word, its graded note is the better
// answer than LDNOOBW's single bucket.
const seen = new Set([...manualWords, ...derived.map((w) => w.word)]);
for (const word of ldnoobw) {
  if (seen.has(word) || NOT_REALLY.has(word)) continue;
  seen.add(word);
  derived.push({
    word,
    origin: 'ldnoobw',
    scope: SLURS_ESDB_MISSES.has(word) ? 'both' : 'generation',
  });
}

const words = [...derived, ...manual].sort((a, b) => a.word.localeCompare(b.word));

writeFileSync(
  OUT,
  JSON.stringify(
    {
      _source:
        'Derived from the English Speller Database (https://github.com/en-wl/wordlist), © 2000-2026 Kevin Atkinson, and the LDNOOBW list (https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words), CC BY 4.0. Entries marked origin "manual" are ours.',
      _scope:
        "'both' = never generated and not accepted from a player. 'generation' = never generated, but accepted if a player types it.",
      _regenerate: 'npm run blocklist — refreshes the esdb: entries, keeps the manual ones',
      words,
    },
    null,
    2
  ) + '\n'
);

const counts = words.reduce((acc, w) => ((acc[w.origin] = (acc[w.origin] || 0) + 1), acc), {});
console.log(`wrote ${OUT}: ${words.length} words`);
for (const [origin, n] of Object.entries(counts).sort()) console.log(`  ${origin}: ${n}`);
