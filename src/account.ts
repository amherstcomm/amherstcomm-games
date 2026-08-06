// Leaving, in the two senses people mean it: clearing the play record, and
// deleting the account outright.
//
// Both are single RPCs that take no argument — the account they act on comes
// from the token, never from anything the client says. See schema.sql.
//
// The client's job afterwards is the half the database can't reach: the
// session, the analytics cookies, and whatever this browser is still holding.

import { clearAnalyticsCookies } from '@/consent';
import { clearLocalStats } from '@/stats';
import { supabase } from '@/supabase';
import { setLevel, serverAllowed, store as siteStore, type StorageLevel } from '@/siteStorage';

/** Apply a storage choice, including the part the storage layer can't do
 *  itself. Below the top level nothing about you is meant to reach us, so a
 *  session that's already open has to end — otherwise "no server data" would
 *  be true of the disk and false of the next twenty minutes.
 *
 *  Local scope: the token is being discarded here, so there's no call for
 *  asking the server to revoke sessions on the user's other devices too. */
export async function applyStorageLevel(next: StorageLevel): Promise<void> {
  setLevel(next);
  if (serverAllowed(next) || !supabase) return;
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // the token is off the disk either way
  }
}

/** Keys that survive a local wipe: how the site looks, and the analytics
 *  answer. Resetting a privacy choice as a side effect of a privacy action
 *  would be a poor trade, and nobody asked us to forget their theme. */
const KEEP = ['anagrimoire:v1', 'anagrimoire:analytics-consent'];

/** Everything this browser holds about playing — boards, totals, the sync
 *  base, the device id and its baseline flags. Not settings, not consent. */
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
    clearAnalyticsCookies();

    await supabase.auth.signOut({ scope: 'local' });
    return true;
  } catch {
    return false;
  }
}
