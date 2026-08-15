// The feed contract. The generator and the client deploy separately — the
// generator publishes to the puzzle-data branch on its own schedule — so this
// file is the interface between two halves that never see each other's code.
// It runs the real generator once, for a pinned date with the NYT fetches
// skipped, and then asserts every promise the client relies on.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// the real generator's own solver, so the check and the puzzle can't drift
// @ts-expect-error plain-JS module without a declaration file
import { countSolutions, indexWords } from '../../scripts/squares.mjs';
// the tier's own variant list, so the contract can't drift from the generator
// @ts-expect-error plain-JS module without a declaration file
import {
  generateCryptogram,
  generatePlayable,
  livePassages,
  markRepetition,
  REPETITION_FLOOR,
  TIER_BAND,
  TIER_VARIANTS,
} from '../../scripts/cryptogram.mjs';
import { livePairs, TIER_PAR } from '../../scripts/ladder.mjs';

const run = promisify(execFile);

const DATE = '2026-01-15'; // pinned: same date, same feed, every run
const DIFFICULTIES = ['easy', 'hard', 'extreme'] as const;
const VARIANTS = ['', 'dev-'] as const;
const GAMES = ['words', 'hive', 'box', 'scramble', 'grid', 'weave', 'squares', 'cryptogram', 'ladder', 'bridge'] as const;

// Feeds are checked by assertion, not by type; typing them would restate the tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Feed = Record<string, any>;

let dir: string;
const feeds = new Map<string, Feed>();

const feed = (variant: string, game: string): Feed => feeds.get(`${variant}${game}`)!;
const decode = (b64: string) => JSON.parse(Buffer.from(b64, 'base64').toString());

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'anagrimoire-feed-'));
  await run('node', ['scripts/fetch-puzzles.mjs'], {
    env: {
      ...process.env,
      SKIP_SOLVER_DATA: '1',
      PUZZLES_DATE: DATE,
      PUZZLES_DATA_DIR: dir,
    },
    maxBuffer: 10 * 1024 * 1024,
  });
  for (const variant of VARIANTS) {
    for (const game of GAMES) {
      const raw = await readFile(join(dir, `${variant}daily-${game}.json`), 'utf8');
      feeds.set(`${variant}${game}`, JSON.parse(raw));
    }
  }
  for (const pool of ['weave-pool', 'squares-pool', 'cryptogram-pool', 'ladder-pool', 'bridge-pool']) {
    feeds.set(pool, JSON.parse(await readFile(join(dir, `${pool}.json`), 'utf8')));
  }
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('every feed', () => {
  it('carries the pinned date and all three difficulties', () => {
    for (const variant of VARIANTS) {
      for (const game of GAMES) {
        const f = feed(variant, game);
        expect(f.date, `${variant}${game}`).toBe(DATE);
        expect(Object.keys(f.byDifficulty).sort(), `${variant}${game}`).toEqual(
          ['easy', 'extreme', 'hard']
        );
      }
    }
  });

  // The easy board used to be repeated at the top level — `words`, `sides`,
  // `cells`, squares' `boards` map — so a client from before difficulty kept
  // working. Nothing reads those now, and carrying them meant every feed
  // shipped its easy board twice. This asserts they are gone rather than
  // merely unused, since a stray duplicate is how the squares map once let
  // extreme overwrite hard.
  it('carries no top-level duplicate of the easy board', () => {
    for (const variant of VARIANTS) {
      for (const game of GAMES) {
        expect(Object.keys(feed(variant, game)).sort(), `${variant}${game}`).toEqual([
          'byDifficulty',
          'date',
          'fetchedAt',
        ]);
      }
    }
  });

  it('gives dev its own puzzles, so testing there never spoils production', () => {
    // read through byDifficulty: the top-level copy this used to compare is
    // gone, and two undefineds would have matched each other for ever
    expect(feed('', 'words').byDifficulty.easy.words).not.toEqual(
      feed('dev-', 'words').byDifficulty.easy.words
    );
  });
});

