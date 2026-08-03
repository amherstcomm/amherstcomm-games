// Links that open a specific board, so a shared result lands the reader on the
// puzzle it came from rather than the front page.
//
//   anagrimoire.com/?daily=hive     today's Hive, ready to play
//   anagrimoire.com/?play=weave     Weave in free play
//   anagrimoire.com/?solve=boxed    the Boxed solver
//   anagrimoire.com/?learn=grid     how Grid works
//
// The slugs are the names people see in the nav, not our internal mode ids —
// a link is something a human reads before they click it.
import type { Mode } from '@/storage';

// Share from dev and the link points at dev; www is folded into the apex so
// shared text reads the way the site is canonically named.
function siteOrigin(): string {
  if (typeof window === 'undefined') return 'https://anagrimoire.com';
  const { protocol, host } = window.location;
  return `${protocol}//${host.replace(/^www\./, '')}`;
}

export const ORIGIN = siteOrigin();
export const SITE = ORIGIN.replace(/^https?:\/\//, '');

export type View = 'solve' | 'play' | 'learn';
export type Slug = 'pattern' | 'scramble' | 'hive' | 'grid' | 'boxed' | 'weave';

const SLUG_MODE: Record<Slug, Mode> = {
  pattern: 'pattern',
  scramble: 'descramble',
  hive: 'bee',
  grid: 'grid',
  boxed: 'boxed',
  weave: 'weave',
};

// How each game is named in an invitation — plainer than the result title,
// which carries board size and word length the reader doesn't need yet.
export const SLUG_NAME: Record<Slug, string> = {
  pattern: 'Guess the Word',
  scramble: 'Scramble',
  hive: 'Hive',
  grid: 'Grid',
  boxed: 'Boxed',
  weave: 'Weave',
};

// param name -> what it selects. `daily` and `play` both open the Play tab;
// they differ only in which board is waiting there.
const PARAMS: { param: string; view: View; daily: boolean | null }[] = [
  { param: 'daily', view: 'play', daily: true },
  { param: 'play', view: 'play', daily: false },
  { param: 'solve', view: 'solve', daily: null },
  { param: 'learn', view: 'learn', daily: null },
];

export function gameUrl(slug: Slug, view: View, daily: boolean): string {
  const param = view === 'play' ? (daily ? 'daily' : 'play') : view;
  return `${ORIGIN}/?${param}=${slug}`;
}

export type Intent = { mode: Mode; view: View; daily: boolean | null };

function parse(): Intent | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  for (const { param, view, daily } of PARAMS) {
    const slug = q.get(param) as Slug | null;
    if (slug && slug in SLUG_MODE) return { mode: SLUG_MODE[slug], view, daily };
  }
  return null;
}

// Read once, at import time: every game reads this while building its initial
// state, and they must all see the same answer.
export const intent = parse();

// ?legal=privacy and ?legal=terms open the documents directly. OAuth consent
// screens and app listings all want a link to a privacy policy, and a link
// that needs someone to find a modal first isn't one.
export type LegalDoc = 'privacy' | 'terms';

export const legalIntent: LegalDoc | null = (() => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('legal');
  return v === 'privacy' || v === 'terms' ? v : null;
})();

// Games persist their own daily/practice toggle; an incoming link overrides it
// for the one game it names, and leaves the rest alone.
export function dailyIntent(mode: Mode): boolean | null {
  return intent && intent.mode === mode ? intent.daily : null;
}

// Once the intent is applied the query string has done its job. Leaving it in
// place would re-select this game on every later reload, long after the reader
// has moved on.
export function clearIntentUrl(): void {
  if (!intent && !legalIntent) return;
  history.replaceState(null, '', window.location.pathname + window.location.hash);
}
