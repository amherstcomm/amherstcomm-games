// Which boards the home page shows. The rule sounds trivial and has been
// wrong twice: first find() only ever reached Guess, then filtering on "done"
// excluded Hive and Weave for ever, because games with no finish line report
// "started" until they're given up on.
import { describe, expect, it } from 'vitest';
import { boardsToShow, emptyBoards, type Boards } from '@/leaderboard';
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
