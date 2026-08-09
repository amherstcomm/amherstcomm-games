// The seed salt is the anti-transparency property itself: with it set, the
// public repo stops being an oracle for future boards. Two runs for the same
// date must agree with themselves and disagree across salts — and the
// unsalted run must be bit-for-bit the historical generator, because easy
// keeping its seed is what kept live boards stable through every change.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const DATE = '2026-01-15'; // the same pinned date the feed contract uses

let unsalted: string;
let salted: string;

async function generate(dir: string, salt: string) {
  await run('node', ['scripts/fetch-puzzles.mjs'], {
    env: {
      ...process.env,
      SKIP_SOLVER_DATA: '1',
      PUZZLES_DATE: DATE,
      PUZZLES_DATA_DIR: dir,
      PUZZLES_SEED_SALT: salt,
    },
    maxBuffer: 10 * 1024 * 1024,
  });
}

beforeAll(async () => {
  unsalted = await mkdtemp(join(tmpdir(), 'anagrimoire-nosalt-'));
  salted = await mkdtemp(join(tmpdir(), 'anagrimoire-salt-'));
  await Promise.all([generate(unsalted, ''), generate(salted, 'test-salt')]);
});

afterAll(async () => {
  await rm(unsalted, { recursive: true, force: true });
  await rm(salted, { recursive: true, force: true });
});

const words = async (dir: string) => {
  const w = JSON.parse(await readFile(join(dir, 'daily-words.json'), 'utf8'));
  delete w.fetchedAt; // wall-clock stamp — the only field two runs may disagree on
  return w;
};

describe('the seed salt', () => {
  it('changes every board — a salted generator is not the public one', async () => {
    const a = (await words(unsalted)).byDifficulty;
    const b = (await words(salted)).byDifficulty;
    for (const d of ['easy', 'hard', 'extreme'] as const) {
      for (const len of Object.keys(a[d].words)) {
        expect(b[d].words[len], `${d} length ${len} unchanged by salt`).not.toBe(a[d].words[len]);
      }
    }
  });

  it('unset means the historical boards, exactly', async () => {
    // the pinned words from the unsalted generator as of the day the salt
    // shipped — if these move, someone changed the seed scheme and every
    // live board with it
    const w = await words(unsalted);
    expect(atob(w.byDifficulty.easy.words['3'])).toBe('gob');
    expect(atob(w.byDifficulty.hard.words['3'])).toBe('ivy');
  });

  it('salted output is still internally deterministic', async () => {
    const again = await mkdtemp(join(tmpdir(), 'anagrimoire-salt2-'));
    try {
      await generate(again, 'test-salt');
      expect(await words(again)).toEqual(await words(salted));
    } finally {
      await rm(again, { recursive: true, force: true });
    }
  });
});
