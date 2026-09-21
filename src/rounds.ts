// What tournament round is on, for the players' side of the site.
//
// Null most of the year, and the page says so rather than showing an empty
// table. Everything a player needs to find the round's boards comes back here:
// which games, which difficulty, and the round's first day, which is what its
// boards and results are keyed by.
import { supabase } from '@/supabase';
import type { Difficulty } from '@/difficulty';
import type { RoundTrivia } from '@/tournaments';

export type CurrentRound = {
  tournament_id: string;
  tournament: string;
  difficulty: Difficulty;
  tournament_starts_on: string;
  tournament_ends_on: string;
  round_id: string;
  starts_on: string;
  ends_on: string;
  /** feed names: words, hive, box, ... */
  games: string[];
  /** the sessions counting in this round, live and open alike */
  trivia: RoundTrivia[];
  /** what winning the round is worth, in words, or nothing */
  prize?: string | null;
  /** and what winning the whole tournament is worth */
  tournament_prize?: string | null;
  /** this round's place in its tournament, counted from 1 */
  number: number;
  of: number;
};

export async function readCurrentRound(): Promise<{ ok: boolean; round: CurrentRound | null }> {
  if (!supabase) return { ok: false, round: null };
  const { data, error } = await supabase.rpc('current_round');
  if (error) return { ok: false, round: null };
  return { ok: true, round: (data as CurrentRound | null) ?? null };
}

/** The tournament covering today, whether or not a round is on: what the
 *  tournament page shows between rounds. Null when there is none. */
export type CurrentTournament = {
  id: string;
  name: string;
  difficulty: Difficulty;
  starts_on: string;
  ends_on: string;
  /** it is the only thing on offer until it ends */
  locks_site: boolean;
  /** what winning it is worth, in words, or nothing */
  prize?: string | null;
  /** null when no round is left to start */
  next_round_starts_on: string | null;
};

export async function readCurrentTournament(): Promise<CurrentTournament | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('current_tournament');
  if (error) return null;
  return (data as CurrentTournament | null) ?? null;
}
