// What this deployment is currently offering.
//
// Ten games, four ways to play each, three difficulties. Most deployments want
// all of it, which is why this is a list of *absences*: no row means available,
// an empty answer is the ordinary one, and a fresh deployment is complete
// without anybody switching anything on.
//
// Distinct from the per-user hiding in storage.ts, and the difference matters.
// Hiding a game is a preference — the person chose it and can choose otherwise,
// so `visibleModes` falls back to showing everything if they somehow hid the
// lot. This is the deployment's decision, so it is not a fallback and not
// negotiable from the browser: a game switched off is gone from the menu *and*
// refused at its own address, or switching it off would mean nothing to anybody
// who had bookmarked it.
//
// It is still only the client's half. Nothing here protects data — a hidden
// game's daily is still in the feed and its RPCs still answer. What it does is
// decide what this deployment is offering, which is a presentation question,
// and treating it as a security boundary would be the wrong kind of confidence.
import { useSyncExternalStore } from 'react';
import { store } from '@/siteStorage';
import { supabase } from '@/supabase';

/** `game:hive`, `view:solve`, `difficulty:extreme`. The vocabulary lives here
 *  and in src/games.ts rather than in the database, which stores whatever it is
 *  handed against a shape — a copy of the game list in SQL would be a copy to
 *  keep in step. */
export type Feature =
  | `game:${string}`
  | `view:${string}`
  | `difficulty:${string}`
  // Not a game and not a way of playing one — sessions, and whatever else turns
  // out to be switchable that nobody plays.
  | `site:${string}`;

const CACHE_KEY = 'anagrimoire:availability:v1';

function clean(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    // Kept in step with the constraint in schema.sql by
    // tests/unit/availability.test.ts — a kind the server allows and this drops
    // is a switch that saves and does nothing, which is how `site:sessions`
    // first behaved.
    (f): f is string =>
      typeof f === 'string' && /^(game|view|difficulty|site):[a-z0-9-]{1,32}$/.test(f)
  );
}

function remembered(): string[] {
  try {
    const raw = store.getItem(CACHE_KEY);
    return raw ? clean(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Read synchronously at module load, for the same reason the site settings
 *  are: the menu is painted early, and a game that appears and then vanishes is
 *  worse than one that was never drawn. */
let off = new Set(remembered());
const listeners = new Set<() => void>();
/** The snapshot useSyncExternalStore compares by identity — a new Set on every
 *  read would re-render every consumer forever. */
let snapshot: string[] = [...off];

function publish(next: string[]): void {
  const same = next.length === snapshot.length && next.every((f) => off.has(f));
  if (same) return;
  off = new Set(next);
  snapshot = next;
  for (const l of listeners) l();
}

export async function refreshAvailability(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('read_availability');
  if (error || !data) return;
  const next = clean(data);
  publish(next);
  try {
    store.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // declined storage, or full — it still applies for this page
  }
}

/** For code that is not a component. */
export function isOffered(feature: Feature): boolean {
  return !off.has(feature);
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The whole set, for components that filter a list by it. Returns the array
 *  rather than a predicate so the identity is stable between renders. */
export function useUnavailable(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot
  );
}

/** Whatever of `all` this deployment is currently offering.
 *
 *  Takes the unavailable list rather than reading module state, so a component
 *  filtering with it has a real dependency the compiler and the linter can both
 *  see. Reading it from inside made the `useUnavailable()` in the dependency
 *  array look unnecessary, which is a warning that would eventually be silenced
 *  and then be right.
 *
 *  No fallback: an empty result means the deployment is offering none of them,
 *  and drawing them anyway would be the interface overruling the person who
 *  switched them off. The caller says what an empty list looks like — which is
 *  a sentence, not a menu of things that do not work.
 */
export function offered<T extends string>(
  unavailable: string[],
  kind: 'game' | 'view' | 'difficulty',
  all: T[]
): T[] {
  const hidden = new Set(unavailable);
  return all.filter((one) => !hidden.has(`${kind}:${one}`));
}

/** Test seam, as in settings.ts — module state is right for a thing read
 *  during a paint, and leaves tests needing a way back to a known one. */
export function __setAvailabilityForTest(unavailable: string[]): void {
  publish(clean(unavailable));
}
