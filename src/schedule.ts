// An open session's window, between the browser and the wire.
//
// Two conversions and a sentence, kept out of the editor because all three have
// edge cases worth asserting and none of them need React to be wrong.
//
// The wire carries instants — ISO strings, UTC. `datetime-local` carries a wall
// clock with no zone at all. The office is one office in one timezone, so the
// honest reading of "closes Friday at five" is five o'clock where the person
// typing it is; that is what the browser's local zone gives, and it is why
// nothing here takes a zone argument. The conversion is only ever between an
// instant and *this* browser's wall clock.

/** ISO instant → the `YYYY-MM-DDTHH:mm` a datetime-local input wants.
 *
 *  Not `toISOString().slice(0, 16)`, which is the obvious version and is wrong
 *  by the offset: it hands the input UTC and the input reads it as local, so a
 *  five o'clock closing shows as one in the afternoon. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** What the input gives back, as an instant. Empty is not a date, it is the
 *  absence of one, and the two have to stay distinguishable all the way to the
 *  server — one means "take it off" and the other means a time. */
export function fromLocalInput(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' });

/** "today at 5:00 pm", "Friday at 5:00 pm", "12 October at 9:00 am".
 *
 *  A weekday alone is the clearest thing to read and the easiest to misread a
 *  week late, so it is only used inside the week where it cannot be. */
export function when(at: Date, now: Date): string {
  const days = Math.round(
    (new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000
  );
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
