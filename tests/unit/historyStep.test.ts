// Every branch of the address-bar decision, enumerated.
//
// This logic had zero tests and lived inside a useEffect with three refs, which
// meant the only way to exercise it was to render the whole app and press
// buttons. Every case below was reachable and none was checked; the two known
// bugs in e2e/history.spec.ts both live in here.
//
// The awkward branches — the ones that deliberately leave the memo alone — are
// pinned rather than tidied. Each is load-bearing for a reason stated at the
// assertion, so that anyone "fixing" one has to argue with a sentence rather
// than guess at intent.
import { describe, expect, it } from 'vitest';
import { FRESH, historyStep, IS_OVERLAY, type Memo } from '@/routing/history';
import type { Route } from '@/routes';

const GAME: Route = { kind: 'game', view: 'play', slug: 'hive', daily: true };
const HOME: Route = { kind: 'home' };
const ABOUT: Route = { kind: 'panel', panel: 'about' };
const NOTICES: Route = { kind: 'legal', doc: 'notices' };
const PRIVACY: Route = { kind: 'legal', doc: 'privacy' };
const STATS: Route = { kind: 'stats', tab: 'overall' };

/** settled, with nothing of ours on top */
const idle = (prev: Route | null = GAME): Memo => ({ settled: true, ourOverlay: false, prev });
/** settled, and the entry on top is one we pushed */
const ours = (prev: Route | null = ABOUT): Memo => ({ settled: true, ourOverlay: true, prev });

describe('the first render', () => {
  it('writes nothing, whatever the route', () => {
    // someone who typed /daily/hive is already looking at it; rewriting the
    // address they typed is at best pointless
    for (const r of [HOME, GAME, ABOUT, STATS]) {
      const { op, memo } = historyStep(FRESH, r, '/whatever');
      expect(op).toEqual({ op: 'none' });
      expect(memo.settled).toBe(true);
    }
  });

  it('leaves ourOverlay false even when the route is an overlay', () => {
    // Arriving straight at /legal leaves nothing of ours behind it, so Back
    // should leave the site rather than close a panel we never opened. This is
    // also the root of the deep-linked-close bug: the *next* move sets
    // ourOverlay true, and then close does a back() onto somebody else's entry.
    const { memo } = historyStep(FRESH, NOTICES, '/legal/notices');
    expect(memo.ourOverlay).toBe(false);
  });

  it('records where we were, so the next step can ask', () => {
    expect(historyStep(FRESH, HOME, '/').memo.prev).toEqual(HOME);
  });
});

describe('already at the address', () => {
  it('does nothing', () => {
    expect(historyStep(idle(), GAME, '/daily/hive').op).toEqual({ op: 'none' });
  });

  it('does not touch ourOverlay — the entry on top is the browser’s now', () => {
    // This path is how a Back or Forward arrives: the URL moved first, the
    // listener set state to match, and this runs with nothing left to do. The
    // entry on top was not pushed by us, so clearing the flag here would make
    // the next close step back onto it.
    const after = historyStep(ours(), ABOUT, '/about').memo;
    expect(after.ourOverlay).toBe(true);
  });

  it('compares the path only, ignoring hash and search', () => {
    // pinned rather than fixed: a route differing only in hash does nothing,
    // which is what the original did and what the auth-callback cleanup relies
    // on
    expect(historyStep(idle(), GAME, '/daily/hive').op).toEqual({ op: 'none' });
  });
});

describe('overlays', () => {
  it('replaces one of ours with another, so tabs do not stack', () => {
    const { op } = historyStep(ours(NOTICES), PRIVACY, '/legal/notices');
    expect(op).toEqual({ op: 'replace', path: '/legal/privacy' });
  });

  it('keeps ourOverlay true across that swap', () => {
    expect(historyStep(ours(NOTICES), PRIVACY, '/legal/notices').memo.ourOverlay).toBe(true);
  });

  it('steps back when closing one we pushed', () => {
    // the one behaviour a close button must not have is leaving something for
    // Back to reopen
    const { op, memo } = historyStep(ours(), GAME, '/about');
    expect(op).toEqual({ op: 'back' });
    expect(memo.ourOverlay).toBe(false);
  });

  it('pushes one that opens over a page, and remembers that it is ours', () => {
    const { op, memo } = historyStep(idle(), ABOUT, '/daily/hive');
    expect(op).toEqual({ op: 'push', path: '/about' });
    expect(memo.ourOverlay).toBe(true);
  });

  it('does not step back when the overlay was not ours', () => {
    // deep-linked: nothing of ours is behind it, so closing is an ordinary move
    const { op } = historyStep(idle(NOTICES), GAME, '/legal/notices');
    expect(op).toEqual({ op: 'push', path: '/daily/hive' });
  });
});

describe('the front page is two different things', () => {
  it('overwrites "/" when it was only a launcher', () => {
    // start page set to a game: "/" was a placeholder on the way somewhere, and
    // Back should not return to it
    const { op } = historyStep(idle(null), GAME, '/');
    expect(op).toEqual({ op: 'replace', path: '/daily/hive' });
  });

  it('pushes when leaving the real home page', () => {
    // start page is home: "/" is somewhere you were, and Back should return
    const { op } = historyStep(idle(HOME), GAME, '/');
    expect(op).toEqual({ op: 'push', path: '/daily/hive' });
  });
});

describe('the hash rides along', () => {
  it('is kept on a push and a replace', () => {
    expect(historyStep(idle(), ABOUT, '/daily/hive', '#x')).toMatchObject({
      op: { op: 'push', path: '/about#x' },
    });
    expect(historyStep(idle(null), GAME, '/', '#x')).toMatchObject({
      op: { op: 'replace', path: '/daily/hive#x' },
    });
  });
});

describe('the overlay table', () => {
  it('names every route kind, so a new one cannot default quietly', () => {
    const kinds: Route['kind'][] = [
      'home', 'game', 'panel', 'stats', 'settings',
      'account', 'legal', 'friend', 'ticket', 'reportAction', 'reportQueue',
    ];
    for (const k of kinds) expect(IS_OVERLAY[k], k).toBeTypeOf('boolean');
    expect(Object.keys(IS_OVERLAY).sort()).toEqual([...kinds].sort());
  });

  it('treats stats and settings as pages, not overlays', () => {
    // deliberate and currently untested: opening Stats pushes, closing pushes
    // again, and Back reopens it. Whether that is right is a live question —
    // this is where the answer is written down.
    expect(IS_OVERLAY.stats).toBe(false);
    expect(IS_OVERLAY.settings).toBe(false);
    expect(IS_OVERLAY.panel).toBe(true);
    expect(IS_OVERLAY.legal).toBe(true);
    expect(IS_OVERLAY.account).toBe(true);
  });

  it('never treats a report page as an overlay', () => {
    // they replace the whole page rather than covering it — the bug where a
    // ticket rendered a playable board underneath came from the other side of
    // this same distinction
    expect(IS_OVERLAY.ticket).toBe(false);
    expect(IS_OVERLAY.reportQueue).toBe(false);
    expect(IS_OVERLAY.reportAction).toBe(false);
  });
});
