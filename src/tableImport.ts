// Filling one question's options from a spreadsheet.
//
// Not an import of a whole quiz: one question at a time, into the boxes the
// editor already has, because that is where the typing hurts. A matching
// question is twenty cells of left, right and which goes with which, and
// retyping it out of the sheet somebody already wrote is the part that stops
// it happening.
//
// Two shapes of input, one parser. A .csv saved out of Excel is comma
// separated; a block of cells copied out of Excel or Sheets is *tab*
// separated, and arrives that way on the clipboard with no file involved. A
// reader that only knew commas would take a pasted block and make one column
// of it, silently, which is the failure this whole module is built to avoid:
// every row it cannot use comes back with its line number and a reason.
//
// Same rule as src/importing.ts, for the same reason: an import that says
// "8 rows" when eleven were pasted has lost three and said nothing.

export type Problem = { line: number; reason: string };
export type Read<T> = { value: T; used: number; problems: Problem[] };

/** Which character separates the cells. Counted outside quotes, most-common
 *  wins: a tab-separated paste holding a comma in a cell must not be read as
 *  comma separated.
 *
 *  Over the whole text rather than the first line, which is what this read at
 *  first: a sheet whose opening cell is quoted and holds a newline opens its
 *  quote on line one and closes it on line two, so line one had no delimiter
 *  outside quotes at all and the whole paste came back as one column. Found by
 *  the test for exactly that cell. */
export function delimiterOf(text: string): string {
  let quoted = false;
  const counts: Record<string, number> = { '\t': 0, ',': 0, ';': 0 };
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch] += 1;
  }
  const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return best && best[1] > 0 ? best[0] : '\t';
}

/** Rows of cells. Quoted fields may hold the delimiter, newlines, and `""` for
 *  a literal quote -- which is what a spreadsheet writes when a cell contains
 *  one, so a reader that does not understand it mangles ordinary text. */
