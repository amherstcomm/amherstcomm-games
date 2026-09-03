// Every address the site answers to.
//
//   /                    wherever you left off
//   /solve/pattern       a solver
//   /play/hive           free play
//   /daily/hive          today's puzzle
//   /learn/grid          how it works
//   /stats /keys /settings /account /about
//   /legal /legal/notices /legal/privacy /legal/terms
//
// The slugs are the names people see in the nav, not our internal mode ids —
// a link is something a human reads before they click it.
//
// Render rewrites every path to index.html, so these are ordinary URLs: they
// survive a refresh, they can be typed, and they mean the same thing tomorrow.

import { SITE_NAME } from '@/brand';
import { ALL_VIEWS, MODE_SLUG, modeOf, SLUG_MODE, SLUG_NAME } from '@/games';
import type { Slug, View } from '@/games';

// Re-exported so the ~50 modules that import these from here don't all have to
// move. `src/games.ts` is the one declaration; this is a door onto it.
export { MODE_SLUG, SLUG_NAME, modeOf, SLUG_MODE };
export type { Slug, View };

// Each of these is one list, read twice — once as the set of values the type
// admits, once as the set `parsePath` will accept. They used to be a type and
// a separate array, which is two places to add a tab and one to forget: add a
// StatsTab without adding it to the array and `pathOf` emits an address that
// `parsePath` then rejects, so a real link 404s to the front page and nothing
// anywhere fails.
export const PANELS = ['keys', 'about'] as const;
export type Panel = (typeof PANELS)[number];

export const DOCS = ['notices', 'privacy', 'terms'] as const;
export type LegalDoc = (typeof DOCS)[number];

export const STATS_TABS = ['overall', 'daily', 'practice', 'history', 'boards'] as const;
export type StatsTab = (typeof STATS_TABS)[number];

export const SETTINGS_TABS = ['site', 'games', 'privacy'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const ACCOUNT_TABS = ['personal', 'friends'] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number];

const VIEWS = ALL_VIEWS;

// A panel with tabs names the tab, always — /stats/overall rather than a bare
// /stats that means the same thing. One state, one address, no exceptions to
// remember. The bare forms are still accepted and settle onto the first tab.
const DEFAULT_STATS: StatsTab = 'overall';
const DEFAULT_SETTINGS: SettingsTab = 'site';
const DEFAULT_DOC: LegalDoc = 'notices';
const DEFAULT_ACCOUNT: AccountTab = 'personal';

// Share from dev and the link points at dev; www is folded into the apex so
// shared text reads the way the site is canonically named.
function siteOrigin(): string {
  if (typeof window === 'undefined') return 'https://anagrimoire.com';
  const { protocol, host } = window.location;
  return `${protocol}//${host.replace(/^www\./, '')}`;
}

