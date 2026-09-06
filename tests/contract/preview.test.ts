// The preview, against the real generator.
//
// This is the tool that answers "show me the first week of October" before
// October, so what it prints has to be what the generator did — not a summary
// of what it was asked for. It runs the generator per date and reads the files
// back, and this runs the preview and reads *it* back.
//
// One day, because the cost is a generator run per day and the thing being
// checked is that the preview reports a day rather than that it can count.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const THEME = {
  name: 'Employee ownership',
  words: [
    'esop', 'shares', 'shared', 'sharing', 'payouts', 'dividends', 'stocks', 'stock',
    'service', 'owned', 'owner', 'ownership', 'policy', 'charter', 'reward', 'rewards',
    'earned', 'worker', 'network', 'employer', 'conduit', 'capital', 'vesting', 'trustee',
  ],
};

describe('the month preview', () => {
  let dir: string;
  let out: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'anagrimoire-preview-test-'));
    const theme = join(dir, 'theme.json');
    await writeFile(theme, JSON.stringify(THEME));
    const { stdout } = await run(
      'node',
      ['scripts/preview-month.mjs', '--from', '2026-10-08', '--days', '1', '--theme', theme],
      { cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 }
    );
    out = stdout;
  }, 120_000);

  afterAll(async () => rm(dir, { recursive: true, force: true }));

  it('says which day it is showing, and what it read', () => {
    expect(out).toContain('2026-10-08');
    expect(out).toContain('theme.json');
  });

  // Every game, because the point of it is to see the day rather than a game:
  // somebody checking a month wants to notice that the hive is the one thing
  // that fell back.
  it('and shows every game that day would publish', () => {
    for (const game of ['guess', 'scramble', 'hive', 'boxed', 'ladder', 'weave', 'cryptogram']) {
      expect(out, `${game} missing from the preview`).toMatch(new RegExp(`\\n\\s+${game}\\s`));
    }
  });

  it('and marks a themed day as themed', () => {
    expect(out).toMatch(/2026-10-08 · themed/);
  });

  // The generator's own account of what it did with the theme, which is where a
  // pin that could not be used or a board that fell back gets said.
  it('and carries the run s own notes about the theme', () => {
    expect(out).toMatch(/Theming 2026-10-08 from "Employee ownership"/);
    expect(out).toMatch(/Box \w+: .+ — \w+( → \w+)+/);
  });

  // Two variants of the feed are generated and each says everything once. A
  // preview that printed both would show two different answers for one day.
  it('and reports one variant rather than two', () => {
    const themings = out.match(/Theming 2026-10-08/g) ?? [];
    expect(themings).toHaveLength(1);
  });

  it('and publishes nothing', async () => {
    // The live feed is written to data/ by the real run; a preview that touched
    // it would be a preview nobody could run on a Tuesday.
    const { stdout } = await run('git', ['status', '--porcelain', 'data'], {
      cwd: process.cwd(),
    });
    expect(stdout.trim()).toBe('');
  });
});

// The refusal, which matters more than it looks. Previewing ordinary days when
// there is nothing to read would show a themed month that "did not work" — the
// same output a broken setup produces, from a tool that was never told to look.
describe('the preview with nothing to read', () => {
  it('refuses rather than showing ordinary days', async () => {
    await expect(
      run('node', ['scripts/preview-month.mjs', '--from', '2026-10-08', '--days', '1'], {
        cwd: process.cwd(),
        env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '' },
      })
    ).rejects.toMatchObject({ code: 1 });
  });

  it('and says what would let it look', async () => {
    const failed = await run(
      'node',
      ['scripts/preview-month.mjs', '--from', '2026-10-08', '--days', '1'],
      { cwd: process.cwd(), env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '' } }
    ).catch((e: { stderr: string }) => e);
    expect((failed as { stderr: string }).stderr).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect((failed as { stderr: string }).stderr).toContain('--theme');
  });
});
