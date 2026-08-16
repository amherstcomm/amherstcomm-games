// Where this load started.
//
// Memoised rather than computed at import, which is a real contract and not an
// optimisation. Ten games call `dailyIntent` while building their initial
// state, and they must all get the same answer — a plain function would re-read
// `window.location` after the address bar had already moved on, and the game
// mounted last would disagree with the game mounted first.
//
// It was a module-level IIFE in routes.ts, so importing that module performed a
// `history.replaceState` as a side effect and froze the answer at first import.
// That made routes.ts untestable without `vi.resetModules()` and a dynamic
// import per scenario, which is a strange price to pay for reading a URL.

import { legacyRoute, parsePath, pathOf, type Route } from '@/routes';
import { SLUG_MODE } from '@/games';
import type { Mode } from '@/games';

let cached: Route | null = null;

/** The address this page load arrived at, normalised.
 *
 *  Rewrites the bar in two cases: a legacy `?daily=hive` query becomes the path
 *  it means, so a bookmark taken now is the new address and a reload doesn't
 *  re-read a link the reader has moved on from; and an address we don't
 *  recognise becomes "/", because there is no server to ask and a word game
 *  saying "not found" to a typo helps nobody. */
export function entryRoute(): Route {
  if (cached) return cached;
  if (typeof window === 'undefined') return (cached = { kind: 'home' });

  const legacy = legacyRoute(window.location.search);
  if (legacy) {
    history.replaceState(null, '', pathOf(legacy) + window.location.hash);
    return (cached = legacy);
  }

  const route = parsePath(window.location.pathname);
  if (route) return (cached = route);

  history.replaceState(null, '', '/' + window.location.search + window.location.hash);
  return (cached = { kind: 'home' });
}

export function entryGame(): Extract<Route, { kind: 'game' }> | null {
  const r = entryRoute();
  return r.kind === 'game' ? r : null;
}

/** Games persist their own daily/practice toggle; an incoming link overrides it
 *  for the one game it names, and leaves the rest alone. */
export function dailyIntent(mode: Mode): boolean | null {
  const game = entryGame();
  if (!game || game.view !== 'play') return null;
  return SLUG_MODE[game.slug] === mode ? game.daily : null;
}

/** Tests only: forget the memo so another location can be read. Nothing in the
 *  app calls this — a page load has exactly one entry route, which is the whole
 *  point of the memo. */
export function forgetEntry(): void {
  cached = null;
}
