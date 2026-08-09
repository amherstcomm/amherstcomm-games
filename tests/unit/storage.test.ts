// Persisted settings survive renames. The solver's word lists were
// Common/Standard/Full before they became the difficulties' accept tiers, and
// a stored pick must carry over rather than reset.
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function fresh() {
  vi.resetModules();
  return import('@/storage');
}

beforeEach(() => {
  localStorage.clear();
});

describe('asDifficulty', () => {
  it('passes the current names through', async () => {
    const m = await fresh();
    expect(m.asDifficulty('easy')).toBe('easy');
    expect(m.asDifficulty('hard')).toBe('hard');
    expect(m.asDifficulty('extreme')).toBe('extreme');
  });

  it('maps the retired names onto the same three rungs', async () => {
    const m = await fresh();
    expect(m.asDifficulty('common')).toBe('easy');
    expect(m.asDifficulty('standard')).toBe('hard');
    expect(m.asDifficulty('full')).toBe('extreme');
  });

  it('rejects anything else', async () => {
    const m = await fresh();
    expect(m.asDifficulty('huge')).toBeNull();
    expect(m.asDifficulty(3)).toBeNull();
    expect(m.asDifficulty(undefined)).toBeNull();
  });
});

describe('loadState', () => {
  it('returns defaults for a blank browser', async () => {
    const m = await fresh();
    const s = m.loadState();
    expect(s.dictionaries.pattern).toBe('easy');
    expect(s.solverDictionary).toBe('per-game');
  });

  it('migrates stored legacy dictionary picks instead of resetting them', async () => {
    localStorage.setItem(
      'anagrimoire:v1',
      JSON.stringify({
        dictionaries: { pattern: 'common', bee: 'full', weave: 'standard' },
        solverDictionary: 'standard',
      })
    );
    const m = await fresh();
    const s = m.loadState();
    expect(s.dictionaries.pattern).toBe('easy');
    expect(s.dictionaries.bee).toBe('extreme');
    expect(s.dictionaries.weave).toBe('hard');
    expect(s.solverDictionary).toBe('hard');
  });

  it('keeps current names as they are', async () => {
    localStorage.setItem(
      'anagrimoire:v1',
      JSON.stringify({ dictionaries: { grid: 'extreme' }, solverDictionary: 'easy' })
    );
    const m = await fresh();
    const s = m.loadState();
    expect(s.dictionaries.grid).toBe('extreme');
    expect(s.solverDictionary).toBe('easy');
  });

  it('drops a value it has never heard of back to the default', async () => {
    localStorage.setItem(
      'anagrimoire:v1',
      JSON.stringify({ dictionaries: { grid: 'enormous' }, solverDictionary: 'enormous' })
    );
    const m = await fresh();
    const s = m.loadState();
    expect(s.dictionaries.grid).toBe('easy');
    expect(s.solverDictionary).toBe('per-game');
  });

  it('survives corrupt JSON', async () => {
    localStorage.setItem('anagrimoire:v1', '{not json');
    const m = await fresh();
    expect(() => m.loadState()).not.toThrow();
  });
});
