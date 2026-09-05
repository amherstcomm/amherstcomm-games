// The words a themed day adds to what the board will accept.
//
// This is the client half of letting ESOP be an answer. The generator can pick
// a word no dictionary carries; without this the board refuses to let anybody
// type it, which is an unanswerable day and worse than not theming at all.
import { describe, expect, it } from 'vitest';
import { acceptedAt, themedWords } from '@/themedWords';

const encode = (words: string[]) => btoa(words.join(' '));

describe('themedWords', () => {
  it('reads the day s own words out of its payload', () => {
    expect(themedWords({ themed: encode(['esop', 'shares']) })).toEqual(['esop', 'shares']);
  });

  // Most of the year there is no theme, and that must not look like an error.
  it('and has none for an ordinary day', () => {
    expect(themedWords({ date: '2026-06-01' })).toEqual([]);
    expect(themedWords(null)).toEqual([]);
    expect(themedWords({ themed: '' })).toEqual([]);
  });

  it('survives a payload it cannot decode', () => {
    // the feed is generated separately and may be older or newer than this
    expect(() => themedWords({ themed: '!!!not base64!!!' })).not.toThrow();
  });

  it('and drops anything that is not a word', () => {
    // Space-separated on the wire, so the entries are single words by
    // construction — the server splits on anything that is not a letter before
    // it stores one. What this guards is junk arriving anyway.
    expect(themedWords({ themed: encode(['esop', '', 'ok2', 'shares']) })).toEqual([
      'esop',
      'shares',
    ]);
  });
});

describe('acceptedAt', () => {
  const dictionary = ['plane', 'planet', 'stake'];

  it('is the dictionary at that length', () => {
    const out = acceptedAt(dictionary, [], 5);
    expect(out?.has('plane')).toBe(true);
    expect(out?.has('planet')).toBe(false);
  });

  it('plus the day s own words, which is the whole point', () => {
    const out = acceptedAt(dictionary, ['esop'], 4);
    expect(out?.has('esop')).toBe(true);
  });

  it('at the right length only', () => {
    expect(acceptedAt(dictionary, ['esop'], 5)?.has('esop')).toBe(false);
  });

  // A guess refused because a fetch was slow reads as the board calling you
  // wrong, so the caller shows "still loading" instead — which it can only do
  // if this says "not yet" rather than "nothing".
  it('and is nothing at all until the dictionary arrives', () => {
    expect(acceptedAt(null, ['esop'], 4)).toBeNull();
  });
});