export const ORIGIN = siteOrigin();
export const SITE = ORIGIN.replace(/^https?:\/\//, '');

// A panel sits on top of whatever you were doing rather than replacing it, so
// the address bar shows the panel and closing it puts the game back.
export type Route =
  | { kind: 'home' }
  | { kind: 'game'; view: View; slug: Slug; daily: boolean }
  | { kind: 'panel'; panel: Panel }
  | { kind: 'stats'; tab: StatsTab }
  | { kind: 'settings'; tab: SettingsTab }
  // account grew tabs when friends moved in, so it names them like the others
  | { kind: 'account'; tab: AccountTab }
  | { kind: 'legal'; doc: LegalDoc }
  // a friend invite landing: opens the account panel on its friends tab
  | { kind: 'friend'; code: string }
  // a reporter checking on their own ticket. Public, and it answers with a
  // status and nothing else — the code names a report, it does not guard one.
  | { kind: 'ticket'; ticket: string }
  // the owner acting on one, from a link in the digest. Two keys: the token in
  // the address, and being signed in as an owner when the page asks. Neither
  // is sufficient, which is what makes it safe to put in an email.
  | { kind: 'reportAction'; id: string; token: string; action: string }
  // the owner's queue. A real address rather than a panel, because it is a
  // page you leave open and come back to.
  | { kind: 'reportQueue' };

export function pathOf(route: Route): string {
  switch (route.kind) {
    case 'home':
      return '/';
    case 'game':
      if (route.view === 'play') return `/${route.daily ? 'daily' : 'play'}/${route.slug}`;
      return `/${route.view}/${route.slug}`;
    case 'panel':
      return `/${route.panel}`;
    case 'stats':
      return `/stats/${route.tab}`;
    case 'settings':
      return `/settings/${route.tab}`;
    case 'account':
      return `/account/${route.tab}`;
    case 'legal':
      return `/legal/${route.doc}`;
    case 'friend':
      return `/friend/${route.code}`;
    case 'ticket':
      return `/report/${route.ticket}`;
    case 'reportAction':
      return `/report/act/${route.id}/${route.token}${route.action ? `/${route.action}` : ''}`;
    case 'reportQueue':
      return '/reports';
  }
}

const VIEW_WORD: Record<View, string> = { play: 'Play', learn: 'How to play' };

/** What the tab says, and what a search result would show. Every address
 *  returning one title makes 33 sitemap entries look like 33 copies of the
 *  same page. */
export function titleOf(route: Route): string {
  // The tab title is set here on every route change, which means it overrides
  // the one index.html ships with. Renaming the static title alone left the
  // site introducing itself correctly for a few milliseconds and then calling
  // itself something else for the rest of the visit.
  const suffix = ` · ${SITE_NAME}`;
  switch (route.kind) {
    case 'home':
      return SITE_NAME;
    case 'game': {
      const name = SLUG_NAME[route.slug];
      if (route.view === 'play') return `${name} — ${route.daily ? 'Daily' : 'Practice'}${suffix}`;
      return `${name} — ${VIEW_WORD[route.view]}${suffix}`;
    }
    case 'stats':
      return `Statistics${suffix}`;
    case 'settings':
      return `Settings${suffix}`;
    case 'account':
      return `Account${suffix}`;
    case 'legal':
      return `${route.doc === 'privacy' ? 'Privacy policy' : route.doc === 'terms' ? 'Terms' : 'Notices'}${suffix}`;
    case 'panel':
      return `${route.panel === 'about' ? 'About & FAQ' : 'Keyboard controls'}${suffix}`;
    case 'friend':
      return `Friend invite${suffix}`;
    case 'ticket':
      return `Report status${suffix}`;
    case 'reportAction':
      return `Handle a report${suffix}`;
    case 'reportQueue':
      return `Open reports${suffix}`;
  }
}

export function urlOf(route: Route): string {
  return ORIGIN + pathOf(route);
}

/** Unknown paths return null and are treated as the front page rather than as
 *  a 404 — there is no server here to ask, and a word game that says "not
 *  found" to a mistyped URL helps nobody. */
export function parsePath(pathname: string): Route | null {
  const parts = pathname.toLowerCase().split('/').filter(Boolean);
  if (!parts.length) return { kind: 'home' };

  const [first, second] = parts;

  if (first === 'legal') {
    if (second === undefined) return { kind: 'legal', doc: DEFAULT_DOC };
    return DOCS.includes(second as LegalDoc) ? { kind: 'legal', doc: second as LegalDoc } : null;
  }

  if (first === 'stats') {
    if (second === undefined) return { kind: 'stats', tab: DEFAULT_STATS };
    return STATS_TABS.includes(second as StatsTab) ? { kind: 'stats', tab: second as StatsTab } : null;
  }

  if (first === 'settings') {
    if (second === undefined) return { kind: 'settings', tab: DEFAULT_SETTINGS };
    return SETTINGS_TABS.includes(second as SettingsTab)
      ? { kind: 'settings', tab: second as SettingsTab }
      : null;
  }

  // An invite link. The code is hex from the minting side, so the lowercasing
  // above can't damage it.
  if (first === 'friend') {
    return second ? { kind: 'friend', code: second } : null;
  }

  // A ticket. Hex from the minting side too, so lowercasing is safe. A bare
  // /report is the lookup form with nothing typed into it yet.
  if (first === 'reports') return { kind: 'reportQueue' };

  if (first === 'report') {
    // /report/act/<id>/<token>[/<action>] is the owner's door; anything else
    // under /report is a ticket, including nothing at all.
    if (second === 'act') {
      const [, , id, token, action] = parts;
      return id && token ? { kind: 'reportAction', id, token, action: action ?? '' } : null;
    }
    return { kind: 'ticket', ticket: second ?? '' };
  }

  if (first === 'account') {
    if (second === undefined) return { kind: 'account', tab: DEFAULT_ACCOUNT };
    return ACCOUNT_TABS.includes(second as AccountTab)
      ? { kind: 'account', tab: second as AccountTab }
      : null;
  }

  // /sign-in and /account are the same panel wearing whichever face fits
  if (first === 'sign-in' || first === 'signin') return { kind: 'account', tab: DEFAULT_ACCOUNT };
  if (PANELS.includes(first as Panel)) return { kind: 'panel', panel: first as Panel };

  // 'solve' is not a view any more, but the address is out there in shared
  // results — it resolves to the board, and the URL corrects itself because
  // the address bar follows state.
  if (first === 'daily' || first === 'solve' || VIEWS.includes(first as View)) {
    const slug = second ? canonicalSlug(second) : null;
    if (!slug) return null;
    if (first === 'daily') return { kind: 'game', view: 'play', slug, daily: true };
    if (first === 'solve') return { kind: 'game', view: 'play', slug, daily: false };
    // daily is only meaningful under /play; learn carries it as false
    return { kind: 'game', view: first as View, slug, daily: false };
  }

  return null;
}

// /solve/pattern was the address for a while and is out there in shared
// results. It resolves to the same board and the URL corrects itself, because
// parsePath hands back the canonical slug and the address bar follows state.
const SLUG_ALIASES: Record<string, Slug> = { pattern: 'guess' };

function canonicalSlug(raw: string): Slug | null {
  if (raw in SLUG_MODE) return raw as Slug;
  return SLUG_ALIASES[raw] ?? null;
}

/** The link that goes out with a shared result. */
export function gameUrl(slug: Slug, view: View, daily: boolean): string {
  return urlOf({ kind: 'game', view, slug, daily });
}

// ---------------------------------------------------------------------------
// The old query links
// ---------------------------------------------------------------------------

// ?daily=hive and friends were the addresses for a while, and they are out
// there in shared results and in Google's OAuth console. They keep working:
// translated to a path and swapped in before anything reads the location, so
// the rest of the app only ever sees the new form.
const LEGACY: { param: string; make: (slug: Slug) => Route }[] = [
  { param: 'daily', make: (slug) => ({ kind: 'game', view: 'play', slug, daily: true }) },
  { param: 'play', make: (slug) => ({ kind: 'game', view: 'play', slug, daily: false }) },
  // The solve view is gone, but an address that names it should still land
  // somewhere sensible rather than nowhere. Both spellings resolve to the
  // board — a link somebody already has is not their mistake.
  { param: 'solve', make: (slug) => ({ kind: 'game', view: 'play', slug, daily: false }) },
  { param: 'learn', make: (slug) => ({ kind: 'game', view: 'learn', slug, daily: false }) },
];

export function legacyRoute(search: string): Route | null {
  const q = new URLSearchParams(search);
  for (const { param, make } of LEGACY) {
    const raw = q.get(param);
    const slug = raw ? canonicalSlug(raw) : null;
    if (slug) return make(slug);
  }
  const doc = q.get('legal');
  if (doc && DOCS.includes(doc as LegalDoc)) return { kind: 'legal', doc: doc as LegalDoc };
  return null;
}

// ---------------------------------------------------------------------------
// Where this load started now lives in src/routing/entry.ts, memoised rather
// than computed at import. It ran here as a module-level IIFE, so importing
// this file performed a history.replaceState as a side effect and froze the
// answer — which made every address function below untestable without
// resetting the module registry between scenarios.
