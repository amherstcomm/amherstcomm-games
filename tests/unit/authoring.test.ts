// What the authoring screen refuses to save, and why.
//
// The server rejects the empty cases too, and that is where the real gate is —
// nothing here is a permission check. These cover the part the server cannot
// know: that a multiple-choice question with one option is a question with
// nothing to decide, and that an option deleted from the textarea must stop
// being the correct answer. Both are silent failures that only show up in front
// of the room.
import { describe, expect, it } from 'vitest';
import { AUTHORABLE, parseOptions, problemWith } from '@/authoring';

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

describe('AUTHORABLE', () => {
  it('is the kinds LiveSession can actually draw', () => {
    // The pair that must not drift: item_kinds is a table, so the server can
    // learn a kind before the site can show it. Offering one the play view
    // cannot render builds a round that fails on the projector, at the one
    // moment there is no way to fix it. When LiveSession learns match, number
    // and rank, this list moves with it.
    expect([...AUTHORABLE]).toEqual(['choice', 'survey', 'open']);
  });
});
