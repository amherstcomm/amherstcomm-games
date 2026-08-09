// The word-list bands and accept tiers, as consumed from the published
// artifacts. The counts are the contract with the Postgres words table —
// both sides are built from the same rows by scripts/build-words.mjs — and
// the subset rules are the promises: moving up a difficulty must never start
// rejecting a word that was legal below it, a slur never scores anywhere,
// and a practice band must not contain the band below.
import { describe, expect, it } from 'vitest';
import { getAcceptPool, getDictionary, getDifficultyPool, getWordFlags } from '@/dictionaries';

describe('accept tiers', () => {
  it('matches the words table in Postgres, tier for tier', async () => {
    // easy is level <= 55, hard is level <= 70, extreme is every row — each
    // minus the slurs. If one of these moves, rebuild the table and band
    // files together (npm run build-words) in the same change, or the server
    // will call honest players liars.
    expect((await getAcceptPool('easy')).length).toBe(67_141);
    expect((await getAcceptPool('hard')).length).toBe(111_370);
    expect((await getAcceptPool('extreme')).length).toBe(276_790);
  });

  it('each tier contains the one below it', async () => {
    const [easy, hard, extreme] = await Promise.all([
      getAcceptPool('easy'),
      getAcceptPool('hard'),
      getAcceptPool('extreme'),
    ]);
    const h = new Set(hard);
    const x = new Set(extreme);
    for (const w of easy) if (!h.has(w)) throw new Error(`hard rejects "${w}" that easy accepted`);
    for (const w of hard) if (!x.has(w)) throw new Error(`extreme rejects "${w}" that hard accepted`);
  });

  it('a slur never scores, at any difficulty', async () => {
    const flags = await getWordFlags();
    const slurs = [...flags.entries()].filter(([, f]) => f === 'slur').map(([w]) => w);
    expect(slurs.length).toBeGreaterThan(0);
    for (const d of ['easy', 'hard', 'extreme'] as const) {
      const pool = new Set(await getAcceptPool(d));
      for (const s of slurs) {
        if (pool.has(s)) throw new Error(`${d} accepts a slur`);
      }
    }
  });

  it('everyday swears score — the ruling was slurs, not swearing', async () => {
    const easy = new Set(await getAcceptPool('easy'));
    for (const w of ['fuck', 'shit', 'crap', 'fart']) {
      expect(easy.has(w), `easy accepts "${w}"`).toBe(true);
    }
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

  it('practice never deals a flagged word — same manners as the daily generator', async () => {
    const flags = await getWordFlags();
    for (const d of ['easy', 'hard', 'extreme'] as const) {
      for (const w of await getDifficultyPool(d)) {
        if (flags.has(w)) throw new Error(`${d} practice pool contains flagged "${w}"`);
      }
    }
  });

  it('easy generates from the common tier, minus only the flagged words', async () => {
    const [easy, common] = await Promise.all([getDifficultyPool('easy'), getDictionary('common')]);
    const flags = await getWordFlags();
    const flaggedInCommon = common.filter((w) => flags.has(w)).length;
    expect(easy.length).toBe(common.length - flaggedInCommon);
    const c = new Set(common);
    for (const w of easy) if (!c.has(w)) throw new Error(`"${w}" is not a common word`);
  });
});
