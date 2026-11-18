import { describe, expect, it } from 'vitest';
import {
  asCompare,
  blankCompare,
  compareProblem,
  letter,
  monthsLabel,
  nextId,
  rowDiffers,
  type ComparePayload,
} from '@/compare';

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
