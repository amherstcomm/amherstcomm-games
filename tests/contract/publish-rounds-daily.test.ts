// Publishing a tournament round's game that has a new board each day.
//
// Its own file because it is the slowest part of publishing rounds -- a real
// generator run per day of the round -- and in a file of its own it runs beside
// the rest instead of after it. What has to hold: a board for every day of the
// round, each dated at its own day and a different word; days ahead
// regenerated, today's only if missing, a day that is over never; and a
// round's daily game and its one-board game each published their own way.
//
// A stub PostgREST (roundsHarness.ts) and the real generator.
import { describe, expect, it } from 'vitest';
import { easternToday, plus, stubRounds } from './roundsHarness';

const h = stubRounds();

describe('publishing a game with a new board each day', () => {
  // ---------------------------------------------------------------------------
  // A new board each day
  // ---------------------------------------------------------------------------

  it('a game with a new board each day gets one for every day of the round, each dated at its day', async () => {
    const start = plus(easternToday(), 3);
    h.rounds = [
      { id: 'd1', starts_on: start, ends_on: plus(start, 2), games: ['words'], daily_games: ['words'], difficulty: 'hard' },
    ];
    const { code, out } = await h.publishRounds(easternToday(), plus(easternToday(), 13));
    expect(code, out).toBe(0);
    const days = h.posted.filter((r) => r.game === 'words').map((r) => r.puzzle_date).sort();
    expect(days).toEqual([start, plus(start, 1), plus(start, 2)]);
    // Each board is that day's own, which is the date a game saves its result
    // under -- so a different word each day.
    for (const row of h.posted) expect(row.payload.date).toBe(row.puzzle_date);
    const words = new Set(h.posted.map((r) => JSON.stringify(r.payload.byDifficulty)));
    expect(words.size, 'two days were dealt the same board').toBe(3);
    expect(out).toContain(`a new board each day for words (${start} to ${plus(start, 2)})`);
  });

  it('a round under way gets its days ahead, today only if missing, and never a day that is over', async () => {
    const today = easternToday();
    h.rounds = [
      {
        id: 'd2', starts_on: plus(today, -2), ends_on: plus(today, 1),
        games: ['words', 'hive'], daily_games: ['words'], difficulty: 'hard',
      },
    ];
    // Today's word is up and being played; tomorrow's is not up yet.
    h.alreadyPublished = [`${today}:words`];
    const { code, out } = await h.publishRounds(plus(today, -7), plus(today, 13));
    expect(code, out).toBe(0);
    expect(h.posted.map((r) => `${r.puzzle_date}:${r.game}`)).toEqual([`${plus(today, 1)}:words`]);
    // and the round's one-board game, under way, is left exactly as it is
    expect(h.posted.some((r) => r.game === 'hive')).toBe(false);
  });

  it("and a round's daily game and its one-board game are each published their own way", async () => {
    const start = plus(easternToday(), 2);
    h.rounds = [
      {
        id: 'd3', starts_on: start, ends_on: plus(start, 1),
        games: ['words', 'hive'], daily_games: ['words'], difficulty: 'hard',
      },
    ];
    const { code, out } = await h.publishRounds(easternToday(), plus(easternToday(), 13));
    expect(code, out).toBe(0);
    expect(h.posted.map((r) => `${r.puzzle_date}:${r.game}`).sort()).toEqual(
      [`${start}:hive`, `${start}:words`, `${plus(start, 1)}:words`].sort()
    );
  });
});
