// Which boards the home page shows. The rule sounds trivial and has been
// wrong twice: first find() only ever reached Guess, then filtering on "done"
// excluded Hive and Weave for ever, because games with no finish line report
// "started" until they're given up on.
import { describe, expect, it } from 'vitest';
import { BOARD_LABELS, boardsToShow, emptyBoards, type Boards } from '@/leaderboard';
import type { DailyState } from '@/dailyStatus';

const row = { name: 'Anagrimoire', value: 1, detail: null };

function boards(games: (keyof Boards)[]): Boards {
  const b = emptyBoards();
  for (const g of games) b[g] = [row];
  return b;
}

const none: Record<string, DailyState> = {};

describe('boardsToShow', () => {
  it('shows the board for a finished game', () => {
    expect(boardsToShow(boards(['guess']), ['pattern'], { pattern: 'done' })).toEqual(['guess']);
  });

  it('a started hive still shows its board — hive has no finish line to reach', () => {
    expect(boardsToShow(boards(['hive']), ['bee'], { bee: 'started' })).toEqual(['hive']);
  });

  it('a started weave too', () => {
    expect(boardsToShow(boards(['weave']), ['weave'], { weave: 'started' })).toEqual(['weave']);
  });

  it('finished and started sit side by side', () => {
    const b = boards(['guess', 'hive']);
    expect(boardsToShow(b, ['pattern', 'bee'], { pattern: 'done', bee: 'started' })).toEqual([
      'guess',
      'hive',
    ]);
  });

  it('an untouched game shows nothing of its own', () => {
    expect(boardsToShow(boards(['guess']), ['pattern'], { pattern: 'none' })).toEqual(['guess']); // fallback: busiest
  });

  it('nothing played falls back to the single busiest board', () => {
    const b = boards(['guess', 'hive']);
    b.hive = [row, row]; // busier
    expect(boardsToShow(b, ['pattern', 'bee'], none)).toEqual(['hive']);
  });

  it('a played game whose board is empty is not shown empty', () => {
    const b = boards(['guess']);
    expect(boardsToShow(b, ['bee'], { bee: 'done' })).toEqual(['guess']); // hive board empty -> fallback
  });

  it('squares can put you on both of its boards', () => {
    const b = boards(['squares4', 'squares5']);
    expect(boardsToShow(b, ['squares'], { squares: 'done' })).toEqual(['squares4', 'squares5']);
  });

  it('no boards at all shows nothing', () => {
    expect(boardsToShow(emptyBoards(), ['pattern'], none)).toEqual([]);
  });
});

// What a row was ranked on, said out loud.
//
// Four boards -- Weave, both Word Squares and Cryptogram -- rank on the fastest
// solve and used to render nothing of it, so five people on "1 solved" read as
// five identical lines in an order the page would not explain. A missing number
// is a gap; a hidden ranking is misinformation, and on a board with a prize
// attached it is the kind that gets argued about.
describe('the number under the number', () => {
  it('says the time on every board that ranks on it', () => {
    for (const game of ['weave', 'squares4', 'squares5', 'cryptogram'] as const) {
      // 95 seconds, as boards_for returns it: milliseconds, from min(timeMs).
      expect(BOARD_LABELS[game].detail(95_000), game).toBe('best 1:35');
    }
  });

  // Nought is "nobody has a time yet", not a solve in no time at all, and a
  // row saying `best 0:00` would be a lie about a board somebody is leading.
  it('and says nothing when there is no time to say', () => {
    expect(BOARD_LABELS.weave.detail(0)).toBe('');
  });

  // The boards that rank on something else keep saying that something else --
  // a clock on Hive would rank it on a thing nobody was doing.
  it('while the boards ranked on other things are untouched', () => {
    expect(BOARD_LABELS.guess.detail(3)).toBe('best 3/6');
    expect(BOARD_LABELS.hive.detail(2)).toBe('2 days');
    expect(BOARD_LABELS.ladder.detail(2)).toContain('par');
  });
});
