// A themed month, proved against the real generator.
//
// The unit tests own the arithmetic — which words survive the intersection,
// what a Weave theme needs. This runs the actual generator twice for one pinned
// date, themed and not, and asserts the difference. That is the only way to
// know the theme reaches the puzzles rather than merely being fetched: the two
// games it touches are wired at different points in a nine-hundred-line script,
// and a wiring that reads correctly can still be wired to nothing.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const DATE = '2026-10-08';

/** A theme shaped like one somebody would write for an event month. The words
 *  are deliberately ordinary — the intersection only keeps words the daily
 *  pools already allow, so a list of invented ones would theme nothing and the
 *  test would pass for the wrong reason. */
const THEME = {
  name: 'Employee ownership',
  clue: 'What we all are',
  spangram: 'employeeowned',
  words: [
    'shares', 'dividend', 'owner', 'equity', 'buyout', 'vesting', 'stake', 'payout',
    'profit', 'capital', 'shared', 'invest', 'earned', 'worker', 'stock', 'value',
    'trustee', 'voting', 'growth', 'reward',
  ],
};

let plain: string;
let themed: string;

async function generate(dir: string, theme?: object) {
  await run('node', ['scripts/fetch-puzzles.mjs'], {
    env: {
      ...process.env,
      SKIP_SOLVER_DATA: '1',
      PUZZLES_DATE: DATE,
      PUZZLES_DATA_DIR: dir,
      PUZZLES_SEED_SALT: 'themed-test-salt',
      ...(theme ? { PUZZLES_THEME: JSON.stringify(theme) } : {}),
    },
    maxBuffer: 10 * 1024 * 1024,
  });
}

const read = async (dir: string, file: string) =>
  JSON.parse(await readFile(join(dir, file), 'utf8'));

const words = (payload: { byDifficulty: Record<string, { words: Record<string, string> }> }, tier: string) =>
  Object.fromEntries(
    Object.entries(payload.byDifficulty[tier].words).map(([len, b64]) => [
      len,
      Buffer.from(b64, 'base64').toString(),
    ])
  );

beforeAll(async () => {
  plain = await mkdtemp(join(tmpdir(), 'anagrimoire-plain-'));
  themed = await mkdtemp(join(tmpdir(), 'anagrimoire-themed-'));
  await Promise.all([generate(plain), generate(themed, THEME)]);
});

afterAll(async () => {
  await rm(plain, { recursive: true, force: true });
  await rm(themed, { recursive: true, force: true });
});

describe('the daily word', () => {
  it('comes from the theme where the theme has a word of that length', async () => {
    const got = words(await read(themed, 'daily-words.json'), 'easy');
    const fromTheme = Object.values(got).filter((w) => THEME.words.includes(w));
    expect(fromTheme.length, `themed nothing: ${JSON.stringify(got)}`).toBeGreaterThan(0);
  });

  // Per length rather than per day. A list with no three-letter words should
  // still theme the boards it can, and leave the rest exactly as they were.
  it('and falls back to the ordinary word where it does not', async () => {
    const before = words(await read(plain, 'daily-words.json'), 'easy');
    const after = words(await read(themed, 'daily-words.json'), 'easy');
    const untouched = Object.keys(before).filter((len) => before[len] === after[len]);
    expect(untouched.length, 'every length changed, so nothing fell back').toBeGreaterThan(0);
    for (const len of untouched) {
      expect(THEME.words).not.toContain(after[len]);
    }
  });

  // The safety of the whole thing. A daily answer has to be typeable, and the
  // board validates against the dictionary that shipped with the client — so a
  // themed answer is only ever a word the ordinary pool already allowed.
  it('and every themed answer is the right length for its board', async () => {
    const got = words(await read(themed, 'daily-words.json'), 'easy');
    for (const [len, word] of Object.entries(got)) {
      expect(word.length, `${word} is not ${len} letters`).toBe(Number(len));
    }
  });

  it('leaves the untouched day alone entirely', async () => {
    const before = words(await read(plain, 'daily-words.json'), 'easy');
    expect(Object.values(before).some((w) => THEME.words.includes(w))).toBe(false);
  });
});

describe('the Weave board', () => {
  it('is built from the theme, clue and all', async () => {
    const board = await read(themed, 'daily-weave.json');
    for (const tier of ['easy', 'hard', 'extreme']) {
      expect(board.byDifficulty[tier].clue).toBe(THEME.clue);
    }
  });

  it('and its answers are the theme s own words', async () => {
    const board = await read(themed, 'daily-weave.json');
    // Each answer is a word *and its path* through the board, so the word is
    // `w` rather than the entry itself.
    const solved: { spangram: { w: string }; words: { w: string }[] } = JSON.parse(
      Buffer.from(board.byDifficulty.easy.answers, 'base64').toString()
    );
    expect(solved.spangram.w).toBe(THEME.spangram);
    for (const { w } of solved.words) {
      expect(THEME.words).toContain(w.toLowerCase());
    }
  });

  it('while the unthemed day gets a curated one', async () => {
    const board = await read(plain, 'daily-weave.json');
    expect(board.byDifficulty.easy.clue).not.toBe(THEME.clue);
  });
});
