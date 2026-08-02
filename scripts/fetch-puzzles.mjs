// Fetches today's NYT Letter Boxed and Spelling Bee puzzles and generates
// daily guess-game words, writing data/letterboxed.json, data/spellingbee.json,
// and data/daily-words.json.
// Run by .github/workflows/letterboxed-data.yml on a daily schedule.
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html',
};

async function fetchGameData(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  const html = await res.text();
  const match = html.match(/window\.gameData\s*=\s*(\{.+?\})\s*(?:;|<\/script>)/s);
  if (!match) throw new Error(`Could not locate window.gameData at ${url}`);
  return JSON.parse(match[1]);
}

await mkdir('data', { recursive: true });

// Letter Boxed
const lb = await fetchGameData('https://www.nytimes.com/puzzles/letter-boxed');
if (!Array.isArray(lb.sides) || lb.sides.length !== 4) {
  throw new Error(`Unexpected Letter Boxed sides: ${JSON.stringify(lb.sides)}`);
}
const lbOut = {
  date: lb.printDate ?? null,
  sides: lb.sides.map((s) => String(s).toLowerCase()),
  par: lb.par ?? null,
  fetchedAt: new Date().toISOString(),
};
await writeFile('data/letterboxed.json', JSON.stringify(lbOut, null, 2) + '\n');
console.log('Wrote data/letterboxed.json:', JSON.stringify(lbOut));

// Spelling Bee (letters only — no answers or pangrams)
const sb = await fetchGameData('https://www.nytimes.com/puzzles/spelling-bee');
const today = sb.today ?? sb;
if (!/^[a-z]$/i.test(String(today.centerLetter)) || !Array.isArray(today.outerLetters) || today.outerLetters.length !== 6) {
  throw new Error(`Unexpected Spelling Bee letters: ${JSON.stringify({ c: today.centerLetter, o: today.outerLetters })}`);
}
const sbOut = {
  date: today.printDate ?? null,
  center: String(today.centerLetter).toLowerCase(),
  outers: today.outerLetters.map((c) => String(c).toLowerCase()),
  fetchedAt: new Date().toISOString(),
};
await writeFile('data/spellingbee.json', JSON.stringify(sbOut, null, 2) + '\n');
console.log('Wrote data/spellingbee.json:', JSON.stringify(sbOut));

// Daily guess-game words: one per length 3-15, deterministic for the Eastern
// date so both scheduled runs pick identical words. Words are base64-encoded
// purely to avoid accidental spoilers in the raw file.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadTierSet(files) {
  const set = new Set();
  for (const f of files) {
    for (const raw of require(`wordlist-english/${f}.json`)) {
      const w = String(raw).toLowerCase();
      if (/^[a-z]+$/.test(w)) set.add(w);
    }
  }
  return set;
}

const COMMON_FILES = ['english-words-10', 'english-words-20', 'english-words-35', 'american-words-10', 'american-words-20', 'american-words-35'];
const STANDARD_FILES = [...COMMON_FILES, 'english-words-40', 'english-words-50', 'english-words-55', 'american-words-40', 'american-words-50', 'american-words-55'];

const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const rng = mulberry32(xmur3(`anagrimoire-guess-${etDate}`)());

const commonSet = loadTierSet(COMMON_FILES);
let standardSet = null; // loaded lazily; long lengths are sparse in the common tiers
let fullList = null;

const dailyWords = {};
for (let len = 3; len <= 15; len++) {
  // skip simple plurals whose stem is also a word
  const pickable = (set) =>
    [...set].filter((w) => w.length === len && !(w.endsWith('s') && set.has(w.slice(0, -1))));
  let pool = pickable(commonSet);
  if (pool.length === 0) {
    standardSet ??= loadTierSet(STANDARD_FILES);
    pool = pickable(standardSet);
  }
  if (pool.length === 0) {
    fullList ??= require('an-array-of-english-words');
    pool = fullList.filter((w) => w.length === len);
  }
  if (pool.length === 0) throw new Error(`No candidate words of length ${len}`);
  pool.sort(); // Set iteration order is insertion order — sort for determinism
  const word = pool[Math.floor(rng() * pool.length)];
  dailyWords[len] = Buffer.from(word).toString('base64');
}

const dwOut = { date: etDate, words: dailyWords, fetchedAt: new Date().toISOString() };
await writeFile('data/daily-words.json', JSON.stringify(dwOut, null, 2) + '\n');
console.log('Wrote data/daily-words.json for', etDate, `(${Object.keys(dailyWords).length} lengths)`);

// Daily hive for play mode: our own generated puzzle (not the NYT's letters),
// seeded from a pangram so it is always completable, deterministic per date.
const hiveRng = mulberry32(xmur3(`anagrimoire-hive-${etDate}`)());
const hiveBases = [...commonSet].filter((w) => w.length >= 7 && new Set(w).size === 7).sort();
if (!hiveBases.length) throw new Error('No pangram bases for the daily hive');
const base = hiveBases[Math.floor(hiveRng() * hiveBases.length)];
const hiveLetters = [...new Set(base)];
const center = hiveLetters[Math.floor(hiveRng() * hiveLetters.length)];
const outers = hiveLetters.filter((c) => c !== center).sort(() => hiveRng() - 0.5);
const hiveOut = { date: etDate, center, outers, fetchedAt: new Date().toISOString() };
await writeFile('data/daily-hive.json', JSON.stringify(hiveOut, null, 2) + '\n');
console.log('Wrote data/daily-hive.json:', JSON.stringify(hiveOut));
