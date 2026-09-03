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

/** Does a held *set of grants* satisfy a requirement?
 *
 *  Grants, not privileges — the two differ at the bottom of the ladder.
 *  games.view is never granted a row, because Zitadel granting the application
 *  is what proves it, so `atLeast([], 'games.view')` is false here while
 *  has_role('games.view') is true in Postgres for any session. That is not a
 *  disagreement to fix by mirroring the floor: a gate should ask what someone
 *  may *do* — `allows(capabilities, 'games.play')` — rather than what tier
 *  they were filed under. This function is for reasoning about grants.
 *
 *  Holding one privilege implies every privilege below it, so an admin needs
 *  no separate editor grant.
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

/** What each privilege unlocks is data, not code — the rows in
 *  public.capabilities, editable by an admin without a deploy. These names are
 *  the vocabulary: a gate asks for one of them, and a row says which privilege
 *  reaches it.
 *
 *  Read twice like ROLES is, and asserted against the seed in schema.sql by
 *  tests/unit/roles.test.ts. A capability the interface asks about but nothing
 *  seeds is not an error at either end — `can()` returns false, the button
 *  never appears, and nobody finds out why. */
export const CAPABILITIES = [
  'games.play',
  'winners.view',
  'games.setup',
  'reports.read',
  'reports.act',
  'users.manage',
  'permissions.manage',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Everything the caller may do, asked once rather than per button.
 *
 *  Empty for a signed-out visitor and for a deployment with no Supabase, which
 *  is the same interface either way — so neither is distinguished here. */
export async function myCapabilities(): Promise<Capability[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('my_capabilities');
  if (error || !Array.isArray(data)) return [];
  const known = new Set<string>(CAPABILITIES);
  return (data as string[]).filter((c): c is Capability => known.has(c));
}

/** Whether a fetched set allows something. Absent means no — the same rule the
 *  SQL uses, and for the same reason: a gate that is silently always-false
 *  gets reported, a gate that is silently always-true does not. */
export function allows(held: readonly string[], capability: Capability): boolean {
  return held.includes(capability);
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
