// What this deployment says about itself, changed without rebuilding it.
//
// Everything here was a `VITE_` value first, and most of those can stay one: a
// name, an origin, an SSO provider are facts about the deployment, and a
// deployment is rebuilt when they change. What does not fit that shape is
// anything naming an *event* — "Employee Ownership Month" is true in October
// and false in November, and a container rebuild is an absurd way to say so.
//
// Three sources, in order, and the order is the whole design:
//
//   1. the database row, once it arrives
//   2. what this browser saw last time, read synchronously at module load
//   3. the build value, compiled in
//
// (2) exists because of (1)'s latency. The subtitle renders in the masthead,
// which is among the first things painted; a value that arrives after the paint
// does not render late, it renders *twice*, and the second one moves the page.
// A remembered value is almost always the right one, so almost nobody sees a
// change at all.
//
// It is remembered through `store` rather than localStorage, so it obeys the
// privacy level like everything else. At `essential` there is no cache, and the
// build value carries the first paint — which is the honest outcome rather than
// a special case: somebody who asked us not to keep things does not have things
// kept.
import { useSyncExternalStore } from 'react';
import { CONTACT_EMAIL_FALLBACK, SITE_SUBTITLE_FALLBACK } from '@/brand';
import { OFFICE_ZONE_FALLBACK } from '@/schedule';
import { store } from '@/siteStorage';
import { supabase } from '@/supabase';

/** The keys the server knows. Kept in step with `site_setting_keys` by
 *  tests/unit/settings.test.ts — a key this file invents is a form field that
 *  saves nothing, and a key only the server knows is one nothing displays. */
export const SETTING_KEYS = ['subtitle', 'announcement', 'contact_email', 'office_zone'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** What each one falls back to with no row. A table rather than a chain of
 *  ternaries, so a new key that nobody gave a fallback fails to compile. */
const FALLBACK: Record<SettingKey, string> = {
  subtitle: SITE_SUBTITLE_FALLBACK,
  announcement: '',
  contact_email: CONTACT_EMAIL_FALLBACK,
  office_zone: OFFICE_ZONE_FALLBACK,
};

const CACHE_KEY = 'anagrimoire:site-settings:v1';

type Rows = Partial<Record<SettingKey, string>>;

function clean(raw: unknown): Rows {
  if (!raw || typeof raw !== 'object') return {};
  const out: Rows = {};
  for (const key of SETTING_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    // Empty is not a value, it is the absence of one — the server leaves empty
    // rows out for the same reason, so an unset row and an unset variable mean
    // the same thing.
    if (typeof v === 'string' && v.trim() !== '') out[key] = v.trim();
  }
  return out;
}

function remembered(): Rows {
  try {
    const raw = store.getItem(CACHE_KEY);
    return raw ? clean(JSON.parse(raw)) : {};
  } catch {
    // A cache that cannot be read is a cache that is not there. It is not worth
    // a page for.
    return {};
  }
}

/** The current answer. Replaced wholesale rather than mutated, because
 *  useSyncExternalStore compares snapshots by identity. */
let rows: Rows = remembered();
const listeners = new Set<() => void>();

function publish(next: Rows): void {
  // Same values, same object: a new identity here re-renders every consumer on
  // every poll, and this is read by the masthead.
  const same =
    SETTING_KEYS.every((k) => rows[k] === next[k]) &&
    Object.keys(rows).length === Object.keys(next).length;
  if (same) return;
  rows = next;
  for (const l of listeners) l();
}

/** Ask the server. Safe to call when there is no client and safe to call
 *  twice; failure leaves whatever was already known in place, because a
 *  network blip is not a reason to forget the site's own name. */
export async function refreshSettings(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('read_site_settings');
  if (error || !data) return;
  const next = clean(data);
  publish(next);
  try {
    store.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // storage full, or declined — the value still applies for this page
  }
}

/** One setting, for code that is not a component: schedule.ts needs the zone
 *  while building formatters, which is not a render. */
export function setting(key: SettingKey): string {
  return rows[key] ?? FALLBACK[key];
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** One setting, for components, which re-render when it changes. */
export function useSetting(key: SettingKey): string {
  return useSyncExternalStore(
    subscribe,
    () => rows[key] ?? FALLBACK[key],
    () => FALLBACK[key]
  );
}

/** Test seam. The store is module state on purpose — it is read during a paint
 *  and there is exactly one site — which leaves tests needing a way back to a
 *  known one. */
export function __setSettingsForTest(next: Rows): void {
  publish(clean(next));
}
