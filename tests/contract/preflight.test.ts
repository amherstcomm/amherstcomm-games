// The preflight, against a database that answers.
//
// It is the one tool here whose whole job is to notice something missing, so
// what has to be tested is that it *fails* — a checker that always says PASS is
// worse than none, because it is the thing somebody trusts on the morning of
// the event instead of looking themselves.
//
// A stub PostgREST rather than a real Postgres: what is being checked is the
// script's reading of the answers, and the answers are the interesting part.
// supabase/tests/ is where the functions themselves are proved.
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

type Answers = {
  /** functions that are missing from this database */
  absent?: string[];
  /** what pin_puzzle says — the old refusal, or the current one */
  stalePins?: boolean;
  /** which dates have rows, and how many games each */
  published?: Record<string, number>;
  /** dates a word list covers */
  themed?: string[];
};

let server: Server;
let base: string;
let answers: Answers = {};

const GAMES = 10;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '';
    const send = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const rpc = url.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];

    if (rpc && (answers.absent ?? []).includes(rpc)) {
      // What PostgREST says for a function that is not there.
      return send({ message: `Could not find the function public.${rpc}` }, 404);
    }
    if (rpc === 'pin_puzzle') {
      return send(
        answers.stalePins
          ? { ok: false, reason: 'squares has no themed candidates to choose between' }
          : { ok: false, reason: 'it needs a date' }
      );
    }
    if (rpc === 'daily_theme') {
      let body = '';
      req.on('data', (c) => (body += c));
      return req.on('end', () => {
        const date = JSON.parse(body || '{}').p_date;
        send(
          (answers.themed ?? []).includes(date)
            ? { name: 'Employee ownership', words: ['esop', 'shares'] }
            : null
        );
      });
    }
    if (rpc === 'daily_puzzle') return send({ date: '2026-10-01', byDifficulty: {} });
    if (rpc) return send([]);

    if (url.startsWith('/rest/v1/daily_puzzles')) {
      const rows = Object.entries(answers.published ?? {}).flatMap(([date, count]) =>
        Array.from({ length: count }, () => ({ puzzle_date: date, game: 'words', env: 'prod' }))
      );
      return send(rows);
    }
    return send([], 404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** Run it, and hand back what it printed whether it passed or failed. */
async function preflight(from: string, days: number) {
  try {
    const { stdout } = await run(
      'node',
      ['scripts/preflight.mjs', '--from', from, '--days', String(days)],
      { env: { ...process.env, SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: 'stub' } }
    );
    return { code: 0, out: stdout };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    return { code: failure.code ?? 1, out: failure.stdout ?? '' };
  }
}

describe('the preflight', () => {
  it('passes when the chain is whole', async () => {
    answers = {
      published: { '2026-10-01': GAMES, '2026-10-02': GAMES },
      themed: ['2026-10-01', '2026-10-02'],
    };
    const { code, out } = await preflight('2026-10-01', 2);
    expect(out).toContain('Ready.');
    expect(out).not.toContain('FAIL');
    expect(code).toBe(0);
  });

  // The failure this exists for: the schema was never re-applied, so every
  // lookup the generator makes answers "nothing covers this day" and the month
  // publishes ordinary puzzles with nothing complaining.
  it('and says which function is missing when the schema is behind', async () => {
    answers = {
      absent: ['daily_word_policy', 'daily_pins'],
      published: { '2026-10-01': GAMES },
      themed: ['2026-10-01'],
    };
    const { code, out } = await preflight('2026-10-01', 1);
    expect(out).toMatch(/FAIL\s+daily_word_policy\(\) is present/);
    expect(out).toMatch(/FAIL\s+daily_pins\(\) is present/);
    expect(out).toContain('re-run supabase/schema.sql');
    expect(code).toBe(1);
  });

  // Squares became pinnable in a schema change, and a database that missed it
  // refuses the pin rather than breaking anything — which is precisely the kind
  // of thing nobody notices until they try it in front of people.
  it('and notices a schema that still refuses to pin a square', async () => {
    answers = { stalePins: true, published: { '2026-10-01': GAMES }, themed: [] };
    const { code, out } = await preflight('2026-10-01', 1);
    expect(out).toMatch(/FAIL\s+Squares can be pinned/);
    expect(code).toBe(1);
  });

  it('and names the days that were never published', async () => {
    answers = { published: { '2026-10-01': GAMES }, themed: [] };
    const { code, out } = await preflight('2026-10-01', 3);
    expect(out).toMatch(/FAIL\s+every day in the range is published/);
    expect(out).toContain('2026-10-02');
    expect(code).toBe(1);
  });

  // A publish that fell over half way leaves a day that looks published and is
  // missing games, which is a different fault from one that never ran.
  it('and the days that are only half published', async () => {
    answers = { published: { '2026-10-01': 4 }, themed: [] };
    const { out } = await preflight('2026-10-01', 1);
    expect(out).toMatch(/FAIL\s+and each published day has all \d+ games/);
    expect(out).toContain('2026-10-01 (4)');
  });

  // Not a verdict. Whether these days were meant to be themed is the one thing
  // it cannot know, so it reports and does not judge -- an unthemed June must
  // not read as a broken deployment.
  it('and reports what is themed without calling it right or wrong', async () => {
    answers = { published: { '2026-10-01': GAMES }, themed: [] };
    const { code, out } = await preflight('2026-10-01', 1);
    expect(out).toMatch(/note\s+days a word list covers — none in this range/);
    expect(code).toBe(0);
  });
});
