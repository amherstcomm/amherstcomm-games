// Weave themes of somebody's own, from the browser's side.
//
// Separate from word lists, because they are separate things. A word list is a
// bag of words — right for a themed round and for picking the daily word, where
// any word of the right length will do. A Weave theme is a set that *tiles a
// board*: a clue, a spangram threaded corner to corner, and words whose lengths
// fill exactly what the spangram leaves.
//
// Nothing here decides who may. `can('games.setup')` decides, in the database.
import { supabase } from '@/supabase';

export type WeaveTheme = {
  id: string;
  clue: string;
  spangram: string;
  words: string[];
  /** the days this theme is a candidate on, or null for not scheduled */
  starts_on: string | null;
  ends_on: string | null;
};

const fail = (reason: string) => ({ ok: false as const, reason });

export async function readWeaveThemes(): Promise<{
  ok: boolean;
  reason?: string;
  themes?: WeaveTheme[];
}> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('weave_themes_sheet');
  if (error || !data) return fail(error?.message ?? 'unavailable');
  return data as { ok: boolean; reason?: string; themes?: WeaveTheme[] };
}

export async function saveWeaveTheme(theme: {
  id: string | null;
  clue: string;
  spangram: string;
  words: string;
  from?: string;
  until?: string;
}): Promise<{ ok: boolean; reason?: string; words?: number }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('save_weave_theme', {
    p_id: theme.id,
    p_clue: theme.clue,
    p_spangram: theme.spangram,
    p_words: theme.words,
    p_from: theme.from || null,
    p_until: theme.until || null,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

export async function deleteWeaveTheme(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('delete_weave_theme', { p_theme: id });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}
