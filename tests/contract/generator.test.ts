// The feed contract. The generator and the client deploy separately — the
// generator publishes to the puzzle-data branch on its own schedule — so this
// file is the interface between two halves that never see each other's code.
// It runs the real generator once, for a pinned date with the NYT fetches
// skipped, and then asserts every promise the client relies on.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const DATE = '2026-01-15'; // pinned: same date, same feed, every run
const DIFFICULTIES = ['easy', 'hard', 'extreme'] as const;
const VARIANTS = ['', 'dev-'] as const;
const GAMES = ['words', 'hive', 'box', 'scramble', 'grid', 'weave', 'squares'] as const;

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
  for (const pool of ['weave-pool', 'squares-pool']) {
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

  it('keeps the legacy top-level keys equal to the easy board, so an old client is unaffected', () => {
    for (const variant of VARIANTS) {
      const w = feed(variant, 'words');
      expect(w.words).toEqual(w.byDifficulty.easy.words);
      const h = feed(variant, 'hive');
      expect({ center: h.center, outers: h.outers }).toEqual({
        center: h.byDifficulty.easy.center,
        outers: h.byDifficulty.easy.outers,
      });
      const b = feed(variant, 'box');
      expect(b.sides).toEqual(b.byDifficulty.easy.sides);
      expect(feed(variant, 'scramble').letters).toEqual(
        feed(variant, 'scramble').byDifficulty.easy.letters
      );
      expect(feed(variant, 'grid').cells).toEqual(feed(variant, 'grid').byDifficulty.easy.cells);
      const v = feed(variant, 'weave');
      expect(v.board).toEqual(v.byDifficulty.easy.board);
    }
  });

  it('keys the legacy squares map by size with hard at 5 — extreme overwrote it once', () => {
    for (const variant of VARIANTS) {
      const s = feed(variant, 'squares');
      expect(s.boards['4']).toEqual(s.byDifficulty.easy);
      expect(s.boards['5']).toEqual(s.byDifficulty.hard);
    }
  });

  it('gives dev its own puzzles, so testing there never spoils production', () => {
    expect(feed('', 'words').words).not.toEqual(feed('dev-', 'words').words);
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
