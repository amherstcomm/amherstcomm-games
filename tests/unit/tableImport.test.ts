// Reading a question's options out of a spreadsheet.
//
// The cases that matter are the ones a real sheet produces: a block copied out
// of Excel arrives tab separated with no file involved, a cell holding a comma
// comes back quoted, and a heading row is there because people label columns.
// Getting any of those wrong loses rows quietly, which is the one thing an
// import must not do.
import { describe, expect, it } from 'vitest';
import {
  delimiterOf,
  parseTable,
  readChoice,
  readMatch,
  readOptions,
  saysYes,
  saySo,
  TEMPLATES,
  toCsv,
  withoutHeadings,
} from '@/tableImport';

describe('what separates the cells', () => {
  it('is tabs when the sheet was copied rather than saved', () => {
    expect(delimiterOf('1998\tESOP formed\n2011\tFiber launch')).toBe('\t');
  });

  it('and commas when it was saved as csv', () => {
    expect(delimiterOf('1998,ESOP formed\n2011,Fiber launch')).toBe(',');
  });

  // The failure this exists for: a pasted block whose cells contain commas,
  // read as comma separated, becomes the wrong number of columns.
  it('counting the row rather than the first character it meets', () => {
    expect(delimiterOf('1998\tFounded, at last\n2011\tFiber, then')).toBe('\t');
  });

  it('and a single column is left alone rather than split on something', () => {
    expect(parseTable('Retirement\nOwnership\nTeam')).toEqual([
      ['Retirement'],
      ['Ownership'],
      ['Team'],
    ]);
  });
});

