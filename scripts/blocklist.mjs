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
    const line = raw.trimEnd();
    if (!line) continue;
    const m = line.match(/:\s*(?:[A-Z]:\s*)?(\S+)\s*<[^>]*>\s*(\([^)]*\))?\s*(?::(.*))?$/);
    if (!m) continue;
    const [, head, note, inflections] = m;
    if (head !== '-') last = head;
    const tag = (note || '').match(/(offensive-1|offensive-2|vulgar-1|vulgar-3)/);
    if (!tag) continue;
    const add = (w) => {
      const clean = w.replace(/[^A-Za-z'-]/g, '').toLowerCase();
      if (!/^[a-z]{2,}$/.test(clean) || NOT_REALLY.has(clean)) return;
      // strongest note wins if a word appears twice
      if (!found.has(clean) || SCOPE_BY_NOTE[tag[1]] === 'both') found.set(clean, tag[1]);
    };
    add(head === '-' ? last || '' : head);
    if (inflections)
      for (const part of inflections.split(/[,|]/)) add(part.replace(/^[?-]+:?/, '').trim());
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

const words = [...derived, ...manual].sort((a, b) => a.word.localeCompare(b.word));

writeFileSync(
  OUT,
  JSON.stringify(
    {
      _source:
        'Derived from the English Speller Database (https://github.com/en-wl/wordlist), © 2000-2026 Kevin Atkinson. Entries marked origin "manual" are ours.',
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
