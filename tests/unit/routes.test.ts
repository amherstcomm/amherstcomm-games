// The address algebra, pinned before the state machine that uses it moves.
//
// `pathOf` and `parsePath` are duals written by hand, and nothing has ever
// checked they are inverses. One test existed before this file and it covered
// `friend` and `account`; the other nine route kinds, `titleOf`, the aliases
// and the legacy query forms were all uncovered. That is a bad thing to be
// true of the code you are about to extract, because a refactor that quietly
// changes an address looks exactly like one that doesn't.
//
// The asymmetry to watch for: `pathOf` emits freely from a type, while
// `parsePath` gates on a list. Where those two disagree, a link the app itself
// produced fails to parse and lands on the front page — no error, no failing
// test, just a game that doesn't open. Deriving the unions from their arrays
// (stage 0) closes it structurally; this closes it by measurement.
import { describe, expect, it } from 'vitest';
import { ALL_SLUGS, ALL_VIEWS } from '@/games';
import {
  ACCOUNT_TABS,
  DOCS,
  PANELS,
  SETTINGS_TABS,
  STATS_TABS,
  legacyRoute,
  parsePath,
  pathOf,
  titleOf,
  urlOf,
  ORIGIN,
  type Route,
} from '@/routes';

/** Every address the app can produce, enumerated from the same lists the app
 *  enumerates — so a new game or a new tab lands here without anyone
 *  remembering to add it. */
const EVERY_ROUTE: Route[] = [
  { kind: 'home' },
  { kind: 'reportQueue' },
  { kind: 'ticket', ticket: '4f2ba9c17d' },
  { kind: 'reportAction', id: 'b0a1', token: 'deadbeef', action: 'dismiss' },
  { kind: 'reportAction', id: 'b0a1', token: 'deadbeef', action: '' },
  { kind: 'friend', code: '61e45286c813' },
  ...PANELS.map((panel) => ({ kind: 'panel', panel }) as const),
  ...DOCS.map((doc) => ({ kind: 'legal', doc }) as const),
  ...STATS_TABS.map((tab) => ({ kind: 'stats', tab }) as const),
  ...SETTINGS_TABS.map((tab) => ({ kind: 'settings', tab }) as const),
  ...ACCOUNT_TABS.map((tab) => ({ kind: 'account', tab }) as const),
  ...ALL_SLUGS.flatMap((slug) =>
    ALL_VIEWS.map((view) => ({ kind: 'game', view, slug, daily: view === 'play' }) as const)
  ),
  // and the free-play form, which is the same view with daily off
  ...ALL_SLUGS.map((slug) => ({ kind: 'game', view: 'play', slug, daily: false }) as const),
];

describe('every address round-trips', () => {
  it('parses back to something that emits the same path', () => {
    const broken = EVERY_ROUTE.filter((r) => {
      const back = parsePath(pathOf(r));
      return !back || pathOf(back) !== pathOf(r);
    }).map(pathOf);
    expect(broken, `these paths do not survive a round trip: ${broken.join(', ')}`).toEqual([]);
  });

  it('parses back to the same route, value for value', () => {
    // stronger than the path check: catches a parse that lands on a different
    // route which happens to render the same address
    for (const r of EVERY_ROUTE) {
      expect(parsePath(pathOf(r)), `for ${pathOf(r)}`).toEqual(r);
    }
  });

  it('gives every address its own title', () => {
    // The comment on titleOf says one title everywhere would make the sitemap
    // read as copies of one page. That claim has never been checked.
    const titles = EVERY_ROUTE.map(titleOf);
    expect(titles.filter((t) => !t)).toEqual([]);
    const games = EVERY_ROUTE.filter((r) => r.kind === 'game');
    expect(new Set(games.map(titleOf)).size, 'game titles collide').toBe(games.length);
  });

  it('builds absolute URLs from the same paths', () => {
    for (const r of EVERY_ROUTE) expect(urlOf(r)).toBe(ORIGIN + pathOf(r));
  });
});

