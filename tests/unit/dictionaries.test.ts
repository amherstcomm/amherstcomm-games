// The word-list bands and accept tiers. The sizes are the measured facts the
// difficulty design was built on; the subset rules are the promises — moving
// up a difficulty must never start rejecting a word that was legal below it,
// and a practice band must not contain the band below (that bug made every
// level draw from the one beneath while appearing to work).
import { describe, expect, it } from 'vitest';
import { getAcceptPool, getDictionary, getDifficultyPool } from '@/dictionaries';

describe('accept tiers', () => {
  it('easy accepts the standard list', async () => {
    const easy = await getAcceptPool('easy');
    expect(easy.length).toBe(67_170);
  });

  it('each tier contains the one below it', async () => {
    const [easy, hard, extreme] = await Promise.all([
      getAcceptPool('easy'),
      getAcceptPool('hard'),
      getAcceptPool('extreme'),
    ]);
    expect(hard.length).toBeGreaterThan(easy.length);
    expect(extreme.length).toBeGreaterThan(hard.length);
    const h = new Set(hard);
    const x = new Set(extreme);
    for (const w of easy) if (!h.has(w)) throw new Error(`hard rejects "${w}" that easy accepted`);
    for (const w of hard) if (!x.has(w)) throw new Error(`extreme rejects "${w}" that hard accepted`);
  });

  it('a tier is sorted and free of duplicates — binary-search callers assume it', async () => {
    const hard = await getAcceptPool('hard');
    for (let i = 1; i < hard.length; i++) {
      if (hard[i] <= hard[i - 1]) throw new Error(`out of order at ${i}: ${hard[i - 1]} >= ${hard[i]}`);
    }
  });
});

describe('generation bands', () => {
  it('are exclusive — each difficulty draws from what it alone adds', async () => {
    const [easy, hard, extreme] = await Promise.all([
      getDifficultyPool('easy'),
      getDifficultyPool('hard'),
      getDifficultyPool('extreme'),
    ]);
    const e = new Set(easy);
    for (const w of hard) if (e.has(w)) throw new Error(`"${w}" is in both easy and hard bands`);
    const s = new Set([...easy, ...hard]);
    for (const w of extreme) if (s.has(w)) throw new Error(`"${w}" is in extreme and a band below`);
  });

  it('easy generates from the common tier', async () => {
    const [easy, common] = await Promise.all([getDifficultyPool('easy'), getDictionary('common')]);
    expect(easy.length).toBe(common.length);
  });
});
