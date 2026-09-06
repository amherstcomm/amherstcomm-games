// Reading a pasted blob of themes or word lists.
//
// The case is a month at a time: thirty-one themes written somewhere else and
// pasted in one go. That pulls two ways — tolerant about shape, because they
// arrive in whatever a spreadsheet or a model produced, and strict about
// reporting, because an import that says "imported twenty-nine" when
// thirty-one were pasted has lost two and said so in the same breath.
import { describe, expect, it } from 'vitest';
import { parsePassages, parseWeaveThemes, parseWordLists } from '@/importing';

// Ray's own shape, derived fields and all.
const RAYS = JSON.stringify([
  {
    theme: 'Profit sharing',
    spangram: 'PROFITSHARING',
    spangram_length: 13,
    words: ['METRICS', 'PAYOUT', 'REWARD', 'TARGET', 'BONUS', 'SPLIT'],
    word_count: 6,
    total_letters: 48,
  },
]);

describe('parseWeaveThemes', () => {
  it('reads the shape these actually arrive in', () => {
    const { items, problems } = parseWeaveThemes(RAYS);
    expect(problems).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0].clue).toBe('Profit sharing');
    expect(items[0].spangram).toBe('profitsharing');
    expect(items[0].words).toEqual(['metrics', 'payout', 'reward', 'target', 'bonus', 'split']);
  });

  // A month at a time is the point of this existing.
  it('and a month of them at once', () => {
    const month = Array.from({ length: 31 }, (_, i) => ({
      theme: `Day ${i + 1}`,
      spangram: 'ownership',
      words: ['payout', 'reward'],
    }));
    const { items, problems } = parseWeaveThemes(JSON.stringify(month));
    expect(items).toHaveLength(31);
    expect(problems).toEqual([]);
  });

  // word_count and total_letters are arithmetic, not data — recomputed rather
  // than trusted, since a hand-edited blob is where they go stale.
  it('ignoring the numbers that are worked out rather than given', () => {
    const { items } = parseWeaveThemes(
      JSON.stringify([{ theme: 'x', spangram: 'ownership', words: ['aaaa'], word_count: 99 }])
    );
    expect(items[0].words).toHaveLength(1);
  });

  it('takes clue or theme, and one entry or many', () => {
    expect(
      parseWeaveThemes(JSON.stringify({ clue: 'x', spangram: 'ownership', words: ['aaaa'] })).items
    ).toHaveLength(1);
    expect(
      parseWeaveThemes(
        JSON.stringify({ themes: [{ theme: 'x', spangram: 'ownership', words: ['aaaa'] }] })
      ).items
    ).toHaveLength(1);
  });

  it('and words however they were written', () => {
    const { items } = parseWeaveThemes(
      JSON.stringify([{ theme: 'x', spangram: 'ownership', words: 'metrics, payout\nreward' }])
    );
    expect(items[0].words).toEqual(['metrics', 'payout', 'reward']);
  });

  it('drops the spangram from its own word list', () => {
    const { items } = parseWeaveThemes(
      JSON.stringify([{ theme: 'x', spangram: 'ownership', words: ['ownership', 'payout'] }])
    );
    expect(items[0].words).toEqual(['payout']);
  });

  // The half that matters at thirty-one entries: nothing disappears without a
  // reason and a position to find it by.
  it('says which entry it could not use, and why', () => {
    const { items, problems } = parseWeaveThemes(
      JSON.stringify([
        { theme: 'Good', spangram: 'ownership', words: ['payout'] },
        { theme: 'No spangram', words: ['payout'] },
        { spangram: 'ownership', words: ['payout'] },
        { theme: 'No words', spangram: 'ownership', words: [] },
      ])
    );
    expect(items).toHaveLength(1);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/Entry 2 \(No spangram\).*cannot be a spangram/);
    expect(problems[1]).toMatch(/Entry 3 has no clue/);
    expect(problems[2]).toMatch(/Entry 4 \(No words\) has no words/);
  });

  it('and says so when the paste is not JSON at all', () => {
    expect(parseWeaveThemes('not json').problems[0]).toMatch(/not valid JSON/);
    expect(parseWeaveThemes('   ').problems[0]).toMatch(/Nothing pasted/);
  });

  // A date read wrong is a theme that appears in the wrong week, so anything
  // that is not plainly a date is left off rather than guessed at.
  it('takes dates it is sure of and ignores the rest', () => {
    const { items } = parseWeaveThemes(
      JSON.stringify([
        {
          theme: 'x',
          spangram: 'ownership',
          words: ['payout'],
          starts_on: '2026-10-01',
          ends_on: 'October',
        },
      ])
    );
    expect(items[0].from).toBe('2026-10-01');
    expect(items[0].until).toBeUndefined();
  });
});

