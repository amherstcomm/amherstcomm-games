// Reading and writing the site settings, from the browser's side.
//
// Separate from settings.ts, which every page imports: this half is only for
// the one page that changes them, and keeping the writer out of the module the
// masthead depends on keeps the masthead's dependency to a store and a fetch.
//
// Nothing here decides who may. `can('site.settings')` decides, in the
// database, on both calls.
import { supabase } from '@/supabase';

export type SettingRow = {
  key: string;
  description: string;
  value: string;
  updated_at: string | null;
  /** the display name of whoever set it, or null if nobody has */
  updated_by: string | null;
};

const fail = (reason: string) => ({ ok: false as const, reason });

export async function readSiteSettings(): Promise<{
  ok: boolean;
  reason?: string;
  settings?: SettingRow[];
}> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('site_settings_sheet');
  if (error || !data) return fail(error?.message ?? 'unavailable');
  return data as { ok: boolean; reason?: string; settings?: SettingRow[] };
}

/** An empty value clears the setting. That is the same call rather than a
 *  separate one, because "set it to nothing" and "unset it" are the same
 *  instruction and having two ways to say it invites them to disagree. */
export async function setSiteSetting(
  key: string,
  value: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('set_site_setting', {
    p_key: key,
    p_value: value,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}
