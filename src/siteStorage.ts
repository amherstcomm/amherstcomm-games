// What this site is allowed to keep, and where.
//
// Almost none of this is legally required — storage a service needs to do the
// job you asked it to do is exempt, and boards, settings and statistics are
// exactly that. It's here because "we store things" deserves an answer other
// than a banner that only offers yes, and because the honest version of
// declining is not "the site breaks" but "it forgets".
//
// Two levels:
//
//   essential  your privacy choices, and nothing else. Every game plays in
//              full; it's all held in memory, so closing the tab starts over.
//   browser    boards, settings, statistics and your sign-in kept in this
//              browser. Yours, on your machine.
//
// There is deliberately no third level for "may anything reach the server",
// because signing in already is that answer — nobody signs in by accident,
// and asking a second time would imply we might do it without being asked.
// That leaves two genuinely separate questions instead of one muddled ladder:
// signing in decides whether anything leaves this device, and the setting
// here decides what stays on it. So you can still sign in at 'essential';
// the session is simply held in memory, and closing the tab ends it.
//
// Everything in the app reads and writes through `store` rather than
// localStorage directly, so the level is enforced in one place instead of
// fifteen.

export type StorageLevel = 'essential' | 'browser';

/** The wording, in one place, because it appears in both the banner and
 *  Settings and the two saying slightly different things would be its own
 *  small dishonesty. */
export const STORAGE_OPTIONS: {
  id: StorageLevel;
  label: string;
  blurb: string;
}[] = [
  {
    id: 'essential',
    label: 'Keep essentials only',
    blurb:
      'Only your privacy answers, which we have to remember in order to honour them. Every game still works in full; close the tab and it starts over, sign-in included.',
  },
  {
    id: 'browser',
    label: 'Keep my games and settings',
    blurb:
      'Boards, settings, statistics and your sign-in stay in this browser, on this machine.',
  },
];

const LEVEL_KEY = 'anagrimoire:storage:v2';

/** The privacy answers themselves. These are kept at every level, including
 *  the strictest — remembering that you said no is the only way to honour it,
 *  and re-asking on every load would be worse for you rather than better. */
function isChoice(key: string): boolean {
  return key === LEVEL_KEY || key.startsWith('anagrimoire:analytics-consent');
}

/** Our keys, wherever they came from. supabase-js writes the session as
 *  sb-<project ref>-auth-token; everything else of ours is namespaced. */
function isOurs(key: string): boolean {
  return key.startsWith('anagrimoire:') || key.startsWith('sb-');
}

// Where anything not allowed on disk goes instead. It behaves like storage for
// as long as the page is open, which is what makes "you can still play" true
// rather than a consolation.
const memory = new Map<string, string>();

function persists(key: string, level: StorageLevel): boolean {
  return isChoice(key) || level === 'browser';
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
 *  'server' is the third level this key briefly held, back when sign-in was a
 *  rung of its own. It was the most permissive answer then and 'browser' is
 *  the most permissive now, so reading it as that honours what was agreed
 *  rather than asking again. */
export function readLevel(): StorageLevel | null {
  const v = rawGet(LEVEL_KEY);
  if (v === 'essential' || v === 'browser') return v;
  return v === 'server' ? 'browser' : null;
}

/** The level in force right now. Unanswered behaves as the most permissive so
 *  a first-time visitor's game isn't quietly forgotten, and someone already
 *  signed in isn't thrown out, while the banner is still sitting there. The
 *  banner is what turns that into a decision. */
export function level(): StorageLevel {
  return readLevel() ?? 'browser';
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
    if (!isOurs(key)) continue;
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
