// Fetches today's NYT Letter Boxed and Spelling Bee puzzles and generates
// daily guess-game words, writing data/letterboxed.json, data/spellingbee.json,
// and data/daily-words.json.
// Run by .github/workflows/daily-puzzle-data.yml on a daily schedule.
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { generateWeave } from './weave.mjs';
import { generateSquare, GIVEN_TARGET } from './squares.mjs';
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

// Words we won't hand anyone as an answer. Applied to the pools puzzles are
// *built* from, never to the sets they're *validated* against: refusing to
// publish a word and refusing to accept one a player typed are different
// things, and only the first is ours to decide. See scripts/blocklist.mjs.
const blockedFromAnswers = new Set(
  JSON.parse(readFileSync('scripts/blocked-words.json', 'utf8')).words.map((w) => w.word)
);

/** A generation pool with the blocked words taken out. */
function answerPool(set) {
  const out = new Set();
  for (const w of set) if (!blockedFromAnswers.has(w)) out.add(w);
  return out;
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

// Three difficulties, and they don't all mean the same thing. Guess, Hive,
// Boxed and Scramble vary by word tier; Grid varies only by what it accepts,
// so its board is the same at every level; Squares and Weave vary by shape,
// because a tier is meaningless to a dice grid or to hand-curated themes.
export const DIFFICULTIES = ['easy', 'hard', 'extreme'];

/** The band below each difficulty, so a difficulty can generate from what it
 *  alone adds. */
const PREVIOUS = { hard: 'easy', extreme: 'hard' };

const TIER_FILES = {
  easy: COMMON_FILES,
  hard: STANDARD_FILES,
  extreme: [
    ...STANDARD_FILES,
    'english-words-60',
    'english-words-70',
    'american-words-60',
    'american-words-70',
  ],
};

// Squares checks solution uniqueness against this, unfiltered on purpose: a
// square with a rude second solution is still a square with two solutions, and
// we want to know.
let uniquenessSet = null;
const uniquenessWords = () => (uniquenessSet ??= loadTierSet(STANDARD_FILES));

// How many words a hive board actually yields, which nothing used to check.
//
// Sampling 60 bases per difficulty found boards ranging from 6 findable words
// to 210, with about one in seven under twenty — at every difficulty, easy
// included. That's a thin puzzle arriving by chance rather than by design, and
// it has nothing to do with difficulty: seven letters' worth of words doesn't
// care whether the seed word was common or obscure.
//
// Counted against the list the game actually accepts, so the number here is
// the number a player can reach.
const HIVE_MIN_WORDS = 30;

let hiveIndex = null;
function hiveWordIndex() {
  if (hiveIndex) return hiveIndex;
  const bit = (c) => 1 << (c.charCodeAt(0) - 97);
  const words = [];
  for (const w of uniquenessWords()) {
    if (w.length < 4) continue;
    let mask = 0;
    for (const c of w) mask |= bit(c);
    // seven letters at most, or it can never fit on a board
    if (mask && (mask & (mask - 1)) !== 0) words.push({ mask, letters: mask });
  }
  hiveIndex = { words, bit };
  return hiveIndex;
}

/** Words findable on this board: every letter on the board, and the centre. */
function hiveWordCount(letters, center) {
  const { words, bit } = hiveWordIndex();
  let board = 0;
  for (const c of letters) board |= bit(c);
  const need = bit(center);
  let n = 0;
  for (const w of words) if ((w.mask & ~board) === 0 && (w.mask & need) !== 0) n++;
  return n;
}

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

/** Everything a difficulty draws from, built once and reused.
 *
 *  These used to be module-level constants off the common tier, which was fine
 *  while there was one difficulty and wrong the moment there were three. */
const poolCache = new Map();

/** How many candidates a length needs to go a year without repeating itself. */
const YEAR = 365;

function poolsFor(difficulty) {
  const cached = poolCache.get(difficulty);
  if (cached) return cached;

  // Everything the difficulty accepts...
  const cumulative = answerPool(loadTierSet(TIER_FILES[difficulty]));

  // ...but generate from the band it *adds*, not the whole nested pool.
  // Cumulative pools make a mockery of the ladder: extreme is 35% easy words,
  // so a third of extreme puzzles would land on one. Measured, that's exactly
  // what happened — the first extreme run drew "cat" for three letters while
  // easy drew "coo".
  const easier = difficulty === 'easy' ? null : answerPool(loadTierSet(TIER_FILES[PREVIOUS[difficulty]]));
  const answers = easier
    ? new Set([...cumulative].filter((w) => !easier.has(w)))
    : cumulative;

  // no 's' in the hive — plurals would flood the answer list
  const hiveBases = [...answers]
    .filter((w) => w.length >= 7 && new Set(w).size === 7 && !w.includes('s'))
    .sort();
  if (!hiveBases.length) throw new Error(`No pangram bases for ${difficulty} hive`);

  const rackBases = [...answers].filter((w) => w.length === 7).sort();
  if (!rackBases.length) throw new Error(`No seven-letter rack bases for ${difficulty}`);

  const boxWords = [...answers].filter((w) => w.length >= 4 && !/(.)\1/.test(w)).sort();
  const boxByFirst = new Map();
  for (const w of boxWords) {
    const g = boxByFirst.get(w[0]) ?? [];
    g.push(w);
    boxByFirst.set(w[0], g);
  }

  const pools = { answers, cumulative, hiveBases, rackBases, boxWords, boxByFirst };
  poolCache.set(difficulty, pools);
  return pools;
}

// Shape rather than tier. Squares takes letters away instead of growing the
// grid, because 6x6 double word squares don't exist in any usable number —
// measured at 0 out of 3 against all 22,418 six-letter words. Weave stops at
// 8x10 because a theme carries about 91 letters and 10x12 needs 120.
const SQUARE_SHAPE = {
  easy: { size: 4, given: 8 },
  hard: { size: 5, given: 10 },
  extreme: { size: 5, given: 6 },
};
const WEAVE_SHAPE = { easy: [6, 8], hard: [7, 9], extreme: [8, 10] };

const GRID_DICE = [
  'aaeegn', 'abbjoo', 'achops', 'affkps',
  'aoottw', 'cimotu', 'deilrx', 'delrvy',
  'distty', 'eeghnw', 'eeinsu', 'ehrtvw',
  'eiosst', 'elrtty', 'himnuq', 'hlnnrz',
];

// Two independent daily sets: production, and a dev-salted set for
// dev.anagrimoire.com/localhost so testing never spoils the production
// puzzles. Everything stays deterministic per Eastern date.
// Easy keeps the seed it has always had, so shipping difficulty doesn't
// change the puzzle anyone is already playing — only hard and extreme are new.
// Without this, republishing mid-day would swap today's board out from under
// whoever is on it.
const diffSalt = (d) => (d === 'easy' ? '' : `-${d}`);

const dailyWeaveClues = new Set();
for (const variant of ['', 'dev']) {
  const salt = variant ? `-${variant}` : '';
  const prefix = variant ? 'dev-' : '';
  const stamp = new Date().toISOString();

  // guess words: one per length 3-12. Each length is its own daily stream, so
  // what matters is depth per length rather than the total: at 13, 14 and 15
  // the common tier holds 558, 199 and 82 words, and 82 is under three months
  // before every fifteen-letter daily has been used. Twelve still has 1,065,
  // which is three years. Cutting lower would cost words and buy nothing —
  // below 12 the thinnest stream becomes length 3, not the long end.
  const guessByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    // Salted per difficulty. Without it the same seed draws the same index
    // from three nested pools and lands on the same word more often than
    // chance would.
    const rng = mulberry32(xmur3(`anagrimoire-guess-${etDate}${salt}${diffSalt(difficulty)}`)());
    const { answers, cumulative } = poolsFor(difficulty);
    const words = {};
    for (let len = 3; len <= 12; len++) {
      // skip simple plurals whose stem is also a word
      const at = (set) =>
        [...set]
          .filter((w) => w.length === len && !(w.endsWith('s') && set.has(w.slice(0, -1))))
          .sort(); // Set iteration order is insertion order — sort for determinism
      // The band first. Three-letter words are the one place it runs dry —
      // 154 hard-only and 148 extreme-only, under five months before repeating
      // — because short words are almost all common ones. There the ladder
      // widens rather than repeat itself, which is the honest trade.
      let pool = at(answers);
      if (pool.length < YEAR) pool = at(cumulative);
      if (pool.length === 0) throw new Error(`No ${difficulty} words of length ${len}`);
      words[len] = Buffer.from(pool[Math.floor(rng() * pool.length)]).toString('base64');
    }
    // wrapped in { words } so every byDifficulty entry has the same field
    // names as the top level — the client merges one over the other, and a
    // variant shaped differently silently leaves the easy board in place
    guessByDifficulty[difficulty] = { words };
  }
  await writeFile(
    `data/${prefix}daily-words.json`,
    JSON.stringify(
      {
        date: etDate,
        // The easy board repeated at the top level, so a client that predates
        // difficulty keeps working. Removed once none do.
        words: guessByDifficulty.easy.words,
        byDifficulty: guessByDifficulty,
        fetchedAt: stamp,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`Wrote data/${prefix}daily-words.json for ${etDate}`);

  // hive: seeded from a pangram so it is always completable
  const hiveByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    const hiveRng = mulberry32(xmur3(`anagrimoire-hive-${etDate}${salt}${diffSalt(difficulty)}`)());
    const { hiveBases } = poolsFor(difficulty);
    // Keep looking until the board is worth playing. The centre matters as
    // much as the letters — the same seven letters can yield 9 words with one
    // centre and 90 with another — so every centre is tried before the base is
    // given up on.
    let picked = null;
    let best = null;
    for (let attempt = 0; attempt < 300 && !picked; attempt++) {
      const base = hiveBases[Math.floor(hiveRng() * hiveBases.length)];
      const letters = [...new Set(base)];
      for (const center of letters.slice().sort(() => hiveRng() - 0.5)) {
        const count = hiveWordCount(letters, center);
        if (!best || count > best.count) best = { letters, center, count };
        if (count >= HIVE_MIN_WORDS) {
          picked = { letters, center, count };
          break;
        }
      }
    }
    // Three hundred bases without one is not a thin day, it's a broken pool —
    // but a puzzle nobody can play is worse than a thin one, so take the best
    // seen and say so.
    if (!picked) {
      picked = best;
      console.warn(
        `hive ${difficulty}: no board reached ${HIVE_MIN_WORDS} words; using ${best.count}`
      );
    }
    const outers = picked.letters.filter((c) => c !== picked.center).sort(() => hiveRng() - 0.5);
    hiveByDifficulty[difficulty] = { center: picked.center, outers };
    hiveByDifficulty[difficulty].words = picked.count;
  }
  await writeFile(
    `data/${prefix}daily-hive.json`,
    JSON.stringify(
      { date: etDate, ...hiveByDifficulty.easy, byDifficulty: hiveByDifficulty, fetchedAt: stamp },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-hive.json: ` +
      DIFFICULTIES.map(
        (d) =>
          `${hiveByDifficulty[d].center}/${hiveByDifficulty[d].outers.join('')} (${hiveByDifficulty[d].words}w)`
      ).join(' ')
  );

  // box: two chainable words covering exactly 12 distinct letters
  const boxByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    const boxRng = mulberry32(xmur3(`anagrimoire-box-${etDate}${salt}${diffSalt(difficulty)}`)());
    const { boxWords, boxByFirst } = poolsFor(difficulty);
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
    if (!boxSides) throw new Error(`Could not generate a ${difficulty} daily box`);
    boxByDifficulty[difficulty] = { sides: boxSides, par: 2 };
  }
  await writeFile(
    `data/${prefix}daily-box.json`,
    JSON.stringify(
      { date: etDate, ...boxByDifficulty.easy, byDifficulty: boxByDifficulty, fetchedAt: stamp },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-box.json: ` +
      DIFFICULTIES.map((d) => boxByDifficulty[d].sides.join('/')).join('  ')
  );

  // scramble rack: shuffled seven-letter word, full-rack bonus guaranteed
  const scrambleByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    const scrambleRng = mulberry32(
      xmur3(`anagrimoire-scramble-${etDate}${salt}${diffSalt(difficulty)}`)()
    );
    const { rackBases } = poolsFor(difficulty);
    const rackBase = rackBases[Math.floor(scrambleRng() * rackBases.length)];
    scrambleByDifficulty[difficulty] = {
      letters: rackBase.split('').sort(() => scrambleRng() - 0.5),
    };
  }
  await writeFile(
    `data/${prefix}daily-scramble.json`,
    JSON.stringify(
      {
        date: etDate,
        ...scrambleByDifficulty.easy,
        byDifficulty: scrambleByDifficulty,
        fetchedAt: stamp,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-scramble.json: ` +
      DIFFICULTIES.map((d) => scrambleByDifficulty[d].letters.join('')).join(' ')
  );

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
  // Weave varies by board size, not by word tier — its words come from
  // hand-curated themes, so there is no tier to widen. 10x12 was the obvious
  // extreme and doesn't exist: a theme carries about 91 letters and 120 cells
  // need 120.
  const weaveByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    const [cols, rows] = WEAVE_SHAPE[difficulty];
    const weaveRng = mulberry32(xmur3(`anagrimoire-weave-${etDate}${salt}${diffSalt(difficulty)}`)());
    const weave = generateWeave(weaveRng, cols, rows, THEMES);
    if (!weave) throw new Error(`Could not generate a ${difficulty} daily weave`);
    dailyWeaveClues.add(weave.clue);
    weaveByDifficulty[difficulty] = {
      clue: weave.clue,
      cols,
      board: weave.board,
      answers: encodeAnswers(weave),
    };
  }
  await writeFile(
    `data/${prefix}daily-weave.json`,
    JSON.stringify(
      {
        date: etDate,
        ...weaveByDifficulty.easy,
        byDifficulty: weaveByDifficulty,
        fetchedAt: stamp,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-weave.json: ` +
      DIFFICULTIES.map((d) => `${weaveByDifficulty[d].cols}w ${weaveByDifficulty[d].clue}`).join(' | ')
  );

  // squares: one 4x4 and one 5x5 a day. `cells` is the board as the player
  // first sees it, so the client renders without decoding anything; the
  // answer rides along base64'd for the reveal button, same as weave.
  // Squares varies by shape too, and by how much of it you're shown. 6x6
  // isn't an option — order-6 double word squares are scarce enough that the
  // generator found none in 3 attempts against all 22,418 six-letter words —
  // so extreme keeps the 5x5 grid and takes letters away. That also fixes the
  // spread: at 10 givens a line could hold 4 or even 5 of them, which hands
  // over a whole word.
  const squareBoards = {};
  const squaresByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    const { size: n, given } = SQUARE_SHAPE[difficulty];
    const sqRng = mulberry32(
      xmur3(`anagrimoire-squares-${etDate}${salt}${diffSalt(difficulty)}`)()
    );
    // built from the easy tier at every difficulty: these words are the answer
    // and have to be guessable, whatever the shape asks of you
    const sq = generateSquare(
      sqRng,
      n,
      [...poolsFor('easy').answers],
      [...uniquenessWords()],
      given
    );
    if (!sq) throw new Error(`Could not generate a ${difficulty} daily square`);
    const flat = sq.rows.join('').split('');
    const board = {
      size: n,
      cells: flat.map((ch, i) => (sq.given.includes(i) ? ch : null)),
      answer: Buffer.from(JSON.stringify({ rows: sq.rows })).toString('base64'),
    };
    squaresByDifficulty[difficulty] = board;
    // the legacy shape, keyed by size, for clients that predate difficulty
    squareBoards[n] = board;
  }
  await writeFile(
    `data/${prefix}daily-squares.json`,
    JSON.stringify(
      { date: etDate, boards: squareBoards, byDifficulty: squaresByDifficulty, fetchedAt: stamp },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-squares.json: ` +
      DIFFICULTIES.map((d) => {
        const b = squaresByDifficulty[d];
        return `${d} ${b.size}x${b.size} ${b.cells.filter(Boolean).length} given`;
      }).join(', ')
  );
}

// shared practice pool for weave: pre-generated boards in both sizes,
// refreshed daily, used by both sites. Both variants' daily themes are
// held out so practice never spoils a daily puzzle.
const poolRng = mulberry32(xmur3(`anagrimoire-weave-pool-${etDate}`)());
const poolThemes = THEMES.filter((t) => !dailyWeaveClues.has(t.clue));
const pool = { '6x8': [], '8x10': [] };
for (const [key, cols, rows, count] of [['6x8', 6, 8, 20], ['8x10', 8, 10, 20]]) {
  const used = new Set();
  for (let i = 0; i < count; i++) {
    // prefer themes not yet in this size's pool for variety
    const fresh = poolThemes.filter((t) => !used.has(t.clue));
    const p =
      (fresh.length && generateWeave(poolRng, cols, rows, fresh)) ||
      generateWeave(poolRng, cols, rows, poolThemes);
    if (!p) throw new Error(`Could not generate pool weave ${key} #${i}`);
    used.add(p.clue);
    pool[key].push({ clue: p.clue, cols, board: p.board, answers: encodeAnswers(p) });
  }
}
await writeFile(
  'data/weave-pool.json',
  JSON.stringify({ date: etDate, pool, fetchedAt: new Date().toISOString() }, null, 2) + '\n'
);
console.log(`Wrote data/weave-pool.json (${pool['6x8'].length} + ${pool['8x10'].length} puzzles)`);

// shared practice pool for squares, same idea: pre-generated boards in both
// sizes so the browser never has to run the search itself.
const sqPoolRng = mulberry32(xmur3(`anagrimoire-squares-pool-${etDate}`)());
const squaresPool = { 4: [], 5: [] };
for (const [n, count] of [[4, 20], [5, 12]]) {
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    // practice pools keep the old sizes and given counts for now; difficulty
    // reaches the dailies first, and these are unscored
    const sq = generateSquare(
      sqPoolRng,
      n,
      [...poolsFor('easy').answers],
      [...uniquenessWords()],
      GIVEN_TARGET[n]
    );
    if (!sq) throw new Error(`Could not generate pool square ${n}x${n} #${i}`);
    const key = sq.rows.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    const flat = sq.rows.join('').split('');
    squaresPool[n].push({
      size: n,
      cells: flat.map((ch, j) => (sq.given.includes(j) ? ch : null)),
      answer: Buffer.from(JSON.stringify({ rows: sq.rows })).toString('base64'),
    });
  }
}
await writeFile(
  'data/squares-pool.json',
  JSON.stringify({ date: etDate, pool: squaresPool, fetchedAt: new Date().toISOString() }, null, 2) + '\n'
);
console.log(`Wrote data/squares-pool.json (${squaresPool[4].length} + ${squaresPool[5].length} puzzles)`);