describe('guess', () => {
  it('covers exactly lengths 3-12 at every difficulty', () => {
    for (const variant of VARIANTS) {
      for (const d of DIFFICULTIES) {
        const words = feed(variant, 'words').byDifficulty[d].words;
        expect(Object.keys(words).map(Number).sort((a, b) => a - b), `${variant}${d}`).toEqual(
          [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        );
        for (const [len, b64] of Object.entries(words)) {
          const word = atob(b64 as string);
          expect(word, `${variant}${d} length ${len}`).toMatch(/^[a-z]+$/);
          expect(word.length).toBe(Number(len));
        }
      }
    }
  });

  it('serves a different word per difficulty — the bands are exclusive', () => {
    for (const variant of VARIANTS) {
      const by = feed(variant, 'words').byDifficulty;
      for (const len of Object.keys(by.easy.words)) {
        const three = new Set([by.easy.words[len], by.hard.words[len], by.extreme.words[len]]);
        expect(three.size, `${variant} length ${len}`).toBe(3);
      }
    }
  });
});

describe('hive', () => {
  it('clears the thirty-word floor at every difficulty', () => {
    for (const variant of VARIANTS) {
      for (const d of DIFFICULTIES) {
        const h = feed(variant, 'hive').byDifficulty[d];
        expect(h.words, `${variant}${d}`).toBeGreaterThanOrEqual(30);
        expect(h.center).toMatch(/^[a-z]$/);
        expect(h.outers).toHaveLength(6);
        expect(new Set([h.center, ...h.outers]).size).toBe(7);
      }
    }
  });
});

describe('box', () => {
  it('is twelve distinct letters, three per side', () => {
    for (const variant of VARIANTS) {
      for (const d of DIFFICULTIES) {
        const sides = feed(variant, 'box').byDifficulty[d].sides as string[];
        expect(sides).toHaveLength(4);
        for (const s of sides) expect(s).toMatch(/^[a-z]{3}$/);
        expect(new Set(sides.join('').split('')).size).toBe(12);
      }
    }
  });

  // The board prints "Solvable in N" from this. It used to print a literal 2
  // beside a feed that happened to publish 2, which is the kind of agreement
  // that holds until it doesn't — and the client still falls back to 2, so a
  // feed that quietly stopped publishing par would look entirely fine.
  it('states the par the board promises', () => {
    for (const variant of VARIANTS) {
      for (const d of DIFFICULTIES) {
        const par = feed(variant, 'box').byDifficulty[d].par;
        expect(par, `${variant}box ${d}`).toBe(2);
      }
    }
  });
});

describe('grid', () => {
  it('is 4x4 at easy and 5x5 above — the third rung is what scores, not the board', () => {
    for (const variant of VARIANTS) {
      const by = feed(variant, 'grid').byDifficulty;
      expect(by.easy.cells).toHaveLength(16);
      expect(by.hard.cells).toHaveLength(25);
      expect(by.extreme.cells).toHaveLength(25);
      for (const d of DIFFICULTIES) {
        for (const c of by[d].cells) expect(c).toMatch(/^[a-z]$/);
      }
    }
  });
});

describe('weave', () => {
  it('is 6, 7 and 8 wide, and the answers tile the whole board exactly once', () => {
    const WIDTH = { easy: 6, hard: 7, extreme: 8 };
    const HEIGHT = { easy: 8, hard: 9, extreme: 10 };
    for (const variant of VARIANTS) {
      for (const d of DIFFICULTIES) {
        const w = feed(variant, 'weave').byDifficulty[d];
        expect(w.cols, `${variant}${d}`).toBe(WIDTH[d]);
        expect(w.board, `${variant}${d}`).toHaveLength(HEIGHT[d]);
        for (const row of w.board) expect(row).toMatch(new RegExp(`^[a-z]{${WIDTH[d]}}$`));
        const answers = decode(w.answers);
        const cells = [
          ...answers.spangram.path,
          ...answers.words.flatMap((x: { path: number[] }) => x.path),
        ];
        expect(cells.length, `${variant}${d} tiles the board`).toBe(WIDTH[d] * HEIGHT[d]);
        expect(new Set(cells).size, `${variant}${d} no cell reused`).toBe(cells.length);
      }
    }
  });
});

describe('squares', () => {
  it('shapes and given counts match the design: 4x4/8, 5x5/10, 5x5/up to 6', () => {
    const SIZE = { easy: 4, hard: 5, extreme: 5 };
    const GIVEN_MAX = { easy: 8, hard: 10, extreme: 7 };
    for (const variant of VARIANTS) {
      for (const d of DIFFICULTIES) {
        const s = feed(variant, 'squares').byDifficulty[d];
        expect(s.size, `${variant}${d}`).toBe(SIZE[d]);
        expect(s.cells).toHaveLength(SIZE[d] * SIZE[d]);
        const given = s.cells.filter((c: string | null) => c !== null);
        expect(given.length, `${variant}${d} given`).toBeGreaterThan(0);
        expect(given.length, `${variant}${d} given`).toBeLessThanOrEqual(GIVEN_MAX[d]);
        // the given letters must agree with the solution they hint at
        const rows = decode(s.answer).rows as string[];
        expect(rows).toHaveLength(SIZE[d]);
        s.cells.forEach((c: string | null, i: number) => {
          if (c !== null) {
            expect(c, `${variant}${d} cell ${i}`).toBe(rows[Math.floor(i / SIZE[d])][i % SIZE[d]]);
          }
        });
      }
    }
  });

  // Uniqueness, re-checked at the seam rather than trusted to the generator.
  // This is a verified-results requirement, not puzzle aesthetics: a Squares
  // win must reconstruct THE answer grid to pass result_is_plausible, so a
  // board with a second legal fill flags an honest solver as a fabricator.
  // Checked against the same standard tier the game accepts typing against —
  // unfiltered, as the generator's own check is, because a square with a rude
  // second solution is still a square with two solutions.
  it('every published board has exactly one legal fill, and it is the published answer', () => {
    const require = createRequire(import.meta.url);
    const standard = new Set<string>();
    for (const f of [
      'english-words-10', 'english-words-20', 'english-words-35',
      'english-words-40', 'english-words-50', 'english-words-55',
      'american-words-10', 'american-words-20', 'american-words-35',
      'american-words-40', 'american-words-50', 'american-words-55',
    ]) {
      for (const raw of require(`wordlist-english/${f}.json`)) {
        const w = String(raw).toLowerCase();
        if (/^[a-z]+$/.test(w)) standard.add(w);
      }
    }
    const words = [...standard];
    const index = { 4: indexWords(words, 4), 5: indexWords(words, 5) };

    const check = (board: Feed, where: string) => {
      const size = board.size as 4 | 5;
      const rows = decode(board.answer).rows as string[];
      // the answer must itself be legal in the accepted list — otherwise the
      // "one" solution the search finds would be some other grid entirely
      for (const r of rows) expect(standard.has(r), `${where}: row "${r}"`).toBe(true);
      for (let c = 0; c < size; c++) {
        const col = rows.map((r) => r[c]).join('');
        expect(standard.has(col), `${where}: column "${col}"`).toBe(true);
      }
      expect(countSolutions(index[size], board.cells, size), `${where}: fills`).toBe(1);
    };

    for (const variant of VARIANTS) {
      for (const d of DIFFICULTIES) {
        check(feed(variant, 'squares').byDifficulty[d], `${variant}squares ${d}`);
      }
    }
    const pool = feeds.get('squares-pool')!;
    for (const d of DIFFICULTIES) {
      (pool.byDifficulty[d] as Feed[]).forEach((b, i) => check(b, `squares pool ${d} #${i}`));
    }
  });
});

describe('cryptogram', () => {
  type Difficulty = (typeof DIFFICULTIES)[number];

  // Every board that ships — both sites' dailies and the practice pool. The
  // cipher is the whole puzzle, so nothing below is checked on the dailies
  // only; a pool board is as published as a daily one.
  const boards = (): { b: Feed; d: Difficulty; where: string }[] => [
    ...VARIANTS.flatMap((v) =>
      DIFFICULTIES.map((d) => ({
        b: feed(v, 'cryptogram').byDifficulty[d] as Feed,
        d,
        where: `${v}cryptogram ${d}`,
      }))
    ),
    ...DIFFICULTIES.flatMap((d) =>
      (feeds.get('cryptogram-pool')!.byDifficulty[d] as Feed[]).map((b, i) => ({
        b,
        d,
        where: `cryptogram pool ${d} #${i}`,
      }))
    ),
  ];

  // Re-derive the substitution from the board alone, the only check that means
  // anything: walk the cipher tokens against the answer's letters and see what
  // each token must stand for. `alphabet` is what separates a cipher token from
  // the passage's own punctuation — with symbols nothing else could, since "★"
  // and "," are both one non-alphanumeric character.
  const solve = (b: Feed) => {
    const alphabet = new Set(b.alphabet as string[]);
    const cipher = (b.tokens as string[]).filter((t) => alphabet.has(t));
    const letters = (decode(b.answer).text as string).toLowerCase().replace(/[^a-z]/g, '');
    const means = new Map<string, string>();
    cipher.forEach((t, i) => {
      if (!means.has(t)) means.set(t, letters[i]);
    });
    return { alphabet, cipher, letters, means };
  };

  it('enciphers the whole passage, one meaning per token, and decodes back to it', () => {
    for (const { b, where } of boards()) {
      const { cipher, letters, means } = solve(b);
      expect(cipher.length, `${where}: a token for every letter`).toBe(letters.length);
      cipher.forEach((t, i) => {
        expect(means.get(t), `${where}: token "${t}" at ${i} means two letters`).toBe(letters[i]);
      });
      expect(cipher.map((t) => means.get(t)).join(''), `${where}: decodes`).toBe(letters);
    }
  });

  it('reveals only what the cipher actually says', () => {
    for (const { b, where } of boards()) {
      const { alphabet, means } = solve(b);
      for (const [token, plain] of Object.entries(b.reveals)) {
        expect(alphabet.has(token), `${where}: reveal "${token}" is a cipher token`).toBe(true);
        expect(means.get(token), `${where}: reveal "${token}"`).toBe(plain);
      }
    }
  });

  it('spends one token per letter unless it announces itself homophonic', () => {
    for (const { b, where } of boards()) {
      if (b.homophonic) continue;
      const meanings = [...solve(b).means.values()];
      expect(new Set(meanings).size, `${where}: two tokens mean one letter`).toBe(meanings.length);
    }
  });

  // A fixed point is only meaningful when the board shows letters: against
  // numbers, coordinates or symbols there is no "itself" to stand for.
  it('never stands a letter for itself, on the boards where that means anything', () => {
    for (const { b, where } of boards()) {
      const { alphabet, means } = solve(b);
      if (![...alphabet].every((t) => /^[A-Z]$/.test(t))) continue;
      for (const [token, plain] of means) {
        expect(token.toLowerCase(), `${where}: "${token}" stands for itself`).not.toBe(plain);
      }
    }
  });

  it('strips the word divisions when grouped, and keeps them exactly when not', () => {
    for (const { b, where } of boards()) {
      const { alphabet } = solve(b);
      const text = decode(b.answer).text as string;
      if (b.grouped) {
        // boundaries are most of a solver's traction, so a grouped board must
        // hand over nothing but cipher
        for (const t of b.tokens as string[]) {
          expect(alphabet.has(t), `${where}: "${t}" is not cipher`).toBe(true);
        }
      } else {
        expect(b.tokens, `${where}: one token per character`).toHaveLength(text.length);
        [...text].forEach((ch, i) => {
          if (!/[A-Za-z]/.test(ch)) expect(b.tokens[i], `${where}: char ${i}`).toBe(ch);
        });
      }
    }
  });

  it('draws its cipher from its own tier, and announces which', () => {
    for (const { b, d, where } of boards()) {
      expect(TIER_VARIANTS[d], `${where}: type "${b.type}"`).toContain(b.type);
      expect(b.label, `${where}: label`).toEqual(expect.any(String));
    }
  });

  it('gives each difficulty a different passage, and dev its own', () => {
    for (const variant of VARIANTS) {
      const texts = DIFFICULTIES.map(
        (d) => decode(feed(variant, 'cryptogram').byDifficulty[d].answer).text
      );
      expect(new Set(texts).size, `${variant}cryptogram`).toBe(3);
    }
    expect(decode(feed('', 'cryptogram').byDifficulty.easy.answer).text).not.toEqual(
      decode(feed('dev-', 'cryptogram').byDifficulty.easy.answer).text
    );
  });

  it('never ships the passage in the clear — the encoded answer is the only copy', () => {
    for (const variant of VARIANTS) {
      const raw = JSON.stringify(feed(variant, 'cryptogram'));
      for (const d of DIFFICULTIES) {
        const { text, author } = decode(feed(variant, 'cryptogram').byDifficulty[d].answer);
        // strip the base64 answers first, or they'd match themselves
        const visible = raw.replace(/"answer":"[^"]*"/g, '');
        expect(visible.includes(text), `${variant}cryptogram ${d}: plaintext`).toBe(false);
        expect(visible.includes(author), `${variant}cryptogram ${d}: author`).toBe(false);
      }
    }
  });

  it('holds back every passage the review flagged', async () => {
    const pool = JSON.parse(await readFile('scripts/cryptogram-passages.json', 'utf8'));
    const held = new Set(
      pool.quotes.filter((q: Feed) => q.review).map((q: Feed) => q.text as string)
    );
    expect(held.size, 'the review flags survived the harvest').toBeGreaterThan(0);
    const published = [
      ...VARIANTS.flatMap((v) =>
        DIFFICULTIES.map((d) => decode(feed(v, 'cryptogram').byDifficulty[d].answer).text)
      ),
      ...DIFFICULTIES.flatMap((d) =>
        (feeds.get('cryptogram-pool')!.byDifficulty[d] as Feed[]).map(
          (b) => decode(b.answer).text as string
        )
      ),
    ];
    for (const text of published) expect(held.has(text), `held-out passage published`).toBe(false);
  });

  it('keeps the practice pool clear of both sites’ dailies', () => {
    const dailies = new Set(
      VARIANTS.flatMap((v) =>
        DIFFICULTIES.map((d) => decode(feed(v, 'cryptogram').byDifficulty[d].answer).text as string)
      )
    );
    for (const d of DIFFICULTIES) {
      const boards = feeds.get('cryptogram-pool')!.byDifficulty[d] as Feed[];
      expect(boards.length, `cryptogram pool ${d}`).toBeGreaterThanOrEqual(10);
      const texts = boards.map((b) => decode(b.answer).text as string);
      expect(new Set(texts).size, `cryptogram pool ${d} repeats itself`).toBe(texts.length);
      for (const t of texts) expect(dailies.has(t), `pool ${d} spoils a daily`).toBe(false);
    }
  });

  // Length is a difficulty dial: forty letters is a poorer likeness of English
  // than eighty, so there is less for frequency and shape to bite on. Extreme
  // plays the short band and the other two do not, and a board that drifted
  // across would be quietly easier or harder than its tier claims.
  const LETTERS = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '').length;
  const BOUNDS = { standard: [50, 100], short: [35, 49] } as const;

  // Stated outright, because every assertion below reads its expectation out
  // of TIER_BAND — which makes them agree with whatever it says. They pin that
  // the generator obeys the table; this pins what the table is meant to say.
  it('gives the short band to extreme and nobody else', () => {
    expect(TIER_BAND).toEqual({ easy: 'standard', hard: 'standard', extreme: 'short' });
  });

  it('plays each difficulty from its own length band', () => {
    for (const v of VARIANTS) {
      for (const d of DIFFICULTIES) {
        const [lo, hi] = BOUNDS[TIER_BAND[d] as keyof typeof BOUNDS];
        const n = LETTERS(decode(feed(v, 'cryptogram').byDifficulty[d].answer).text as string);
        expect(n, `${v}cryptogram ${d} is ${TIER_BAND[d]}`).toBeGreaterThanOrEqual(lo);
        expect(n, `${v}cryptogram ${d} is ${TIER_BAND[d]}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('practises on the band it plays', () => {
    for (const d of DIFFICULTIES) {
      const [lo, hi] = BOUNDS[TIER_BAND[d] as keyof typeof BOUNDS];
      for (const b of feeds.get('cryptogram-pool')!.byDifficulty[d] as Feed[]) {
        const n = LETTERS(decode(b.answer).text as string);
        expect(n, `cryptogram pool ${d}`).toBeGreaterThanOrEqual(lo);
        expect(n, `cryptogram pool ${d}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  // The bands are separate pools rather than one pool with a filter, and that
  // is load-bearing: the standard pool has to keep dealing easy and hard the
  // passages it dealt yesterday, which it only does while its own contents and
  // order are untouched by whatever the short harvest added.
  it('keeps the two bands disjoint, and every passage inside its own band', async () => {
    const parsed = JSON.parse(await readFile('scripts/cryptogram-passages.json', 'utf8'));
    const standard = livePassages(parsed, 'standard');
    const short = livePassages(parsed, 'short');
    expect(short.length, 'the short band is stocked').toBeGreaterThan(100);
    for (const [band, pool] of [
      ['standard', standard],
      ['short', short],
    ] as const) {
      const [lo, hi] = BOUNDS[band];
      for (const q of pool) {
        const n = LETTERS(q.text as string);
        expect(n, `${band}: ${q.text}`).toBeGreaterThanOrEqual(lo);
        expect(n, `${band}: ${q.text}`).toBeLessThanOrEqual(hi);
      }
    }
    const texts = new Set(standard.map((q: Feed) => q.text as string));
    for (const q of short) expect(texts.has(q.text as string), 'a passage in both bands').toBe(false);
  });

  // A board is solved off repetition: marks that recur are what frequency and
  // word shape have to work with. Homophonic is the one cipher that can lose
  // it, spending several marks on the same letter — over a year of dates it
  // put 42 boards under this floor, the worst at 23%, all of them extreme.
  // Every other cipher clears it always, so the floor only bites the one that
  // can fail.
  it('never serves a board with too little repetition to grip', () => {
    const boards = [
      ...VARIANTS.flatMap((v) =>
        DIFFICULTIES.map((d) => ({ b: feed(v, 'cryptogram').byDifficulty[d] as Feed, where: `${v}${d}` }))
      ),
      ...DIFFICULTIES.flatMap((d) =>
        (feeds.get('cryptogram-pool')!.byDifficulty[d] as Feed[]).map((b, i) => ({
          b,
          where: `pool ${d} #${i}`,
        }))
      ),
    ];
    for (const { b, where } of boards) {
      expect(markRepetition(b), `${where} (${b.label})`).toBeGreaterThanOrEqual(REPETITION_FLOOR);
    }
  });

  // The test above reads one day's feed, and only about one extreme board in
  // nine is thin enough to matter — so on most dates it would pass with the
  // guard removed entirely. This one goes at generatePlayable directly, over
  // the pool that can actually produce a bad board: 36% of these pairings are
  // degenerate on the first draw, so a broken guard has nowhere to hide.
  it('either hands back a board with grip or hands back nothing', async () => {
    const pool = livePassages(
      JSON.parse(await readFile('scripts/cryptogram-passages.json', 'utf8')),
      'short'
    ) as { text: string; author: string }[];
    const mulberry32 = (a: number) => () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let degenerate = 0;
    let rescued = 0;
    for (let i = 0; i < pool.length; i += 3) {
      for (let seed = 1; seed <= 3; seed++) {
        const raw = generateCryptogram(pool[i], mulberry32(seed), 'homophonic');
        if (markRepetition(raw) >= REPETITION_FLOOR) continue;
        degenerate++;
        const board = generatePlayable(pool[i], mulberry32(seed), 'homophonic');
        // null is a fair answer — the caller changes cipher or passage. What
        // it must never do is return the thin board anyway.
        if (board === null) continue;
        expect(markRepetition(board), pool[i].text).toBeGreaterThanOrEqual(REPETITION_FLOOR);
        rescued++;
      }
    }
    expect(degenerate, 'the sweep found boards worth guarding against').toBeGreaterThan(50);
    expect(rescued / degenerate, 're-dealing rescues nearly all of them').toBeGreaterThan(0.9);
  });

  // The pool walks the tier's variants in turn rather than drawing at random,
  // so ten boards always cover every cipher the tier can serve — practice is
  // where a player meets the variant before a daily hands it to them.
  it('serves every one of a tier’s ciphers somewhere in that tier’s practice pool', () => {
    for (const d of DIFFICULTIES) {
      const boards = feeds.get('cryptogram-pool')!.byDifficulty[d] as Feed[];
      const types = new Set(boards.map((b) => b.type as string));
      expect([...types].sort(), `cryptogram pool ${d}`).toEqual([...TIER_VARIANTS[d]].sort());
    }
  });
});

describe('nothing blocked is published as an answer', () => {
  it('across guess words, weave answers and squares solutions, plain or encoded', async () => {
    const blocked = new Set<string>(
      JSON.parse(await readFile('scripts/blocked-words.json', 'utf8')).words.map(
        (w: { word: string }) => w.word
      )
    );
    const check = (word: string, where: string) => {
      expect(blocked.has(word), `${where}: "${word}" is on the blocklist`).toBe(false);
    };
    for (const variant of VARIANTS) {
      for (const d of DIFFICULTIES) {
        for (const b64 of Object.values(feed(variant, 'words').byDifficulty[d].words)) {
          check(atob(b64 as string), `${variant}guess ${d}`);
        }
        const weave = decode(feed(variant, 'weave').byDifficulty[d].answers);
        check(weave.spangram.w, `${variant}weave ${d}`);
        for (const w of weave.words) check(w.w, `${variant}weave ${d}`);
        const rows = decode(feed(variant, 'squares').byDifficulty[d].answer).rows as string[];
        const size = rows.length;
        for (const r of rows) check(r, `${variant}squares ${d}`);
        for (let c = 0; c < size; c++) {
          check(rows.map((r) => r[c]).join(''), `${variant}squares ${d} col`);
        }
      }
    }
  });
});

describe('the practice pools', () => {
  it('carry all three difficulties with full boards', () => {
    const weavePool = feeds.get('weave-pool')!;
    const squaresPool = feeds.get('squares-pool')!;
    for (const d of DIFFICULTIES) {
      expect(weavePool.byDifficulty[d].length, `weave pool ${d}`).toBeGreaterThanOrEqual(10);
      expect(squaresPool.byDifficulty[d].length, `squares pool ${d}`).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('ladder', () => {
  // The rungs a player may step through: the common tier with the blocklist
  // taken out of the graph, which is what the harvest measured par over. Par
  // has to mean the same thing here or the board states a number nobody can
  // hit.
  const rungs = new Set<string>();
  beforeAll(async () => {
    const blocked = new Set(
      (JSON.parse(await readFile('scripts/blocked-words.json', 'utf8')) as Feed).words.map(
        (w: Feed) => w.word as string
      )
    );
    for (const band of ['band-10', 'band-20', 'band-35']) {
      const words = (JSON.parse(await readFile(`src/wordbands/${band}.json`, 'utf8')) as Feed)
        .words as string[];
      for (const w of words) if (/^[a-z]+$/.test(w) && !blocked.has(w)) rungs.add(w);
    }
  });

  /** the shortest route, and the route itself so it can be shown to be real */
  const route = (from: string, to: string): string[] | null => {
    const prev = new Map<string, string | null>([[from, null]]);
    const queue = [from];
    for (let i = 0; i < queue.length; i++) {
      const w = queue[i];
      if (w === to) {
        const path: string[] = [];
        for (let at: string | null = to; at; at = prev.get(at)!) path.push(at);
        return path.reverse();
      }
      for (let p = 0; p < w.length; p++) {
        for (let c = 97; c < 123; c++) {
          const next = w.slice(0, p) + String.fromCharCode(c) + w.slice(p + 1);
          if (next !== w && rungs.has(next) && !prev.has(next)) {
            prev.set(next, w);
            queue.push(next);
          }
        }
      }
    }
    return null;
  };

  const boards = () => [
    ...VARIANTS.flatMap((v) =>
      DIFFICULTIES.map((d) => ({ b: feed(v, 'ladder').byDifficulty[d] as Feed, where: `${v}${d}` }))
    ),
    ...DIFFICULTIES.flatMap((d) =>
      (feeds.get('ladder-pool')!.byDifficulty[d] as Feed[]).map((b, i) => ({
        b,
        where: `pool ${d} #${i}`,
      }))
    ),
  ];

  it('gives both ends, the same length, and a par', () => {
    for (const { b, where } of boards()) {
      expect(typeof b.from, where).toBe('string');
      expect(typeof b.to, where).toBe('string');
      expect(b.from, where).not.toBe(b.to);
      expect(b.from.length, where).toBe(b.to.length);
      expect(Number.isInteger(b.par), where).toBe(true);
    }
  });

  // The one that matters. The board prints "in 5 steps" and a player who
  // cannot do it in five has been lied to, so par is not taken on trust from
  // the pool file — it is re-derived here, and the route is reconstructed to
  // prove the number is reachable rather than merely recorded.
  it('states a par a player can actually reach', () => {
    for (const { b, where } of boards()) {
      const found = route(b.from, b.to);
      expect(found, `${where}: ${b.from} -> ${b.to} has no ladder at all`).not.toBeNull();
      expect(found!.length - 1, `${where}: ${found!.join(' -> ')}`).toBe(b.par);
      for (const rung of found!) expect(rungs.has(rung), `${where}: ${rung}`).toBe(true);
      found!.forEach((w, i) => {
        if (i === 0) return;
        const differ = [...w].filter((c, k) => c !== found![i - 1][k]).length;
        expect(differ, `${where}: ${found![i - 1]} -> ${w}`).toBe(1);
      });
    }
  });

  it('deals each difficulty out of its own par band', () => {
    for (const v of VARIANTS) {
      for (const d of DIFFICULTIES) {
        const [lo, hi] = TIER_PAR[d];
        const par = feed(v, 'ladder').byDifficulty[d].par as number;
        expect(par, `${v}${d}`).toBeGreaterThanOrEqual(lo);
        expect(par, `${v}${d}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  // Every other game encodes an answer into the feed and this one has none to
  // encode: a ladder is checked by rule, so publishing a route would be
  // publishing one arbitrary solution out of many and spoiling all of them.
  it('publishes no route', () => {
    for (const v of VARIANTS) {
      const raw = JSON.stringify(feed(v, 'ladder'));
      expect(raw).not.toMatch(/answer|route|path|steps"\s*:\s*\[/);
      for (const d of DIFFICULTIES) {
        expect(Object.keys(feed(v, 'ladder').byDifficulty[d]).sort()).toEqual(['from', 'par', 'to']);
      }
    }
  });

  it('keeps practice clear of both sites’ dailies', () => {
    const dailies = new Set(
      VARIANTS.flatMap((v) =>
        DIFFICULTIES.map((d) => {
          const b = feed(v, 'ladder').byDifficulty[d];
          return `${b.from} ${b.to}`;
        })
      )
    );
    for (const d of DIFFICULTIES) {
      const pool = feeds.get('ladder-pool')!.byDifficulty[d] as Feed[];
      expect(pool.length, `ladder pool ${d}`).toBeGreaterThanOrEqual(10);
      const seen = pool.map((b) => `${b.from} ${b.to}`);
      expect(new Set(seen).size, `ladder pool ${d} repeats itself`).toBe(seen.length);
      for (const s of seen) expect(dailies.has(s), `pool ${d} spoils a daily`).toBe(false);
    }
  });

  it('holds back every pair the review flagged', async () => {
    const parsed = JSON.parse(await readFile('scripts/ladder-pairs.json', 'utf8'));
    const held = new Set(
      (parsed.pairs as Feed[]).filter((p) => p.review).map((p) => `${p.a} ${p.b}`)
    );
    expect(held.size, 'the review flags survived the harvest').toBeGreaterThan(0);
    expect(livePairs(parsed).length).toBe(parsed.pairs.length - held.size);
    for (const { b, where } of boards())
      expect(held.has(`${b.from} ${b.to}`), `${where} published a held pair`).toBe(false);
  });
});

describe('bridge', () => {
  // The words a bridge may be built from: the common tier with the blocklist
  // out, which is the dictionary the client will check against. A prompt whose
  // answer is not reachable in that list is unsolvable however good it looks.
  const words = new Set<string>();
  beforeAll(async () => {
    const blocked = new Set(
      (JSON.parse(await readFile('scripts/blocked-words.json', 'utf8')) as Feed).words.map(
        (w: Feed) => w.word as string
      )
    );
    // Through band-55, because the harvest builds compounds up to level 50 and
    // that is the band file they land in. No catch on the read: a band that
    // stopped existing would quietly shrink the dictionary and turn this test
    // into one that cannot fail.
    for (const band of ['band-10', 'band-20', 'band-35', 'band-55']) {
      const raw = await readFile(`src/wordbands/${band}.json`, 'utf8');
      for (const w of (JSON.parse(raw) as Feed).words as string[]) {
        if (/^[a-z]+$/.test(w) && !blocked.has(w)) words.add(w);
      }
    }
  });

  const boards = () => [
    ...VARIANTS.flatMap((v) =>
      DIFFICULTIES.map((d) => ({ b: feed(v, 'bridge').byDifficulty[d] as Feed, where: `${v}${d}` }))
    ),
    ...DIFFICULTIES.flatMap((d) =>
      (feeds.get('bridge-pool')!.byDifficulty[d] as Feed[]).map((b, i) => ({
        b,
        where: `pool ${d} #${i}`,
      }))
    ),
  ];

  it('deals five prompts with five different answers', () => {
    for (const { b, where } of boards()) {
      expect(b.prompts.length, where).toBe(5);
      const answers = decode(b.answers) as string[];
      expect(answers.length, where).toBe(5);
      // The rule the generator exists to enforce. The pool holds far more
      // prompts than answers, so a walk that did not check would happily deal
      // OUT three times in one board — which is one prompt asked three ways.
      expect(new Set(answers).size, `${where}: ${answers.join(', ')}`).toBe(5);
    }
  });

  it('gives every prompt an answer that actually bridges', () => {
    for (const { b, where } of boards()) {
      const answers = decode(b.answers) as string[];
      b.prompts.forEach((p: Feed, i: number) => {
        const m = answers[i];
        const label = `${where}: ${p.x} · ${m} · ${p.y}`;
        expect(words.has(p.x + m), `${label} — ${p.x + m} is not a word`).toBe(true);
        expect(words.has(m + p.y), `${label} — ${m + p.y} is not a word`).toBe(true);
      });
    }
  });

  // Difficulty here is support rather than vocabulary, so this is the whole of
  // it: the same pool at every level, and a different number of hints.
  it('sets the hint budget by difficulty and nothing else', () => {
    const HINTS = { easy: 3, hard: 1, extreme: 0 };
    for (const v of VARIANTS) {
      for (const d of DIFFICULTIES) {
        expect(feed(v, 'bridge').byDifficulty[d].hints, `${v}${d}`).toBe(HINTS[d]);
        expect(Object.keys(feed(v, 'bridge').byDifficulty[d]).sort()).toEqual([
          'answers',
          'hints',
          'prompts',
        ]);
      }
    }
  });

  // Both ends, the answer and both compounds. The harvest asserts this over
  // the pool; this asserts it over what actually ships, which is the only
  // place it can be checked after a generator change.
  it('publishes no blocked word, in a prompt or in a compound', async () => {
    const blocked = new Set(
      (JSON.parse(await readFile('scripts/blocked-words.json', 'utf8')) as Feed).words.map(
        (w: Feed) => w.word as string
      )
    );
    for (const { b, where } of boards()) {
      const answers = decode(b.answers) as string[];
      b.prompts.forEach((p: Feed, i: number) => {
        const m = answers[i];
        for (const w of [p.x, m, p.y, p.x + m, m + p.y]) {
          expect(blocked.has(w), `${where}: ${w}`).toBe(false);
        }
      });
    }
  });

  // A prompt carries its two ends and nothing else, and the answers travel
  // encoded — the same courtesy weave's answers get, so a glance at the feed
  // does not spoil the day. Not secrecy: base64 is a wrapper, and the real
  // guarantee is that a bridge is checked by rule, so the answers being
  // readable costs nothing but the surprise.
  //
  // Deliberately *not* asserting that an answer string appears nowhere in the
  // prompts. The first version of this did, and it was wrong: an answer is
  // frequently an end word of another prompt on the same board — WORK is the
  // answer to PIECE · ? · SHEET and the left end of WORK · ? · LAW — so that
  // test failed on a board with nothing wrong with it.
  it('shows the player the ends and nothing else', () => {
    for (const v of VARIANTS) {
      for (const d of DIFFICULTIES) {
        const b = feed(v, 'bridge').byDifficulty[d];
        for (const p of b.prompts) expect(Object.keys(p).sort()).toEqual(['x', 'y']);
        expect(typeof b.answers, `${v}${d}`).toBe('string');
        expect(Array.isArray(decode(b.answers)), `${v}${d}`).toBe(true);
      }
    }
  });

  it('keeps practice clear of both sites’ dailies', () => {
    const dailies = new Set(
      VARIANTS.flatMap((v) =>
        DIFFICULTIES.flatMap((d) =>
          (feed(v, 'bridge').byDifficulty[d].prompts as Feed[]).map((p) => `${p.x} ${p.y}`)
        )
      )
    );
    for (const d of DIFFICULTIES) {
      const pool = feeds.get('bridge-pool')!.byDifficulty[d] as Feed[];
      expect(pool.length, `bridge pool ${d}`).toBeGreaterThanOrEqual(10);
      for (const b of pool) {
        for (const p of b.prompts as Feed[]) {
          expect(dailies.has(`${p.x} ${p.y}`), `pool ${d} reuses today's ${p.x}/${p.y}`).toBe(false);
        }
      }
    }
  });
});
