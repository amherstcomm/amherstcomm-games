// A whole quiz read out of one workbook.
//
// The template is read back through the reader it is for, because a template
// handed out as correct and then refused is worse than none. The rest is the
// ways a real sheet is wrong: a kind nobody recognises, a tab that is not
// there, a question with nothing marked correct.
import { describe, expect, it } from 'vitest';
import { QUIZ_TEMPLATE, readQuiz, sayQuiz, quizTemplateBytes } from '@/quizWorkbook';
import { readWorkbook } from '@/xlsx';

describe('the quiz template', () => {
  it('reads back as one question of every kind', async () => {
    const { items, problems } = readQuiz(await readWorkbook(quizTemplateBytes()));
    expect(problems).toEqual([]);
    expect(items.map((i) => i.kind)).toEqual(['choice', 'match', 'rank', 'survey', 'number', 'open']);
  });

  it('with the options, pairs and answers its tabs hold', async () => {
    const { items } = readQuiz(await readWorkbook(quizTemplateBytes()));
    const by = (kind: string) => items.find((i) => i.kind === kind)!;

    expect(by('choice').payload).toMatchObject({ options: ['We do', 'The bank', 'A founder'] });
    expect(by('choice').answer).toEqual({ correct: ['We do'] });
    expect(by('match').payload).toMatchObject({ left: ['1998', '2011', '2024'] });
    expect((by('match').answer as { pairs: Record<string, string> }).pairs['2024']).toBe(
      'Gigabit everywhere'
    );
    // A ranking's answer is the order the sheet listed them in.
    expect(by('rank').answer).toEqual({ order: ['ESOP formed', 'Fiber launch', 'Gigabit everywhere'] });
    // A survey has no right answer, and must not be given one.
    expect(by('survey').answer).toBeNull();
    expect(by('number').answer).toEqual({ value: 1350 });
    expect(by('open').answer).toBeNull();
  });

  it('and carries the seconds each question was given', async () => {
    const { items } = readQuiz(await readWorkbook(quizTemplateBytes()));
    expect(items.find((i) => i.kind === 'choice')!.payload).toMatchObject({ seconds: 20 });
    // Blank seconds is no clock, not zero.
    expect(items.find((i) => i.kind === 'open')!.payload).toEqual({});
  });

  it('is named as a workbook', () => {
    expect(QUIZ_TEMPLATE.file).toMatch(/\.xlsx$/);
  });
});

describe('reading a quiz somebody wrote', () => {
  const questions = (rows: string[][]) => ({
    Questions: [['Ref', 'Kind', 'Question', 'Seconds', 'Answer'], ...rows],
  });

  it('takes the kinds by the names the site uses on screen', () => {
    const { items, problems } = readQuiz({
      ...questions([
        ['', 'Open question', 'Anything?', '', ''],
        ['', 'Closest guess', 'How many?', '', '42'],
      ]),
    });
    expect(problems).toEqual([]);
    expect(items.map((i) => i.kind)).toEqual(['open', 'number']);
  });

  it('says which row names a kind it does not have', () => {
    const { items, problems } = readQuiz(questions([['', 'Charades', 'Act this out', '', '']]));
    expect(items).toEqual([]);
    expect(problems[0]).toEqual({ line: 2, reason: 'does not name a kind this site has: "Charades"' });
  });

  // The row number is the one the sheet shows down its left edge, heading
  // included -- a report pointing at the wrong row is worse than none.
  it('and counts rows the way the sheet does', () => {
    const { problems } = readQuiz(
      questions([
        ['', 'Open question', 'Fine', '', ''],
        ['', 'Open question', '', '', ''],
      ])
    );
    expect(problems[0]).toEqual({ line: 3, reason: 'has no question' });
  });

  it('names the tab a question points at when it is missing', () => {
    const { items, problems } = readQuiz(questions([['Q9', 'Matching', 'Match these', '', '']]));
    expect(items).toEqual([]);
    expect(problems[0].reason).toMatch(/names a tab "Q9" that is not in this workbook/);
  });

  it('and refuses a choice question with nothing marked correct', () => {
    const { items, problems } = readQuiz({
      ...questions([['Q1', 'Multiple choice', 'Which?', '', '']]),
      Q1: [['Option', 'Correct'], ['One', ''], ['Two', '']],
    });
    expect(items).toEqual([]);
    expect(problems[0].reason).toMatch(/nothing marked correct/);
  });

  it('carries a problem from a detail tab up, saying which tab', () => {
    const { problems } = readQuiz({
      ...questions([['Q1', 'Matching', 'Match these', '', '']]),
      Q1: [['Item', 'Matches'], ['1998', 'ESOP'], ['2011', ''], ['2024', 'Gigabit']],
    });
    expect(problems[0].reason).toMatch(/on tab "Q1", line 2 needs both/);
  });

  it('reads a workbook whose first tab is not called Questions', () => {
    const { items, problems } = readQuiz({
      'Round one': [['Ref', 'Kind', 'Question'], ['', 'Open question', 'Anything?']],
    });
    expect(problems).toEqual([]);
    expect(items).toHaveLength(1);
  });

  // Somebody will delete the heading row, or paste without one.
  it('and one with no heading row at all, in the template’s own column order', () => {
    const { items, problems } = readQuiz({
      Questions: [['Q1', 'Matching', 'Match these', '45', ''], ['', 'Open question', 'Anything?', '', '']],
      Q1: [['Item', 'Matches'], ['1998', 'ESOP'], ['2011', 'Fiber']],
    });
    expect(problems).toEqual([]);
    expect(items.map((i) => i.kind)).toEqual(['match', 'open']);
  });

  it('refuses a closest guess with no number', () => {
    const { problems } = readQuiz(questions([['', 'Closest guess', 'How many?', '', 'lots']]));
    expect(problems[0].reason).toMatch(/no number in its answer column/);
  });

  // A thousands separator is what a spreadsheet shows for a number typed with
  // one, and refusing it would be refusing the sheet's own formatting.
  it('but takes one written with a comma in it', () => {
    const { items } = readQuiz(questions([['', 'Closest guess', 'How many?', '', '1,350']]));
    expect(items[0].answer).toEqual({ value: 1350 });
  });
});

