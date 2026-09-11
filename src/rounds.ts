// What tournament round is on, for the players' side of the site.
//
// Null most of the year, and the page says so rather than showing an empty
// table. Everything a player needs to find the round's boards comes back here:
// which games, which difficulty, and the round's first day, which is what its
// boards and results are keyed by.
import { supabase } from '@/supabase';
import type { Difficulty } from '@/difficulty';

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
