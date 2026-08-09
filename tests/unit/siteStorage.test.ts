// The storage gate: what the site may keep, and where. These are the rules
// the consent banner promises, so a regression here is a broken promise
// rather than a broken feature.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The module keeps state (the in-memory fallback map), so every test gets a
// fresh copy — stale module state is exactly the kind of thing that makes a
// storage test pass for the wrong reason.
async function fresh() {
  vi.resetModules();
  return import('@/siteStorage');
}

const LEVEL_KEY = 'anagrimoire:storage:v2';

beforeEach(() => {
  localStorage.clear();
});

describe('the level itself', () => {
  it('is null before anyone has answered', async () => {
    const m = await fresh();
    expect(m.readLevel()).toBeNull();
  });

  it('behaves as the most permissive until answered, so a first visit is not quietly forgotten', async () => {
    const m = await fresh();
    expect(m.level()).toBe('browser');
  });

  it("reads the retired 'server' answer as 'browser' rather than asking again", async () => {
    localStorage.setItem(LEVEL_KEY, 'server');
    const m = await fresh();
    expect(m.readLevel()).toBe('browser');
  });

  it('ignores a value it never wrote', async () => {
    localStorage.setItem(LEVEL_KEY, 'everything');
    const m = await fresh();
    expect(m.readLevel()).toBeNull();
  });
});

describe("at 'browser'", () => {
  it('game data lands on disk', async () => {
    const m = await fresh();
    m.setLevel('browser');
    m.store.setItem('anagrimoire:hive:v1', '{"found":["mode"]}');
    expect(localStorage.getItem('anagrimoire:hive:v1')).toBe('{"found":["mode"]}');
  });
});

describe("at 'essential'", () => {
  it('game data still works but never touches disk', async () => {
    const m = await fresh();
    m.setLevel('essential');
    m.store.setItem('anagrimoire:hive:v1', '{"found":["mode"]}');
    expect(m.store.getItem('anagrimoire:hive:v1')).toBe('{"found":["mode"]}');
    expect(localStorage.getItem('anagrimoire:hive:v1')).toBeNull();
  });

  it('the choice itself is still remembered — forgetting the "no" would be worse', async () => {
    const m = await fresh();
    m.setLevel('essential');
    expect(localStorage.getItem(LEVEL_KEY)).toBe('essential');
  });

  it('dropping the level moves what was on disk into memory, so the session keeps working', async () => {
    const m = await fresh();
    m.setLevel('browser');
    m.store.setItem('anagrimoire:grid:v1', 'progress');
    m.setLevel('essential');
    expect(localStorage.getItem('anagrimoire:grid:v1')).toBeNull();
    expect(m.store.getItem('anagrimoire:grid:v1')).toBe('progress');
  });

  it('the supabase session is ours to purge too', async () => {
    const m = await fresh();
    m.setLevel('browser');
    m.store.setItem('sb-ref-auth-token', 'jwt');
    m.setLevel('essential');
    expect(localStorage.getItem('sb-ref-auth-token')).toBeNull();
    expect(m.store.getItem('sb-ref-auth-token')).toBe('jwt');
  });

  it("someone else's keys are not ours to touch", async () => {
    const m = await fresh();
    localStorage.setItem('third-party', 'theirs');
    m.setLevel('essential');
    expect(localStorage.getItem('third-party')).toBe('theirs');
  });
});