describe('parseTable', () => {
  it('keeps a quoted comma inside its cell', () => {
    expect(parseTable('"Ownership, mostly",yes')).toEqual([['Ownership, mostly', 'yes']]);
  });

  // What a spreadsheet writes for a cell containing a quote.
  it('reads a doubled quote as one quote', () => {
    expect(parseTable('"She said ""yes""",y')).toEqual([['She said "yes"', 'y']]);
  });

  it('and a newline inside a quoted cell is not a new row', () => {
    expect(parseTable('"two\nlines",yes')).toEqual([['two\nlines', 'yes']]);
  });

  it('drops blank lines rather than importing them as empty options', () => {
    expect(parseTable('a,1\n\nb,2\n')).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('and handles the carriage returns Windows leaves behind', () => {
    expect(parseTable('a,1\r\nb,2')).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });
});

describe('heading rows', () => {
  it('go, when the whole row is headings', () => {
    expect(withoutHeadings([['Left', 'Right'], ['1998', 'ESOP']])).toEqual([['1998', 'ESOP']]);
  });

  it('but a row of real data that starts with such a word stays', () => {
    expect(withoutHeadings([['Answer', '1998'], ['Question', '2011']])).toEqual([
      ['Answer', '1998'],
      ['Question', '2011'],
    ]);
  });

  it('and a sheet with only one row is data, not headings', () => {
    expect(withoutHeadings([['option', 'correct']])).toEqual([['option', 'correct']]);
  });

  // The case guessing cannot reach: a real sheet says "Year" over "Event",
  // which is indistinguishable from data. The page asks instead.
  it('go when told to, whatever they say', () => {
    expect(withoutHeadings([['Year', 'Event'], ['1998', 'ESOP']], true)).toEqual([['1998', 'ESOP']]);
  });

  it('and each reader obeys the same tick', () => {
    expect(readMatch('Year,Event\n1998,ESOP', true).used).toBe(1);
    expect(readChoice('Option,Right\nWe do,yes', true).value.options).toEqual(['We do']);
    expect(readOptions('Heading\nFirst\nSecond', true).value).toEqual(['First', 'Second']);
  });
});

describe('a matching question', () => {
  it('reads one pair per row', () => {
    const { value, used, problems } = readMatch(
      'Left\tRight\n1998\tESOP formed\n2011\tFiber launch\n2024\tGigabit'
    );
    expect(used).toBe(3);
    expect(problems).toEqual([]);
    expect(value.left).toEqual(['1998', '2011', '2024']);
    expect(value.right).toEqual(['ESOP formed', 'Fiber launch', 'Gigabit']);
    expect(value.pairs).toEqual({ '1998': 'ESOP formed', '2011': 'Fiber launch', '2024': 'Gigabit' });
  });

  // Two things matching the same answer is a legal question, and the room
  // should be offered that answer once.
  it('offers a shared answer once, and still pairs both', () => {
    const { value } = readMatch('1998,Ownership\n2011,Ownership');
    expect(value.right).toEqual(['Ownership']);
    expect(value.pairs).toEqual({ '1998': 'Ownership', '2011': 'Ownership' });
  });

  it('says which row was half empty rather than importing half a pair', () => {
    const { used, problems } = readMatch('1998,ESOP formed\n2011,\n2024,Gigabit');
    expect(used).toBe(2);
    expect(problems).toEqual([{ line: 2, reason: 'needs both a thing to match and what it matches' }]);
  });

  it('and refuses to match one thing twice', () => {
    const { used, problems } = readMatch('1998,ESOP\n1998,Fiber');
    expect(used).toBe(1);
    expect(problems[0].reason).toMatch(/already matched/);
  });
});

describe('a multiple choice question', () => {
  it('takes the option and whether it is correct', () => {
    const { value, problems } = readChoice('We do,yes\nThe bank,\nA founder,no');
    expect(value.options).toEqual(['We do', 'The bank', 'A founder']);
    expect(value.correct).toEqual(['We do']);
    expect(problems).toEqual([]);
  });

  it('and more than one can be correct', () => {
    const { value } = readChoice('Retirement,x\nOwnership,TRUE\nFree parking,');
    expect(value.correct).toEqual(['Retirement', 'Ownership']);
  });

  // A list with nothing marked is worth importing: the editor still asks.
  it('a sheet of options alone imports with nothing marked', () => {
    const { value, used } = readChoice('Retirement\nOwnership\nTeam');
    expect(used).toBe(3);
    expect(value.correct).toEqual([]);
  });

  it('and a tick with no option beside it is reported', () => {
    const { problems } = readChoice('We do,yes\n,yes');
    expect(problems).toEqual([{ line: 2, reason: 'marked correct but has no option' }]);
  });
});

describe('a survey or ranking', () => {
  it('keeps the order they were listed in', () => {
    const { value, used } = readOptions('ESOP formed\nFiber launch\nGigabit');
    expect(value).toEqual(['ESOP formed', 'Fiber launch', 'Gigabit']);
    expect(used).toBe(3);
  });

  it('and says when one was listed twice', () => {
    const { value, problems } = readOptions('Team\nTeam');
    expect(value).toEqual(['Team']);
    expect(problems[0].reason).toMatch(/already in the list/);
  });
});

describe('what it says afterwards', () => {
  it('counts what it read', () => {
    expect(saySo(3, [], 'pair')).toBe('Read 3 pairs.');
    expect(saySo(1, [], 'option')).toBe('Read 1 option.');
  });

  // Never only the good news: an import that reports 8 of 11 and says nothing
  // about the other three has lost them.
  it('and names the first row it could not use, and how many more', () => {
    const said = saySo(8, [
      { line: 2, reason: 'needs both a thing to match and what it matches' },
      { line: 5, reason: 'x' },
      { line: 9, reason: 'y' },
    ], 'pair');
    expect(said).toMatch(/^Read 8 pairs\. Line 2 needs both/);
    expect(said).toMatch(/2 other rows could not be used/);
  });
});

describe('what counts as a yes', () => {
  it('is the things a spreadsheet puts in that column', () => {
    for (const yes of ['yes', 'Y', 'TRUE', '1', 'x', '✓', 'correct']) expect(saysYes(yes)).toBe(true);
  });

  it('and nothing else', () => {
    for (const no of ['', 'no', '0', '-', 'maybe']) expect(saysYes(no)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The templates
// ---------------------------------------------------------------------------
// A template handed out as correct and then refused by the reader is worse
// than none, so each is read back through the reader it is for.
describe('the sheet to start from', () => {
  it('a matching template reads back as its pairs', () => {
    const { value, used, problems } = readMatch(toCsv(TEMPLATES.match.rows), true);
    expect(problems).toEqual([]);
    expect(used).toBe(3);
    expect(value.left).toEqual(['1998', '2011', '2024']);
    expect(value.pairs['2024']).toBe('Gigabit everywhere');
  });

  it('a choice template reads back with its answer marked', () => {
    const { value, used, problems } = readChoice(toCsv(TEMPLATES.choice.rows), true);
    expect(problems).toEqual([]);
    expect(used).toBe(3);
    expect(value.correct).toEqual(['We do']);
  });

  it('an options template reads back in order', () => {
    const { value, problems } = readOptions(toCsv(TEMPLATES.options.rows), true);
    expect(problems).toEqual([]);
    expect(value).toEqual(['ESOP formed', 'Fiber launch', 'Gigabit everywhere']);
  });

  // Each carries a heading row, which is what the tick on the page is for.
  it('and each one leads with a heading row', () => {
    for (const t of Object.values(TEMPLATES)) {
      expect(t.rows.length).toBeGreaterThan(1);
      expect(t.file).toMatch(/\.csv$/);
    }
    expect(TEMPLATES.match.rows[0]).toEqual(['Item', 'Matches']);
  });
});

describe('writing a sheet back out', () => {
  it('quotes a cell holding a comma, and nothing that does not need it', () => {
    expect(toCsv([['plain', 'with, comma']])).toBe('plain,"with, comma"\r\n');
  });

  it('doubles a quote inside a cell, the way a spreadsheet reads it back', () => {
    expect(toCsv([['She said "yes"']])).toBe('"She said ""yes"""\r\n');
  });

  // What is written must be what the reader reads: the round trip is the
  // claim, not the punctuation.
  it('and whatever it writes, the reader reads', () => {
    const rows = [['Item', 'Matches'], ['a, with comma', 'b "quoted"'], ['c', 'd']];
    const { value, used } = readMatch(toCsv(rows), true);
    expect(used).toBe(2);
    expect(value.pairs['a, with comma']).toBe('b "quoted"');
  });
});
