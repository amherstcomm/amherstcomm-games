// A whole quiz in one workbook.
//
// The first tab is the questions, a row each. A question that needs a list --
// matching, multiple choice, survey, ranking -- names a tab, and that tab holds
// exactly the columns the per-question import already takes, so there is one
// description of "what a matching sheet looks like" and one reader behind it.
//
// Everything that can be wrong is reported with the tab and row it is on, and
// nothing is saved until the whole book has been read: half a quiz in a session
// is worse than none, because the half that arrived looks like the whole.
import { readChoice, readMatch, readOptions, type Problem } from '@/tableImport';
import { writeWorkbook, type Sheets } from '@/xlsx';

/** What a question row becomes: the arguments saveItem takes. */
export type QuizItem = {
  kind: string;
  prompt: string;
  payload: Record<string, unknown>;
  answer: Record<string, unknown> | null;
  /** for the report and the preview, not for the server */
  ref: string;
};

export type ReadQuiz = { items: QuizItem[]; problems: Problem[] };

/** The names on the first tab, as somebody writing the sheet would say them,
 *  mapped to what the database calls them. Spelled the way KIND_LABEL spells
 *  them on screen, and tolerant of the database's own word. */
const KINDS: Record<string, string> = {
  'multiple choice': 'choice',
  choice: 'choice',
  matching: 'match',
  match: 'match',
  survey: 'survey',
  ranking: 'rank',
  rank: 'rank',
  'closest guess': 'number',
  number: 'number',
  'open question': 'open',
  open: 'open',
};

/** Which kinds want a tab of their own, and what that tab holds. */
const NEEDS_TAB = new Set(['choice', 'match', 'survey', 'rank']);

const HEADINGS = ['ref', 'tab', 'kind', 'question', 'prompt', 'seconds', 'answer'];

/** A column index by any of its names, or -1. */
function columnFor(head: string[], ...names: string[]): number {
  const lower = head.map((h) => h.trim().toLowerCase());
  for (const name of names) {
    const at = lower.indexOf(name);
    if (at >= 0) return at;
  }
  return -1;
}

/** Read a whole quiz. The workbook's first tab is the questions whatever it is
 *  called; a tab named "Questions" is used if there is one, because a book that
 *  has been reordered should still work. */
export function readQuiz(sheets: Sheets): ReadQuiz {
  const names = Object.keys(sheets);
  const firstName = names.find((n) => n.trim().toLowerCase() === 'questions') ?? names[0];
  const problems: Problem[] = [];
  const items: QuizItem[] = [];

  if (!firstName) return { items, problems: [{ line: 0, reason: 'that workbook has no sheets' }] };

  const rows = sheets[firstName] ?? [];
  const head = rows[0] ?? [];
  const headed = head.some((c) => HEADINGS.includes(c.trim().toLowerCase()));
  const body = headed ? rows.slice(1) : rows;
  const at = {
    ref: headed ? columnFor(head, 'ref', 'tab') : 0,
    kind: headed ? columnFor(head, 'kind') : 1,
    prompt: headed ? columnFor(head, 'question', 'prompt') : 2,
    seconds: headed ? columnFor(head, 'seconds') : 3,
    answer: headed ? columnFor(head, 'answer') : 4,
  };
  // Without headings the columns are the template's own order, which is the
  // only assumption available and is said in the template's heading row.
  const cell = (row: string[], column: number) => (column >= 0 ? (row[column] ?? '') : '');

  body.forEach((row, i) => {
    // +1 for the row, +1 again when a heading row was dropped, so the number
    // is the one the sheet shows down its left edge.
    const line = i + 1 + (headed ? 1 : 0);
    const ref = cell(row, at.ref).trim();
    const kindSaid = cell(row, at.kind).trim();
    const prompt = cell(row, at.prompt).trim();
    if (!ref && !kindSaid && !prompt) return;

    const kind = KINDS[kindSaid.toLowerCase()];
    if (!kind) {
      problems.push({
        line,
        reason: kindSaid
          ? `does not name a kind this site has: "${kindSaid}"`
          : 'has no kind',
      });
      return;
    }
    if (!prompt) {
      problems.push({ line, reason: 'has no question' });
      return;
    }

    const seconds = Number(cell(row, at.seconds).trim());
    const timed = Number.isFinite(seconds) && seconds > 0 ? { seconds } : {};
    const answerSaid = cell(row, at.answer).trim();

    if (!NEEDS_TAB.has(kind)) {
      if (kind === 'number') {
        const value = Number(answerSaid.replace(/[, ]/g, ''));
        if (!answerSaid || !Number.isFinite(value)) {
          problems.push({ line, reason: 'is a closest guess with no number in its answer column' });
          return;
        }
        items.push({ ref: ref || prompt, kind, prompt, payload: { ...timed }, answer: { value } });
        return;
      }
      items.push({ ref: ref || prompt, kind, prompt, payload: { ...timed }, answer: null });
      return;
    }

    // A tab of its own, found by the name in the ref column.
    const tabName = names.find((n) => n.trim().toLowerCase() === ref.trim().toLowerCase());
    if (!ref) {
      problems.push({ line, reason: `is a ${kindSaid.toLowerCase()} question with no tab named in its Ref column` });
      return;
    }
    if (!tabName) {
      problems.push({ line, reason: `names a tab "${ref}" that is not in this workbook` });
      return;
    }
    const tab = sheets[tabName] ?? [];
    // The detail tabs carry the same headings the single-question imports
    // write, so they are read with the tick on rather than guessed at.
    const text = tab.map((r) => r.join('\t')).join('\n');
    const headedTab = looksHeaded(tab);

    if (kind === 'match') {
      const { value, used, problems: theirs } = readMatch(text, headedTab);
      problems.push(...theirs.map((p) => ({ ...p, reason: `on tab "${tabName}", line ${p.line} ${p.reason}` })));
      if (used < 2) {
        problems.push({ line, reason: `has fewer than two pairs on tab "${tabName}"` });
        return;
      }
      items.push({
        ref,
        kind,
        prompt,
        payload: { left: value.left, right: value.right, ...timed },
        answer: { pairs: value.pairs },
      });
      return;
    }

    if (kind === 'choice') {
      const { value, used, problems: theirs } = readChoice(text, headedTab);
      problems.push(...theirs.map((p) => ({ ...p, reason: `on tab "${tabName}", line ${p.line} ${p.reason}` })));
      if (used < 2) {
        problems.push({ line, reason: `has fewer than two options on tab "${tabName}"` });
        return;
      }
      if (value.correct.length === 0) {
        problems.push({ line, reason: `has nothing marked correct on tab "${tabName}"` });
        return;
      }
      items.push({
        ref,
        kind,
        prompt,
        payload: { options: value.options, multi: value.correct.length > 1, ...timed },
        answer: { correct: value.correct },
      });
      return;
    }

    const { value, used, problems: theirs } = readOptions(text, headedTab);
    problems.push(...theirs.map((p) => ({ ...p, reason: `on tab "${tabName}", line ${p.line} ${p.reason}` })));
    if (used < 2) {
      problems.push({ line, reason: `has fewer than two options on tab "${tabName}"` });
      return;
    }
    items.push({
      ref,
      kind,
      prompt,
      payload: { options: value, ...timed },
      // A ranking's answer is the order they were listed in; a survey has none.
      answer: kind === 'rank' ? { order: value } : null,
    });
  });

  return { items, problems };
}

