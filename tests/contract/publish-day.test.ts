// Regenerating one day, against a database that answers.
//
// Two things have to be true and only one of them is the obvious one. The
// obvious one: the day gets published, themed when a list covers it, and the
// tool says so having checked. The other: a day that has already started is
// refused unless somebody means it -- regenerating a live board puts a different
// puzzle under everybody partway through it, and this is a tool somebody will
// run in a hurry the morning of something.
//
// A stub PostgREST rather than a real Postgres, and the real generator: what is
// under test is what gets sent and what gets said, and the generator is what
// decides the first.
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const THEME = {
  name: 'Employee ownership',
  words: [
    'esop', 'shares', 'shared', 'sharing', 'payouts', 'dividends', 'stocks', 'stock',
    'service', 'owned', 'owner', 'ownership', 'policy', 'charter', 'reward', 'rewards',
    'earned', 'worker', 'network', 'employer', 'conduit', 'capital', 'vesting', 'trustee',
  ],
};

/** Eastern, as the tool reckons it -- the machine's zone is not the question. */
const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

type Row = { puzzle_date: string; env: string; game: string; payload: Record<string, unknown> };

let server: Server;
let base: string;
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
      if (url.startsWith('/rest/v1/daily_puzzles') && req.method === 'POST') {
        posted.push(...(JSON.parse(body) as Row[]));
        return send([], 201);
      }
      if (url.startsWith('/rest/v1/daily_puzzles')) {
        // The read-back: one day's word board.
        const date = url.match(/puzzle_date=eq\.([\d-]+)/)?.[1];
        const row = posted.find((r) => r.game === 'words' && r.env === 'prod' && r.puzzle_date === date);
        return send(row ? [{ payload: row.payload }] : []);
      }
      // The settings the generator asks for, beyond the word list -- which
      // comes inline through PUZZLES_THEME. Nothing set up: no Weave themes, no
      // passages, no rules, no pins.
      const rpc = url.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
      if (rpc === 'daily_word_policy' || rpc === 'daily_pins') return send({});
      return send([]);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  posted = [];
});

/** Run it and hand back what it said and how it ended. */
async function publishDay(args: string[], env: Record<string, string> = {}) {
  try {
    const { stdout, stderr } = await run('node', ['scripts/publish-day.mjs', ...args], {
      env: {
        ...process.env,
        SUPABASE_URL: base,
        SUPABASE_SERVICE_ROLE_KEY: 'stub',
        PUZZLES_SEED_SALT: 'test-salt',
        PUZZLES_THEME: JSON.stringify(THEME),
        ...env,
      },
      maxBuffer: 20 * 1024 * 1024,
    });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, out: (failure.stdout ?? '') + (failure.stderr ?? '') };
  }
}

describe('regenerating one day', () => {
  // The case that matters most, because it is the one run in a hurry.
  it('refuses today without --force, and publishes nothing', async () => {
    const { code, out } = await publishDay([easternToday()]);
    expect(code).toBe(1);
    expect(out).toMatch(/already live/);
    expect(out).toContain('--force');
    expect(posted).toEqual([]);
  });

  it('and the past, for the same reason', async () => {
    const { code, out } = await publishDay([plus(easternToday(), -3)]);
    expect(code).toBe(1);
    expect(out).toMatch(/in the past/);
    expect(posted).toEqual([]);
  });

  it('and a date that is not one', async () => {
    const { code, out } = await publishDay(['next tuesday']);
    expect(code).toBe(1);
    expect(out).toMatch(/Which day/);
  });

  // Without the salt the board is a different board, and publishing it would
  // replace a day's real puzzle with one that only looks right.
  it('and refuses to publish without the salt', async () => {
    const { code, out } = await publishDay([plus(easternToday(), 20)], { PUZZLES_SEED_SALT: '' });
    expect(code).toBe(1);
    expect(out).toContain('PUZZLES_SEED_SALT');
    expect(posted).toEqual([]);
  });

  it('publishes a future day, themed, and says it checked', async () => {
    const day = plus(easternToday(), 20);
    const { code, out } = await publishDay([day]);
    expect(code, out).toBe(0);

    // Every game for that day, for the site to read -- and nothing for any
    // other day, which is the difference between this and the window.
    const days = new Set(posted.filter((r) => r.env === 'prod' && !r.game.endsWith('-pool')).map((r) => r.puzzle_date));
    expect([...days]).toEqual([day]);

    const words = posted.find((r) => r.env === 'prod' && r.game === 'words');
    expect(words?.payload.themed, 'the word board carries no theme').toBeTruthy();
    expect(out).toContain(`${day} published, themed from "Employee ownership"`);
  });
});
