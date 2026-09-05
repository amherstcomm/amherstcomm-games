// An open session's window, between the browser and the wire.
//
// Two conversions and a sentence, kept out of the editor because all three have
// edge cases worth asserting and none of them need React to be wrong.
//
// The wire carries instants — ISO strings, UTC — so enforcement was never in
// question: `closes_at` is one moment everywhere, and Postgres compares it to
// `now()`. What needed deciding is which wall clock the words refer to.
//
// Reversal, and the reason this file no longer says "local". The first version
// used the browser's own zone, on the assumption that one office means one
// timezone. Everyone here is *based* in Central, but not everyone is *in*
// Central at the moment they use this — and a host setting "Friday at five"
// from a hotel two zones over would have set it for six o'clock at home,
// silently and correctly by the old rule.
//
// So the office clock is the anchor. "Five" means five where the company is,
// whoever is typing it and wherever they are standing, and every time shown
// carries its zone so a traveller reading it knows which five it is.

/** The zone a deployment falls back to when it does not name one. */
export const OFFICE_ZONE_FALLBACK = 'America/Chicago';

/** Whether the platform actually knows a zone.
 *
 *  Worth asking rather than assuming, because an unknown name does not degrade
 *  — `Intl.DateTimeFormat` throws a RangeError on it. These formatters are
 *  built at module load, so a typo in the environment would not produce a wrong
 *  time, it would produce a white page. */
function usable(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** The company's clock. Not the browser's, deliberately — see above.
 *
 *  A zone *name* rather than an offset, so the two annual changeovers are the
 *  platform's problem: `America/Chicago` is CST or CDT depending on the date
 *  being formatted, and a stored -6 would be an hour wrong for eight months of
 *  the year.
 *
 *  From the environment, like every other thing about a deployment that is not
 *  this one's to know — see brand.ts. Build-time, so changing it means a
 *  rebuild; that is the same cost as editing this line, and the point of the
 *  variable is that a fork does not have to edit this line at all. */
export const OFFICE_ZONE: string = (() => {
  const named = typeof import.meta.env.VITE_OFFICE_ZONE === 'string'
    ? import.meta.env.VITE_OFFICE_ZONE.trim()
    : '';
  return usable(named) ? named : OFFICE_ZONE_FALLBACK;
})();

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: OFFICE_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** The office wall clock at a given instant, as numbers. */
function officeParts(at: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of PARTS.formatToParts(at)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  // 24:00 rather than 00:00 is legal output for hourCycle h24 and would push
  // the arithmetic below a day out.
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** How far ahead of UTC the office is at that instant, in milliseconds. */
function offsetAt(at: Date): number {
  const p = officeParts(at);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at.getTime();
}

/** Instant → the `YYYY-MM-DDTHH:mm` a datetime-local input wants, on the office
 *  clock.
 *
 *  Not `toISOString().slice(0, 16)`, which is the obvious version and is wrong
 *  by the offset: it hands the input UTC and the input reads it as a wall
 *  clock, so a five o'clock closing shows as eleven at night. */
export function toOfficeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = officeParts(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
  );
}

/** What the input gives back, read as an office wall clock rather than the
 *  browser's.
 *
 *  Two passes, because the offset depends on the instant and the instant is
 *  what is being worked out. The first guess uses the offset at the same wall
 *  clock read as UTC, which is right except within an hour of a changeover; the
 *  second uses the offset at the guess, which lands. On the March morning where
 *  the wall clock does not exist, and the November one where it happens twice,
 *  this settles on a real instant rather than throwing — a schedule is not the
 *  place to argue with somebody about 2:30 am.
 *
 *  Empty is not a date, it is the absence of one, and the two have to stay
 *  distinguishable all the way to the server: one means "take it off". */
export function fromOfficeInput(value: string): Date | null {
  // Shape-checked rather than left to Date.parse, which is lenient enough to
  // make an instant out of 'nonsense' and hand back the first of January 2000.
  // A datetime-local emits seconds in some browsers, so they are allowed.
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(value ?? '');
  if (!m) return null;
  const naive = Date.parse(`${m[1]}:00Z`);
  if (Number.isNaN(naive)) return null;
  const first = naive - offsetAt(new Date(naive));
  return new Date(naive - offsetAt(new Date(first)));
}

const TIME = new Intl.DateTimeFormat(undefined, {
  timeZone: OFFICE_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});
const DAY = new Intl.DateTimeFormat(undefined, { timeZone: OFFICE_ZONE, weekday: 'long' });
const DATE = new Intl.DateTimeFormat(undefined, {
  timeZone: OFFICE_ZONE,
  day: 'numeric',
  month: 'long',
});

/** Which day of the office's calendar an instant falls on. */
function officeDay(at: Date): number {
  const p = officeParts(at);
  return Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;
}

/** "today at 5:00 PM CDT", "Friday at 5:00 PM CST", "12 October at 9:00 AM CDT".
 *
 *  A weekday alone is the clearest thing to read and the easiest to misread a
 *  week late, so it is only used inside the week where it cannot be. The zone
 *  is always shown: it is the whole point of the anchor, and it is what tells
 *  somebody reading this from another zone which five o'clock is meant. */
export function when(at: Date, now: Date): string {
  const days = officeDay(at) - officeDay(now);
  const day =
    days === 0
      ? 'today'
      : days === 1
        ? 'tomorrow'
        : days === -1
          ? 'yesterday'
          : days > 1 && days < 7
            ? DAY.format(at)
            : DATE.format(at);
  return `${day} at ${TIME.format(at)}`;
}

/** The line under the session's name. Null when there is no window, because a
 *  sentence saying nothing is worse than no sentence.
 *
 *  It says what happens next rather than listing both ends: the useful fact
 *  about a survey that is running is when it shuts, and the useful fact about
 *  one that has not started is when it opens. */
export function describeWindow(
  opens: string | null | undefined,
  closes: string | null | undefined,
  now: Date = new Date()
): string | null {
  const o = opens ? new Date(opens) : null;
  const c = closes ? new Date(closes) : null;
  const opensAt = o && !Number.isNaN(o.getTime()) ? o : null;
  const closesAt = c && !Number.isNaN(c.getTime()) ? c : null;
  if (!opensAt && !closesAt) return null;

  if (closesAt && closesAt <= now) return `Closed ${when(closesAt, now)}.`;
  if (opensAt && opensAt > now) {
    return closesAt
      ? `Opens ${when(opensAt, now)} and closes ${when(closesAt, now)}.`
      : `Opens ${when(opensAt, now)}.`;
  }
  if (closesAt) return `Closes ${when(closesAt, now)}.`;
  // Opened on time and no closing set: the schedule has done its job and has
  // nothing left to say, so it says that rather than repeating the past.
  return `Opened ${when(opensAt as Date, now)}.`;
}
