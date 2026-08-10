// Friends, through the definer functions and nothing else. Everything here
// returns names and numbers; there is no path from this module to another
// player's rows, because the database doesn't offer one.
//
// A friendship starts as an invite link. The code inside it has to survive
// the trip through sign-in — OAuth leaves the page entirely and comes back at
// the origin — so a link that lands before the session exists is stashed and
// picked up by the account panel once there is someone to accept it as.

import { ORIGIN } from '@/routes';
import { supabase } from '@/supabase';
import { store as siteStore } from '@/siteStorage';

export type InviteFailure = 'not signed in' | 'name required' | 'too many' | 'error';
export type InviteResult = { ok: true; code: string } | { ok: false; reason: InviteFailure };

export type AcceptFailure = 'not signed in' | 'name required' | 'invalid' | 'self' | 'full' | 'error';
export type AcceptResult = { ok: true; name: string } | { ok: false; reason: AcceptFailure };

export type FriendEntry = { name: string; since: string };
export type Circle = { friends: FriendEntry[]; blocked: string[] };

export function inviteUrl(code: string): string {
  return `${ORIGIN}/friend/${code}`;
}

export async function mintInvite(): Promise<InviteResult> {
  if (!supabase) return { ok: false, reason: 'error' };
  try {
    const { data, error } = await supabase.rpc('friend_invite');
    if (error) return { ok: false, reason: 'error' };
    const r = data as { ok?: boolean; code?: string; reason?: string } | null;
    if (r?.ok && typeof r.code === 'string') return { ok: true, code: r.code };
    const known: InviteFailure[] = ['not signed in', 'name required', 'too many'];
    return { ok: false, reason: known.includes(r?.reason as InviteFailure) ? (r?.reason as InviteFailure) : 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function acceptInvite(code: string): Promise<AcceptResult> {
  if (!supabase) return { ok: false, reason: 'error' };
  try {
    const { data, error } = await supabase.rpc('friend_accept', { p_code: code });
    if (error) return { ok: false, reason: 'error' };
    const r = data as { ok?: boolean; name?: string; reason?: string } | null;
    if (r?.ok && typeof r.name === 'string') return { ok: true, name: r.name };
    const known: AcceptFailure[] = ['not signed in', 'name required', 'invalid', 'self', 'full'];
    return { ok: false, reason: known.includes(r?.reason as AcceptFailure) ? (r?.reason as AcceptFailure) : 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function fetchCircle(): Promise<Circle | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('friends');
    if (error) return null;
    const r = data as { friends?: unknown; blocked?: unknown } | null;
    const friends = Array.isArray(r?.friends)
      ? r.friends
          .filter((f): f is { name: string; since?: string } => !!f && typeof f.name === 'string')
          .map((f) => ({ name: f.name, since: String(f.since ?? '') }))
      : [];
    const blocked = Array.isArray(r?.blocked) ? r.blocked.filter((n): n is string => typeof n === 'string') : [];
    return { friends, blocked };
  } catch {
    return null;
  }
}

async function nameAction(fn: 'friend_remove' | 'friend_block' | 'friend_unblock', name: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc(fn, { p_name: name });
    return !error && data === true;
  } catch {
    return false;
  }
}

export const removeFriend = (name: string) => nameAction('friend_remove', name);
export const blockFriend = (name: string) => nameAction('friend_block', name);
export const unblockFriend = (name: string) => nameAction('friend_unblock', name);

// ---------------------------------------------------------------------------
// The invite that arrived before it could be used
// ---------------------------------------------------------------------------
// Not cleared on read: 'name required' means the code has to wait for a
// display name, and a stash that empties itself on the first look can't wait
// for anything. Cleared explicitly, once the accept has actually resolved.

const PENDING = 'anagrimoire:friendinvite:v1';

export function stashInvite(code: string): void {
  try {
    siteStore.setItem(PENDING, code);
  } catch {
    // storage unavailable — the link only works within this page view
  }
}

export function pendingInvite(): string | null {
  try {
    return siteStore.getItem(PENDING);
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    siteStore.removeItem(PENDING);
  } catch {
    // nothing to do — a stale code fails as 'invalid' at worst
  }
}
