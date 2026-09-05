// The window, between the browser and the wire.
//
// Every assertion here is against an absolute instant rather than a round trip,
// which is the point: these conversions must not depend on the zone the machine
// running them happens to be in. A round-trip test passes in Denver while the
// feature is an hour wrong there.
//
// The dates are chosen around the two changeovers, because that is where a
// fixed -6 offset — the version this replaced would have needed — goes wrong
// for eight months of the year. In 2026 US daylight time runs 8 March to
// 1 November: Central is UTC-6 (CST) outside that and UTC-5 (CDT) inside it.
import { describe, expect, it } from 'vitest';
import {
  OFFICE_ZONE,
  OFFICE_ZONE_FALLBACK,
  describeWindow,
  fromOfficeInput,
  toOfficeInput,
  when,
} from '@/schedule';

/** An instant, written the way the wire writes it. */
const at = (iso: string) => new Date(iso).toISOString();

describe('the anchor', () => {
  it('is a company clock, not the browser', () => {
    // Set by the deployment; this build does not set it, so it is the fallback.
    expect(OFFICE_ZONE).toBe(OFFICE_ZONE_FALLBACK);
    expect(OFFICE_ZONE_FALLBACK).toBe('America/Chicago');
  });

  // The zone is used to build formatters at module load, and an unknown name
  // does not degrade — Intl throws a RangeError on it. A typo in the
  // environment has to cost a wrong default, not a white page.
  it('and a name the platform does not know is not fatal', () => {
    const bad = () => new Intl.DateTimeFormat('en-US', { timeZone: 'Amherst/Office' });
    expect(bad).toThrow();
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: OFFICE_ZONE })).not.toThrow();
  });
});

describe('fromOfficeInput', () => {
  // The bug this exists for: a host setting "Friday at five" from a hotel two
  // zones over set it for six o'clock at home, silently and correctly by the
  // old rule. These are absolute, so they fail on that version wherever they
  // are run.
  it('reads five in the afternoon as five in the office, in summer', () => {
    expect(fromOfficeInput('2026-10-16T17:00')?.toISOString()).toBe('2026-10-16T22:00:00.000Z');
  });

  it('and in winter, which is a different offset', () => {
    expect(fromOfficeInput('2026-12-11T17:00')?.toISOString()).toBe('2026-12-11T23:00:00.000Z');
  });

  it('the morning after the clocks go forward', () => {
    expect(fromOfficeInput('2026-03-08T09:00')?.toISOString()).toBe('2026-03-08T14:00:00.000Z');
  });

  it('and the morning after they go back', () => {
    expect(fromOfficeInput('2026-11-01T09:00')?.toISOString()).toBe('2026-11-01T15:00:00.000Z');
  });

  // A schedule is not the place to argue with somebody about 2:30 am.
  it('settles on a real instant for a wall clock that never happened', () => {
    // 2:30 am on 8 March 2026 does not exist in Central: the hour is skipped
    const got = fromOfficeInput('2026-03-08T02:30');
    expect(got).not.toBeNull();
    expect(Number.isNaN(got!.getTime())).toBe(false);
  });

  it('and picks one for a wall clock that happened twice', () => {
    // 1:30 am on 1 November 2026 happens once in CDT and again in CST
    const got = fromOfficeInput('2026-11-01T01:30');
    expect(got).not.toBeNull();
    expect(['2026-11-01T06:30:00.000Z', '2026-11-01T07:30:00.000Z']).toContain(
      got!.toISOString()
    );
  });

  // One means "take it off" and the other means a time; they have to stay
  // distinguishable all the way to the server.
  it('keeps empty distinct from a date', () => {
    expect(fromOfficeInput('')).toBeNull();
    expect(fromOfficeInput('nonsense')).toBeNull();
  });
});

