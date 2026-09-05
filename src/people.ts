// Who may do what, from the browser's side.
//
// Nothing here decides anything. `can('users.manage')` decides, in the
// database, on every call — including the two refusals that matter: nobody
// hands out more than they hold, and the last administrator cannot be removed.
// The second is not recoverable from inside the application, so the page states
// it and the server enforces it.
import { supabase } from '@/supabase';

/** The ladder. `games.view` is never stored — being signed in is the proof, so
 *  it is what somebody has when they have no row at all. */
export const LADDER = ['games.view', 'games.edit', 'games.admin'] as const;
export type Role = (typeof LADDER)[number];

/** What each rung is called on a page, and what it lets somebody do. A table
 *  rather than a chain of ternaries, so a new rung that nobody named fails to
 *  compile. */
export const ROLE_LABEL: Record<Role, string> = {
  'games.view': 'Player',
  'games.edit': 'Editor',
  'games.admin': 'Administrator',
};

export const ROLE_MEANS: Record<Role, string> = {
  'games.view': 'Plays the games and appears on the leaderboard.',
  'games.edit': 'Builds and runs sessions, and sees who won.',
  'games.admin': 'Everything, including who else may do what.',
};

export type Person = {
  user: string;
  email: string | null;
  name: string | null;
  /** null for somebody who holds no row — an ordinary player */
  role: Role | null;
  granted_at?: string | null;
  /** whether this is the person reading the page */
  self?: boolean;
};

const fail = (reason: string) => ({ ok: false as const, reason });

export async function readPeople(): Promise<{
  ok: boolean;
  reason?: string;
  people?: Person[];
}> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('people_with_roles');
  if (error || !data) return fail(error?.message ?? 'unavailable');
  return data as { ok: boolean; reason?: string; people?: Person[] };
}

/** Search rather than list. The whole staff directory on a page is a different
 *  thing from "who can do what", and the question here is always about one
 *  person somebody already has in mind. Under two characters the server answers
 *  with nobody. */
export async function findPeople(query: string): Promise<Person[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('find_people', { p_query: query });
  if (error || !data) return [];
  return ((data as { people?: Person[] }).people ?? []) as Person[];
}

export async function setPersonRole(
  user: string,
  role: Role
): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('set_person_role', {
    p_user: user,
    p_role: role,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

/** What to call somebody. The address is the fallback rather than the other way
 *  round: a display name is what they chose, and two people called Dave are
 *  told apart by the address underneath it. */
export function nameOf(person: Person): string {
  return person.name || person.email || 'Somebody';
}
