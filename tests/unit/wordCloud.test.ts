// Counting words for a cloud.
//
// The decisions worth arguing with are all here: what counts as a word, what
// counts as noise, and what order the result comes out in. A cloud is a picture
// people read conclusions off, so being wrong is quiet — it just looks like the
// room said something it did not.
import { describe, expect, it } from 'vitest';
import { cloudWords } from '@/wordCloud';

const said = (...values: string[]) => values.map((value) => ({ value }));

describe('cloudWords', () => {
  it('counts the same word said twice as one word said twice', () => {
    expect(cloudWords(said('coffee', 'coffee'))).toEqual([{ word: 'coffee', count: 2 }]);
  });

  it('does not care about case, because "Coffee" is the same answer', () => {
    expect(cloudWords(said('Coffee', 'coffee', 'COFFEE'))).toEqual([
      { word: 'coffee', count: 3 },
    ]);
  });

  it('drops the words that would otherwise be the biggest thing on the wall', () => {
    // A cloud whose largest word is "the" has told the room nothing.
    const out = cloudWords(said('the coffee is the best', 'the coffee'));
    expect(out.map((w) => w.word)).not.toContain('the');
    expect(out.map((w) => w.word)).not.toContain('is');
    expect(out[0]).toEqual({ word: 'coffee', count: 2 });
  });

  it('keeps an apostrophe inside a word and drops it round the outside', () => {
    // "don't" is one word; a quoted 'word' is not a different one
    expect(cloudWords(said("don't"))).toEqual([{ word: "don't", count: 1 }]);
    expect(cloudWords(said("'coffee'"))).toEqual([{ word: 'coffee', count: 1 }]);
  });

  it('treats a curly apostrophe the same as a straight one', () => {
    // phones type the curly one, so a room's answers contain both
    expect(cloudWords(said('don’t', "don't")).map((w) => w.count)).toEqual([2]);
  });

  it('ignores single letters, which are noise at any size', () => {
    expect(cloudWords(said('a b coffee')).map((w) => w.word)).toEqual(['coffee']);
  });

  it('puts the commonest first', () => {
    expect(cloudWords(said('tea', 'coffee tea', 'coffee', 'coffee'))).toEqual([
      { word: 'coffee', count: 3 },
      { word: 'tea', count: 2 },
    ]);
  });

  it('and is stable within a count, so the same answers draw the same cloud', () => {
    // a picture that reshuffles on every refresh reads as though the data
    // changed
    const once = cloudWords(said('pear apple mango'));
    const again = cloudWords(said('mango pear apple'));
    expect(once).toEqual(again);
    expect(once.map((w) => w.word)).toEqual(['apple', 'mango', 'pear']);
  });

  it('takes only as many as will fit', () => {
    const many = said([...Array(60)].map((_, i) => `word${i}`).join(' '));
    expect(cloudWords(many)).toHaveLength(40);
    expect(cloudWords(many, 5)).toHaveLength(5);
  });

  it('survives an answer that is not a string', () => {
    // `value` is whatever was submitted, and the type does not rule this out
    expect(() => cloudWords([{ value: null }, { value: 42 }, { value: { a: 1 } }])).not.toThrow();
  });

  it('has nothing to draw when nothing was said', () => {
    expect(cloudWords([])).toEqual([]);
    expect(cloudWords(said('the and of'))).toEqual([]);
  });
});
