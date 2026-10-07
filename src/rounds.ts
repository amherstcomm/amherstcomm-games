// What tournament round is on, for the players' side of the site.
//
// Null most of the year, and the page says so rather than showing an empty
// table. Everything a player needs to find the round's boards comes back here:
// which games, which difficulty, and the round's first day, which is what its
// boards and results are keyed by.
import { supabase } from '@/supabase';
import type { Difficulty } from '@/difficulty';
import type { RoundTrivia } from '@/tournaments';

/** A contest a round counts, and what it is worth against the boards. */
export type RoundContest = {
  contest_id: string;
  name: string;
  phase: string;
  votes_close_on: string;
  weight: number;
};

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
  /** what each game is worth against the others; missing is 1 */
  game_weights?: Record<string, number>;
  /** the sessions counting in this round, live and open alike */
  trivia: RoundTrivia[];
  /** the contests counting in this round */
  contests: RoundContest[];
  /** what winning the round is worth, in words, or nothing */
  prize?: string | null;
  /** and what winning the whole tournament is worth */
  tournament_prize?: string | null;
  /** this round's place in its tournament, counted from 1 */
  number: number;
  of: number;
};

/**
 * Every round on today, in round order -- empty when nothing is running.
 *
 * Rounds may overlap now: a contest that runs for a week sits across the daily
 * rounds, and "the round on today" stopped being one round. No game is in two
 * of them on the same day (the server refuses it), so a game still has exactly
 * one round to be played in -- see `roundFor`.
 */
export async function readCurrentRounds(): Promise<{ ok: boolean; rounds: CurrentRound[] }> {
  if (!supabase) return { ok: false, rounds: [] };
  const { data, error } = await supabase.rpc('current_rounds');
  if (!error) return { ok: true, rounds: Array.isArray(data) ? (data as CurrentRound[]) : [] };

  // A database that has not had this release's schema yet has no
  // current_rounds. The site deploys on merge and the schema is applied by
  // hand after, and in that gap a live tournament would otherwise read as
  // having no round on at all -- so ask the old single-round question, which
  // every database has, and show the one round it knows about.
  const old = await supabase.rpc('current_round');
  if (old.error) return { ok: false, rounds: [] };
  return { ok: true, rounds: old.data ? [old.data as CurrentRound] : [] };
}

/** The round on today that has this game, by feed name. At most one: two
 *  rounds on the same day may not share a game. */
export function roundFor(rounds: CurrentRound[], feed: string): CurrentRound | null {
  return rounds.find((r) => r.games.includes(feed)) ?? null;
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
