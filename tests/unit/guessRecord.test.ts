// The Guess board's stored shape, across the rename of its one field.
//
// It used to be called `secret`, which it never was: it is the answer to a word
// game, held in the player's own browser, base64'd so it isn't sitting in plain
// sight in devtools. The player is not the adversary and there isn't one. The
// name was wrong enough that a static analyser read it as a credential and
// flagged the random pick feeding it — a fair reading of the word, and not of
// the thing.
//
// What makes this worth a test rather than a find-and-replace is that the field
// crosses the wire. A board lives in `daily_progress`, so a phone and a laptop
// sync to each other, and for a while one of them will be on the build that
// wrote `secret`. Reading both is the whole compatibility story, and it is the
// kind of thing that looks fine until somebody's half-finished Wednesday
// silently resets.
import { describe, expect, it } from 'vitest';
import { asRecord, asRecords } from '@/guessRecord';

describe('reading a stored board', () => {
  it('takes the new name', () => {
    expect(asRecord({ answer: 'Y3JhbmU=', guesses: ['slate'] })).toEqual({
      answer: 'Y3JhbmU=',
      guesses: ['slate'],
    });
  });

  it('takes the old one, so a board written by the previous build survives', () => {
    expect(asRecord({ secret: 'Y3JhbmU=', guesses: ['slate'] })).toEqual({
      answer: 'Y3JhbmU=',
      guesses: ['slate'],
    });
  });

  it('prefers the new name when a record somehow carries both', () => {
    // belt and braces: a device mid-migration could write one and merge the
    // other, and picking the stale one would score guesses against the wrong
    // word rather than failing outright, which is the worse kind of wrong
    expect(asRecord({ answer: 'bmV3', secret: 'b2xk', guesses: [] })?.answer).toBe('bmV3');
  });

  it('keeps the clock when there is one, and stays quiet when there is not', () => {
    expect(asRecord({ answer: 'YQ==', guesses: [], elapsedMs: 4200 })?.elapsedMs).toBe(4200);
    expect(asRecord({ answer: 'YQ==', guesses: [] })).not.toHaveProperty('elapsedMs');
  });

  it('drops what it cannot read rather than inventing a board', () => {
    // a record with no answer is not a board in progress, and keeping one would
    // put an unplayable row on screen
    for (const junk of [null, undefined, 42, 'nope', {}, { guesses: ['slate'] }, { answer: 7 }]) {
      expect(asRecord(junk)).toBeUndefined();
    }
  });

  it('repairs a guess list that is not a list of strings', () => {
    expect(asRecord({ answer: 'YQ==', guesses: ['ok', 3, null, 'fine'] })?.guesses).toEqual([
      'ok',
      'fine',
    ]);
    expect(asRecord({ answer: 'YQ==', guesses: 'slate' })?.guesses).toEqual([]);
  });
});

describe('reading the whole bag', () => {
  it('normalises every length, whichever name each was written under', () => {
    const bag = asRecords({
      '4': { secret: 'Y3JhbmU=', guesses: [] },
      '5': { answer: 'c2xhdGU=', guesses: ['crane'] },
    });
    expect(Object.keys(bag).sort()).toEqual(['4', '5']);
    expect(bag['4'].answer).toBe('Y3JhbmU=');
  });

  it('leaves out the unreadable instead of failing the whole bag', () => {
    // one bad row used to be able to take the rest of the boards with it
    const bag = asRecords({ '4': { answer: 'YQ==', guesses: [] }, '5': { guesses: [] } });
    expect(Object.keys(bag)).toEqual(['4']);
  });

  it('answers empty for anything that is not a bag', () => {
    for (const junk of [null, undefined, 'x', 7]) expect(asRecords(junk)).toEqual({});
  });
});
