// Recognition: nominating each other for acting like an owner, the wall of
// posted nominations, and the award rounds reviewers open.
//
// The server holds every rule (recognition.sql): nothing is on the wall until
// a reviewer posts it, the wall names the nominator only if they chose so,
// and nobody reviews or picks themselves. This file carries and words.
import { supabase } from '@/supabase';
import type { Avatar } from '@/avatars';

export type Person = { user: string; name: string; avatar: Avatar | null };

export type Round = {
  id: string;
  title: string;
  blurb: string | null;
  starts_on: string;
  ends_on: string;
  state: 'soon' | 'open' | 'closed';
  winner: { nomination: string; who: Person; story: string; note: string | null; announced_at: string } | null;
};

export type WallCard = {
  id: string;
  who: Person;
  story: string;
  /** the nominator, when they chose to be named */
  from: Person | null;
  at: string;
  /** titles of the rounds it won */
  awards: string[];
};

export type Status = 'waiting' | 'posted' | 'declined';

export type MyNomination = { id: string; who: Person; story: string; show_name: boolean; status: Status; at: string };

export type ReviewRow = {
  id: string;
  who: Person;
  from: Person | null;
  story: string;
  show_name: boolean;
  status: Status;
  note: string | null;
  at: string;
  /** the company-clock day it was made, which puts it in a round */
  day: string;
  reviewed_by: string | null;
  about_me: boolean;
};

export type RecognitionPage = {
  ok: boolean;
  reason?: string;
  can_review?: boolean;
  me?: string;
  rounds?: Round[];
  wall?: WallCard[];
  mine?: MyNomination[];
  review?: { nominations: ReviewRow[]; waiting: number } | null;
};

type Answer<T = object> = ({ ok: true } & T) | { ok: false; reason?: string };

async function call<T = object>(fn: string, args?: Record<string, unknown>): Promise<Answer<T>> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, reason: error.message };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'no answer' };
  return data as Answer<T>;
}

export async function readRecognition(): Promise<RecognitionPage> {
  return (await call<RecognitionPage>('recognition_view')) as RecognitionPage;
}

/** How many nominations wait for this reader to review: none for anybody else. */
export async function readWaiting(): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc('recognition_waiting');
  return error || typeof data !== 'number' ? 0 : data;
}

export const nominate = (nominee: string, story: string, showName: boolean) =>
  call<{ id: string }>('nominate', { p_nominee: nominee, p_story: story, p_show_name: showName });
export const withdrawNomination = (id: string) => call('withdraw_nomination', { p_id: id });
export const reviewNomination = (id: string, post: boolean, note: string | null = null) =>
  call('review_nomination', { p_id: id, p_post: post, p_note: note });

export type RoundForm = { id: string | null; title: string; blurb: string; startsOn: string; endsOn: string };
export const saveRound = (f: RoundForm) =>
  call<{ id: string }>('save_recognition_round', {
    p_id: f.id,
    p_title: f.title,
    p_blurb: f.blurb || null,
    p_starts_on: f.startsOn || null,
    p_ends_on: f.endsOn || null,
  });
export const deleteRound = (id: string) => call('delete_recognition_round', { p_id: id });
export const pickWinner = (round: string, nomination: string | null, note: string | null = null) =>
  call('pick_round_winner', { p_round: round, p_nomination: nomination, p_note: note });

// --- words ------------------------------------------------------------------

/** A date-only value, as "November 3". Read at noon UTC and printed in UTC,
 *  so a day is that day wherever the reader is. */
export function dayWord(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' });
}

export const roundDates = (r: Pick<Round, 'starts_on' | 'ends_on'>) =>
  r.starts_on === r.ends_on ? dayWord(r.starts_on) : `${dayWord(r.starts_on)} – ${dayWord(r.ends_on)}`;

export const STATUS_WORD: Record<Status, string> = {
  waiting: 'Waiting for review',
  posted: 'On the wall',
  declined: 'Not posted',
};

/** The posted nominations made within a round's dates: its candidates. */
export const candidates = (rows: ReviewRow[], r: Pick<Round, 'starts_on' | 'ends_on'>) =>
  rows.filter((n) => n.status === 'posted' && n.day >= r.starts_on && n.day <= r.ends_on);
