// A clue for a tournament round's Guess the Word.
//
// The clue is never in the board -- a board anybody can fetch is a clue
// everybody has taken without saying so. The page asks whether there is one,
// and takes it only when the player chooses to; the server records that, and
// the round's ranking counts it after the fewest guesses and before the clock.
import { supabase } from '@/supabase';

export type RoundClue = {
  /** the board in front of the player has a clue to give */
  available: boolean;
  /** they have taken it */
  taken: boolean;
  /** what it says, once taken */
  clue: string | null;
};

const NONE: RoundClue = { available: false, taken: false, clue: null };

async function ask(game: string, take: boolean, length: number): Promise<RoundClue | { error: string }> {
  if (!supabase) return { error: 'not connected' };
  const { data, error } = await supabase.rpc('round_clue', { p_game: game, p_take: take, p_length: length });
  if (error) return { error: error.message };
  const res = (data ?? {}) as { ok?: boolean; reason?: string; available?: boolean; taken?: boolean; clue?: string | null };
  if (res.ok !== true) return { error: res.reason ?? 'no answer' };
  return { available: res.available === true, taken: res.taken === true, clue: res.clue ?? null };
}

/** Whether the word at this length has a clue, and -- if it was taken
 *  already -- what it says. The length, because an unpinned round board has a
 *  word at each and the clue is that word's. A
 *  database without clues answers with an error, which reads as none. */
export async function readRoundClue(game: string, length: number): Promise<RoundClue> {
  try {
    const got = await ask(game, false, length);
    return 'error' in got ? NONE : got;
  } catch {
    return NONE;
  }
}

/** Take it. Recorded once; asking again repeats it. */
export async function takeRoundClue(game: string, length: number): Promise<RoundClue | { error: string }> {
  try {
    return await ask(game, true, length);
  } catch {
    return { error: 'no answer' };
  }
}