describe('the forms people actually type', () => {
  it('settles a bare panel address onto its first tab', () => {
    expect(parsePath('/stats')).toEqual({ kind: 'stats', tab: 'overall' });
    expect(parsePath('/settings')).toEqual({ kind: 'settings', tab: 'site' });
    expect(parsePath('/legal')).toEqual({ kind: 'legal', doc: 'notices' });
    expect(parsePath('/account')).toEqual({ kind: 'account', tab: 'personal' });
  });

  it('accepts both spellings of the sign-in door', () => {
    expect(parsePath('/sign-in')).toEqual({ kind: 'account', tab: 'personal' });
    expect(parsePath('/signin')).toEqual({ kind: 'account', tab: 'personal' });
  });

  it('ignores case, because a typed address is not a keystroke record', () => {
    expect(parsePath('/DAILY/HIVE')).toEqual(parsePath('/daily/hive'));
    expect(parsePath('/Legal/Privacy')).toEqual({ kind: 'legal', doc: 'privacy' });
  });

  it('corrects the old slug rather than refusing it', () => {
    // /solve/pattern is out there in shared results
    // Both aliases at once: 'pattern' was the old slug and 'solve' was a view
    // that no longer exists. The address resolves to the board and corrects
    // itself, because a link somebody already holds is not their mistake.
    const r = parsePath('/solve/pattern');
    expect(r).toEqual({ kind: 'game', view: 'play', slug: 'guess', daily: false });
    expect(pathOf(r!)).toBe('/play/guess');
  });

  it('treats an unknown address as nothing rather than as something wrong', () => {
    // null means "front page"; the app has no server to ask and a word game
    // saying "not found" to a mistyped URL helps nobody
    for (const p of ['/account/enemies', '/stats/nope', '/legal/eula', '/play/nosuchgame', '/friend']) {
      expect(parsePath(p), `expected ${p} to be unrecognised`).toBeNull();
    }
  });

  it('reads the query forms the site used to use', () => {
    expect(legacyRoute('?daily=hive')).toEqual({ kind: 'game', view: 'play', slug: 'hive', daily: true });
    expect(legacyRoute('?play=weave')).toEqual({ kind: 'game', view: 'play', slug: 'weave', daily: false });
    expect(legacyRoute('?solve=boxed')).toEqual({ kind: 'game', view: 'play', slug: 'boxed', daily: false });
    expect(legacyRoute('?learn=grid')).toEqual({ kind: 'game', view: 'learn', slug: 'grid', daily: false });
    expect(legacyRoute('?legal=terms')).toEqual({ kind: 'legal', doc: 'terms' });
    expect(legacyRoute('?nothing=here')).toBeNull();
  });

  it('picks daily first when a link carries two of them', () => {
    // pinning the current precedence — it is the order of the LEGACY array,
    // which is an implementation detail until something depends on it
    expect(legacyRoute('?solve=hive&daily=weave')).toEqual({
      kind: 'game',
      view: 'play',
      slug: 'weave',
      daily: true,
    });
  });
});

describe('the parts that are easy to get subtly wrong', () => {
  it('only says "daily" under play', () => {
    // /solve/hive and /learn/hive have no daily/practice distinction, so the
    // address must not carry one — and a Route claiming daily:true on solve
    // cannot round-trip, which is how App's currentRoute can produce an
    // address it can never parse back
    expect(pathOf({ kind: 'game', view: 'solve', slug: 'hive', daily: true })).toBe('/solve/hive');
    expect(parsePath('/solve/hive')).toMatchObject({ daily: false });
  });

  it('drops an empty action from a report link rather than trailing a slash', () => {
    expect(pathOf({ kind: 'reportAction', id: 'a', token: 'b', action: '' })).toBe('/report/act/a/b');
    expect(parsePath('/report/act/a/b')).toEqual({
      kind: 'reportAction',
      id: 'a',
      token: 'b',
      action: '',
    });
  });

  it('treats a bare /report as the lookup form, not as a missing ticket', () => {
    expect(parsePath('/report')).toEqual({ kind: 'ticket', ticket: '' });
  });

  it('keeps /reports and /report/<code> apart', () => {
    expect(parsePath('/reports')).toEqual({ kind: 'reportQueue' });
    expect(parsePath('/report/reports')).toEqual({ kind: 'ticket', ticket: 'reports' });
  });
});
