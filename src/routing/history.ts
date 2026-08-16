// What the address bar should do next, as a function rather than an effect.
//
// This is the subtlest code in the app and it had no tests at all. It decides
// whether a state change pushes a history entry, replaces one, steps back, or
// does nothing — and getting it wrong is invisible until somebody presses Back
// and lands somewhere absurd. Pulling it out of the effect means the decision
// can be enumerated; the effect is left holding only the part that must touch
// `window`.
//
// The memo is the three refs the effect used to keep. They are carried in and
// out rather than mutated, so a test can put the machine in any state without
// rendering anything.

import { pathOf, type Route } from '@/routes';

/** An overlay sits on top of whatever you were doing rather than replacing it,
 *  so closing one should put back what was underneath.
 *
 *  A Record rather than a chain of `||`, so a twelfth route kind is a compile
 *  error here instead of silently defaulting to "not an overlay" — which is
 *  the shape of every drift this project has catalogued.
 *
 *  Note `stats` and `settings` are false. They are full-screen and behave as
 *  pages: opening one pushes, closing it pushes again, and Back reopens it.
 *  Whether that is right is a live question — but it is the current behaviour,
 *  and this table is where it is stated rather than implied. */
export const IS_OVERLAY: Record<Route['kind'], boolean> = {
  home: false,
  game: false,
  panel: true,
  stats: false,
  settings: false,
  account: true,
  legal: true,
  friend: false,
  ticket: false,
  reportAction: false,
  reportQueue: false,
};

export type HistoryOp =
  | { op: 'none' }
  | { op: 'push'; path: string }
  | { op: 'replace'; path: string }
  | { op: 'back' };

export type Memo = {
  /** the first render writes nothing */
  settled: boolean;
  /** did we push the entry currently on top? */
  ourOverlay: boolean;
  /** where we were, for the "leaving home" question */
  prev: Route | null;
};

export const FRESH: Memo = { settled: false, ourOverlay: false, prev: null };

/** Decide what to do about `next`, given where the browser currently is.
 *
 *  `here` is `location.pathname` and `hash` is `location.hash`; both are passed
 *  in rather than read, which is the only reason this is testable. */
export function historyStep(memo: Memo, next: Route, here: string, hash = ''): {
  op: HistoryOp;
  memo: Memo;
} {
  const path = pathOf(next);
  // "/" is a real page when it is the home page, and a placeholder when the
  // start page sends you straight to a game. Leaving the first should be a step
  // you can come back from; overwriting the second is the whole point.
  const leavingHome = memo.prev?.kind === 'home';
  const prev = next;

  // The first render writes nothing: someone who typed "/" keeps the tidy link
  // they typed, and a route asked for by hand is already on screen. Note this
  // leaves `ourOverlay` false even when the incoming route *is* an overlay —
  // arriving straight at /legal leaves nothing of ours behind it, so Back
  // should leave the site rather than close a panel we never opened.
  if (!memo.settled) {
    return { op: { op: 'none' }, memo: { ...memo, settled: true, prev } };
  }

  // Already there. Two ways to arrive here: the browser moved first (Back or
  // Forward, whose listener sets state to match) or nothing that matters
  // changed.
  //
  // `ourOverlay` is deliberately *not* updated on this path. That is how the
  // original behaved and it is load-bearing after a popstate — the entry on
  // top is the browser's now, not ours. It also means the comparison ignores
  // hash and search, so a route differing only in those does nothing. Both are
  // pinned by test rather than tidied here.
  if (path === here) return { op: { op: 'none' }, memo: { ...memo, prev } };

  // One overlay swapped for another — most often a panel's own tabs — replaces
  // the entry rather than stacking it, so leaving takes one Back and not one
  // per tab you read.
  //
  // The condition is "the previous route was an overlay too", not "we pushed
  // it". That distinction was the deep-linked-close bug: arriving straight at
  // /legal/notices leaves ourOverlay false, so switching to the Privacy tab
  // fell through to a push and set the flag true — and Close then stepped back
  // onto the arrival entry, which is *also* the panel, so the panel reopened
  // and the button appeared to do nothing.
  //
  // Moving within a panel is a replace whether or not we opened the panel. A
  // deep-linked one therefore keeps ourOverlay false all the way through, and
  // closing it takes the ordinary push below rather than stepping back onto
  // somebody else's entry.
  if (IS_OVERLAY[next.kind] && memo.prev && IS_OVERLAY[memo.prev.kind]) {
    return { op: { op: 'replace', path: path + hash }, memo: { ...memo, prev } };
  }

  // Closing an overlay we pushed is a step back, not a new address, so Back
  // does not reopen what was just dismissed.
  if (!IS_OVERLAY[next.kind] && memo.ourOverlay) {
    return { op: { op: 'back' }, memo: { ...memo, ourOverlay: false, prev } };
  }

  const op: HistoryOp =
    here === '/' && !leavingHome
      ? { op: 'replace', path: path + hash }
      : { op: 'push', path: path + hash };
  return { op, memo: { ...memo, ourOverlay: IS_OVERLAY[next.kind], prev } };
}
