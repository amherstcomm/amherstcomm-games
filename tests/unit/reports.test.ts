// Reporting, on the one rule that makes a report worth acting on: the client
// says *where* the thing was, never *what* it said.
//
// This is the whole design and it is invisible to every other check. A version
// that posted the board it was holding would typecheck, lint, render the same
// dialog, and produce reports that cannot be told apart from invented ones —
// so the test asserts the shape of the outgoing call, which is the only place
// the difference shows.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('@/dailyData', () => ({ DAILY_ENV: 'prod' }));

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { ok: true, recorded: true, ticket: '4f2ba9c17d' }, error: null });
});

describe('what a report sends', () => {
  it('a puzzle report carries where the board was and nothing off it', async () => {
    const { reportPuzzle } = await import('@/reports');
    await reportPuzzle('bridge', '2026-08-15', 'hard', 'the answer is a slur');

    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('report_puzzle');
    expect(args).toEqual({
      p_game: 'bridge',
      p_date: '2026-08-15',
      p_difficulty: 'hard',
      p_env: 'prod',
      p_reason: 'the answer is a slur',
      p_email: null,
    });
    // The assertion that matters: no board, no prompts, no cells, no letters.
    // Everything except the reason, because the reason is the player's own
    // words and they are entitled to write "the answer is a slur" in it —
    // which this test did, and which is how it caught itself.
    const located = { ...args };
    delete located.p_reason;
    expect(JSON.stringify(located)).not.toMatch(/board|prompt|answer|cells|words|letters/i);
  });

  it('a player report carries a name and a reason, not a rank or a score', async () => {
    const { reportPlayer } = await import('@/reports');
    await reportPlayer('SomeName', 'the name is a slur');

    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('report_player');
    expect(Object.keys(args).sort()).toEqual(['p_email', 'p_name', 'p_reason']);
  });

  it('the reason is capped before it leaves, not after it arrives', async () => {
    const { reportPuzzle, REASON_MAX } = await import('@/reports');
    await reportPuzzle('guess', '2026-08-15', 'easy', 'x'.repeat(REASON_MAX + 500));

    const [, args] = rpc.mock.calls[0] as [string, Record<string, string>];
    expect(args.p_reason.length).toBe(REASON_MAX);
  });
});

describe('what a report answers', () => {
  it('a dropped duplicate reads as filed, but with no ticket to name it', async () => {
    // The server says recorded:false once a subject already has five reports
    // in a month. The reporter did their part either way, and telling them it
    // was dropped invites them to file it again by another route — but there
    // is no new report for a ticket to point at, so the dialog says the honest
    // thing instead of inventing a reference.
    const { reportPuzzle } = await import('@/reports');
    rpc.mockResolvedValue({ data: { ok: true, recorded: false }, error: null });
    expect(await reportPuzzle('guess', '2026-08-15', 'easy', '')).toEqual({
      state: 'filed',
      ticket: null,
    });
  });

  it('a board the server cannot find is its own answer, not an error', async () => {
    const { reportPuzzle } = await import('@/reports');
    rpc.mockResolvedValue({ data: { ok: false, reason: 'no such puzzle' }, error: null });
    expect(await reportPuzzle('guess', '2001-01-01', 'easy', '')).toEqual({ state: 'unknown' });
  });

  it('a transport failure is an error, so the dialog can offer a retry', async () => {
    const { reportPuzzle } = await import('@/reports');
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } });
    expect(await reportPuzzle('guess', '2026-08-15', 'easy', '')).toEqual({ state: 'error' });
  });

  it('a thrown request is an error too, rather than a rejected promise', async () => {
    const { reportPlayer } = await import('@/reports');
    rpc.mockRejectedValue(new Error('offline'));
    expect(await reportPlayer('Someone', '')).toEqual({ state: 'error' });
  });
});

describe('the ticket', () => {
  it('comes back on a filed report, so the reporter has something to hold', async () => {
    const { reportPuzzle } = await import('@/reports');
    expect(await reportPuzzle('bridge', '2026-08-15', 'hard', '')).toEqual({
      state: 'filed',
      ticket: '4f2ba9c17d',
    });
  });

  it('carries an address only when one was typed', async () => {
    const { reportPlayer } = await import('@/reports');
    await reportPlayer('SomeName', '', '  Someone@Example.com  ');
    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_email).toBe('Someone@Example.com');

    rpc.mockClear();
    await reportPlayer('SomeName', '', '   ');
    const [, blank] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(blank.p_email).toBeNull();
  });

  it('answers open or closed and nothing else', async () => {
    const { ticketStatus } = await import('@/reports');
    rpc.mockResolvedValue({
      data: { found: true, status: 'handled', resolution: 'blocked', filed: 'x', closed: 'y' },
      error: null,
    });
    expect(await ticketStatus('4f2ba9c17d')).toEqual({
      found: true,
      open: false,
      resolution: 'blocked',
      filed: 'x',
      closed: 'y',
    });
  });

  it('a code that names nothing is not an error, because guessing is not a crime', async () => {
    const { ticketStatus } = await import('@/reports');
    rpc.mockResolvedValue({ data: { found: false }, error: null });
    expect(await ticketStatus('nope')).toEqual({ found: false });
  });
});

describe('acting on one', () => {
  it('a missing owner and a wrong token are the same answer', async () => {
    // The server says 'not allowed' to both, on purpose: a page that told them
    // apart would say which half of the lock somebody had already picked.
    const { reportForAction } = await import('@/reports');
    rpc.mockResolvedValue({ data: { ok: false, reason: 'not allowed' }, error: null });
    expect(await reportForAction('id', 'token')).toBe('denied');
  });

  it('passes the server’s own word back rather than inventing one', async () => {
    const { actOnReport } = await import('@/reports');
    rpc.mockResolvedValue({ data: { ok: false, reason: 'already handled' }, error: null });
    expect(await actOnReport('id', 'tok', 'dismiss', '', '')).toBe('already handled');
  });
});
