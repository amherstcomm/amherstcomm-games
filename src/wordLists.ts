// Word lists of somebody's own, from the browser's side.
//
// The dictionary in `public.words` is the English language; a themed list is a
// small set of words somebody typed. What a list is *for* is deciding what the
// puzzle is, not deciding what counts as English — the server keeps the
// ordinary dictionary and allows the list's own words on top, so a round about
// shares still accepts HOUSE and also accepts ESOP.
//
// The words themselves are the answer key. Nothing a participant calls returns
// them, and `can('games.setup')` decides that in the database on every call.
import { supabase } from '@/supabase';

export type WordList = {
  id: string;
  name: string;
  words: number;
  /** the Weave clue, and its long corner-to-corner answer */
  clue: string | null;
  spangram: string | null;
  /** the days this list themes, or null for none */
  daily_from: string | null;
  daily_until: string | null;
  /** the board sizes this list can fill — an editor picking one for a
   *  six-letter round needs to know it has six-letter words */
  lengths: number[];
  created_at: string;
};

const fail = (reason: string) => ({ ok: false as const, reason });

export async function readWordLists(): Promise<WordList[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('word_lists_sheet');
  if (error || !data) return [];
  return ((data as { lists?: WordList[] }).lists ?? []) as WordList[];
}

export async function readWordListWords(list: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('word_list_words', { p_list: list });
  if (error || !data) return [];
  return ((data as { words?: string[] }).words ?? []) as string[];
}

/** Saving replaces. It is the one action that looks most like editing a text
 *  file, and a save that quietly kept words the author had deleted would be the
 *  wrong behaviour for it. */
export async function saveWordList(
  id: string | null,
  name: string,
  words: string,
  daily: { clue?: string; spangram?: string; from?: string; until?: string } = {}
): Promise<{ ok: boolean; reason?: string; id?: string; words?: number }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('save_word_list', {
    p_id: id,
    p_name: name,
    p_words: words,
    p_clue: daily.clue || null,
    p_spangram: daily.spangram || null,
    // Empty is no date rather than an invalid one, and the two have to stay
    // distinguishable: a list with no dates themes nothing.
    p_from: daily.from || null,
    p_until: daily.until || null,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

export async function deleteWordList(list: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('delete_word_list', { p_list: list });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}
