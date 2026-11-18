// Splitting a session's results by one question's answer: "of the people who
// said yes to question 1, how did they answer question 2". The host and site
// admins only -- see session_split in schema.sql, which also hides groups too
// small to show without showing somebody.
import { supabase } from '@/supabase';

export type SplitQuestion = { id: string; position: number; prompt: string; kind: string };

export type SplitGroup = {
  label: string;
  n: number;
  /** 'small': fewer people in it than the survey's smallest group shown */
  hidden: 'small' | null;
  questions:
    | (SplitQuestion & { answered: number; cells: { label: string; count: number }[] })[]
    | null;
};

export type SplitList =
  | { ok: true; questions: SplitQuestion[] }
  | { ok: false; reason: string };

export type Split =
  | {
      ok: true;
      privacy: 'room' | 'full';
      /** the smallest group that is broken down */
      min: number;
      by: SplitQuestion;
      /** answers from before answers were linked, which cannot be split */
      unlinked: number;
      groups: SplitGroup[];
    }
  | { ok: false; reason: string; answered?: number; needed?: number };

/** The kinds that can split the results, and be split. */
export const SPLITTABLE = ['choice', 'survey', 'compare', 'nps'] as const;

export async function readSplitQuestions(session: string): Promise<SplitList> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('session_split', { p_session: session });
  if (error || !data) return { ok: false, reason: error?.message ?? 'unavailable' };
  return data as SplitList;
}

export async function readSplit(session: string, by: string): Promise<Split> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('session_split', { p_session: session, p_by: by });
  if (error || !data) return { ok: false, reason: error?.message ?? 'unavailable' };
  return data as Split;
}

/** An eNPS from a group's three cells: promoters less detractors, as a share. */
export function npsOf(cells: { label: string; count: number }[], answered: number): number | null {
  if (!answered) return null;
  const promoters = cells.find((c) => c.label.startsWith('Promoters'))?.count ?? 0;
  const detractors = cells.find((c) => c.label.startsWith('Detractors'))?.count ?? 0;
  return Math.round((100 * (promoters - detractors)) / answered);
}