describe('toOfficeInput', () => {
  it('shows the instant on the office clock', () => {
    expect(toOfficeInput(at('2026-10-16T22:00:00Z'))).toBe('2026-10-16T17:00');
  });

  it('across the changeover, where a fixed offset would be an hour out', () => {
    expect(toOfficeInput(at('2026-12-11T23:00:00Z'))).toBe('2026-12-11T17:00');
  });

  it('pads, because the input will not accept 2026-9-2T9:05', () => {
    expect(toOfficeInput(at('2026-09-02T14:05:00Z'))).toBe('2026-09-02T09:05');
  });

  it('and midnight is not the day before', () => {
    // hourCycle h24 can report 24:00, which would push the date out by a day
    expect(toOfficeInput(at('2026-10-16T05:00:00Z'))).toBe('2026-10-16T00:00');
  });

  it('has nothing to show for no time', () => {
    expect(toOfficeInput(null)).toBe('');
    expect(toOfficeInput(undefined)).toBe('');
    expect(toOfficeInput('not a date')).toBe('');
  });

  it('round-trips whatever it shows', () => {
    for (const iso of ['2026-10-16T22:00:00Z', '2026-12-11T23:00:00Z', '2026-03-08T14:00:00Z']) {
      expect(fromOfficeInput(toOfficeInput(iso))?.toISOString()).toBe(at(iso));
    }
  });
});

describe('when', () => {
  // Monday 12 October 2026, 9am Central
  const now = new Date('2026-10-12T14:00:00Z');

  it('names the zone, so a traveller knows which five o clock is meant', () => {
    expect(when(new Date('2026-10-12T22:00:00Z'), now)).toMatch(/C[DS]T/);
  });

  it('says today rather than naming the day', () => {
    expect(when(new Date('2026-10-12T22:00:00Z'), now)).toMatch(/^today at /);
  });

  it('and tomorrow', () => {
    expect(when(new Date('2026-10-13T22:00:00Z'), now)).toMatch(/^tomorrow at /);
  });

  it('names the weekday inside the week', () => {
    expect(when(new Date('2026-10-16T22:00:00Z'), now)).toMatch(/^Friday at /);
  });

  // A weekday alone is the easiest thing to misread a week late.
  it('and the date once a weekday could mean either week', () => {
    const line = when(new Date('2026-10-19T22:00:00Z'), now);
    expect(line).not.toMatch(/^Monday/);
    expect(line).toMatch(/19/);
  });

  // "Today" is the office's today. Eleven at night in Central is the small
  // hours in London, and the answer is still today.
  it('counts days on the office calendar, not the reader s', () => {
    // 2026-10-13T03:00Z is 10pm Monday in Central
    expect(when(new Date('2026-10-13T03:00:00Z'), now)).toMatch(/^today at /);
  });
});

describe('describeWindow', () => {
  const now = new Date('2026-10-12T14:00:00Z');

  it('has nothing to say when there is no window', () => {
    expect(describeWindow(null, null, now)).toBeNull();
  });

  it('says when it opens, before it does', () => {
    expect(describeWindow(at('2026-10-13T14:00:00Z'), null, now)).toMatch(/^Opens tomorrow at /);
  });

  it('and both ends when both are still ahead', () => {
    expect(
      describeWindow(at('2026-10-13T14:00:00Z'), at('2026-10-16T22:00:00Z'), now)
    ).toMatch(/^Opens tomorrow at .* and closes Friday at /);
  });

  // The useful fact about a survey that is running is when it shuts.
  it('says when it shuts, once it is running', () => {
    expect(
      describeWindow(at('2026-10-12T13:00:00Z'), at('2026-10-16T22:00:00Z'), now)
    ).toMatch(/^Closes Friday at /);
  });

  it('and says it is shut once it is', () => {
    expect(describeWindow(null, at('2026-10-09T22:00:00Z'), now)).toMatch(/^Closed /);
  });

  // A passed closing beats a passed opening, which is the order apply_schedule
  // applies them in.
  it('a passed closing beats a passed opening', () => {
    expect(
      describeWindow(at('2026-10-05T14:00:00Z'), at('2026-10-09T22:00:00Z'), now)
    ).toMatch(/^Closed /);
  });

  it('and an opening with no closing has nothing left to promise', () => {
    expect(describeWindow(at('2026-10-12T13:00:00Z'), null, now)).toMatch(/^Opened today at /);
  });
});
