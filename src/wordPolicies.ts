// What a themed day accepts as a word, from the browser's side.
//
// Per day rather than per word list, because several lists can cover one day
// and a list is the wrong place to keep an answer about the day. Per game as
// well, because "only our words" is a fine puzzle in the letter box and an
// unplayable one in the hive.
import { supabase } from '@/supabase';

export const POLICIES = ['both', 'themed', 'dictionary'] as const;
export type Policy = (typeof POLICIES)[number];

/** What each answer means, in the words of somebody choosing one. The table is
 *  read twice — once for the picker, once for the line under a saved rule — so
 *  the two cannot drift. */
export const POLICY_MEANS: Record<Policy, string> = {
  both: 'the dictionary and the day’s own words',
  themed: 'only the day’s own words',
  dictionary: 'the dictionary alone, as though nothing were themed',
};

export type WordPolicy = {
  id: string;
  /** null is the day's default; a game named overrides it */
  game: string | null;
  policy: Policy;
  starts_on: string;
  ends_on: string;
};

const fail = (reason: string) => ({ ok: false as const, reason });

export async function readWordPolicies(): Promise<{
  ok: boolean;
  reason?: string;
  policies: WordPolicy[];
}> {
  if (!supabase) return { ok: false, reason: 'not connected', policies: [] };
  const { data, error } = await supabase.rpc('word_policies_sheet');
  if (error) return { ok: false, reason: error.message, policies: [] };
  const res = (data ?? {}) as { ok?: boolean; reason?: string; policies?: WordPolicy[] };
  return { ok: res.ok === true, reason: res.reason, policies: res.policies ?? [] };
}

export async function saveWordPolicy(rule: {
  id?: string | null;
  game: string | null;
  policy: Policy;
  from: string;
  until: string;
}): Promise<{ ok: boolean; reason?: string; id?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('save_word_policy', {
    p_id: rule.id ?? null,
    // Empty is the day's default rather than a game called nothing.
    p_game: rule.game || null,
    p_policy: rule.policy,
    p_from: rule.from || null,
    p_until: rule.until || null,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

export async function deleteWordPolicy(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('delete_word_policy', { p_policy: id });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}
