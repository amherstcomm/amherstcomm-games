// Fetches today's NYT Letter Boxed and Spelling Bee puzzles and generates
// daily guess-game words, writing data/letterboxed.json, data/spellingbee.json,
// and data/daily-words.json.
// Run by .github/workflows/daily-puzzle-data.yml on a daily schedule.
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { generateWeave } from './weave.mjs';
import { THEMES } from './themes.mjs';

const require = createRequire(import.meta.url);

const encodeAnswers = (p) =>
  Buffer.from(JSON.stringify({ spangram: p.spangram, words: p.words })).toString('base64');

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

// NYT Strands (board letters and theme clue only — no answers)
const strandsRes = await fetch(`https://www.nytimes.com/svc/strands/v2/${
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}.json`, { headers: HEADERS });
if (!strandsRes.ok) throw new Error(`Strands responded ${strandsRes.status}`);
const strands = await strandsRes.json();
if (
  !Array.isArray(strands.startingBoard) ||
  strands.startingBoard.length !== 8 ||
  !strands.startingBoard.every((r) => /^[a-z]{6}$/i.test(String(r)))
) {
  throw new Error(`Unexpected Strands board: ${JSON.stringify(strands.startingBoard)}`);
}
const strandsOut = {
  date: strands.printDate ?? null,
  clue: typeof strands.clue === 'string' ? strands.clue : null,
  board: strands.startingBoard.map((r) => String(r).toLowerCase()),
  fetchedAt: new Date().toISOString(),
};
await writeFile('data/strands.json', JSON.stringify(strandsOut, null, 2) + '\n');
console.log('Wrote data/strands.json:', JSON.stringify(strandsOut));

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

const commonSet = loadTierSet(COMMON_FILES);
let standardSet = null; // loaded lazily; long lengths are sparse in the common tiers
let fullList = null;

// shared candidate pools, computed once and drawn from per variant
// no 's' in the hive (plurals would flood the answer list)
const hiveBases = [...commonSet]
  .filter((w) => w.length >= 7 && new Set(w).size === 7 && !w.includes('s'))
  .sort();
if (!hiveBases.length) throw new Error('No pangram bases for the daily hive');
const rackBases = [...commonSet].filter((w) => w.length === 7).sort();
if (!rackBases.length) throw new Error('No seven-letter rack bases');

// Daily box for play mode: our own generated Letter Boxed-style puzzle.
// Built from two chainable words covering exactly 12 distinct letters, with
// sides assigned so no consecutive pair shares a side — which guarantees a
// two-word solution exists. Deterministic per Eastern date.
function assignSides(w1, w2, rng) {
  const letters = [...new Set(w1 + w2)];
  const adjacent = new Set();
  for (const w of [w1, w2]) {
    for (let i = 1; i < w.length; i++) {
      adjacent.add(w[i - 1] + w[i]);
      adjacent.add(w[i] + w[i - 1]);
    }
  }
  // most-constrained letters first
  const degree = (c) => letters.filter((x) => adjacent.has(c + x)).length;
  letters.sort((a, b) => degree(b) - degree(a));
  const sides = [[], [], [], []];
  const bt = (i) => {
    if (i === letters.length) return true;
    const c = letters[i];
    const order = [0, 1, 2, 3].sort(() => rng() - 0.5);
    for (const s of order) {
      if (sides[s].length >= 3) continue;
      if (sides[s].some((x) => adjacent.has(x + c))) continue;
      sides[s].push(c);
      if (bt(i + 1)) return true;
      sides[s].pop();
    }
    return false;
  };
  return bt(0) ? sides.map((s) => s.join('')) : null;
}

const boxWords = [...commonSet].filter((w) => w.length >= 4 && !/(.)\1/.test(w)).sort();
const boxByFirst = new Map();
for (const w of boxWords) {
  const g = boxByFirst.get(w[0]) ?? [];
  g.push(w);
  boxByFirst.set(w[0], g);
}

const GRID_DICE = [
  'aaeegn', 'abbjoo', 'achops', 'affkps',
  'aoottw', 'cimotu', 'deilrx', 'delrvy',
  'distty', 'eeghnw', 'eeinsu', 'ehrtvw',
  'eiosst', 'elrtty', 'himnuq', 'hlnnrz',
];

