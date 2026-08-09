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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const OUT = 'scripts/words.csv';
const BANDS_DIR = 'src/wordbands';
const ESDB = 'https://raw.githubusercontent.com/en-wl/wordlist/v2/data/scowl-pre.txt';

// ---- content flags ----------------------------------------------------------
// Three tiers, agreed 2026-08-09:
//   slur    never scores, never shown, at any difficulty or setting
//   strong  scores; a player can choose not to be shown it
//   mild    scores; same choice, gentler tier
// ESDB supplies the spine (offensive-1/2 -> slur, vulgar-1 -> strong,
// vulgar-3 -> mild); the sets below are the hand-curated remainder — mostly
// slurs ESDB's own README admits it misses, plus the crude register LDNOOBW
// catches. Every entry is one line to amend, and the rebuild workflow makes
// amendments cheap. When in doubt leave a word unflagged: flagging ordinary
// English (sex, escort, nipple) is the filter failing, not working.

const SLURS = new Set([
  // ethnicity — the manual set the generator blocklist already carries
  'darkie', 'darkies', 'jigaboo', 'jigaboos', 'kike', 'kikes',
  'spic', 'spics', 'wetback', 'wetbacks',
  // from LDNOOBW; ESDB has none of these
  'honkey', 'honkeys', 'honky', 'honkies',
  'raghead', 'ragheads', 'towelhead', 'towelheads',
  'pikey', 'pikeys', 'mong', 'mongs',
  'spastic', 'spastics',
  // sexuality and gender
  'faggot', 'faggots', 'fag', 'fags', 'poof', 'poofs', 'poofter', 'poofters',
  'tranny', 'trannies', 'trannys', 'shemale', 'shemales',
  'bulldyke', 'bulldykes', 'twink', 'twinks',
  // left unflagged on purpose — dual-use words a filter must not eat:
  // chink (of light), gook (goo), fagged (exhausted), dyke (a levee)
]);

const STRONG = new Set([
  // dated ethnonym rather than slur — the baseball leagues, the river — but
  // nobody filtering should meet it
  'negro', 'negros', 'negroes',
  // everyday swears ESDB's vulgar-1 doesn't carry
  'bastard', 'bastards', 'bitch', 'bitches', 'bollocks', 'twat', 'twats',
  'tosser', 'tossers', 'wank', 'wanks', 'wanked', 'wanking', 'wanker', 'wankers',
  'whore', 'whores', 'slut', 'sluts', 'pussy', 'pussies',
  // the crude register
  'apeshit', 'blowjob', 'blowjobs', 'bukkake', 'bunghole', 'bungholes',
  'cum', 'cumming', 'cunnilingus', 'anilingus', 'fellatio', 'felch',
  'dildo', 'dildos', 'dildoes', 'dominatrix', 'dingleberry', 'dingleberries',
  'gangbang', 'gangbangs', 'handjob', 'handjobs', 'jizz', 'milf', 'milfs',
  'nympho', 'nymphos', 'poon', 'poontang', 'porn', 'porno', 'pornos', 'pubes',
  'punany', 'quim', 'rimming', 'schlong', 'schlongs', 'smut', 'smutty',
  'sodomize', 'sodomized', 'sodomizes', 'sodomizing', 'sodomy', 'spunk',
  'tit', 'tits', 'titties', 'titty', 'twerk',
  'tribadism', 'zoophilia', 'bestiality', 'coprophilia',
  // not slurs, but nobody filtering should meet them on a score list
  'rape', 'raped', 'rapes', 'raping', 'rapist', 'rapists',
  'incest', 'jailbait', 'swastika', 'swastikas',
  'paedophile', 'paedophiles', 'paedophilia', 'pedophile', 'pedophiles', 'pedophilia',
]);

const MILD = new Set(['boob', 'boobs', 'boner', 'boners', 'tushy', 'horny', 'kinky']);

// ESDB flags these for their roots rather than themselves — craps is a dice
// game, dickens an exclamation, dicker to haggle. Same exemptions as the
// generator blocklist, for the same reason.
const NOT_FLAGGED = new Set([
  'craps', 'dickens', 'dickenses', 'dicker', 'dickered', 'dickering', 'dickers',
]);

const NOTE_FLAG = {
  'offensive-1': 'slur',
  'offensive-2': 'slur',
  'vulgar-1': 'strong',
  'vulgar-3': 'mild',
};

const RANK = { slur: 3, strong: 2, mild: 1 };

// SCOWL sizes, smallest first, so a word takes the first one it appears in.
const LEVELS = [10, 20, 35, 40, 50, 55, 60, 70];

const level = new Map();
for (const size of LEVELS)
  for (const locale of ['english', 'american'])
    for (const raw of require(`wordlist-english/${locale}-words-${size}.json`)) {
      const w = String(raw).toLowerCase();
      if (/^[a-z]+$/.test(w) && !level.has(w)) level.set(w, size);
    }