/** Whether a detail tab leads with a heading row. The single-question imports
 *  ask the person; a workbook cannot, so it guesses -- and the template writes
 *  headings this recognises, which is why the template matters. */
function looksHeaded(rows: string[][]): boolean {
  const head = rows[0] ?? [];
  const known = ['item', 'matches', 'option', 'correct', 'answer', 'order', 'text'];
  return head.length > 0 && head.every((c) => known.includes(c.trim().toLowerCase()));
}

/** What the page says after reading one. Never only the good news -- the same
 *  rule the single-question imports follow. */
export function sayQuiz(items: QuizItem[], problems: Problem[]): string {
  const got = `${items.length} question${items.length === 1 ? '' : 's'}`;
  if (problems.length === 0) return `Read ${got}.`;
  const first = problems[0];
  const rest = problems.length - 1;
  const where = first.line > 0 ? `Row ${first.line} ` : '';
  return (
    `Read ${got}. ${where}${first.reason}` +
    (rest > 0 ? `, and ${rest} other problem${rest === 1 ? '' : 's'}.` : '.')
  );
}

/** The workbook to start from: one question of every kind, and a tab for each
 *  that needs one. Written from the same shapes readQuiz reads, and read back
 *  through it in the tests. */
export const QUIZ_TEMPLATE: { file: string; sheets: Sheets } = {
  file: 'quiz-template.xlsx',
  sheets: {
    Questions: [
      ['Ref', 'Kind', 'Question', 'Seconds', 'Answer'],
      ['Q1', 'Multiple choice', 'Who owns this company?', '20', ''],
      ['Q2', 'Matching', 'Match the year to what happened', '45', ''],
      ['Q3', 'Ranking', 'Put these in the order they happened', '30', ''],
      ['Q4', 'Survey', 'Which of these matters most to you?', '15', ''],
      ['Q5', 'Closest guess', 'How many miles of fiber do we run?', '20', '1350'],
      ['Q6', 'Open question', 'What should we do more of next year?', '', ''],
    ],
    Q1: [
      ['Option', 'Correct'],
      ['We do', 'yes'],
      ['The bank', ''],
      ['A founder', ''],
    ],
    Q2: [
      ['Item', 'Matches'],
      ['1998', 'ESOP formed'],
      ['2011', 'Fiber launch'],
      ['2024', 'Gigabit everywhere'],
    ],
    Q3: [['Option'], ['ESOP formed'], ['Fiber launch'], ['Gigabit everywhere']],
    Q4: [['Option'], ['Retirement'], ['Flexibility'], ['The team']],
  },
};

export const quizTemplateBytes = () => writeWorkbook(QUIZ_TEMPLATE.sheets);
