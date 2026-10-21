// The stub database and the call both publish-rounds test files use.
//
// Split out when the file did: publishing rounds was the slowest contract
// file by minutes -- a dozen real generator runs one after another -- and two
// files run side by side where one runs end to end. Shared rather than copied,
// so the two cannot drift into testing against different databases.
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach } from 'vitest';

const run = promisify(execFile);

export const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date(Date.now() - (3 * 60 + 15) * 60_000)
  );
export const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export type Row = { puzzle_date: string; env: string; game: string; payload: Record<string, unknown> };
export type Round = {
  id: string;
  starts_on: string;
  ends_on: string;
  games: string[];
  daily_games?: string[];
  difficulty: string;
};

/** A stub PostgREST for the file that calls this, reset before each test.
 *  Set `rounds` and `alreadyPublished`; read `posted`. */
export function stubRounds() {
  let server: Server;
  let base = '';
  const h = {
    rounds: [] as Round[],
    /** What is already up: a date on its own is every game that day, as the
     *  earlier tests meant it; `date:game` is one game's board. */
    alreadyPublished: [] as string[],
    posted: [] as Row[],
    async publishRounds(from: string, until: string) {
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
    },
  };

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
        if (rpc === 'rounds_to_publish') return send(h.rounds);
        if (rpc === 'daily_word_policy' || rpc === 'daily_pins') return send({});
        if (rpc) return send([]);
        if (url.startsWith('/rest/v1/daily_puzzles') && req.method === 'POST') {
          h.posted.push(...(JSON.parse(body) as Row[]));
          return send([], 201);
        }
        if (url.startsWith('/rest/v1/daily_puzzles')) {
          const query = new URL(url, 'http://stub').searchParams;
          const date = (query.get('puzzle_date') ?? '').replace(/^eq\./, '');
          // game=in.(words,hive); a request without one asks for hive
          const game = query.get('game') ?? 'in.(hive)';
          const asked = game.slice('in.('.length, -1).split(',');
          return send(
            asked
              .filter((g) => h.alreadyPublished.includes(date) || h.alreadyPublished.includes(`${date}:${g}`))
              .map((game) => ({ game }))
          );
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
    h.rounds = [];
    h.alreadyPublished = [];
    h.posted = [];
  });

  return h;
}
