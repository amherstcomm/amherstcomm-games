// Where the unit goes.
//
// "41.5 dollars" is not how anybody writes a share price, and "$" belongs in
// front while "%" and "kg" belong behind — and which side a currency symbol
// takes is a property of the locale, not of the currency. That is a solved
// problem and the solution ships in the browser: Intl.NumberFormat knows the
// placement, the grouping and the decimal digits for every currency and for a
// fixed list of units, and formatToParts hands back where each piece went.
//
// So no dependency. What is here is the small amount of glue: reading a
// question's payload into a formatter, and splitting a formatted sample so the
// input box can wear the same affixes the answer will.
import type { NumberPayload } from '@/authoring';

/** How a guessing question is written down. Stored in `payload`, so the room
 *  gets it with the question — the affixes are part of what is being asked. */
export type GuessFormat =
  | { style: 'plain' }
  | { style: 'currency'; currency: string }
  | { style: 'percent' }
  | { style: 'unit'; unit: string }
  /** anything Intl does not know — "employees", "cups of coffee" */
  | { style: 'suffix'; suffix: string };

/** The units Intl actually supports are a fixed list, and passing one outside
 *  it throws. These are the ones an internal quiz plausibly asks about; the
 *  rest of the world goes through `suffix`. */
export const INTL_UNITS = [
  'day',
  'foot',
  'gigabyte',
  'hour',
  'inch',
  'kilogram',
  'kilometer',
  'liter',
  'megabyte',
  'meter',
  'mile',
  'minute',
  'month',
  'pound',
  'second',
  'terabyte',
  'week',
  'year',
] as const;

/** Read a payload into a format. Tolerant on purpose: `unit` predates this and
 *  older questions carry a free string in it, which is still a suffix. */
export function formatOf(payload: NumberPayload | undefined): GuessFormat {
  const currency = payload?.currency?.trim().toUpperCase();
  if (currency && /^[A-Z]{3}$/.test(currency)) return { style: 'currency', currency };
  if (payload?.percent) return { style: 'percent' };
  const unit = payload?.unit?.trim();
  if (!unit) return { style: 'plain' };
  if ((INTL_UNITS as readonly string[]).includes(unit)) return { style: 'unit', unit };
  return { style: 'suffix', suffix: unit };
}

function formatter(format: GuessFormat): Intl.NumberFormat | null {
  try {
    switch (format.style) {
      case 'currency':
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: format.currency,
        });
      case 'percent':
        return new Intl.NumberFormat(undefined, {
          style: 'percent',
          maximumFractionDigits: 2,
        });
      case 'unit':
        return new Intl.NumberFormat(undefined, {
          style: 'unit',
          unit: format.unit,
          unitDisplay: 'short',
        });
      case 'plain':
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
      default:
        return null;
    }
  } catch {
    // An unsupported currency code or unit throws rather than degrading, and a
    // question that will not render is worse than one rendered plainly.
    return null;
  }
}

/** A number as the question writes it. */
export function formatGuess(value: number, payload: NumberPayload | undefined): string {
  if (!Number.isFinite(value)) return '';
  const format = formatOf(payload);
  // Percent is stored the way it is spoken: 12.5 means 12.5%, not 1250%. Intl
  // wants the fraction, so the conversion happens here rather than asking the
  // author to type 0.125 and hoping.
  const n = format.style === 'percent' ? value / 100 : value;
  const fmt = formatter(format);
  if (!fmt) return format.style === 'suffix' ? `${value} ${format.suffix}` : String(value);
  return fmt.format(n);
}

/** What to print either side of the input box, so somebody typing a guess is
 *  looking at the same thing the answer will be shown in.
 *
 *  Taken from formatToParts rather than from a table of symbols: the point of
 *  using Intl at all is that it knows "$1,234.50" and "1 234,50 €" are the same
 *  request answered in two locales. */
export function guessAffixes(payload: NumberPayload | undefined): {
  prefix: string;
  suffix: string;
} {
  const format = formatOf(payload);
  if (format.style === 'suffix') return { prefix: '', suffix: format.suffix };
  const fmt = formatter(format);
  if (!fmt) return { prefix: '', suffix: '' };
  const parts = fmt.formatToParts(1234.5);
  const numeric = new Set(['integer', 'group', 'decimal', 'fraction', 'minusSign', 'plusSign']);
  const first = parts.findIndex((p) => numeric.has(p.type));
  const last = parts.length - 1 - [...parts].reverse().findIndex((p) => numeric.has(p.type));
  if (first < 0) return { prefix: '', suffix: '' };
  return {
    prefix: parts
      .slice(0, first)
      .map((p) => p.value)
      .join('')
      .trim(),
    suffix: parts
      .slice(last + 1)
      .map((p) => p.value)
      .join('')
      .trim(),
  };
}
