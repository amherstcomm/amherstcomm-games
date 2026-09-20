// Asking the server for a round's hint.
//
// The rule this carries is in the database, and supabase/tests/roundhints.sql
// proves it there: the count is the server's, and a browser claiming none does
// not win the tie. What is checked here is the half in the page -- that a
// refusal is read as a refusal rather than as a hint, and that a malformed
// answer is never mistaken for a word to light up.
//
// The limit, stated because it is the interesting one: the button itself is
// not browser-tested. Reaching it means banking three non-theme words on a
// Weave board, which is a long drive for the assertion it would add; what the
// button does with these two functions is one line each.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

async function fresh() {
  vi.resetModules();
  return import('@/roundHints');
}

beforeEach(() => rpc.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('takeRoundHint', () => {
  it('asks for the game it is playing, and passes the word and count back', async () => {
    rpc.mockResolvedValue({ data: { ok: true, target: 'SHARE', taken: 2 }, error: null });
    const m = await fresh();
    expect(await m.takeRoundHint('weave')).toEqual({ ok: true, target: 'SHARE', taken: 2 });
    expect(rpc).toHaveBeenCalledWith('take_round_hint', { p_game: 'weave' });
  });

  // The server's reasons are sentences a person can read, so they are carried
  // rather than replaced.
  it('carries a refusal back as a refusal', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'there is nothing left to hint' }, error: null });
    const m = await fresh();
    expect(await m.takeRoundHint('weave')).toEqual({
      ok: false,
      reason: 'there is nothing left to hint',
    });
  });

  it('and a request that fails is not a hint', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    const m = await fresh();
    expect(await m.takeRoundHint('weave')).toEqual({ ok: false, reason: 'network' });
  });

  // An ok with no word would light up nothing and count as help received.
  it('nor is an answer that says ok without a word', async () => {
    rpc.mockResolvedValue({ data: { ok: true, taken: 1 }, error: null });
    const m = await fresh();
    expect(await m.takeRoundHint('weave')).toMatchObject({ ok: false });
  });

  // A client that answers with nothing at all: reading data and error off it
  // throws inside this module, which is what the catch is for.
  //
  // Not simulated by throwing from the mock, though that is the obvious way:
  // vitest 4 reports an error raised inside a mock as an unhandled error and
  // fails the file even when the code under test catches it and carries on --
  // measured, not assumed, by printing the return value, which was the right
  // one while the file still went red.
  it('nor an answer that cannot be read at all', async () => {
    rpc.mockResolvedValue(null);
    const m = await fresh();
    expect(await m.takeRoundHint('weave')).toEqual({ ok: false, reason: 'no answer' });
  });
});

describe('readRoundHints', () => {
  it('reads back what was given', async () => {
    rpc.mockResolvedValue({ data: { taken: 2, targets: ['SHARE', 'STAKE'] }, error: null });
    const m = await fresh();
    expect(await m.readRoundHints('weave')).toEqual({ taken: 2, targets: ['SHARE', 'STAKE'] });
  });

  // A page that cannot ask shows no hints rather than failing to draw.
  it('and answers none when it cannot ask', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const m = await fresh();
    expect(await m.readRoundHints('weave')).toEqual({ taken: 0, targets: [] });
  });

  it('keeping only the targets that are words', async () => {
    rpc.mockResolvedValue({ data: { taken: 1, targets: ['SHARE', 7, null] }, error: null });
    const m = await fresh();
    expect(await m.readRoundHints('weave')).toEqual({ taken: 1, targets: ['SHARE'] });
  });
});
