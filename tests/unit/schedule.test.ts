// The window, between the browser and the wire.
//
// The conversion worth testing is the one with an off-by-a-timezone in it: an
// instant shown in a datetime-local input, and read back out of it. Run these
// under a fixed TZ (vitest.config sets one) or the round trip is the only thing
// that can be asserted.
import { describe, expect, it } from 'vitest';
import { describeWindow, fromLocalInput, toLocalInput, when } from '@/schedule';

describe('toLocalInput', () => {
  it('gives the input a wall clock, not UTC', () => {
    // The obvious version — toISOString().slice(0, 16) — is wrong by the
    // offset, and shows a five o'clock closing as one in the afternoon.
    const at = new Date(2026, 9, 12, 17, 0);
    expect(toLocalInput(at.toISOString())).toBe('2026-10-12T17:00');
  });

  it('pads, because the input will not accept 2026-9-2T9:05', () => {
    expect(toLocalInput(new Date(2026, 8, 2, 9, 5).toISOString())).toBe('2026-09-02T09:05');
  });

  it('has nothing to show for no time', () => {
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput(undefined)).toBe('');
    expect(toLocalInput('not a date')).toBe('');
  });
});

describe('fromLocalInput', () => {
  it('reads the input back as the instant it was showing', () => {
    const at = new Date(2026, 9, 12, 17, 0);
    expect(fromLocalInput(toLocalInput(at.toISOString()))?.getTime()).toBe(at.getTime());
  });

  // One means "take it off" and the other means a time; they have to stay
  // distinguishable all the way to the server.
  it('keeps empty distinct from a date', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('nonsense')).toBeNull();
  });
});

describe('when', () => {
  const now = new Date(2026, 9, 12, 9, 0); // Monday 12 October 2026

  it('says today rather than naming the day', () => {
    expect(when(new Date(2026, 9, 12, 17, 0), now)).toMatch(/^today at /);
  });

  it('and tomorrow', () => {
    expect(when(new Date(2026, 9, 13, 17, 0), now)).toMatch(/^tomorrow at /);
  });

  it('names the weekday inside the week', () => {
    expect(when(new Date(2026, 9, 16, 17, 0), now)).toMatch(/^Friday at /);
  });

  // A weekday alone is the easiest thing to misread a week late.
  it('and the date once a weekday could mean either week', () => {
    expect(when(new Date(2026, 9, 19, 17, 0), now)).not.toMatch(/^Monday/);
    expect(when(new Date(2026, 9, 19, 17, 0), now)).toMatch(/19/);
  });

  it('counts calendar days, not twenty-four-hour blocks', () => {
    // 11pm to 1am is two hours and one day; "in 2 hours" would read as today
    expect(when(new Date(2026, 9, 13, 1, 0), new Date(2026, 9, 12, 23, 0))).toMatch(
      /^tomorrow at /
    );
  });
});

describe('describeWindow', () => {
  const now = new Date(2026, 9, 12, 9, 0);

  it('has nothing to say when there is no window', () => {
    expect(describeWindow(null, null, now)).toBeNull();
  });

  it('says when it opens, before it does', () => {
    const line = describeWindow(new Date(2026, 9, 13, 9, 0).toISOString(), null, now);
    expect(line).toMatch(/^Opens tomorrow at /);
  });

  it('and both ends when both are still ahead', () => {
    const line = describeWindow(
      new Date(2026, 9, 13, 9, 0).toISOString(),
      new Date(2026, 9, 16, 17, 0).toISOString(),
      now
    );
    expect(line).toMatch(/^Opens tomorrow at .* and closes Friday at /);
  });

  // The useful fact about a survey that is running is when it shuts.
  it('says when it shuts, once it is running', () => {
    const line = describeWindow(
      new Date(2026, 9, 12, 8, 0).toISOString(),
      new Date(2026, 9, 16, 17, 0).toISOString(),
      now
    );
    expect(line).toMatch(/^Closes Friday at /);
  });

  it('and says it is shut once it is', () => {
    const line = describeWindow(null, new Date(2026, 9, 9, 17, 0).toISOString(), now);
    expect(line).toMatch(/^Closed /);
  });

  // A closing time in the past wins over an opening time in the past, which is
  // the same order apply_schedule applies them in.
  it('a passed closing beats a passed opening', () => {
    const line = describeWindow(
      new Date(2026, 9, 5, 9, 0).toISOString(),
      new Date(2026, 9, 9, 17, 0).toISOString(),
      now
    );
    expect(line).toMatch(/^Closed /);
  });

  it('and an opening with no closing has nothing left to promise', () => {
    const line = describeWindow(new Date(2026, 9, 12, 8, 0).toISOString(), null, now);
    expect(line).toMatch(/^Opened today at /);
  });
});
