// What a signed-in person is allowed to do.
//
// Zitadel names three: games.view plays, games.edit sets games up and sees
// winners, games.admin does everything including acting on other people.
//
// **These names are read twice and declared once.** The same three strings are
// the CHECK constraint on public.role_grants, and tests/unit/roles.test.ts
// asserts this list against that one — two lists that must agree are one list
// read twice, and the day they disagree is the day a role the interface offers
// is rejected by the database with no error anyone will connect to it.
//
// What this module is *not* is an authorization boundary. It decides what to
// draw. Every decision that matters is made in Postgres by has_role(), because
// the roles arrive in the token as user_metadata and GoTrue lets the user who
// holds a session rewrite that:
//
//   await supabase.auth.updateUser({ data: { roles: ['games.admin'] } })
//
// So a hostile client can make this module say anything. It cannot make
// role_grants say anything, which is why that table is what the server reads.
import { supabase } from '@/supabase';

/** Lowest privilege first. Order is meaning here, not presentation — the
 *  index is the rank, and public.role_rank() in the schema is the same ladder
 *  written in SQL. */
export const ROLES = ['games.view', 'games.edit', 'games.admin'] as const;
export type Role = (typeof ROLES)[number];

/** Rank, mirroring public.role_rank(). Zero would mean "unrecognised", which
 *  is why an unknown name is not in the table at all rather than mapped to
 *  something harmless-looking. */
export function rank(role: string): number {
  const i = (ROLES as readonly string[]).indexOf(role);
  return i < 0 ? 0 : i + 1;
}

/** Does a held set satisfy a requirement? Holding one privilege implies every
 *  privilege below it, so an admin needs no separate editor grant.
 *
 *  An unrecognised requirement is never satisfied. The naive version — compare
 *  the highest held rank against the required rank — says yes to everybody
 *  when the requirement ranks 0, so a typo would open a surface rather than
 *  close it. Same guard as the SQL, for the same reason. */
export function atLeast(held: readonly string[], needed: string): boolean {
  const want = rank(needed);
  if (want === 0) return false;
  return held.some((r) => rank(r) >= want);
}

/** The caller's own roles, from the database rather than from the token.
 *
 *  Empty is the honest answer for a signed-out visitor, for a deployment with
 *  no Supabase at all, and for a signed-in person holding nothing above the
 *  floor — all three should draw the same interface, so none of them is an
 *  error worth distinguishing here. */
export async function myRoles(): Promise<Role[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('my_roles');
  if (error || !Array.isArray(data)) return [];
  return (data as string[]).filter((r): r is Role => rank(r) > 0);
}
