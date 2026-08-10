// The invite link's client half: the address parses to a code, the code
// survives being stashed (sign-in may leave the page entirely before anyone
// can accept), and the stash only empties when told to — 'name required'
// means the code has to wait, and a stash that clears itself can't wait.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePath, pathOf } from '@/routes';

async function freshFriends() {
  vi.resetModules();
  return import('@/friends');
}

beforeEach(() => {
  localStorage.clear();
});

describe('the /friend route', () => {
  it('parses a code and round-trips it', () => {
    const r = parsePath('/friend/61e45286c813');
    expect(r).toEqual({ kind: 'friend', code: '61e45286c813' });
    expect(pathOf(r!)).toBe('/friend/61e45286c813');
  });

  it('a bare /friend is nobody’s invite', () => {
    expect(parsePath('/friend')).toBeNull();
  });
});

describe('the account tabs', () => {
  it('names the tab, and the bare form settles onto the first', () => {
    expect(parsePath('/account')).toEqual({ kind: 'account', tab: 'personal' });
    expect(parsePath('/account/personal')).toEqual({ kind: 'account', tab: 'personal' });
    expect(parsePath('/account/friends')).toEqual({ kind: 'account', tab: 'friends' });
    expect(pathOf({ kind: 'account', tab: 'friends' })).toBe('/account/friends');
  });

  it('a tab that does not exist is not an address', () => {
    expect(parsePath('/account/enemies')).toBeNull();
  });

  it('/sign-in is still the account panel wearing its other face', () => {
    expect(parsePath('/sign-in')).toEqual({ kind: 'account', tab: 'personal' });
  });
});

describe('the pending stash', () => {
  it('holds a code across reads until cleared', async () => {
    const m = await freshFriends();
    m.stashInvite('61e45286c813');
    expect(m.pendingInvite()).toBe('61e45286c813');
    expect(m.pendingInvite()).toBe('61e45286c813');
    m.clearPendingInvite();
    expect(m.pendingInvite()).toBeNull();
  });

  it('a later link replaces an earlier one — the reader means the newest', async () => {
    const m = await freshFriends();
    m.stashInvite('first0000000');
    m.stashInvite('second000000');
    expect(m.pendingInvite()).toBe('second000000');
  });
});

describe('the invite url', () => {
  it('points at this site', async () => {
    const m = await freshFriends();
    expect(m.inviteUrl('abc123')).toMatch(/\/friend\/abc123$/);
  });
});
