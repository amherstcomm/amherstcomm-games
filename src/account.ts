// Leaving, in the two senses people mean it: clearing the play record, and
// deleting the account outright.
//
// Both are single RPCs that take no argument — the account they act on comes
// from the token, never from anything the client says. See schema.sql.
//
// The client's job afterwards is the half the database can't reach: the
// session and whatever this browser is still holding.

import { clearLocalStats } from '@/stats';
import { supabase } from '@/supabase';
import { store as siteStore } from '@/siteStorage';

/** Keys that survive a local wipe: how the site looks. Nobody asked us to
 *  forget their theme as a side effect of clearing their play data. */
const KEEP = ['anagrimoire:v1'];

/** Everything this browser holds about playing — boards, totals, the sync
 *  base, the device id and its baseline flags. Not settings. */
export function wipeLocalPlayData(): void {
  try {
    const doomed = siteStore
      .keys()
      .filter((k) => k.startsWith('anagrimoire:') && !KEEP.some((keep) => k.startsWith(keep)));
    // through the facade, so anything held in memory under a stricter storage
    // setting goes as well — erasing only the disk copy would leave the board
    // sitting there for the rest of the session
    for (const k of doomed) siteStore.removeItem(k);
  } catch {
    // a browser that won't let us enumerate storage isn't one we can tidy
  }
}

/** Delete the results, daily boards and baselines held on the account, and
 *  forget this browser's totals to match. The account itself stays, display
 *  name included. */
export async function clearMyStats(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.rpc('clear_my_stats');
    if (error) return false;
    clearLocalStats();
    return true;
  } catch {
    return false;
  }
}

/** Delete the account. One row in auth.users goes and the rest cascades.
 *
 *  `wipeLocal` is the caller's choice rather than ours: boards in this
 *  browser are the player's own copy, and quietly erasing them would take
 *  away a puzzle nobody asked us to touch.
 *
 *  Sign-out is local-scope on purpose — the usual sign-out asks the server to
 *  revoke a session belonging to a user that no longer exists, which fails,
 *  and a failed sign-out would leave a dead token behind. */
export async function deleteAccount(wipeLocal: boolean): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.rpc('delete_account');
    if (error) return false;

    if (wipeLocal) wipeLocalPlayData();

    // GA4 never received an account id, so there's nothing on Google's side
    // filed under this account to delete. Clearing the cookies drops the
    // browser-scoped id that is the only thing tying these visits together.

    await supabase.auth.signOut({ scope: 'local' });
    return true;
  } catch {
    return false;
  }
}
