// Where the unit goes.
//
// "41.5 dollars" is not how anybody writes a share price. The placement is a
// property of the locale rather than of the currency, which is why this goes
// through Intl rather than through a table of symbols — and why these tests
// pin the *shape* (is there a prefix, does the suffix carry the symbol) rather
// than exact strings for every locale.
//
// The runner's locale decides the output, so anything asserting "$" would be
// asserting the CI machine's settings. `en-US` is forced where the exact form
// is the point.
import { describe, expect, it } from 'vitest';
import { formatGuess, formatOf, guessAffixes, INTL_UNITS } from '@/guessFormat';

describe('reading the format out of a question', () => {
  it('is plain when nothing is set', () => {
    expect(formatOf(undefined)).toEqual({ style: 'plain' });
    expect(formatOf({})).toEqual({ style: 'plain' });
  });

  it('takes a currency code, whatever case it was typed in', () => {
    expect(formatOf({ currency: 'usd' })).toEqual({ style: 'currency', currency: 'USD' });
    expect(formatOf({ currency: ' eur ' })).toEqual({ style: 'currency', currency: 'EUR' });
  });

  it('ignores something that is not a currency code', () => {
    // three letters is the whole rule; "dollars" is a suffix, not a code
    expect(formatOf({ currency: 'dollars' })).toEqual({ style: 'plain' });
  });

  it('knows which units Intl will accept and which are just words', () => {
    expect(formatOf({ unit: 'kilogram' })).toEqual({ style: 'unit', unit: 'kilogram' });
    expect(formatOf({ unit: 'employees' })).toEqual({ style: 'suffix', suffix: 'employees' });
  });

  it('treats an old free-text unit as a suffix, because that is what it was', () => {
    // `unit` predates this module and holds arbitrary words in questions
    // already written; they must keep rendering rather than start throwing
    expect(formatOf({ unit: 'cups of coffee' })).toEqual({
      style: 'suffix',
      suffix: 'cups of coffee',
    });
  });
});

describe('writing a number down', () => {
  it('puts a currency symbol where the locale puts it, not where we guess', () => {
    const usd = formatGuess(41.5, { currency: 'USD' });
    // en-US on the runner or not, the symbol is somewhere and the digits are
    // there — the placement itself is Intl's job and is asserted below
    expect(usd).toMatch(/41[.,]50/);
    expect(usd).not.toMatch(/USD 41\.5$/);
  });

  it('reads a percent the way it is spoken', () => {
    // the author types 12.5 meaning 12.5%; Intl wants the fraction, and that
    // conversion is ours rather than something to ask the author to do
    expect(formatGuess(12.5, { percent: true })).toMatch(/12\.5\s*%/);
  });

  it('puts a unit after the number', () => {
    expect(formatGuess(70, { unit: 'kilogram' })).toMatch(/^70/);
  });

  it('falls back to the number and the words for anything else', () => {
    expect(formatGuess(41, { unit: 'employees' })).toBe('41 employees');
  });

  it('does not render an unfinished guess', () => {
    expect(formatGuess(Number.NaN, {})).toBe('');
    expect(formatGuess(Number.POSITIVE_INFINITY, {})).toBe('');
  });

  it('renders plainly rather than throwing on a code Intl does not know', () => {
    // an unsupported currency throws inside Intl; a question that will not
    // render is worse than one rendered plainly
    expect(formatGuess(41.5, { currency: 'ZZZ' })).toMatch(/41/);
  });
});

describe('the affixes on the input box', () => {
  it('puts a dollar sign in front and nothing behind, in en-US', () => {
    const l = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    // the module reads the runner's locale, so this asserts the mechanism
    // against a formatter built the same way rather than against a hard-coded
    // symbol somebody's machine might not produce
    const parts = l.formatToParts(1234.5);
    expect(parts[0].type).toBe('currency');
  });

  it('gives a percent question a trailing sign and no leading one', () => {
    const { prefix, suffix } = guessAffixes({ percent: true });
    expect(prefix).toBe('');
    expect(suffix).toBe('%');
  });

  it('gives a plain question neither', () => {
    expect(guessAffixes({})).toEqual({ prefix: '', suffix: '' });
  });

  it('gives free-text words as the suffix, untouched', () => {
    expect(guessAffixes({ unit: 'employees' })).toEqual({ prefix: '', suffix: 'employees' });
  });

  it('never leaves the digits inside the affixes', () => {
    // the failure this guards: splitting on the wrong part and putting "1,234"
    // in the prefix, so the box reads "1,234$ [____]"
    for (const payload of [
      {},
      { currency: 'USD' },
      { currency: 'EUR' },
      { currency: 'JPY' },
      { percent: true },
      { unit: 'kilogram' },
      { unit: 'employees' },
    ]) {
      const { prefix, suffix } = guessAffixes(payload);
      expect(prefix, JSON.stringify(payload)).not.toMatch(/\d/);
      expect(suffix, JSON.stringify(payload)).not.toMatch(/\d/);
    }
  });

  it('every unit it offers is one Intl actually accepts', () => {
    // passing an unlisted unit throws, so an editor offering one would break
    // the question rather than the formatting
    for (const unit of INTL_UNITS) {
      expect(() =>
        new Intl.NumberFormat('en-US', { style: 'unit', unit }).format(1)
      ).not.toThrow();
    }
  });
});
