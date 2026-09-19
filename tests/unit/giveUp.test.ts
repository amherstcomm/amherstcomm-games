// A button's request, given the same wait a panel gets.
//
// The browser half -- that Check and Look come back on screen -- is in
// e2e/admin-wait.spec.ts. This is the timing, with the clock under control.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoAnswer, noAnswerToRead, noAnswerToWrite, withinWait } from '@/giveUp';
import { WAIT_MS } from '@/Waiting';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('withinWait', () => {
  it('passes an answer straight through', async () => {
    await expect(withinWait(Promise.resolve('rows'))).resolves.toBe('rows');
  });

  it('passes a failure straight through, rather than calling it no answer', async () => {
    const boom = new Error('refused');
    await expect(withinWait(Promise.reject(boom))).rejects.toBe(boom);
  });

  it('gives up with NoAnswer once the wait is over', async () => {
    const held = withinWait(new Promise(() => {}));
    const caught = held.catch((e) => e);
    vi.advanceTimersByTime(WAIT_MS);
    expect(await caught).toBeInstanceOf(NoAnswer);
  });

  it('and not a moment before', async () => {
    let settled = false;
    void withinWait(new Promise(() => {})).catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(WAIT_MS - 1);
    expect(settled).toBe(false);
  });

  // Once the page has told somebody to try again, an old answer must not land
  // on top of the next attempt.
  it('ignores an answer that arrives after it gave up', async () => {
    let answer!: (v: string) => void;
    const held = withinWait(new Promise<string>((r) => (answer = r)));
    const caught = held.catch((e) => e);
    vi.advanceTimersByTime(WAIT_MS);
    answer('late rows');
    expect(await caught).toBeInstanceOf(NoAnswer);
  });
});

describe('what it says', () => {
  it('tells a read that nothing changed', () => {
    expect(noAnswerToRead('the coverage')).toMatch(/nothing has been changed/);
  });

  // A write may have landed, so it must not claim otherwise.
  it('does not tell a write that nothing changed', () => {
    const said = noAnswerToWrite('the pin was saved', 'Press Look.');
    expect(said).not.toMatch(/nothing has been changed/);
    expect(said).toMatch(/cannot tell whether the pin was saved\. Press Look\./);
  });
});
