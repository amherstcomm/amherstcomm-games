// What the presenter is offered, and when.
//
// The states form a sequence and the sequence has ends, and every wrong answer
// here happens live in front of a room. The old controls put all five verbs on
// screen at once with nothing saying which was next; these pin the order that
// replaced them.
import { describe, expect, it } from 'vitest';
import { nextMove, otherMoves, secondsLeft, whereWeAre, type Door } from '@/presenting';

const draft = (over: Partial<Door> = {}): Door => ({
  ok: true,
  state: 'draft',
  total: 3,
  pending: 3,
  position: null,
  item_state: null,
  ...over,
});
const live = (over: Partial<Door> = {}): Door => ({ ...draft(), state: 'live', ...over });

describe('the next move', () => {
  it('starts a draft', () => {
    expect(nextMove(draft())).toEqual({ action: 'start', label: 'Start the session' });
  });

  it('offers nothing on an empty draft', () => {
    // "nothing left to show" arriving after Start looks like a fault, and the
    // fix is on a different screen
    expect(nextMove(draft({ total: 0, pending: 0 }))).toBeNull();
    expect(whereWeAre(draft({ total: 0, pending: 0 }))).toMatch(/add some/i);
  });

  it('walks the whole round in order', () => {
    // started, nothing shown
    expect(nextMove(live())).toMatchObject({ action: 'show', label: 'Show question 1 of 3' });
    // question one, open
    expect(nextMove(live({ pending: 2, position: 1, item_state: 'open' }))).toMatchObject({
      action: 'lock',
    });
    // closed
    expect(nextMove(live({ pending: 2, position: 1, item_state: 'locked' }))).toMatchObject({
      action: 'reveal',
    });
    // shown, two to go
    expect(nextMove(live({ pending: 2, position: 1, item_state: 'revealed' }))).toMatchObject({
      action: 'show',
      label: 'Show question 2 of 3',
    });
  });

  it('counts the question by what is left, not by the one on screen', () => {
    // skipping means position and "how far through" stop agreeing, and the
    // number people care about is which one is coming next
    expect(nextMove(live({ pending: 1, position: 1, item_state: 'revealed' }))).toMatchObject({
      label: 'Show question 3 of 3',
    });
  });

  it('finishes rather than running out of things to press', () => {
    expect(nextMove(live({ pending: 0, position: 3, item_state: 'revealed' }))).toEqual({
      action: 'close',
      label: 'Finish the session',
    });
  });

  it('offers nothing once it is closed', () => {
    expect(nextMove(live({ state: 'closed' }))).toBeNull();
    expect(otherMoves(live({ state: 'closed' }))).toEqual([]);
    expect(whereWeAre(live({ state: 'closed' }))).toBe('Finished');
  });

  it('offers nothing at all when the door did not answer', () => {
    // signed out, or not the host — the buttons should not be there to press
    expect(nextMove({ ok: false })).toBeNull();
    expect(otherMoves({ ok: false })).toEqual([]);
    expect(whereWeAre({ ok: false })).toBe('');
  });
});

describe('the other moves', () => {
  it('lets a question be skipped while it is up', () => {
    const skip = otherMoves(live({ pending: 2, position: 1, item_state: 'open' }));
    expect(skip.map((m) => m.action)).toContain('show');
  });

  it('does not offer a skip when there is nothing to skip to', () => {
    const last = otherMoves(live({ pending: 0, position: 3, item_state: 'open' }));
    expect(last.map((m) => m.action)).not.toContain('show');
  });

  it('offers an early reveal only while answers are open', () => {
    expect(
      otherMoves(live({ pending: 1, position: 1, item_state: 'open' })).map((m) => m.action)
    ).toContain('reveal');
    expect(
      otherMoves(live({ pending: 1, position: 1, item_state: 'revealed' })).map((m) => m.action)
    ).not.toContain('reveal');
  });

  it('never repeats the primary move as a secondary one', () => {
    // two buttons that do the same thing, one of them worded differently, is
    // the confusion this replaced
    for (const d of [
      live(),
      live({ pending: 2, position: 1, item_state: 'open' }),
      live({ pending: 2, position: 1, item_state: 'locked' }),
      live({ pending: 0, position: 3, item_state: 'revealed' }),
    ]) {
      const primary = nextMove(d);
      const labels = otherMoves(d).map((m) => m.label);
      if (primary) expect(labels, primary.label).not.toContain(primary.label);
    }
  });

  it('can always finish', () => {
    for (const d of [live(), live({ position: 1, item_state: 'open' })]) {
      expect(otherMoves(d).map((m) => m.action)).toContain('close');
    }
  });
});

describe('where we are', () => {
  it('says the question and what it is doing', () => {
    expect(whereWeAre(live({ position: 2, item_state: 'open' }))).toBe(
      'Question 2 of 3 · answers open'
    );
    expect(whereWeAre(live({ position: 2, item_state: 'locked' }))).toBe(
      'Question 2 of 3 · answers closed'
    );
    expect(whereWeAre(live({ position: 2, item_state: 'revealed' }))).toBe(
      'Question 2 of 3 · answer shown'
    );
  });

  it('counts questions in the singular when there is one', () => {
    expect(whereWeAre(draft({ total: 1, pending: 1 }))).toMatch(/1 question$/);
    expect(whereWeAre(draft({ total: 2, pending: 2 }))).toMatch(/2 questions$/);
  });
});

describe('the clock', () => {
  const opened = '2026-10-01T12:00:00.000Z';
  const at = (iso: string) => Date.parse(iso);

  it('counts down from the full window', () => {
    expect(secondsLeft(opened, 30, 0, at('2026-10-01T12:00:00.000Z'))).toBe(30);
    expect(secondsLeft(opened, 30, 0, at('2026-10-01T12:00:10.000Z'))).toBe(20);
  });

  it('stops at zero rather than going negative', () => {
    expect(secondsLeft(opened, 30, 0, at('2026-10-01T12:05:00.000Z'))).toBe(0);
  });

  it('corrects for a browser clock that disagrees with the server', () => {
    // A laptop twenty seconds behind would otherwise show twenty seconds that
    // do not exist — and the server is the only opinion that decides whether an
    // answer counts.
    const skew = 20_000; // the server is 20s ahead of this browser
    expect(secondsLeft(opened, 30, skew, at('2026-10-01T11:59:50.000Z'))).toBe(20);
  });

  it('is null when there is no clock', () => {
    expect(secondsLeft(opened, null, 0, at(opened))).toBeNull();
    expect(secondsLeft(opened, undefined, 0, at(opened))).toBeNull();
    expect(secondsLeft(null, 30, 0, at(opened))).toBeNull();
  });

  it('is null rather than NaN when opened_at is not a date', () => {
    // it comes from JSON, so this is a shape the type does not rule out
    expect(secondsLeft('not a date', 30, 0, at(opened))).toBeNull();
  });
});
