// Where a page load started, and why it is remembered.
//
// The memo is a contract, not an optimisation. Ten games call `dailyIntent`
// while building their initial state and they must all get the same answer — a
// plain function would re-read `window.location` after the address bar had
// already been rewritten, and the game mounted last would disagree with the
// game mounted first about which board to open.
//
// This also exists because the old version could not be tested at all. It was a
// module-level IIFE in routes.ts, so importing that module performed a
// `history.replaceState` as a side effect and froze the answer at first import
// — every scenario needed the module registry reset and a dynamic import.
import { beforeEach, describe, expect, it } from 'vitest';
import { dailyIntent, entryGame, entryRoute, forgetEntry } from '@/routing/entry';

/** Put the browser at an address, then let the next read see it. */
function at(url: string) {
  history.replaceState(null, '', url);
  forgetEntry();
}

beforeEach(() => at('/'));

describe('reading the incoming address', () => {
  it('reads a game link', () => {
    at('/daily/hive');
    expect(entryRoute()).toEqual({ kind: 'game', view: 'play', slug: 'hive', daily: true });
    expect(entryGame()?.slug).toBe('hive');
  });

  it('is not a game when it is a panel', () => {
    at('/legal/privacy');
    expect(entryGame()).toBeNull();
  });

  it('rewrites a legacy query to the address it means', () => {
    at('/?daily=weave');
    expect(entryRoute()).toEqual({ kind: 'game', view: 'play', slug: 'weave', daily: true });
    // and the bar is corrected, so a bookmark taken now is the new address and
    // a reload does not re-read a link the reader has moved on from
    expect(window.location.pathname).toBe('/daily/weave');
    expect(window.location.search).toBe('');
  });

  it('sends an address we do not know to the front page, and tidies the bar', () => {
    at('/no/such/place');
    expect(entryRoute()).toEqual({ kind: 'home' });
    expect(window.location.pathname).toBe('/');
  });
});

describe('the memo', () => {
  it('answers the same thing after the address bar has moved on', () => {
    // This is the whole reason it is memoised. The app rewrites the URL as soon
    // as it settles, and the ten games read this while mounting — some of them
    // after that rewrite. Without the memo they would disagree.
    at('/daily/bridge');
    const first = entryRoute();
    history.replaceState(null, '', '/solve/guess');
    expect(entryRoute()).toEqual(first);
  });

  it('gives every game the same answer, whenever it asks', () => {
    at('/daily/ladder');
    const asked = ['ladder', 'bee', 'bridge'] as const;
    const answers = asked.map((m) => dailyIntent(m));
    history.replaceState(null, '', '/');
    expect(asked.map((m) => dailyIntent(m))).toEqual(answers);
  });
});

describe('what an incoming link says about the daily toggle', () => {
  it('overrides the stored choice for the game it names', () => {
    at('/daily/hive');
    expect(dailyIntent('bee')).toBe(true);
    at('/play/hive');
    expect(dailyIntent('bee')).toBe(false);
  });

  it('says nothing about the games it does not name', () => {
    // otherwise a link to one game would reset everybody else's toggle
    at('/daily/hive');
    expect(dailyIntent('bridge')).toBeNull();
    expect(dailyIntent('pattern')).toBeNull();
  });

  it('says nothing at all when the link is not a play link', () => {
    at('/learn/hive');
    expect(dailyIntent('bee')).toBeNull();
    at('/legal/terms');
    expect(dailyIntent('bee')).toBeNull();
  });

  it('reads a retired /solve link as the practice board', () => {
    // /solve used to say nothing about the daily toggle, because a solver was
    // neither. The view is gone and the address now resolves to the board — so
    // it expresses an opinion it did not used to, and practice is the closer
    // equivalent of a solver than a daily is.
    //
    // Harmless here because no /solve link was ever shared from this
    // deployment; it exists so an address that used to work still lands
    // somewhere rather than nowhere.
    at('/solve/hive');
    expect(dailyIntent('bee')).toBe(false);
  });
});