// Two independent daily sets: production, and a dev-salted set for
// dev.anagrimoire.com/localhost so testing never spoils the production
// puzzles. Everything stays deterministic per Eastern date.
for (const variant of ['', 'dev']) {
  const salt = variant ? `-${variant}` : '';
  const prefix = variant ? 'dev-' : '';
  const stamp = new Date().toISOString();

  // guess words: one per length 3-15
  const rng = mulberry32(xmur3(`anagrimoire-guess-${etDate}${salt}`)());
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
  await writeFile(
    `data/${prefix}daily-words.json`,
    JSON.stringify({ date: etDate, words: dailyWords, fetchedAt: stamp }, null, 2) + '\n'
  );
  console.log(`Wrote data/${prefix}daily-words.json for ${etDate}`);

  // hive: seeded from a pangram so it is always completable
  const hiveRng = mulberry32(xmur3(`anagrimoire-hive-${etDate}${salt}`)());
  const base = hiveBases[Math.floor(hiveRng() * hiveBases.length)];
  const hiveLetters = [...new Set(base)];
  const center = hiveLetters[Math.floor(hiveRng() * hiveLetters.length)];
  const outers = hiveLetters.filter((c) => c !== center).sort(() => hiveRng() - 0.5);
  await writeFile(
    `data/${prefix}daily-hive.json`,
    JSON.stringify({ date: etDate, center, outers, fetchedAt: stamp }, null, 2) + '\n'
  );
  console.log(`Wrote data/${prefix}daily-hive.json: ${center}/${outers.join('')}`);

  // box: two chainable words covering exactly 12 distinct letters
  const boxRng = mulberry32(xmur3(`anagrimoire-box-${etDate}${salt}`)());
  let boxSides = null;
  for (let attempt = 0; attempt < 2000 && !boxSides; attempt++) {
    const w1 = boxWords[Math.floor(boxRng() * boxWords.length)];
    const cands = (boxByFirst.get(w1[w1.length - 1]) ?? []).filter(
      (w2) => w2 !== w1 && new Set(w1 + w2).size === 12
    );
    if (!cands.length) continue;
    const w2 = cands[Math.floor(boxRng() * cands.length)];
    boxSides = assignSides(w1, w2, boxRng);
  }
  if (!boxSides) throw new Error('Could not generate a daily box');
  await writeFile(
    `data/${prefix}daily-box.json`,
    JSON.stringify({ date: etDate, sides: boxSides, par: 2, fetchedAt: stamp }, null, 2) + '\n'
  );
  console.log(`Wrote data/${prefix}daily-box.json: ${boxSides.join('/')}`);

  // scramble rack: shuffled seven-letter word, full-rack bonus guaranteed
  const scrambleRng = mulberry32(xmur3(`anagrimoire-scramble-${etDate}${salt}`)());
  const rackBase = rackBases[Math.floor(scrambleRng() * rackBases.length)];
  const rack = rackBase.split('').sort(() => scrambleRng() - 0.5);
  await writeFile(
    `data/${prefix}daily-scramble.json`,
    JSON.stringify({ date: etDate, letters: rack, fetchedAt: stamp }, null, 2) + '\n'
  );
  console.log(`Wrote data/${prefix}daily-scramble.json: ${rack.join('')}`);

  // 4x4 grid from the classic dice (q treated as a plain letter)
  const gridRng = mulberry32(xmur3(`anagrimoire-grid-${etDate}${salt}`)());
  const gridCells = GRID_DICE.map((d) => d[Math.floor(gridRng() * 6)]).sort(() => gridRng() - 0.5);
  await writeFile(
    `data/${prefix}daily-grid.json`,
    JSON.stringify({ date: etDate, cells: gridCells, fetchedAt: stamp }, null, 2) + '\n'
  );
  console.log(`Wrote data/${prefix}daily-grid.json: ${gridCells.join('')}`);

  // weave: themed 6x8 tiling puzzle (Strands-style); answers ship base64d
  // to avoid casual spoilers
  const weaveRng = mulberry32(xmur3(`anagrimoire-weave-${etDate}${salt}`)());
  const weave = generateWeave(weaveRng, 6, 8, THEMES);
  if (!weave) throw new Error('Could not generate a daily weave');
  await writeFile(
    `data/${prefix}daily-weave.json`,
    JSON.stringify(
      { date: etDate, clue: weave.clue, cols: 6, board: weave.board, answers: encodeAnswers(weave), fetchedAt: stamp },
      null,
      2
    ) + '\n'
  );
  console.log(`Wrote data/${prefix}daily-weave.json: ${weave.clue} (${weave.spangram.w})`);
}

// shared practice pool for weave: pre-generated boards in both sizes,
// refreshed daily, used by both sites
const poolRng = mulberry32(xmur3(`anagrimoire-weave-pool-${etDate}`)());
const pool = { '6x8': [], '8x10': [] };
for (const [key, cols, rows, count] of [['6x8', 6, 8, 8], ['8x10', 8, 10, 8]]) {
  for (let i = 0; i < count; i++) {
    const p = generateWeave(poolRng, cols, rows, THEMES);
    if (!p) throw new Error(`Could not generate pool weave ${key} #${i}`);
    pool[key].push({ clue: p.clue, cols, board: p.board, answers: encodeAnswers(p) });
  }
}
await writeFile(
  'data/weave-pool.json',
  JSON.stringify({ date: etDate, pool, fetchedAt: new Date().toISOString() }, null, 2) + '\n'
);
console.log(`Wrote data/weave-pool.json (${pool['6x8'].length} + ${pool['8x10'].length} puzzles)`);
