// What this site is allowed to keep on your device.
//
// None of this is legally required — storage a service needs to do the job you
// asked it to do is exempt, and boards, settings and statistics are exactly
// that. It's here because "we store things on your device" deserves an answer
// other than a banner that only offers yes, and because the honest version of
// declining is not "the site breaks" but "it forgets".
//
// Three levels, in order of how much survives closing the tab:
//
//   full       everything, as before — boards, settings, statistics, sign-in
//   essential  the sign-in and your two answers here; nothing else touches the
//              disk. Signed in, your dailies and settings still follow you,
//              because they live in your account rather than this browser.
//   session    nothing at all. Everything lives in memory, so a whole session
//              plays normally and a refresh starts over.
//
// Everything in the app reads and writes through `store` rather than
// localStorage directly, so the level is enforced in one place instead of
// fifteen.

export type StorageLevel = 'full' | 'essential' | 'session';

const LEVEL_KEY = 'anagrimoire:storage:v1';

/** Keys that survive at 'essential': the record of what you chose (or we'd ask
 *  on every load and never be able to honour the answer), your analytics
 *  answer, and the token that keeps you signed in. */
function isEssential(key: string): boolean {
  return (
    key === LEVEL_KEY ||
    key.startsWith('anagrimoire:analytics-consent') ||
    // supabase-js writes its session under sb-<project ref>-auth-token
    key.startsWith('sb-')
  );
}

// Where anything not allowed on disk goes instead. It behaves like storage for
// as long as the page is open, which is what makes "you can still play" true
// rather than a consolation.
const memory = new Map<string, string>();

function canPersist(key: string, level: StorageLevel): boolean {
  if (level === 'full') return true;
  if (level === 'session') return false;
  return isEssential(key);
}

function rawGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function rawSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode, or a full quota — memory already holds it
  }
}

function rawRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing to do
  }
}

/** The chosen level, or null if never asked.
 *
 *  At 'session' the answer itself can't go on the disk — that's the promise —
 *  so it goes to sessionStorage, which the browser drops with the tab. It's
 *  the one thing that has to be remembered in order to honour "remember
 *  nothing", and a tab-scoped note is the smallest way to do it. */
export function readLevel(): StorageLevel | null {
  const valid = (v: string | null): StorageLevel | null =>
    v === 'full' || v === 'essential' || v === 'session' ? v : null;
  try {
    const s = valid(sessionStorage.getItem(LEVEL_KEY));
    if (s) return s;
  } catch {
    // no sessionStorage; fall through
  }
  return valid(rawGet(LEVEL_KEY));
}

/** The level in force right now. Unanswered behaves as 'full' so a first-time
 *  visitor's game isn't quietly forgotten while the banner is still up; the
 *  banner is what turns that into a decision. */
export function level(): StorageLevel {
  return readLevel() ?? 'full';
}

/** Record the choice — and make it true immediately. Dropping to a stricter
 *  level has to remove what's already on the disk, or the answer is a label
 *  rather than a change. */
export function setLevel(next: StorageLevel): void {
  if (next === 'session') {
    try {
      sessionStorage.setItem(LEVEL_KEY, next);
    } catch {
      // it'll hold for this page view only
    }
    rawRemove(LEVEL_KEY);
  } else {
    rawSet(LEVEL_KEY, next);
    try {
      sessionStorage.removeItem(LEVEL_KEY);
    } catch {
      // nothing to do
    }
  }
  purge(next);
}

/** Move anything the new level doesn't permit off the disk and into memory, so
 *  the current session carries on working while the device forgets. */
function purge(next: StorageLevel): void {
  let keys: string[] = [];
  try {
    keys = Object.keys(localStorage);
  } catch {
    return;
  }
  for (const key of keys) {
    if (!key.startsWith('anagrimoire:') && !key.startsWith('sb-')) continue;
    if (canPersist(key, next)) continue;
    const value = rawGet(key);
    if (value !== null) memory.set(key, value);
    rawRemove(key);
  }
}

export const store = {
  getItem(key: string): string | null {
    const lvl = level();
    if (canPersist(key, lvl)) return rawGet(key);
    return memory.has(key) ? memory.get(key)! : null;
  },
  setItem(key: string, value: string): void {
    const lvl = level();
    if (canPersist(key, lvl)) rawSet(key, value);
    else memory.set(key, value);
  },
  removeItem(key: string): void {
    memory.delete(key);
    rawRemove(key);
  },
  /** Every key we hold, wherever it lives — used by account deletion, which
   *  has to clear memory as well as the disk to mean anything. */
  keys(): string[] {
    let disk: string[] = [];
    try {
      disk = Object.keys(localStorage);
    } catch {
      disk = [];
    }
    return [...new Set([...disk, ...memory.keys()])];
  },
};
