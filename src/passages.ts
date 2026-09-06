// Cryptogram passages of a deployment's own, from the browser's side.
//
// The plaintext is the solution, so this is answer-key territory in the same
// way a word list is: `can('games.setup')` decides it in the database on every
// call, and nothing a player calls returns any of it.
import { supabase } from '@/supabase';

export type Passage = {
  id: string;
  text: string;
  author: string | null;
  /** what the cipher will encipher — spaces and punctuation are not counted */
  letters: number;
  starts_on: string | null;
  ends_on: string | null;
};

const fail = (reason: string) => ({ ok: false as const, reason });

export async function readPassages(): Promise<{
  ok: boolean;
  reason?: string;
  passages: Passage[];
}> {
  if (!supabase) return { ok: false, reason: 'not connected', passages: [] };
  const { data, error } = await supabase.rpc('cryptogram_passages_sheet');
  if (error) return { ok: false, reason: error.message, passages: [] };
  const res = (data ?? {}) as { ok?: boolean; reason?: string; passages?: Passage[] };
  return { ok: res.ok === true, reason: res.reason, passages: res.passages ?? [] };
}

export async function savePassage(passage: {
  id?: string | null;
  text: string;
  author?: string | null;
  from?: string | null;
  until?: string | null;
}): Promise<{ ok: boolean; reason?: string; id?: string; letters?: number }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('save_cryptogram_passage', {
    p_id: passage.id ?? null,
    p_text: passage.text,
    p_author: passage.author || null,
    // Empty is no date rather than an invalid one, and the two have to stay
    // distinguishable: a passage with no dates is one nobody has scheduled.
    p_from: passage.from || null,
    p_until: passage.until || null,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

export async function deletePassage(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('delete_cryptogram_passage', { p_passage: id });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}
