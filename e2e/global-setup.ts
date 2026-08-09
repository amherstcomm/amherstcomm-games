// Generate today's puzzle feed once, before any test runs. The date has to be
// computed the way the app computes it (src/dailyStatus.ts todayEt) rather
// than real Eastern time — the two can disagree for a few hours around
// midnight, and a feed the app considers yesterday's would be refused.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '.data');

export function appToday(): string {
  return new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function globalSetup() {
  const date = appToday();
  const marker = join(DATA_DIR, 'dev-daily-words.json');

  // a feed from an earlier run today is still today's feed — skip the minute
  if (existsSync(marker)) {
    try {
      if (JSON.parse(readFileSync(marker, 'utf8')).date === date) return;
    } catch {
      // regenerate
    }
  }

  await mkdir(DATA_DIR, { recursive: true });
  await run('node', ['scripts/fetch-puzzles.mjs'], {
    env: {
      ...process.env,
      SKIP_SOLVER_DATA: '1',
      PUZZLES_DATE: date,
      PUZZLES_DATA_DIR: DATA_DIR,
    },
    maxBuffer: 10 * 1024 * 1024,
  });

  // The solver-prefill files the generator skipped. Real-looking shapes so the
  // solvers render their prefill buttons without a console full of failures.
  writeFileSync(
    join(DATA_DIR, 'letterboxed.json'),
    JSON.stringify({ date, sides: ['abc', 'def', 'ghi', 'jkl'], par: 4 })
  );
  writeFileSync(
    join(DATA_DIR, 'spellingbee.json'),
    JSON.stringify({ date, center: 'a', outers: ['b', 'c', 'd', 'e', 'f'] })
  );
  writeFileSync(
    join(DATA_DIR, 'strands.json'),
    JSON.stringify({ date, clue: 'Test theme', board: Array(8).fill('abcdef') })
  );
}
