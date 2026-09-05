// Dragging one thing into a different place in a list.
//
// The case worth pinning is the difference between a move and a swap. The
// buttons beside each row swap with a neighbour, which is the same thing when
// the two are adjacent and a completely different thing when they are not:
// dragging the top item to the bottom should push everything else up one, not
// exchange the ends.
import { describe, expect, it } from 'vitest';
import { reorder, rowAt } from '@/ranking';

const abcd = ['a', 'b', 'c', 'd'];

describe('reorder', () => {
  it('moves rather than swaps', () => {
    expect(reorder(abcd, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    // the swap this is not
    expect(reorder(abcd, 0, 3)).not.toEqual(['d', 'b', 'c', 'a']);
  });

  it('and moving upwards pushes the rest down', () => {
    expect(reorder(abcd, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('agrees with a swap when the two are neighbours', () => {
    // the buttons and the drag have to leave the same list, or a question
    // answered with both is answered with neither
    expect(reorder(abcd, 1, 2)).toEqual(['a', 'c', 'b', 'd']);
    expect(reorder(abcd, 2, 1)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('does nothing when it lands where it started', () => {
    expect(reorder(abcd, 2, 2)).toBe(abcd);
  });

  it('lands on the end when dropped past it', () => {
    expect(reorder(abcd, 0, 99)).toEqual(['b', 'c', 'd', 'a']);
    expect(reorder(abcd, 3, -5)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('leaves the original alone', () => {
    const before = [...abcd];
    reorder(abcd, 0, 2);
    expect(abcd).toEqual(before);
  });

  it('survives an index that is not in the list', () => {
    expect(reorder(abcd, 9, 0)).toBe(abcd);
    expect(reorder([], 0, 0)).toEqual([]);
  });
});

describe('rowAt', () => {
  // four rows, 40px tall, starting at 100
  const mids = [120, 160, 200, 240];

  it('is the first row above the first midpoint', () => {
    expect(rowAt(mids, 0)).toBe(0);
    expect(rowAt(mids, 119)).toBe(0);
  });

  // An item crosses into the next place when it passes the middle of the row it
  // is displacing — the point at which the two have visibly swapped. Edges make
  // the list flicker while a finger rests on a boundary.
  it('crosses at the midpoint, not the edge', () => {
    expect(rowAt(mids, 121)).toBe(1);
    expect(rowAt(mids, 159)).toBe(1);
    expect(rowAt(mids, 161)).toBe(2);
  });

  it('and does not run off the end', () => {
    expect(rowAt(mids, 10_000)).toBe(3);
  });

  it('has nothing to be over when there are no rows', () => {
    expect(rowAt([], 100)).toBe(-1);
  });
});
