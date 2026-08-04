// The daily/practice toggle belongs to each game: it persists the choice and
// it draws the switch. But the address bar has to say which board is open, and
// a link — or the Back button — has to be able to ask for the other one.
//
// This is that conversation, and nothing else. The alternative was a prop and
// an imperative handle threaded through all six games so App could reach in,
// which is a lot of plumbing for one boolean.

import type { Mode } from '@/storage';

type Report = (mode: Mode, daily: boolean) => void;

const reporters = new Set<Report>();
const switches = new Map<Mode, (daily: boolean) => void>();

/** A game saying which board it currently has open. */
export function reportDaily(mode: Mode, daily: boolean): void {
  for (const fn of reporters) fn(mode, daily);
}

/** App listening for the above. Returns an unsubscribe. */
export function onDailyReport(fn: Report): () => void {
  reporters.add(fn);
  return () => {
    reporters.delete(fn);
  };
}

/** A game offering to switch boards when an address asks it to. */
export function offerDailySwitch(mode: Mode, fn: (daily: boolean) => void): () => void {
  switches.set(mode, fn);
  return () => {
    // only clear our own: a remount registers the new one before the old
    // one's cleanup runs, and blindly deleting would leave nobody listening
    if (switches.get(mode) === fn) switches.delete(mode);
  };
}

/** An address asking a game to show the other board. Silently does nothing if
 *  that game isn't mounted, which is the right answer — it will read its own
 *  stored toggle when it does mount. */
export function requestDaily(mode: Mode, daily: boolean): void {
  switches.get(mode)?.(daily);
}
