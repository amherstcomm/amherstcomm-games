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

import type { Mode } from '@/storage';

export type View = 'solve' | 'play' | 'learn';
export type Slug = 'guess' | 'scramble' | 'hive' | 'grid' | 'boxed' | 'weave' | 'squares';
export type Panel = 'keys' | 'account' | 'about';
export type LegalDoc = 'notices' | 'privacy' | 'terms';
export type StatsTab = 'overall' | 'daily' | 'practice' | 'history' | 'boards';
export type SettingsTab = 'site' | 'games';

// the slug is what a person reads; the mode id is what storage is keyed on,
// so they don't have to match and 'pattern' stays put internally
const SLUG_MODE: Record<Slug, Mode> = {
  guess: 'pattern',
  scramble: 'descramble',
  hive: 'bee',
  grid: 'grid',
  boxed: 'boxed',
  weave: 'weave',
  squares: 'squares',
};

export const MODE_SLUG = Object.fromEntries(
  Object.entries(SLUG_MODE).map(([slug, mode]) => [mode, slug])
) as Record<Mode, Slug>;

// How each game is named in an invitation — plainer than the result title,
// which carries board size and word length the reader doesn't need yet.
export const SLUG_NAME: Record<Slug, string> = {
  guess: 'Guess the Word',
  scramble: 'Scramble',
  hive: 'Hive',
  grid: 'Grid',
  boxed: 'Boxed',
  weave: 'Weave',
  squares: 'Word Squares',
};

const VIEWS: View[] = ['solve', 'play', 'learn'];
const PANELS: Panel[] = ['keys', 'account', 'about'];
const DOCS: LegalDoc[] = ['notices', 'privacy', 'terms'];
const STATS_TABS: StatsTab[] = ['overall', 'daily', 'practice', 'history', 'boards'];
const SETTINGS_TABS: SettingsTab[] = ['site', 'games'];

// A panel with tabs names the tab, always — /stats/overall rather than a bare
// /stats that means the same thing. One state, one address, no exceptions to
// remember. The bare forms are still accepted and settle onto the first tab.
const DEFAULT_STATS: StatsTab = 'overall';
const DEFAULT_SETTINGS: SettingsTab = 'site';
const DEFAULT_DOC: LegalDoc = 'notices';

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
  | { kind: 'legal'; doc: LegalDoc };

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
    case 'legal':
      return `/legal/${route.doc}`;
  }
}

const VIEW_WORD: Record<View, string> = { solve: 'Solver', play: 'Play', learn: 'How to play' };

/** What the tab says, and what a search result would show. Every address
 *  returning one title makes 33 sitemap entries look like 33 copies of the
 *  same page. */
export function titleOf(route: Route): string {
  const suffix = ' · Anagrimoire';
  switch (route.kind) {
    case 'home':
      return 'Anagrimoire — word game solvers and daily puzzles';
    case 'game': {
      const name = SLUG_NAME[route.slug];
      if (route.view === 'play') return `${name} — ${route.daily ? 'Daily' : 'Practice'}${suffix}`;
      return `${name} — ${VIEW_WORD[route.view]}${suffix}`;
    }
    case 'stats':
      return `Statistics${suffix}`;
    case 'settings':
      return `Settings${suffix}`;
    case 'legal':
      return `${route.doc === 'privacy' ? 'Privacy policy' : route.doc === 'terms' ? 'Terms' : 'Notices'}${suffix}`;
    case 'panel':
      return `${route.panel === 'about' ? 'About & FAQ' : route.panel === 'account' ? 'Account' : 'Keyboard controls'}${suffix}`;
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

  // /sign-in and /account are the same panel wearing whichever face fits
  if (first === 'sign-in' || first === 'signin') return { kind: 'panel', panel: 'account' };
  if (PANELS.includes(first as Panel)) return { kind: 'panel', panel: first as Panel };

  if (first === 'daily' || VIEWS.includes(first as View)) {
    const slug = second ? canonicalSlug(second) : null;
    if (!slug) return null;
    if (first === 'daily') return { kind: 'game', view: 'play', slug, daily: true };
    // daily is only meaningful under /play; solve and learn carry it as false
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

export function modeOf(slug: Slug): Mode {
  return SLUG_MODE[slug];
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
  { param: 'solve', make: (slug) => ({ kind: 'game', view: 'solve', slug, daily: false }) },
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
// Where this load starts
// ---------------------------------------------------------------------------

// Read once, at import: every game reads the incoming route while building its
// initial state, and they must all see the same answer.
export const initialRoute: Route = (() => {
  if (typeof window === 'undefined') return { kind: 'home' };

  const legacy = legacyRoute(window.location.search);
  if (legacy) {
    // Drop the query as we go, so a bookmark taken now is the new address and
    // a reload doesn't keep re-reading a link the reader has moved on from.
    history.replaceState(null, '', pathOf(legacy) + window.location.hash);
    return legacy;
  }

  const route = parsePath(window.location.pathname);
  if (route) return route;

  history.replaceState(null, '', '/' + window.location.search + window.location.hash);
  return { kind: 'home' };
})();

export const initialGame = initialRoute.kind === 'game' ? initialRoute : null;

/** Games persist their own daily/practice toggle; an incoming link overrides it
 *  for the one game it names, and leaves the rest alone. */
export function dailyIntent(mode: Mode): boolean | null {
  if (!initialGame || initialGame.view !== 'play') return null;
  return SLUG_MODE[initialGame.slug] === mode ? initialGame.daily : null;
}
