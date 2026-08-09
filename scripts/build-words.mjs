// Builds the rows for the `words` table: every word we might ever accept, with
// the SCOWL size it enters at and, where ESDB knows, its part of speech and the
// headword it inflects from.
//
// Membership and `level` come from the npm packages the client bundles, not
// from ESDB, so the table can't disagree with the dictionaries the browser is
// searching. A generated answer that fails to validate is the sort of bug that
// shows up on one puzzle, months apart.
//
// `pos` and `lemma` come from ESDB, which is the only source that has them.
// Two things it can't do, worth knowing before relying on it:
//   - coverage is partial. About 106k of 277k rows have a lemma, so a null
//     lemma means "not known to be an inflection", never "not an inflection".
//   - `pos` is a set, not a value: run is n|v and blue is aj|n|v.
//
// Writes a CSV rather than SQL because 277k INSERT statements is not a thing
// anyone should paste into an editor. Load it with \copy, or Supabase's table
// import. The file is gitignored — it's derived, and it's 10MB.
//
//   npm run build-words

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

const OUT = 'scripts/words.csv';
const ESDB = 'https://raw.githubusercontent.com/en-wl/wordlist/v2/data/scowl-pre.txt';

// SCOWL sizes, smallest first, so a word takes the first one it appears in.
const LEVELS = [10, 20, 35, 40, 50, 55, 60, 70];

const level = new Map();
for (const size of LEVELS)
  for (const locale of ['english', 'american'])
    for (const raw of require(`wordlist-english/${locale}-words-${size}.json`)) {
      const w = String(raw).toLowerCase();
      if (/^[a-z]+$/.test(w) && !level.has(w)) level.set(w, size);
    }

// Everything else we accept, which the large list has and SCOWL doesn't. No
// level: they're extreme-only by definition.
const words = new Set(level.keys());
for (const raw of require('an-array-of-english-words')) {
  const w = String(raw).toLowerCase();
  if (/^[a-z]+$/.test(w)) words.add(w);
}

// ---- ESDB: part of speech and lemma ----------------------------------------
const res = await fetch(ESDB);
if (!res.ok) {
  console.error(`could not fetch ESDB: ${res.status}`);
  process.exit(1);
}

const pos = new Map();
const lemma = new Map();
let last = null;
let lastPos = null;
for (const raw of (await res.text()).split('\n')) {
  // a trailing "#..." is a note, not data
  const line = raw.trimEnd().split(/\s#/)[0];
  if (!line) continue;
  // <sizes>: [<region>:] <headword> <pos/flags> [{sense}] [(usage)] [: inflections]
  // The {sense} marker is not optional to handle: mouse <n> {animal}: mice.
  // Skipping it loses every irregular plural.
  const m = line.match(
    /^[^:]*:\s*(?:[A-Z]:\s*)?(\S+)\s*<([^>]*)>\s*(?:\{[^}]*\}\s*)?(?:\([^)]*\)\s*)?(?:\{[^}]*\}\s*)?(?::(.*))?$/
  );
  if (!m) continue;
  const [, head, flags, inflections] = m;
  const base = flags.split('/')[0];

  if (head !== '-') {
    last = head;
    lastPos = base;
    const w = head.toLowerCase();
    if (/^[a-z]+$/.test(w)) {
      const have = pos.get(w);
      // joined with | rather than , because this lands in a CSV column:
      // "aj,n" would silently become two fields
      pos.set(w, have ? [...new Set([...have.split('|'), base])].sort().join('|') : base);
    }
  }

  if (!inflections || !last) continue;
  const headLower = last.toLowerCase();
  for (const part of inflections.split(/[,|()]/)) {
    const w = part.replace(/^[?-]+:?/, '').trim().toLowerCase();
    if (!/^[a-z]+$/.test(w) || w === headLower) continue;
    if (!lemma.has(w)) lemma.set(w, headLower);
    if (!pos.has(w)) pos.set(w, head === '-' ? lastPos : base);
  }
}

// ---- rows ------------------------------------------------------------------
const sorted = (w) => [...w].sort().join('');
const rows = [...words].sort();

const csv = ['word,len,sorted,level,pos,lemma'];
let withLevel = 0;
let withPos = 0;
let withLemma = 0;
for (const w of rows) {
  const lv = level.get(w);
  const p = pos.get(w);
  // A lemma is only useful if we hold it too — pointing at a word the table
  // doesn't have would be a dangling reference, and the rule that uses this
  // asks "is my lemma also in the pool?"
  const lm = lemma.get(w);
  const keepLemma = lm && words.has(lm) ? lm : '';
  if (lv !== undefined) withLevel++;
  if (p) withPos++;
  if (keepLemma) withLemma++;
  csv.push(`${w},${w.length},${sorted(w)},${lv ?? ''},${p ?? ''},${keepLemma}`);
}

writeFileSync(OUT, csv.join('\n') + '\n');

const pct = (n) => `${((n / rows.length) * 100).toFixed(1)}%`;
console.log(`wrote ${OUT}: ${rows.length.toLocaleString()} rows`);
console.log(`  with a SCOWL level : ${withLevel.toLocaleString().padStart(9)}  ${pct(withLevel)}`);
console.log(`  with a pos         : ${withPos.toLocaleString().padStart(9)}  ${pct(withPos)}`);
console.log(`  with a lemma       : ${withLemma.toLocaleString().padStart(9)}  ${pct(withLemma)}`);
const byLevel = {};
for (const w of rows) {
  const k = level.get(w) ?? 'none';
  byLevel[k] = (byLevel[k] ?? 0) + 1;
}
console.log(
  '  by level           :',
  [...LEVELS, 'none'].map((l) => `${l}:${(byLevel[l] ?? 0).toLocaleString()}`).join('  ')
);
