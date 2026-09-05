// Counting answers for a cloud.
//
// The decisions worth arguing with are all here: what counts as the same
// answer, what the label says, and what order the result comes out in. A cloud
// is a picture people read conclusions off, so being wrong is quiet — it just
// looks like the room said something it did not.
import { describe, expect, it } from 'vitest';
import { cloudWords } from '@/wordCloud';

const said = (...values: string[]) => values.map((value) => ({ value }));

describe('cloudWords', () => {
  // The reason this is not a word cloud in the literal sense. Splitting on
  // whitespace took "employee ownership" apart and showed the room two ideas
  // where it had given one.
  it('keeps a phrase together', () => {
    expect(cloudWords(said('employee ownership', 'employee ownership'))).toEqual([
      { word: 'employee ownership', count: 2 },
    ]);
  });

  it('and does not fold a phrase into the words inside it', () => {
    const out = cloudWords(said('ownership', 'employee ownership'));
    expect(out.map((w) => w.word).sort()).toEqual(['employee ownership', 'ownership']);
  });

  it('counts the same answer said twice as one answer said twice', () => {
    expect(cloudWords(said('coffee', 'coffee'))).toEqual([{ word: 'coffee', count: 2 }]);
  });

  it('does not care about capitals, because "Coffee" is the same answer', () => {
    expect(cloudWords(said('Coffee', 'coffee', 'COFFEE'))).toEqual([
      { word: 'Coffee', count: 3 },
    ]);
  });

  it('shows the first spelling rather than the key it counted by', () => {
    // the cloud should read like something a person typed
    expect(cloudWords(said('Employee Ownership', 'employee ownership'))[0].word).toBe(
      'Employee Ownership'
    );
  });

  it('treats spacing as typing rather than as meaning', () => {
    expect(cloudWords(said('employee  ownership', ' employee ownership '))).toEqual([
      { word: 'employee ownership', count: 2 },
    ]);
  });

  it('and a full stop on the end the same way', () => {
    expect(cloudWords(said('coffee.', 'coffee', 'coffee!'))).toEqual([
      { word: 'coffee.', count: 3 },
    ]);
  });

  it('treats a curly apostrophe the same as a straight one', () => {
    // phones type the curly one, so a room's answers contain both
    expect(cloudWords(said('don’t know', "don't know")).map((w) => w.count)).toEqual([2]);
  });

  it('puts the commonest first', () => {
    expect(cloudWords(said('tea', 'coffee', 'coffee'))).toEqual([
      { word: 'coffee', count: 2 },
      { word: 'tea', count: 1 },
    ]);
  });

  it('and is stable within a count, so the same answers draw the same cloud', () => {
    // a picture that reshuffles on every refresh reads as though the data
    // changed
    const once = cloudWords(said('pear', 'apple', 'mango'));
    const again = cloudWords(said('mango', 'pear', 'apple'));
    expect(once).toEqual(again);
    expect(once.map((w) => w.word)).toEqual(['apple', 'mango', 'pear']);
  });

  it('takes only as many as will fit', () => {
    const many = [...Array(60)].map((_, i) => ({ value: `answer ${i}` }));
    expect(cloudWords(many)).toHaveLength(40);
    expect(cloudWords(many, 5)).toHaveLength(5);
  });

  it('survives an answer that is not a string', () => {
    // `value` is whatever was submitted, and the type does not rule this out
    expect(() => cloudWords([{ value: null }, { value: 42 }, { value: { a: 1 } }])).not.toThrow();
  });

  it('has nothing to draw when nothing was said', () => {
    expect(cloudWords([])).toEqual([]);
    expect(cloudWords(said('', '   ', '...'))).toEqual([]);
  });
});
