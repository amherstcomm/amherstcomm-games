// The reconciliation layer, at the seams that broke in live testing: a word
// deleted on one device must disappear on the other, and the bases that make
// that possible must survive auth noise. Found by two browsers side by side —
// the deletion reached the server and the second browser refused it, because
// every INITIAL_SESSION had wiped its bases and a baseless device reads every
// difference as a conflict, which a deletion can never win.
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function fresh() {
  vi.resetModules();
  return import('@/dailySync');
}

beforeEach(() => {
  localStorage.clear();
});

const DATE = '2026-08-09';

describe('a deletion arriving from the other device', () => {
  it('lands on a device that is in step — the case the doorbell exists for', async () => {
    const m = await fresh();
    const local = { chain: ['player', 'rune'], elapsedMs: 40_000 };
    // this device last reconciled at T1, holding the full chain
    m.noteWritten('box', '', 'easy', DATE, 'T1', local);
    const merged = m.mergeFromServer('box', '', 'easy', DATE, local, {
      state: { chain: ['player'] },
      completed: false,
      result: null,
      updatedAt: 'T2',
    });
    expect(merged?.chain).toEqual(['player']);
    // the clock is not progress; the visible device's keeps running
    expect(merged?.elapsedMs).toBe(40_000);
  });

  it('loses to a device with no base — the conflict fallback, kept deliberately', async () => {
    const m = await fresh();
    const local = { chain: ['player', 'rune'] };
    const merged = m.mergeFromServer('box', '', 'easy', DATE, local, {
      state: { chain: ['player'] },
      completed: false,
      result: null,
      updatedAt: 'T2',
    });
    // with no base, "they deleted" and "I have unsaved work" are the same
    // sight, and more-progress-wins is the safe read. The fix is upstream:
    // stop losing the base (accountChanged below), and write the resolution
    // back (sameProgress below) so the two sides converge instead of quietly
    // disagreeing forever.
    expect(merged?.chain).toEqual(['player', 'rune']);
  });

  it("is kept when it is this device's own unsaved deletion echoing back", async () => {
    const m = await fresh();
    const local = { chain: [] };
    // we reconciled at T2 with the shorter chain; the row still says T2
    m.noteWritten('box', '', 'easy', DATE, 'T2', local);
    const merged = m.mergeFromServer('box', '', 'easy', DATE, local, {
      state: { chain: ['player'] },
      completed: false,
      result: null,
      updatedAt: 'T2',
    });
    expect(merged?.chain).toEqual([]);
  });
});

describe('sameProgress', () => {
  it('sees through key order and ignores the clock', async () => {
    const m = await fresh();
    expect(
      m.sameProgress(
        'box',
        { chain: ['a'], invalid: ['x'], elapsedMs: 1 },
        { invalid: ['x'], chain: ['a'], elapsedMs: 99 }
      )
    ).toBe(true);
  });

  it('reports a merge that kept more than the row holds', async () => {
    const m = await fresh();
    expect(m.sameProgress('box', { chain: ['a', 'b'] }, { chain: ['a'] })).toBe(false);
  });
});

describe('accountChanged', () => {
  it('fires once for a new account, then stays quiet for its auth noise', async () => {
    const m = await fresh();
    expect(m.accountChanged('uid-1')).toBe(true);
    // INITIAL_SESSION on every mount, TOKEN_REFRESHED on a timer
    expect(m.accountChanged('uid-1')).toBe(false);
    expect(m.accountChanged('uid-1')).toBe(false);
  });

  it('fires on a real switch, and on sign-out', async () => {
    const m = await fresh();
    m.accountChanged('uid-1');
    expect(m.accountChanged('uid-2')).toBe(true);
    expect(m.accountChanged(null)).toBe(true);
    expect(m.accountChanged(null)).toBe(false);
  });

  it('a quiet auth event leaves the bases standing, so a deletion still lands', async () => {
    const m = await fresh();
    m.accountChanged('uid-1');
    const local = { chain: ['player', 'rune'] };
    m.noteWritten('box', '', 'easy', DATE, 'T1', local);
    m.accountChanged('uid-1'); // the mount that used to wipe everything
    const merged = m.mergeFromServer('box', '', 'easy', DATE, local, {
      state: { chain: ['player'] },
      completed: false,
      result: null,
      updatedAt: 'T2',
    });
    expect(merged?.chain).toEqual(['player']);
  });
});
