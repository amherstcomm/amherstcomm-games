import { describe, expect, it } from 'vitest';
import {
  asCompare,
  blankCompare,
  compareProblem,
  letter,
  monthsLabel,
  moveItem,
  nextId,
  parseCompareSheet,
  rowDiffers,
  type ComparePayload,
} from '@/compare';

describe('moving an option or a row', () => {
  it('swaps it with its neighbour', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
  });

  it('goes nowhere off either end', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('a table pasted from a spreadsheet', () => {
  // what Excel and Google Sheets put on the clipboard: tabs between cells,
  // a line per row, and Windows line endings from Excel
  const SHEET = '\tBi-weekly\tSemi-monthly\r\nPaychecks a year\t26\t24\r\nWhen you are paid\tEvery other Friday\tThe 15th and the last day\r\n';

  it('takes the options from the first line and the rows from the rest', () => {
    const got = parseCompareSheet(SHEET);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.options.map((o) => o.name)).toEqual(['Bi-weekly', 'Semi-monthly']);
    expect(got.rows).toEqual([
      { id: 'r1', label: 'Paychecks a year', kind: 'text', values: { a: '26', b: '24' }, differs: 'auto' },
      { id: 'r2', label: 'When you are paid', kind: 'text',
        values: { a: 'Every other Friday', b: 'The 15th and the last day' }, differs: 'auto' },
    ]);
  });

  it('accepts a label in the corner cell', () => {
    const got = parseCompareSheet('Pay schedule\tA\tB\nPaychecks\t26\t24');
    expect(got.ok && got.options.map((o) => o.name)).toEqual(['A', 'B']);
  });

  it('says what is wrong rather than guessing', () => {
    expect(parseCompareSheet('Bi-weekly, Semi-monthly\n26, 24')).toEqual({
      ok: false, reason: 'Cells need tabs between them: copy them straight from the spreadsheet.',
    });
    expect(parseCompareSheet('\tOnly one\nRow\t1')).toMatchObject({ ok: false });
    expect(parseCompareSheet('\tA\tB\n\t1\t2')).toEqual({ ok: false, reason: 'Row 2 has no label in its first cell.' });
    expect(parseCompareSheet('\tA\tB')).toMatchObject({ ok: false });
  });
});

describe('a row of pictures', () => {
  it('needs one in the bucket for each option', () => {
    const uid = '54000000-0000-0000-0000-000000000001';
    const base: ComparePayload = {
      options: [{ id: 'a', name: 'Plan A' }, { id: 'b', name: 'Plan B' }],
      rows: [{ id: 'r1', label: 'Floor plan', kind: 'image', values: { a: `${uid}/a.jpg`, b: `${uid}/b.png` } }],
      allowNoPreference: false, askWhy: false, markDifferences: true, shuffleOptions: false,
    };
    expect(compareProblem(base)).toBeNull();
    expect(compareProblem({ ...base, rows: [{ ...base.rows[0], values: { a: `${uid}/a.jpg`, b: '' } }] }))
      .toBe('Row "Floor plan" needs a picture for each option.');
  });
});

const PAY: ComparePayload = {
  options: [
    { id: 'a', name: 'Bi-weekly', subtitle: 'Every other Friday' },
    { id: 'b', name: 'Semi-monthly', subtitle: 'Twice a month' },
  ],
  rows: [
    { id: 'r1', label: 'Paychecks a year', kind: 'text', values: { a: '26', b: '24' }, differs: 'auto' },
    { id: 'r2', label: 'Your pay for the year', kind: 'text', values: { a: 'Same', b: ' same ' } },
    {
      id: 'r3',
      label: 'Paydays across a year',
      kind: 'months',
      values: { a: [2, 2, 3, 2, 2, 2, 2, 3, 2, 2, 2, 2], b: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] },
    },
  ],
  allowNoPreference: true,
  askWhy: true,
  markDifferences: true,
  shuffleOptions: false,
};

describe('whether a row differs', () => {
  it('compares text as a reader would: trimmed, any case', () => {
    expect(rowDiffers(PAY.rows[0], PAY.options)).toBe(true);
    expect(rowDiffers(PAY.rows[1], PAY.options)).toBe(false);
  });

  it('compares a year of months month by month', () => {
    expect(rowDiffers(PAY.rows[2], PAY.options)).toBe(true);
    const flat = { ...PAY.rows[2], values: { a: Array(12).fill(2), b: Array(12).fill(2) } };
    expect(rowDiffers(flat, PAY.options)).toBe(false);
  });

  it('lets the author say so either way', () => {
    expect(rowDiffers({ ...PAY.rows[1], differs: 'yes' }, PAY.options)).toBe(true);
    expect(rowDiffers({ ...PAY.rows[0], differs: 'no' }, PAY.options)).toBe(false);
  });
});

describe('what is wrong with a comparison', () => {
  it('nothing, for the pay-schedule question', () => {
    expect(compareProblem(PAY)).toBeNull();
  });

  it('says the same words as the server', () => {
    // compare_payload_problem() in schema.sql; supabase/tests/compare.sql pins
    // its side of these
    expect(compareProblem({ ...PAY, options: PAY.options.slice(0, 1) })).toBe('A comparison needs two to four options.');
    expect(compareProblem({ ...PAY, rows: [] })).toBe('A comparison needs one to fifteen rows.');
    expect(compareProblem({ ...PAY, options: [PAY.options[0], { id: 'none', name: 'X' }] }))
      .toBe('Each option needs an id of its own.');
    expect(compareProblem({ ...PAY, rows: [{ ...PAY.rows[0], values: { a: '26' } }] }))
      .toBe('Row "Paychecks a year" needs a value for each option, 300 characters at most.');
    expect(compareProblem({ ...PAY, rows: [{ ...PAY.rows[2], values: { a: [2, 2], b: Array(12).fill(2) } }] }))
      .toBe('Row "Paydays across a year" needs twelve whole numbers, 0 to 9, for each option.');
  });

  it('a blank one needs its names filled in before it can be saved', () => {
    expect(compareProblem(blankCompare())).toBe('Every option needs a name.');
  });
});

describe('the small things', () => {
  it('letters options by where they are shown', () => {
    expect([0, 1, 2, 3].map(letter)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('says a year of paydays in words, for a screen reader', () => {
    expect(monthsLabel([2, 2, 3, 2, 2, 2, 2, 3, 2, 2, 2, 2])).toMatch(/^2 in January, 2 in February, 3 in March/);
  });

  it('finds the next free id', () => {
    expect(nextId(['a', 'b'], 'option')).toBe('c');
    expect(nextId(['r1', 'r3'], 'row')).toBe('r2');
  });

  it('opens a half-written payload rather than throwing', () => {
    const p = asCompare({ options: PAY.options });
    expect(p.options).toEqual(PAY.options);
    expect(p.rows.length).toBe(1);
    expect(p.allowNoPreference).toBe(true);
  });
});
