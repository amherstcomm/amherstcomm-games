// A tournament's standings, from the browser's side.
//
// Two tables, from one call. Each round has a leaderboard per game, ranked the
// way the site's own boards rank that game -- the fastest solve, the most
// points, the fewest guesses -- and the tournament has an overall table that
// awards placement points per game-round, so games whose scores are not
// comparable (Hive points against Weave times) can still be added together.
// The ranking and the points are the database's; this module carries them.
import { supabase } from '@/supabase';
import type { Difficulty } from '@/difficulty';
import type { BoardGame } from '@/leaderboard';

export type StandingRow = { name: string; value: number; detail: number | null };

export type RoundStandings = {
  id: string;
  number: number;
  starts_on: string;
  ends_on: string;
  /** keyed like the site's leaderboards: guess, hive, box, squares5, ... */
  boards: Partial<Record<BoardGame, StandingRow[]>>;
};

export type TableRow = {
  name: string;
  /** placement points: 1st in a game-round is 10, 10th is 1 */
  points: number;
  /** game-rounds won outright, the table's tiebreak */
  wins: number;
  /** game-rounds placed in at all */
  placed: number;
};

export type TournamentStandings = {
  tournament: { id: string; name: string; difficulty: Difficulty };
  table: TableRow[];
  rounds: RoundStandings[];
};

export async function readTournamentStandings(
  tournamentId: string
): Promise<{ ok: boolean; reason?: string; standings: TournamentStandings | null }> {
  if (!supabase) return { ok: false, reason: 'not connected', standings: null };
  const { data, error } = await supabase.rpc('tournament_standings', { p_tournament: tournamentId });
  if (error) return { ok: false, reason: error.message, standings: null };
  const res = (data ?? {}) as { ok?: boolean; reason?: string } & Partial<TournamentStandings>;
  if (res.ok !== true || !res.tournament) {
    return { ok: false, reason: res.reason ?? 'no answer', standings: null };
  }
  return {
    ok: true,
    standings: { tournament: res.tournament, table: res.table ?? [], rounds: res.rounds ?? [] },
  };
}
