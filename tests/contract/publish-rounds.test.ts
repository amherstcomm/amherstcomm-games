// Publishing tournament rounds, against a database that answers.
//
// What has to hold: a round is published as one board per listed game and no
// others, under env 'round' and dated at its first day; the board is the
// round's own rather than that day's daily; and a round under way is never
// regenerated, because its board has been played.
//
// A stub PostgREST and the real generator.
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

type Row = { puzzle_date: string; env: string; game: string; payload: Record<string, unknown> };
type Round = { id: string; starts_on: string; ends_on: string; games: string[]; difficulty: string };

let server: Server;
let base: string;
let rounds: Round[] = [];
let alreadyPublished: string[] = [];
let posted: Row[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '';
    const send = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const rpc = url.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
      if (rpc === 'rounds_to_publish') return send(rounds);
      if (rpc === 'daily_word_policy' || rpc === 'daily_pins') return send({});
      if (rpc) return send([]);
      if (url.startsWith('/rest/v1/daily_puzzles') && req.method === 'POST') {
        posted.push(...(JSON.parse(body) as Row[]));
        return send([], 201);
      }
      if (url.startsWith('/rest/v1/daily_puzzles')) {
        const date = url.match(/puzzle_date=eq\.([\d-]+)/)?.[1] ?? '';
        return send(alreadyPublished.includes(date) ? [{ game: 'hive' }] : []);
      }
      return send([], 404);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  rounds = [];
  alreadyPublished = [];
  posted = [];
});

async function publishRounds(from: string, until: string) {
  try {
    const { stdout, stderr } = await run(
      'node',
      ['scripts/publish-rounds.mjs', '--from', from, '--until', until],
      {
        env: {
          ...process.env,
          SUPABASE_URL: base,
          SUPABASE_SERVICE_ROLE_KEY: 'stub',
          PUZZLES_SEED_SALT: 'test-salt',
        },
        maxBuffer: 20 * 1024 * 1024,
      }
    );
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, out: (failure.stdout ?? '') + (failure.stderr ?? '') };
  }
}

describe('publishing tournament rounds', () => {
  it('publishes one board per listed game, and no others', async () => {
    const start = plus(easternToday(), 5);
    rounds = [{ id: 'r1', starts_on: start, ends_on: plus(start, 9), games: ['hive', 'box'], difficulty: 'hard' }];
    const { code, out } = await publishRounds(easternToday(), plus(easternToday(), 13));
    expect(code, out).toBe(0);

    expect(posted.map((r) => r.game).sort()).toEqual(['box', 'hive']);
    for (const row of posted) {
      expect(row.env).toBe('round');
      // Dated at the round's first day, the key a result is verified against.
      expect(row.puzzle_date).toBe(start);
      expect(row.payload.date).toBe(start);
      expect(row.payload.byDifficulty, `${row.game} has no boards`).toBeTruthy();
    }
    expect(out).toContain(`Round ${start} to ${plus(start, 9)}: 2 boards (hive, box)`);
  });

  // A round is a third version of its first day, not that day's daily: were
  // they the same, everybody would have played the round's hive that morning.
  it("and the round board is not that day's daily", async () => {
    const start = plus(easternToday(), 6);
    rounds = [{ id: 'r2', starts_on: start, ends_on: start, games: ['hive'], difficulty: 'hard' }];
    await publishRounds(easternToday(), plus(easternToday(), 13));
    const round = posted.find((r) => r.game === 'hive')?.payload as
      | { byDifficulty: Record<string, { center: string; outers: string[] }> }
      | undefined;
    expect(round, 'no round hive was published').toBeTruthy();

    // The same date's ordinary daily, generated the ordinary way into a
    // directory this test owns, with the same salt.
    const dir = mkdtempSync(join(tmpdir(), 'round-vs-daily-'));
    try {
      await run('node', ['scripts/fetch-puzzles.mjs'], {
        env: {
          ...process.env,
          PUZZLES_DATE: start,
          PUZZLES_DATA_DIR: dir,
          SKIP_SOLVER_DATA: '1',
          PUZZLES_SEED_SALT: 'test-salt',
          SUPABASE_URL: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
        },
        maxBuffer: 20 * 1024 * 1024,
      });
      const daily = JSON.parse(readFileSync(join(dir, 'daily-hive.json'), 'utf8')) as {
        byDifficulty: Record<string, { center: string; outers: string[] }>;
      };
      const letters = (b: { center: string; outers: string[] }) =>
        [b.center, ...b.outers].join('');
      // Seven letters and a centre drawn from the same pool with a different
      // seed: equal on the hard board would mean the round had been dealt the
      // daily, and everybody would have played it that morning.
      expect(letters(round!.byDifficulty.hard)).not.toBe(letters(daily.byDifficulty.hard));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The rule that protects people mid-round.
  it('never regenerates a round that is under way', async () => {
    rounds = [
      { id: 'r3', starts_on: plus(easternToday(), -2), ends_on: plus(easternToday(), 4), games: ['hive'], difficulty: 'hard' },
    ];
    const { code } = await publishRounds(plus(easternToday(), -7), plus(easternToday(), 13));
    expect(code).toBe(0);
    expect(posted).toEqual([]);
  });

  it('and publishes a round starting today only if it is not there yet', async () => {
    const today = easternToday();
    rounds = [{ id: 'r4', starts_on: today, ends_on: plus(today, 3), games: ['hive'], difficulty: 'hard' }];
    alreadyPublished = [today];
    await publishRounds(today, plus(today, 13));
    expect(posted).toEqual([]);
  });
});