// SCOWL's own 80 ("huge") tier, vendored from upstream (scripts/scowl/) —
// wordlist-english stops at 70. Same english+american pair, same
// normalization; latin1 because the final lists carry accented entries the
// a-z filter drops anyway. This is what Extreme accepts up to: one lineage,
// every tier a size SCOWL itself defined, and nothing from the "insane" 95.
for (const f of ['english-words.80', 'american-words.80'])
  for (const raw of readFileSync(`scripts/scowl/${f}`, 'latin1').split('\n')) {
    const w = raw.trim().toLowerCase();
    if (/^[a-z]+$/.test(w) && !level.has(w)) level.set(w, 80);
  }

// SCOWL is the whole list. an-array-of-english-words used to widen the top
// tier and is gone entirely — it turned out to be mostly British-variant
// spellings and machine plurals, a different dialect smuggled in at one
// difficulty. Every word here has a SCOWL size.
const words = new Set(level.keys());

// ---- ESDB: part of speech and lemma ----------------------------------------
const res = await fetch(ESDB);
if (!res.ok) {
  console.error(`could not fetch ESDB: ${res.status}`);
  process.exit(1);
}

const pos = new Map();
const lemma = new Map();
const esdbFlag = new Map(); // word -> slur|strong|mild, from ESDB usage notes
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
    /^[^:]*:\s*(?:[A-Z]:\s*)?(\S+)\s*<([^>]*)>\s*(?:\{[^}]*\}\s*)?(?:\(([^)]*)\)\s*)?(?:\{[^}]*\}\s*)?(?::(.*))?$/
  );
  if (!m) continue;
  const [, head, flags, usage, inflections] = m;
  const base = flags.split('/')[0];

  // the same usage notes the blocklist reads, mapped to flag tiers; a note
  // covers every form on its line
  const noteTag = (usage || '').match(/(offensive-1|offensive-2|vulgar-1|vulgar-3)/);
  if (noteTag) {
    const tier = NOTE_FLAG[noteTag[1]];
    const mark = (word) => {
      const c = word.trim().toLowerCase();
      if (!/^[a-z]{2,}$/.test(c)) return;
      const have = esdbFlag.get(c);
      if (!have || RANK[tier] > RANK[have]) esdbFlag.set(c, tier);
    };
    mark(head === '-' ? last || '' : head);
    if (inflections)
      for (const part of inflections.split(/[,|()]/)) mark(part.replace(/^[?-]+:?/, '').trim());
  }

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

// ---- WordNet: noun domains --------------------------------------------------
// Which of WordNet's 26 noun categories each word belongs to — animal, food,
// plant, artifact and so on. Not for this site's games (yet): the use is
// themed generation someday, and other projects reading the shared files. A
// word inherits its lemma's domains when WordNet only knows the base form.
const LEXNAME = {
  3: 'tops', 4: 'act', 5: 'animal', 6: 'artifact', 7: 'attribute', 8: 'body',
  9: 'cognition', 10: 'communication', 11: 'event', 12: 'feeling', 13: 'food',
  14: 'group', 15: 'location', 16: 'motive', 17: 'object', 18: 'person',
  19: 'phenomenon', 20: 'plant', 21: 'possession', 22: 'process',
  23: 'quantity', 24: 'relation', 25: 'shape', 26: 'state', 27: 'substance',
  28: 'time',
};

const wnDomains = new Map();
for (const line of readFileSync(join(require('wordnet-db').path, 'data.noun'), 'utf8').split('\n')) {
  if (!line || line.startsWith('  ')) continue; // license header
  // offset lex_filenum ss_type w_cnt(word lex_id)* ... — w_cnt is hex
  const parts = line.split(' ');
  const cat = LEXNAME[Number(parts[1])];
  if (!cat) continue;
  const count = parseInt(parts[3], 16);
  for (let i = 0; i < count; i++) {
    const w = parts[4 + i * 2].toLowerCase();
    if (!/^[a-z]+$/.test(w)) continue; // collocations carry underscores
    let set = wnDomains.get(w);
    if (!set) wnDomains.set(w, (set = new Set()));
    set.add(cat);
  }
}

// ---- rows ------------------------------------------------------------------
const sorted = (w) => [...w].sort().join('');
const rows = [...words].sort();

function flagOf(w) {
  if (NOT_FLAGGED.has(w)) return '';
  if (SLURS.has(w)) return 'slur';
  let f = esdbFlag.get(w) ?? '';
  if (STRONG.has(w) && (!f || RANK.strong > RANK[f])) f = 'strong';
  if (MILD.has(w) && !f) f = 'mild';
  return f;
}

