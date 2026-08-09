// The doorbell's routing: which board an event is about, and whose
// environment it belongs to. The channel itself needs a live socket and is
// exercised by hand; these pin the pure decisions so a payload shape change
// rings the wrong board loudly in CI rather than quietly in production.
import { describe, expect, it } from 'vitest';
import { DAILY_ENV } from '@/dailyData';
import { doorbellKey, doorbellWants } from '@/realtimeSync';

describe('doorbellKey', () => {
  it('builds the sync key from a full row', () => {
    expect(
      doorbellKey({ game: 'hive', variant: '', difficulty: 'hard', puzzle_date: '2026-08-09' })
    ).toBe('hive::hard:2026-08-09');
  });

  it('carries the variant, which separates the day\'s Guess lengths', () => {
    expect(
      doorbellKey({ game: 'guess', variant: '6', difficulty: 'easy', puzzle_date: '2026-08-09' })
    ).toBe('guess:6:easy:2026-08-09');
  });

  it('returns null when the payload cannot say which board — everyone re-pulls', () => {
    expect(doorbellKey(null)).toBeNull();
    expect(doorbellKey({})).toBeNull();
    expect(doorbellKey({ game: 'hive' })).toBeNull();
  });
});

describe('doorbellWants', () => {
  it('accepts rows for this environment, and rows too bare to carry one', () => {
    expect(doorbellWants({ env: DAILY_ENV })).toBe(true);
    expect(doorbellWants({})).toBe(true);
  });

  it("ignores the other environment's rows", () => {
    expect(doorbellWants({ env: DAILY_ENV === 'prod' ? 'dev' : 'prod' })).toBe(false);
  });
});
