// Difficulty as puzzle identity: the setting, the listeners, and — most
// importantly — how a difficulty is read out of a feed that may predate the
// whole idea.
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function fresh() {
  vi.resetModules();
  return import('@/difficulty');
}

beforeEach(() => {
  localStorage.clear();
});

describe('the setting', () => {
  it("defaults to easy — what every pre-difficulty daily already was", async () => {
    const m = await fresh();
    expect(m.difficulty()).toBe('easy');
  });

  it('stores a change and notifies listeners', async () => {
    const m = await fresh();
    const heard = vi.fn();
    m.onDifficultyChange(heard);
    m.setDifficulty('hard');
    expect(m.difficulty()).toBe('hard');
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('setting the same value again is silent — games re-fetch on notify, so a no-op must not fire', async () => {
    const m = await fresh();
    m.setDifficulty('hard');
    const heard = vi.fn();
    m.onDifficultyChange(heard);
    m.setDifficulty('hard');
    expect(heard).not.toHaveBeenCalled();
  });

  it('unsubscribe means unsubscribed', async () => {
    const m = await fresh();
    const heard = vi.fn();
    const off = m.onDifficultyChange(heard);
    off();
    m.setDifficulty('extreme');
    expect(heard).not.toHaveBeenCalled();
  });

  it('a garbage stored value reads as easy', async () => {
    localStorage.setItem('anagrimoire:difficulty:v1', 'nightmare');
    const m = await fresh();
    expect(m.difficulty()).toBe('easy');
  });
});

describe('reading a difficulty out of a feed', () => {
  const legacy = { words: { 5: 'abc' } }; // a feed from before difficulty existed
  const modern = {
    words: { 5: 'abc' }, // legacy keys hold the easy board
    byDifficulty: {
      easy: { words: { 5: 'abc' } },
      hard: { words: { 5: 'def' } },
      extreme: { words: { 5: 'ghi' } },
    },
  };

  it('a modern feed serves each difficulty its own board', async () => {
    const m = await fresh();
    expect(m.pickDifficulty(modern, 'hard')).toEqual({ words: { 5: 'def' } });
    expect(m.pickDifficulty(modern, 'extreme')).toEqual({ words: { 5: 'ghi' } });
  });

  it('a legacy feed serves easy from its top-level keys', async () => {
    const m = await fresh();
    expect(m.pickDifficulty(legacy, 'easy')).toBe(legacy);
  });

  it('a legacy feed genuinely has no hard board', async () => {
    const m = await fresh();
    expect(m.pickDifficulty(legacy, 'hard')).toBeNull();
  });

  it('resolveDifficulty falls back to easy AND says so — recording the fallback as hard would put a board nobody played at hard onto its leaderboard', async () => {
    const m = await fresh();
    const r = m.resolveDifficulty(legacy, 'hard');
    expect(r.board).toBe(legacy);
    expect(r.difficulty).toBe('easy');
  });

  it('resolveDifficulty keeps the asked-for difficulty when the feed has it', async () => {
    const m = await fresh();
    const r = m.resolveDifficulty(modern, 'extreme');
    expect(r.board).toEqual({ words: { 5: 'ghi' } });
    expect(r.difficulty).toBe('extreme');
  });

  it('a null payload resolves to nothing rather than throwing', async () => {
    const m = await fresh();
    expect(m.resolveDifficulty(null, 'hard')).toEqual({ board: null, difficulty: 'easy' });
  });
});
