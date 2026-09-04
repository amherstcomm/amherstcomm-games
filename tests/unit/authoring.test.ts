// What the authoring screen refuses to save, and why.
//
// The server rejects the empty cases too, and that is where the real gate is —
// nothing here is a permission check. These cover the part the server cannot
// know: that a multiple-choice question with one option is a question with
// nothing to decide, and that an option deleted from the textarea must stop
// being the correct answer. Both are silent failures that only show up in front
// of the room.
import { describe, expect, it } from 'vitest';
import { AUTHORABLE, KIND_LABEL, parseOptions, problemWith, secondsOf } from '@/authoring';

describe('parseOptions', () => {
  it('takes one option per line and drops the blanks', () => {
    expect(parseOptions('2019\n2021\n\n2023\n')).toEqual(['2019', '2021', '2023']);
  });

  it('trims, because trailing spaces are invisible and would split the tally', () => {
    expect(parseOptions('  yes  \n no')).toEqual(['yes', 'no']);
  });

  it('drops duplicates', () => {
    // not a typo worth preserving: item_tally counts by value, so two identical
    // options are one bar in the results and an unwinnable choice on screen
    expect(parseOptions('yes\nno\nyes')).toEqual(['yes', 'no']);
  });

  it('is empty for empty input rather than one blank option', () => {
    expect(parseOptions('')).toEqual([]);
    expect(parseOptions('   \n  ')).toEqual([]);
  });
});

describe('problemWith', () => {
  const ok = { kind: 'choice', prompt: 'Which year?', options: ['2019', '2021'], correct: ['2021'] };

  it('passes a complete question', () => {
    expect(problemWith(ok)).toBeNull();
  });

  it('wants words in the question', () => {
    expect(problemWith({ ...ok, prompt: '   ' })).toMatch(/words/);
  });

  it('wants at least two options', () => {
    expect(problemWith({ ...ok, options: ['2021'], correct: ['2021'] })).toMatch(/two options/);
  });

  it('wants a correct answer marked on a scored question', () => {
    expect(problemWith({ ...ok, correct: [] })).toMatch(/correct/);
  });

  it('refuses a correct answer that is not one of the options', () => {
    // the case that reaches the room: an option is edited or deleted after it
    // was ticked, and the answer now names something nobody can pick
    expect(problemWith({ ...ok, correct: ['2020'] })).toMatch(/not one of the options/);
  });

  it('asks a survey for options but not for an answer', () => {
    // a survey is unscored — the server drops an answer sent for one, so
    // demanding one here would block a question the database is happy with
    expect(problemWith({ ...ok, kind: 'survey', correct: [] })).toBeNull();
    expect(problemWith({ ...ok, kind: 'survey', options: ['only'], correct: [] })).toMatch(
      /two options/
    );
  });

  it('asks an open question for nothing but words', () => {
    expect(problemWith({ kind: 'open', prompt: 'Ask away', options: [], correct: [] })).toBeNull();
  });
});

describe('the other three kinds', () => {
  const ok = { kind: 'choice', prompt: 'Which year?', options: [] as string[], correct: [] as string[] };

  it('every authorable kind has a name on screen', () => {
    // a Record over AUTHORABLE, so adding a kind without naming it is a
    // compile error rather than a button labelled "rank"
    for (const k of AUTHORABLE) expect(KIND_LABEL[k], k).toBeTruthy();
  });

  it('a guess needs a value, and one that is a number', () => {
    expect(problemWith({ ...ok, kind: 'number', value: '' })).toMatch(/value/);
    expect(problemWith({ ...ok, kind: 'number', value: 'about forty' })).toMatch(/not a number/);
    expect(problemWith({ ...ok, kind: 'number', value: '41.5' })).toBeNull();
    expect(problemWith({ ...ok, kind: 'number', value: '-3' })).toBeNull();
  });

  it('a match needs both columns and every pair decided', () => {
    const base = { ...ok, kind: 'match', left: ['Ada'], right: ['Analyst', 'Teacher'] };
    expect(problemWith({ ...base, left: [] })).toMatch(/things being matched/);
    expect(problemWith({ ...base, right: ['Analyst'] })).toMatch(/at least two/);
    // the case that reaches the room: a pair silently left blank
    expect(problemWith({ ...base, pairs: {} })).toMatch(/Ada/);
    expect(problemWith({ ...base, pairs: { Ada: 'Analyst' } })).toBeNull();
  });

  it('names how many pairs are still undecided, not just the first', () => {
    expect(
      problemWith({
        ...ok,
        kind: 'match',
        left: ['Ada', 'Grace', 'Alan'],
        right: ['a', 'b'],
        pairs: {},
      })
    ).toMatch(/and 2 more/);
  });

  it('a ranking needs options and no separate answer — the order is the answer', () => {
    expect(problemWith({ ...ok, kind: 'rank', options: ['a'] })).toMatch(/two options/);
    expect(problemWith({ ...ok, kind: 'rank', options: ['a', 'b'], correct: [] })).toBeNull();
  });
});

describe('secondsOf', () => {
  // The editor and item_seconds() in the schema have to agree about whether a
  // question has a clock. If the editor offers a value the server reads as no
  // clock, it has offered a timer that silently is not one.
  it('reads a usable window', () => {
    expect(secondsOf({ seconds: 30 })).toBe(30);
  });

  it('reads one that arrived as a string, because JSON', () => {
    expect(secondsOf({ seconds: '30' })).toBe(30);
  });

  it('is null for no clock at all', () => {
    expect(secondsOf({ options: ['a'] })).toBeNull();
    expect(secondsOf(undefined)).toBeNull();
  });

  it('is null outside the range the server accepts', () => {
    // 5 to 3600, matching item_seconds()
    expect(secondsOf({ seconds: 4 })).toBeNull();
    expect(secondsOf({ seconds: 5 })).toBe(5);
    expect(secondsOf({ seconds: 3600 })).toBe(3600);
    expect(secondsOf({ seconds: 3601 })).toBeNull();
  });

  it('is null for anything that is not a whole number of seconds', () => {
    expect(secondsOf({ seconds: 'soon' })).toBeNull();
    expect(secondsOf({ seconds: 12.5 })).toBeNull();
    expect(secondsOf({ seconds: null })).toBeNull();
  });
});

describe('AUTHORABLE', () => {
  it('is the kinds LiveSession can actually draw', () => {
    // The pair that must not drift: item_kinds is a table, so the server can
    // learn a kind before the site can show it. Offering one the play view
    // cannot render builds a round that fails on the projector, at the one
    // moment there is no way to fix it. When LiveSession learns match, number
    // and rank, this list moves with it.
    expect([...AUTHORABLE]).toEqual([
      'choice',
      'survey',
      'open',
      'match',
      'number',
      'rank',
    ]);
  });
});
