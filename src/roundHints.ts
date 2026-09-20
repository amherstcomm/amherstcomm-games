// Hints on a round board come from the server.
//
// On the daily, a hint is worked out in the page and counted there: the daily
// has to work offline and signed out, and nothing is ranked on its hint count.
// A round is ranked on it -- Weave's board breaks a tie on the fewest hints --
// and a number the page writes is a number the page can lower. So on a round
// board the page asks, and the server picks the word and keeps the count.
//
// What this does not do: it does not check that a hint was earned. The bank of
// three banked words is still the page's own arithmetic, against a dictionary
// the server does not hold. What it ends is taking a hint and reporting none.
import { supabase } from '@/supabase';

export type RoundHint =
  | { ok: true; target: string; taken: number }
  | { ok: false; reason: string };

/** Ask for the next hint on the round's board. Asking again for a word already
 *  given and still unfound returns it without being counted twice, so a reload
 *  or a second tab is not a second hint. */
export async function takeRoundHint(game: string): Promise<RoundHint> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  try {
    const { data, error } = await supabase.rpc('take_round_hint', { p_game: game });
    if (error) return { ok: false, reason: error.message };
    const res = (data ?? {}) as Partial<RoundHint> & { ok?: boolean; reason?: string };
    if (res.ok !== true || typeof (res as { target?: unknown }).target !== 'string') {
      return { ok: false, reason: res.reason ?? 'no answer' };
    }
    return { ok: true, target: String((res as { target: string }).target), taken: Number((res as { taken?: number }).taken ?? 0) };
  } catch {
    return { ok: false, reason: 'no answer' };
  }
}

/** What this player has already been given on the round board, so a page that
 *  was reloaded lights the same word and shows the same count. */
export async function readRoundHints(
  game: string
): Promise<{ taken: number; targets: string[] }> {
  if (!supabase) return { taken: 0, targets: [] };
  try {
    const { data, error } = await supabase.rpc('my_round_hints', { p_game: game });
    if (error) return { taken: 0, targets: [] };
    const res = (data ?? {}) as { taken?: number; targets?: unknown };
    return {
      taken: Number(res.taken ?? 0),
      targets: Array.isArray(res.targets) ? res.targets.filter((w): w is string => typeof w === 'string') : [],
    };
  } catch {
    return { taken: 0, targets: [] };
  }
}