const csv = ['word,len,sorted,level,pos,lemma,flag,domains'];
const flagCounts = { slur: 0, strong: 0, mild: 0 };
let withLevel = 0;
let withPos = 0;
let withLemma = 0;
let withDomains = 0;
const domainsOut = {}; // the shared domains.json, resolved per word
for (const w of rows) {
  const lv = level.get(w);
  const p = pos.get(w);
  // A lemma is only useful if we hold it too — pointing at a word the table
  // doesn't have would be a dangling reference, and the rule that uses this
  // asks "is my lemma also in the pool?"
  const lm = lemma.get(w);
  const keepLemma = lm && words.has(lm) ? lm : '';
  const flag = flagOf(w);
  const dm = wnDomains.get(w) ?? (keepLemma ? wnDomains.get(keepLemma) : undefined);
  const dmArr = dm ? [...dm].sort() : null;
  // text[] literal for \copy; quoted because it contains commas. Lexnames
  // are bare lowercase words, so no inner escaping can ever be needed.
  const dmCsv = dmArr ? `"{${dmArr.join(',')}}"` : '';
  if (lv !== undefined) withLevel++;
  if (p) withPos++;
  if (keepLemma) withLemma++;
  if (dmArr) {
    withDomains++;
    domainsOut[w] = dmArr;
  }
  if (flag) flagCounts[flag]++;
  csv.push(`${w},${w.length},${sorted(w)},${lv ?? ''},${p ?? ''},${keepLemma},${flag},${dmCsv}`);
}

writeFileSync(OUT, csv.join('\n') + '\n');

// ---- the shared, versioned files -------------------------------------------
// Four bands (words + flags) and one domains map, committed and served from a
// CDN at a pinned tag. Every pool anything needs is a union of bands:
// generation is one band, acceptance is the bands up to a cut — minus slurs,
// which never score anywhere. The database is seeded from the same rows, so
// the client and the table cannot disagree by construction.
const WORDS_VERSION = process.env.WORDS_VERSION || 'words-v1';
mkdirSync(BANDS_DIR, { recursive: true });
const bandOf = (lv) => (lv <= 35 ? 'band-35' : lv <= 55 ? 'band-55' : lv <= 70 ? 'band-70' : 'band-80');
const bands = {
  'band-35': { words: [], flags: {} },
  'band-55': { words: [], flags: {} },
  'band-70': { words: [], flags: {} },
  'band-80': { words: [], flags: {} },
};
for (const w of rows) {
  const band = bands[bandOf(level.get(w))];
  band.words.push(w);
  const flag = flagOf(w);
  if (flag) band.flags[w] = flag;
}
for (const [name, band] of Object.entries(bands)) {
  writeFileSync(
    join(BANDS_DIR, `${name}.json`),
    JSON.stringify({ version: WORDS_VERSION, ...band }) + '\n'
  );
}
writeFileSync(
  join(BANDS_DIR, 'domains.json'),
  JSON.stringify({ version: WORDS_VERSION, domains: domainsOut }) + '\n'
);

const pct = (n) => `${((n / rows.length) * 100).toFixed(1)}%`;
console.log(`wrote ${OUT}: ${rows.length.toLocaleString()} rows`);
console.log(`  with a SCOWL level : ${withLevel.toLocaleString().padStart(9)}  ${pct(withLevel)}`);
console.log(`  with a pos         : ${withPos.toLocaleString().padStart(9)}  ${pct(withPos)}`);
console.log(`  with a lemma       : ${withLemma.toLocaleString().padStart(9)}  ${pct(withLemma)}`);
console.log(`  with domains       : ${withDomains.toLocaleString().padStart(9)}  ${pct(withDomains)}`);
console.log(
  `  flags              : slur ${flagCounts.slur}, strong ${flagCounts.strong}, mild ${flagCounts.mild}`
);
// The accept-tier counts the client tests pin — a tier is its level cut minus
// the slurs, which never score.
const accepts = { easy: 0, hard: 0, extreme: 0 };
for (const w of rows) {
  if (flagOf(w) === 'slur') continue;
  const lv = level.get(w);
  if (lv <= 55) accepts.easy++;
  if (lv <= 70) accepts.hard++;
  if (lv <= 80) accepts.extreme++;
}
console.log(
  `  accept tiers       : easy ${accepts.easy.toLocaleString()}, hard ${accepts.hard.toLocaleString()}, extreme ${accepts.extreme.toLocaleString()}`
);
const byLevel = {};
for (const w of rows) {
  const k = level.get(w) ?? 'none';
  byLevel[k] = (byLevel[k] ?? 0) + 1;
}
console.log(
  '  by level           :',
  [...LEVELS, 80].map((l) => `${l}:${(byLevel[l] ?? 0).toLocaleString()}`).join('  ')
);
