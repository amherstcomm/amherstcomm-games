// The whiteboard: one question a week for everybody, and who answered what.
//
// The server decides who sees the board (whiteboard_view): somebody who has
// answered, whoever writes the questions, and anybody once the week is over.
// This file carries the answers and words them.
import { supabase } from '@/supabase';
import type { Avatar } from '@/avatars';

export type QuestionKind = 'choice' | 'text';

export type Question = {
  id: string;
  prompt: string;
  kind: QuestionKind;
  options: string[];
  /** the Monday of its week, or null while it waits for one */
  week_of: string | null;
  /** later: not asked yet; open: this week; closed: a week gone */
  state: 'later' | 'open' | 'closed';
  ends_at: string | null;
};

export type BoardAnswer = {
  user: string;
  name: string;
  avatar: Avatar | null;
  choice: number | null;
  body: string | null;
};

export type PastWeek = { id: string; prompt: string; week_of: string; answers: number };

export type Board = {
  ok: boolean;
  reason?: string;
  can_manage?: boolean;
  /** the Monday of this week */
  week_of?: string;
  question?: Question | null;
  count?: number;
  mine?: { choice: number | null; body: string | null } | null;
  /** null until the reader may see them */
  answers?: BoardAnswer[] | null;
  past?: PastWeek[];
};

export type SheetQuestion = {
  id: string;
  prompt: string;
  kind: QuestionKind;
  options: string[];
  week_of: string | null;
  answers: number;
};
export type Suggestion = { id: string; prompt: string; at: string; from: string | null };
export type Sheet = { week_of: string; questions: SheetQuestion[]; suggestions: Suggestion[] };

type Answer<T = object> = ({ ok: true } & T) | { ok: false; reason?: string };

async function call<T = object>(fn: string, args?: Record<string, unknown>): Promise<Answer<T>> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, reason: error.message };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'no answer' };
  return data as Answer<T>;
}

export async function readBoard(question: string | null = null): Promise<Board> {
  return (await call<Board>('whiteboard_view', { p_question: question })) as Board;
}

export const answerChoice = (question: string, choice: number) =>
  call('answer_whiteboard', { p_question: question, p_choice: choice, p_body: null });
export const answerWords = (question: string, body: string) =>
  call('answer_whiteboard', { p_question: question, p_choice: null, p_body: body });
export const withdrawAnswer = (question: string) => call('withdraw_whiteboard_answer', { p_question: question });
export const suggestQuestion = (prompt: string) => call('suggest_whiteboard_question', { p_prompt: prompt });

// --- writing them -----------------------------------------------------------

export const readSheet = () => call<Sheet>('whiteboard_sheet');

export type QuestionForm = {
  id: string | null;
  prompt: string;
  kind: QuestionKind;
  options: string[];
  /** a Monday, as yyyy-mm-dd, or empty for not yet */
  weekOf: string;
  suggestion: string | null;
};

export const saveQuestion = (f: QuestionForm) =>
  call<{ id: string }>('save_whiteboard_question', {
    p_id: f.id,
    p_prompt: f.prompt,
    p_kind: f.kind,
    p_options: f.kind === 'choice' ? f.options : [],
    p_week_of: f.weekOf || null,
    p_suggestion: f.suggestion,
  });
export const deleteQuestion = (id: string) => call('delete_whiteboard_question', { p_id: id });
export const dismissSuggestion = (id: string) => call('dismiss_whiteboard_suggestion', { p_id: id });
export const removeAnswer = (question: string, user: string) =>
  call('remove_whiteboard_answer', { p_question: question, p_user: user });

// --- words ------------------------------------------------------------------

/** "the week of November 16", from its Monday. Dates only, so read at noon UTC
 *  and printed in UTC: a Monday is a Monday wherever the reader is. */
export function weekWord(monday: string): string {
  const d = new Date(`${monday}T12:00:00Z`);
  return `the week of ${d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' })}`;
}

/** The next `n` Mondays from this week's, for scheduling. */
export function mondays(thisWeek: string, n: number): string[] {
  const start = new Date(`${thisWeek}T12:00:00Z`).getTime();
  return Array.from({ length: n }, (_, k) => new Date(start + k * 7 * 86_400_000).toISOString().slice(0, 10));
}

export const answered = (n: number) => (n === 1 ? '1 person has answered' : `${n} people have answered`);
