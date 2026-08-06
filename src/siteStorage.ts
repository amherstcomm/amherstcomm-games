// What this site is allowed to keep, and where.
//
// Almost none of this is legally required — storage a service needs to do the
// job you asked it to do is exempt, and boards, settings and statistics are
// exactly that. It's here because "we store things" deserves an answer other
// than a banner that only offers yes, and because the honest version of
// declining is not "the site breaks" but "it forgets".
//
// Three levels, each one adding to the last, ordered by how far your data
// travels rather than by how much of it there is:
//
//   essential  your privacy choices, and nothing else. Every game plays in
//              full; it's all held in memory, so closing the tab starts over.
//   browser    the above, plus boards, settings and statistics kept in this
//              browser. Yours, on your machine, sent nowhere.
//   server     the above, plus staying signed in — which is what lets results
//              leave this device and follow you to another one.
//
// Sign-in sits at the top rather than in the middle on purpose. It's the only
// rung where anything reaches us, and that's a bigger ask than a file on your
// own disk, however small the file is.
//
// Everything in the app reads and writes through `store` rather than
// localStorage directly, so the level is enforced in one place instead of
// fifteen.

export type StorageLevel = 'essential' | 'browser' | 'server';

/** The wording, in one place, because it appears in both the banner and
 *  Settings and the two saying slightly different things would be its own
 *  small dishonesty. Ascending, since each level adds to the one before it. */
export const STORAGE_OPTIONS: {
  id: StorageLevel;
  label: string;
  blurb: string;
}[] = [
  {
    id: 'essential',
    label: 'Essential only',
    blurb:
      'Only your privacy choices are kept — we have to remember them to honour them. Every game plays in full, and closing the tab starts over.',
  },
  {
    id: 'browser',
    label: 'Allow browser game data',
    blurb:
      'Boards, settings and statistics stay in this browser, on this machine, sent nowhere.',
  },
  {
    id: 'server',
    label: 'Allow server game data (sign in)',
    blurb:
      'The above, plus staying signed in — which is what lets your results follow you to another device.',
  },
];

const LEVEL_KEY = 'anagrimoire:storage:v2';

/** The privacy answers themselves. These are kept at every level, including
 *  the strictest — remembering that you said no is the only way to honour it,
 *  and re-asking on every load would be worse for you rather than better. */
function isChoice(key: string): boolean {
  return key === LEVEL_KEY || key.startsWith('anagrimoire:analytics-consent');
}

/** The token that keeps you signed in. supabase-js writes it as
 *  sb-<project ref>-auth-token. */
function isAuth(key: string): boolean {
  return key.startsWith('sb-');
}

// Where anything not allowed on disk goes instead. It behaves like storage for
// as long as the page is open, which is what makes "you can still play" true
// rather than a consolation.
const memory = new Map<string, string>();

function persists(key: string, level: StorageLevel): boolean {
  if (isChoice(key)) return true;
  if (isAuth(key)) return level === 'server';
  return level !== 'essential';
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

/** The chosen level, or null if never asked. */
export function readLevel(): StorageLevel | null {
  const v = rawGet(LEVEL_KEY);
  return v === 'essential' || v === 'browser' || v === 'server' ? v : null;
}

/** The level in force right now. Unanswered behaves as the most permissive so
 *  a first-time visitor's game isn't quietly forgotten, and someone already
 *  signed in isn't thrown out, while the banner is still sitting there. The
 *  banner is what turns that into a decision. */
export function level(): StorageLevel {
  return readLevel() ?? 'server';
}

/** True when the level permits staying signed in. Callers use this to sign out
 *  of a browser that is no longer allowed to hold the session. */
export function serverAllowed(level_: StorageLevel = level()): boolean {
  return level_ === 'server';
}

/** Record the choice — and make it true immediately. Dropping to a stricter
 *  level has to remove what's already on the disk, or the answer is a label
 *  rather than a change. */
export function setLevel(next: StorageLevel): void {
  rawSet(LEVEL_KEY, next);
  purge(next);
}

/** Move anything the new level no longer permits off the disk and into memory,
 *  so the current session carries on working while the device forgets. */
function purge(next: StorageLevel): void {
  let keys: string[] = [];
  try {
    keys = Object.keys(localStorage);
  } catch {
    return;
  }
  for (const key of keys) {
    if (!key.startsWith('anagrimoire:') && !isAuth(key)) continue;
    if (persists(key, next)) continue;
    const value = rawGet(key);
    if (value !== null) memory.set(key, value);
    rawRemove(key);
  }
}

export const store = {
  getItem(key: string): string | null {
    if (persists(key, level())) return rawGet(key);
    return memory.has(key) ? memory.get(key)! : null;
  },
  setItem(key: string, value: string): void {
    if (persists(key, level())) rawSet(key, value);
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
