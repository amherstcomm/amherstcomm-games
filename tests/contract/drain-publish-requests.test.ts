// The publish host's half of "Republish this day".
//
// The page files a request and the VM's minute timer runs this. What has to be
// true: nothing waiting costs nothing; a waiting day is published, read back
// and answered; a day that became live after it was asked for is left alone;
// and whatever happens, the request is closed -- a request left open is a page
// that says "publishing now" for ever.
//
// A stub PostgREST and the real generator, as with ops/publish-day.sh.
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

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

type Row = { puzzle_date: string; env: string; game: string; payload: Record<string, unknown> };
type Job = { id: string; on_date: string; force: boolean };

let server: Server;
let base: string;
let queue: Job[] = [];
let finished: { p_id: string; p_ok: boolean; p_note: string }[] = [];
let posted: Row[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '';
    const send = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const rpc = url.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
      if (rpc === 'claim_publish_request') return send(queue.shift() ?? null);
      if (rpc === 'finish_publish_request') {
        finished.push(JSON.parse(body));
        // What PostgREST answers for a function returning void: nothing.
        res.writeHead(204);
        return res.end();
      }
      if (rpc === 'daily_word_policy' || rpc === 'daily_pins') return send({});
      if (rpc) return send([]);
      if (url.startsWith('/rest/v1/daily_puzzles') && req.method === 'POST') {
        posted.push(...(JSON.parse(body) as Row[]));
        return send([], 201);
      }
      if (url.startsWith('/rest/v1/daily_puzzles')) {
        const date = url.match(/puzzle_date=eq\.([\d-]+)/)?.[1];
        const row = posted.find((r) => r.game === 'words' && r.env === 'prod' && r.puzzle_date === date);
        return send(row ? [{ payload: row.payload }] : []);
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
  queue = [];
  finished = [];
  posted = [];
});

async function drain(env: Record<string, string> = {}) {
  try {
    const { stdout, stderr } = await run('node', ['scripts/drain-publish-requests.mjs'], {
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

describe('the publish host draining requests', () => {
  it('does nothing when nothing is waiting', async () => {
    const { code } = await drain();
    expect(code).toBe(0);
    expect(posted).toEqual([]);
    expect(finished).toEqual([]);
  });

  it('publishes a waiting day, and answers with what it found', async () => {
    const day = plus(easternToday(), 20);
    queue = [{ id: 'r1', on_date: day, force: false }];
    const { code, out } = await drain();
    expect(code, out).toBe(0);

    const days = new Set(
      posted.filter((r) => r.env === 'prod' && !r.game.endsWith('-pool')).map((r) => r.puzzle_date)
    );
    expect([...days]).toEqual([day]);
    expect(finished).toEqual([
      { p_id: 'r1', p_ok: true, p_note: 'published, themed from "Employee ownership"' },
    ]);
  });

  // Asked for tomorrow at 11:59 p.m., drained a minute later: by then it is
  // today, and the rule is about the board being live rather than about when
  // somebody pressed the button.
  it('leaves a day alone that became live before it could be published', async () => {
    queue = [{ id: 'r2', on_date: easternToday(), force: false }];
    await drain();
    expect(posted).toEqual([]);
    expect(finished).toHaveLength(1);
    expect(finished[0].p_ok).toBe(false);
    expect(finished[0].p_note).toMatch(/started before it could be published/);
  });

  // The request is closed whatever happens -- including a generator that
  // cannot run -- because an open request is a page saying "publishing now"
  // for ever.
  it('and closes the request when the generator fails', async () => {
    queue = [{ id: 'r3', on_date: plus(easternToday(), 21), force: false }];
    await drain({ PUZZLES_THEME: 'not json' });
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ p_id: 'r3', p_ok: false });
    expect(finished[0].p_note).toMatch(/the generator failed/);
  });

  it('refuses to run without the salt, and takes nothing', async () => {
    queue = [{ id: 'r4', on_date: plus(easternToday(), 22), force: false }];
    const { code, out } = await drain({ PUZZLES_SEED_SALT: '' });
    expect(code).toBe(1);
    expect(out).toContain('PUZZLES_SEED_SALT');
    // Still in the queue: not claimed, so the next run with a salt takes it.
    expect(queue).toHaveLength(1);
    expect(finished).toEqual([]);
  });
});