describe('what it says afterwards', () => {
  it('counts the questions', () => {
    expect(sayQuiz([{ ref: 'a', kind: 'open', prompt: 'x', payload: {}, answer: null }], [])).toBe(
      'Read 1 question.'
    );
  });

  it('and leads with the first problem and how many more', () => {
    const said = sayQuiz([], [
      { line: 3, reason: 'has no question' },
      { line: 4, reason: 'has no kind' },
    ]);
    expect(said).toBe('Read 0 questions. Row 3 has no question, and 1 other problem.');
  });
});

// ---------------------------------------------------------------------------
// What a question is worth
// ---------------------------------------------------------------------------
describe('points in the workbook', () => {
  const questions = (rows: string[][]) => ({
    Questions: [
      ['Ref', 'Kind', 'Question', 'Seconds', 'Answer', 'Points', 'Wrong', 'Skipped'],
      ...rows,
    ],
  });

  it('the template carries what each question pays', async () => {
    const { items } = readQuiz(await readWorkbook(quizTemplateBytes()));
    expect(items.map((i) => i.points)).toEqual([2, 5, 3, 1, 2, 1]);
    // The closest guess is the one the template deducts on, and it is not
    // part-marked, so the switch means something there.
    expect(items.find((i) => i.kind === 'number')!.penaltyWrong).toBe(true);
    expect(items.find((i) => i.kind === 'choice')!.penaltyWrong).toBe(false);
  });

  it('a blank Points column is one point, as it always was', () => {
    const { items, problems } = readQuiz(questions([['', 'Open question', 'Anything?', '', '', '', '', '']]));
    expect(problems).toEqual([]);
    expect(items[0].points).toBe(1);
  });

  it('and a sheet with no Points column at all still reads', () => {
    const { items, problems } = readQuiz({
      Questions: [['Ref', 'Kind', 'Question'], ['', 'Open question', 'Anything?']],
    });
    expect(problems).toEqual([]);
    expect(items[0]).toMatchObject({ points: 1, penaltyWrong: false, penaltySkip: false });
  });

  it('takes yes in either deduction column', () => {
    const { items } = readQuiz(questions([['', 'Open question', 'Anything?', '', '', '4', 'yes', 'x']]));
    expect(items[0]).toMatchObject({ points: 4, penaltyWrong: true, penaltySkip: true });
  });

  it('and says which row is worth something that is not points', () => {
    const { items, problems } = readQuiz(questions([['', 'Open question', 'Anything?', '', '', 'lots', '', '']]));
    expect(items).toEqual([]);
    expect(problems[0].reason).toMatch(/which is not points between 0 and 100/);
  });
});