export function parseTable(text: string, delimiter = delimiterOf(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/\r\n?/g, '\n');

  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    // A trailing delimiter, or a blank line, is not a row of data.
    if (row.some((c) => c !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) endCell();
    else if (ch === '\n') endRow();
    else cell += ch;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/** Words a spreadsheet's first row uses for headings rather than data. Matched
 *  on the whole cell, so an option legitimately called "Answer" in a quiz
 *  about forms is only dropped when the row beside it looks like headings too. */
const HEADINGS = new Set([
  'option',
  'options',
  'answer',
  'answers',
  'correct',
  'right',
  'left',
  'item',
  'items',
  'pair',
  'pairs',
  'match',
  'matches',
  'value',
  'text',
  'prompt',
  'question',
  'order',
  'rank',
]);

/** Drop a heading row, if that is what the first one is -- or if the person
 *  importing says it is, which is the only reliable way to know.
 *
 *  Guessing only catches the words a sheet is likely to use for a heading, and
 *  a real one says "Year" over "Event". Those cannot be told from data by any
 *  rule that is also safe, so the page offers a tick instead and this obeys it.
 *  Found by the test that pasted exactly that sheet. */
export function withoutHeadings(rows: string[][], skipFirst = false): string[][] {
  const first = rows[0];
  if (!first || rows.length < 2) return rows;
  if (skipFirst) return rows.slice(1);
  const words = first.filter((c) => c !== '');
  if (words.length > 0 && words.every((c) => HEADINGS.has(c.toLowerCase()))) return rows.slice(1);
  return rows;
}

/** What a spreadsheet puts in a "correct" column. Anything else is not a yes:
 *  a blank, a dash, or the word "no" all mean the same thing. */
const YES = new Set(['yes', 'y', 'true', 't', '1', 'x', '✓', '✔', 'correct']);
export const saysYes = (cell: string) => YES.has(cell.trim().toLowerCase());

/** One row per pair: what is being matched, and what it matches.
 *
 *  The right-hand column keeps its order and its duplicates collapse -- two
 *  years sharing an event is a legal question, and the room should be offered
 *  that event once. */
export function readMatch(
  text: string,
  skipFirst = false
): Read<{ left: string[]; right: string[]; pairs: Record<string, string> }> {
  const rows = withoutHeadings(parseTable(text), skipFirst);
  const left: string[] = [];
  const right: string[] = [];
  const pairs: Record<string, string> = {};
  const problems: Problem[] = [];

  rows.forEach((row, i) => {
    const line = i + 1;
    const [l, r] = [row[0] ?? '', row[1] ?? ''];
    if (l === '' && r === '') return;
    if (l === '' || r === '') {
      problems.push({ line, reason: 'needs both a thing to match and what it matches' });
      return;
    }
    if (left.includes(l)) {
      problems.push({ line, reason: `"${l}" is already matched, further up` });
      return;
    }
    left.push(l);
    if (!right.includes(r)) right.push(r);
    pairs[l] = r;
  });

  return { value: { left, right, pairs }, used: left.length, problems };
}

/** One row per option, with a second column saying which are correct. A sheet
 *  with one column is a list of options and no answer marked, which is a
 *  legal thing to import -- the editor still asks which is right. */
export function readChoice(
  text: string,
  skipFirst = false
): Read<{ options: string[]; correct: string[] }> {
  const rows = withoutHeadings(parseTable(text), skipFirst);
  const options: string[] = [];
  const correct: string[] = [];
  const problems: Problem[] = [];

  rows.forEach((row, i) => {
    const line = i + 1;
    const option = row[0] ?? '';
    if (option === '') {
      if ((row[1] ?? '') !== '') problems.push({ line, reason: 'marked correct but has no option' });
      return;
    }
    if (options.includes(option)) {
      problems.push({ line, reason: `"${option}" is already an option` });
      return;
    }
    options.push(option);
    if (saysYes(row[1] ?? '')) correct.push(option);
  });

  return { value: { options, correct }, used: options.length, problems };
}

/** One column, in the order they should be listed -- which for a ranking is
 *  the right order, and for a survey is just the order. */
export function readOptions(text: string, skipFirst = false): Read<string[]> {
  const rows = withoutHeadings(parseTable(text), skipFirst);
  const options: string[] = [];
  const problems: Problem[] = [];

  rows.forEach((row, i) => {
    const line = i + 1;
    const option = row[0] ?? '';
    if (option === '') return;
    if (options.includes(option)) {
      problems.push({ line, reason: `"${option}" is already in the list` });
      return;
    }
    options.push(option);
  });

  return { value: options, used: options.length, problems };
}

/** What the page says afterwards. Never only the good news. */
export function saySo(used: number, problems: Problem[], noun: string): string {
  const got = `${used} ${noun}${used === 1 ? '' : 's'}`;
  if (problems.length === 0) return `Read ${got}.`;
  const first = problems[0];
  const rest = problems.length - 1;
  return (
    `Read ${got}. Line ${first.line} ${first.reason}` +
    (rest > 0 ? `, and ${rest} other row${rest === 1 ? '' : 's'} could not be used.` : '.')
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
//
// A sheet to start from, so the columns are demonstrated rather than described.
// One definition per kind, and the same rows are shown on screen and written to
// the file -- a template that drifts from what the reader accepts is worse than
// none, because it is handed out as correct. tests/unit/tableImport.test.ts
// reads each one back through its own reader and checks what comes out.
//
// Each carries its heading row, which is what the "first row is a heading" tick
// is for. The example rows are real sentences from this company rather than
// foo/bar: somebody looking at the file has to see what belongs in the cells.

export type Template = { file: string; rows: string[][] };

export const TEMPLATES: Record<'match' | 'choice' | 'options', Template> = {
  match: {
    file: 'matching-template.csv',
    rows: [
      ['Item', 'Matches'],
      ['1998', 'ESOP formed'],
      ['2011', 'Fiber launch'],
      ['2024', 'Gigabit everywhere'],
    ],
  },
  choice: {
    file: 'multiple-choice-template.csv',
    rows: [
      ['Option', 'Correct'],
      ['We do', 'yes'],
      ['The bank', ''],
      ['A founder', ''],
    ],
  },
  options: {
    file: 'options-template.csv',
    rows: [['Option'], ['ESOP formed'], ['Fiber launch'], ['Gigabit everywhere']],
  },
};

/** Rows as a spreadsheet would read them back. Quoted where a cell holds the
 *  delimiter, a quote or a newline -- the three that would otherwise turn one
 *  cell into two, or one row into two. */
export function toCsv(rows: string[][]): string {
  const cell = (c: string) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  // A trailing newline: some spreadsheets drop the last row without one.
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** The same rows as they look in a sheet, for showing on screen. Tabs, because
 *  that is what a copied block looks like and the columns line up. */
export const asExample = (rows: string[][]) => rows.map((row) => row.join('\t')).join('\n');