describe('parseWordLists', () => {
  it('reads a list', () => {
    const { items, problems } = parseWordLists(
      JSON.stringify([{ name: 'Employee ownership', words: ['shares', 'ESOP'] }])
    );
    expect(problems).toEqual([]);
    expect(items[0].name).toBe('Employee ownership');
    expect(items[0].words).toEqual(['shares', 'esop']);
  });

  it('carries spangrams and dates when they are there', () => {
    const { items } = parseWordLists(
      JSON.stringify([
        {
          name: 'x',
          words: ['shares'],
          spangrams: ['employeeowned', 'no'],
          daily_from: '2026-10-01',
          daily_until: '2026-10-31',
        },
      ])
    );
    expect(items[0].spangrams).toEqual(['employeeowned']);
    expect(items[0].from).toBe('2026-10-01');
  });

  it('and names the entries it could not use', () => {
    const { items, problems } = parseWordLists(
      JSON.stringify([{ words: ['shares'] }, { name: 'Empty', words: [] }])
    );
    expect(items).toEqual([]);
    expect(problems).toHaveLength(2);
  });
});

// A passage is a sentence rather than a set of words, so this parser is the
// loosest of the three — and the length is deliberately not its business.
describe('parsePassages', () => {
  it('takes the shape the template is written in', () => {
    const { items, problems } = parsePassages(
      JSON.stringify({
        passages: [
          { text: 'We own this place.', author: 'The charter', starts_on: '2026-10-01', ends_on: '2026-10-31' },
        ],
      })
    );
    expect(problems).toEqual([]);
    expect(items[0]).toEqual({
      text: 'We own this place.',
      author: 'The charter',
      from: '2026-10-01',
      until: '2026-10-31',
    });
  });

  // Which is what makes lifting a handful out of the curated file possible
  // without reshaping them first.
  it('and the curated file s own shape', () => {
    const { items, problems } = parsePassages(
      JSON.stringify({ quotes: [{ text: 'A stitch in time.', author: 'Proverb', source: 'bartletts' }] })
    );
    expect(problems).toEqual([]);
    expect(items[0].author).toBe('Proverb');
  });

  // A bare string is a passage. Nothing else here would be worth accepting as
  // one, and pasting a list of sentences is the obvious thing to try.
  it('and a plain list of sentences', () => {
    const { items, problems } = parsePassages(JSON.stringify(['One sentence.', 'Another one.']));
    expect(problems).toEqual([]);
    expect(items.map((p) => p.text)).toEqual(['One sentence.', 'Another one.']);
  });

  // The server refuses what no board can take, and says how many letters it
  // had. Doing it here as well would be two places that have to agree about
  // the bands forever, and the paste would lose the entry silently.
  it('does not judge the length, which is the server s job', () => {
    const { items, problems } = parsePassages(JSON.stringify(['Too short.']));
    expect(problems).toEqual([]);
    expect(items).toHaveLength(1);
  });

  it('and names what it could not use', () => {
    const { items, problems } = parsePassages(JSON.stringify([{ author: 'Nobody' }, '', 7]));
    expect(items).toEqual([]);
    expect(problems).toHaveLength(3);
  });
});
