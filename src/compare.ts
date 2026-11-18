// A comparison: options side by side, the things to weigh as rows, one picked
// (November 2026; first use, bi-weekly or semi-monthly pay).
//
// The rules the editor, the question and the tests share. The server checks
// the same shape in compare_payload_problem() and says the same words, so an
// author is never told one thing here and another on save.

export type CompareOption = { id: string; name: string; subtitle?: string };
export type TextRow = {
  id: string;
  label: string;
  kind: 'text';
  values: Record<string, string>;
  differs?: 'auto' | 'yes' | 'no';
  note?: string;
};
export type MonthsRow = {
  id: string;
  label: string;
  kind: 'months';
  /** twelve counts per option, January first */
  values: Record<string, number[]>;
  differs?: 'auto' | 'yes' | 'no';
  note?: string;
};
export type CompareRow = TextRow | MonthsRow;
export type ComparePayload = {
  options: CompareOption[];
  rows: CompareRow[];
  allowNoPreference: boolean;
  askWhy: boolean;
  markDifferences: boolean;
  shuffleOptions: boolean;
};
export type CompareAnswer = { pick: string; why: string | null };

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MAX_ROWS = 15;
export const MAX_WHY = 1000;
export const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/** "OPTION A", "OPTION B": by where it is shown, so a shuffled order still
 *  reads A, B, C left to right. */
export const letter = (i: number) => String.fromCharCode(65 + i);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether a row's options are not the same. `auto` compares the values as a
 *  reader would -- trimmed, any case -- and the author can say yes or no. */
export function rowDiffers(row: CompareRow, options: CompareOption[]): boolean {
  if (row.differs === 'yes') return true;
  if (row.differs === 'no') return false;
  const vals = options.map((o) => row.values[o.id]);
  if (vals.length < 2) return false;
  if (row.kind === 'months') {
    const key = (v: unknown) => JSON.stringify(Array.isArray(v) ? v : []);
    return vals.some((v) => key(v) !== key(vals[0]));
  }
  return vals.some((v) => !same(String(v ?? ''), String(vals[0] ?? '')));
}

/** "2 paydays in January, 2 in February, 3 in March..." -- what the dot strip
 *  says to somebody who cannot see it. */
export function monthsLabel(counts: number[]): string {
  return counts
    .map((n, i) => `${n} in ${MONTH_NAMES[i]}`)
    .join(', ');
}

/** What is wrong with a comparison, in the server's words, or null. */
export function compareProblem(p: ComparePayload): string | null {
  const { options, rows } = p;
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) return 'A comparison needs two to four options.';
  const ids = options.map((o) => o.id);
  if (ids.some((id) => !id.trim() || id === 'none') || new Set(ids).size !== ids.length)
    return 'Each option needs an id of its own.';
  if (options.some((o) => !o.name.trim())) return 'Every option needs a name.';
  if (options.some((o) => o.name.length > 60 || (o.subtitle ?? '').length > 80))
    return 'Option names are 60 characters at most, and subtitles 80.';
  if (rows.length < 1 || rows.length > MAX_ROWS) return 'A comparison needs one to fifteen rows.';
  for (const r of rows) {
    if (!r.label.trim()) return 'Every row needs a label.';
    if (r.label.length > 80) return 'Row labels are 80 characters at most.';
    for (const id of ids) {
      if (r.kind === 'text') {
        const v = r.values[id];
        if (typeof v !== 'string' || v.length > 300)
          return `Row "${r.label}" needs a value for each option, 300 characters at most.`;
      } else {
        const v = r.values[id];
        if (!Array.isArray(v) || v.length !== 12 || v.some((n) => !Number.isInteger(n) || n < 0 || n > 9))
          return `Row "${r.label}" needs twelve whole numbers, 0 to 9, for each option.`;
      }
    }
  }
  return null;
}

/** A fresh one, for the editor: two options, one row, the switches the spec
 *  turns on. */
export function blankCompare(): ComparePayload {
  return {
    options: [
      { id: 'a', name: '', subtitle: '' },
      { id: 'b', name: '', subtitle: '' },
    ],
    rows: [{ id: 'r1', label: '', kind: 'text', values: { a: '', b: '' }, differs: 'auto' }],
    allowNoPreference: true,
    askWhy: true,
    markDifferences: true,
    shuffleOptions: false,
  };
}

/** What a stored payload says, with anything missing filled in -- an item saved
 *  by an older build, or by hand, should open in the editor rather than throw. */
export function asCompare(raw: unknown): ComparePayload {
  const p = (raw ?? {}) as Partial<ComparePayload>;
  const blank = blankCompare();
  return {
    options: Array.isArray(p.options) && p.options.length > 0 ? p.options : blank.options,
    rows: Array.isArray(p.rows) && p.rows.length > 0 ? p.rows : blank.rows,
    allowNoPreference: p.allowNoPreference ?? blank.allowNoPreference,
    askWhy: p.askWhy ?? blank.askWhy,
    markDifferences: p.markDifferences ?? blank.markDifferences,
    shuffleOptions: p.shuffleOptions ?? blank.shuffleOptions,
  };
}

/** An id not yet used among these: a, b, c, d for options; r1, r2 for rows. */
export function nextId(taken: string[], prefix: 'option' | 'row'): string {
  if (prefix === 'option') {
    for (const c of 'abcdefghij') if (!taken.includes(c)) return c;
  }
  for (let n = 1; ; n++) if (!taken.includes(`r${n}`)) return `r${n}`;
}
