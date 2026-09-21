// Tournaments and their rounds, from the browser's side.
//
// A tournament is a span of dates with one difficulty; a round is its own span
// inside it with a list of games and a list of trivia sessions. Each of those
// games has one fixed board for the whole round; each session is scored the way
// its host's own screen scores it, times whatever the round said it was worth. The rules that matter -- rounds inside their tournament,
// no two rounds on one day, nothing changed under a round that is being played
// -- live in the database, where a page cannot talk its way past them. This
// module only carries the answers, which the server writes as sentences a
// person can read.
import { supabase } from '@/supabase';
import { ALL_MODES, FEED_NAME, GAME_NAME } from '@/games';
import type { Difficulty } from '@/difficulty';

/** A session counting in a round. Both session modes work: a live one is the
 *  round's trivia night, an open one is trivia played on your own time inside
 *  the round -- which is what an open session already is. */
export type RoundTrivia = {
  session_id: string;
  title: string;
  mode: 'live' | 'open';
  state: 'draft' | 'live' | 'closed';
  /** what a placement here is worth against a placement on a board; 1 is parity */
  weight: number;
};

export type Round = {
  id: string;
  starts_on: string;
  ends_on: string;
  /** feed names -- words, hive, box -- which is what a round board is keyed by */
  games: string[];
  /** what each game is worth against the others, by feed name; missing is 1 */
  game_weights?: Record<string, number>;
  /** the sessions counting in this round */
  trivia: RoundTrivia[];
  /** what is on offer for winning it, in whatever words the admin used */
  prize?: string | null;
  /** its first puzzle day has come: only the end date may change now */
  started: boolean;
};

export type Tournament = {
  id: string;
  name: string;
  difficulty: Difficulty;
  starts_on: string;
  ends_on: string;
  /** from its first day to its last, the tournament is the only thing on offer */
  locks_site: boolean;
  /** while it locks the site, sessions outside its rounds stay joinable */
  sessions_open: boolean;
  /** what is on offer overall */
  prize?: string | null;
  rounds: Round[];
};

/** Every game a round can list, named the way the site names it and keyed by
 *  what its board is published as. Read from @/games, so a game added there is
 *  a game a round can use without this file hearing about it. */
export const ROUND_GAMES: { feed: string; name: string }[] = ALL_MODES.map((mode) => ({
  feed: FEED_NAME[mode],
  name: GAME_NAME[mode].full,
}));

/** A feed name as a person would say it: "Guess the Word", not "words". */
export function roundGameName(feed: string): string {
  return ROUND_GAMES.find((g) => g.feed === feed)?.name ?? feed;
}

const fail = (reason: string) => ({ ok: false as const, reason });

export async function readTournaments(): Promise<{
  ok: boolean;
  reason?: string;
  tournaments: Tournament[];
}> {
  if (!supabase) return { ok: false, reason: 'not connected', tournaments: [] };
  const { data, error } = await supabase.rpc('tournaments_sheet');
  if (error) return { ok: false, reason: error.message, tournaments: [] };
  const res = (data ?? {}) as { ok?: boolean; reason?: string; tournaments?: Tournament[] };
  return { ok: res.ok === true, reason: res.reason, tournaments: res.tournaments ?? [] };
}

export async function saveTournament(t: {
  id: string | null;
  name: string;
  difficulty: Difficulty;
  from: string;
  until: string;
  locksSite: boolean;
  sessionsOpen: boolean;
  prize: string;
}): Promise<{ ok: boolean; reason?: string; id?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('save_tournament', {
    p_id: t.id,
    p_name: t.name,
    p_difficulty: t.difficulty,
    p_starts: t.from || null,
    p_ends: t.until || null,
    p_locks_site: t.locksSite,
    p_sessions_open: t.locksSite && t.sessionsOpen,
    p_prize: t.prize.trim() || null,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string; id?: string }) ?? fail('no answer');
}

export async function deleteTournament(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('delete_tournament', { p_id: id });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

export async function saveRound(r: {
  id: string | null;
  tournament: string;
  from: string;
  until: string;
  games: string[];
  /** the sessions counting in this round, with what each is worth */
  sessions?: { id: string; weight: number }[];
  /** what is on offer for winning the round */
  prize?: string;
  /** what each game is worth, by feed name; a game left out is worth 1 */
  gameWeights?: Record<string, number>;
}): Promise<{ ok: boolean; reason?: string; id?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('save_round', {
    p_id: r.id,
    p_tournament: r.tournament,
    p_starts: r.from || null,
    p_ends: r.until || null,
    p_games: r.games,
    p_sessions: r.sessions ?? [],
    p_prize: (r.prize ?? '').trim() || null,
    // Only the ones that are not 1: the server refuses a weight for a game the
    // round does not have, and a 1 says nothing a missing key does not.
    p_game_weights: Object.fromEntries(
      Object.entries(r.gameWeights ?? {}).filter(([game, w]) => r.games.includes(game) && w !== 1)
    ),
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string; id?: string }) ?? fail('no answer');
}

export async function deleteRound(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('delete_round', { p_id: id });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}
