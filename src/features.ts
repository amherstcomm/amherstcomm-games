// Reading and writing what this deployment offers, from the browser's side.
//
// Separate from availability.ts, which every page imports: this half is only
// for the one page that changes them, and keeping the writer out of the module
// the menu depends on keeps that dependency to a store and a fetch.
//
// Nothing here decides who may. `can('site.settings')` decides, in the
// database, on every call.
import { supabase } from '@/supabase';

export type FeatureWindow = {
  /** `game:hive`, `view:solve`, `difficulty:extreme` */
  feature: string;
  enabled: boolean;
  /** ISO instants, or null for "no window" — the two are different answers and
   *  have to stay distinguishable all the way to the server */
  starts_at: string | null;
  ends_at: string | null;
};

const fail = (reason: string) => ({ ok: false as const, reason });

export async function readFeatureWindows(): Promise<{
  ok: boolean;
  reason?: string;
  features?: FeatureWindow[];
}> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('feature_windows_sheet');
  if (error || !data) return fail(error?.message ?? 'unavailable');
  return data as { ok: boolean; reason?: string; features?: FeatureWindow[] };
}

/** On with no window is the same as never having been set, and the server
 *  deletes the row for it — so the table stays a list of exceptions rather
 *  than a hundred rows saying "as usual". */
export async function setFeatureWindow(
  window: FeatureWindow
): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('set_feature_window', {
    p_feature: window.feature,
    p_enabled: window.enabled,
    p_starts_at: window.starts_at,
    p_ends_at: window.ends_at,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}
