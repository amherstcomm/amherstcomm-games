// The automatic sign-in exists to spare people a second login they have
// already done at the proxy. Everything worth testing about it is a way it
// could go wrong instead.
//
// A redirect loop is the failure that matters: the page loads, finds no
// session, redirects to the identity provider, comes back without a session
// because something upstream is misconfigured, and does it again — forever,
// with the error that would explain it never on screen long enough to read.
// So: one attempt per tab, and if the attempt cannot be *recorded*, none at
// all. A guard that might not be there is worse than no automation.
//
// Signing out is the same failure wearing different clothes. Sign out, land on
// a page with no session, get signed straight back in, and there is no way to
// leave.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithSSO = vi.fn(async () => ({ data: {}, error: null }));

vi.mock('@/supabase', () => ({
  supabase: {
    auth: {
      signInWithSSO,
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
    },
  },
}));

vi.mock('@/sso', () => ({
  SSO_ROUTE: { kind: 'saml', by: 'domain', domain: 'amherstcomm.net' },
  SSO_LABEL: 'Amherst Communications',
  SSO_ONLY: true,
}));

async function fresh() {
  vi.resetModules();
  signInWithSSO.mockClear();
  sessionStorage.clear();
  return import('@/signIn');
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('signing in without being asked', () => {
  it('does nothing for someone already signed in', async () => {
    const { autoSignIn } = await fresh();
    await autoSignIn(true);
    expect(signInWithSSO).not.toHaveBeenCalled();
  });

  it('starts the configured route when there is no session', async () => {
    const { autoSignIn } = await fresh();
    await autoSignIn(false);
    expect(signInWithSSO).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'amherstcomm.net' })
    );
  });

  it('never attempts twice in one tab, which is the redirect loop', async () => {
    const { autoSignIn } = await fresh();
    await autoSignIn(false);
    await autoSignIn(false);
    await autoSignIn(false);
    expect(signInWithSSO).toHaveBeenCalledTimes(1);
  });

  it('survives a reload, because the guard outlives the navigation', async () => {
    const { autoSignIn } = await fresh();
    await autoSignIn(false);
    expect(signInWithSSO).toHaveBeenCalledTimes(1);

    // a fresh module graph, as a reload would be — sessionStorage persists
    vi.resetModules();
    signInWithSSO.mockClear();
    const again = await import('@/signIn');
    await again.autoSignIn(false);
    expect(signInWithSSO).not.toHaveBeenCalled();
  });

  it('does not redirect at all when the guard cannot be written', async () => {
    // Private mode, a full quota, a locked-down browser. Without a guard a
    // loop cannot be detected, so the button — which always works and reports
    // its errors — is the safer answer.
    const { autoSignIn } = await fresh();
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
      clear: () => {},
    });
    await autoSignIn(false);
    expect(signInWithSSO).not.toHaveBeenCalled();
  });

  it('does not redirect when the guard writes but does not read back', async () => {
    // Storage that silently discards is rarer than storage that throws, and
    // fails the same way: nothing would stop the second attempt.
    const { autoSignIn } = await fresh();
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    });
    await autoSignIn(false);
    expect(signInWithSSO).not.toHaveBeenCalled();
  });
});

describe('after signing out', () => {
  it('leaves the person signed out rather than pulling them back in', async () => {
    const { autoSignIn } = await fresh();
    await autoSignIn(false); // the automatic one, on arrival
    signInWithSSO.mockClear();

    // they sign out; the app re-renders with no session
    await autoSignIn(false);
    expect(signInWithSSO).not.toHaveBeenCalled();
  });
});

describe('a deliberate click', () => {
  it('works even after the automatic attempt has been spent', async () => {
    const { autoSignIn, beginSso, releaseAutoAttempt } = await fresh();
    await autoSignIn(false);
    signInWithSSO.mockClear();

    releaseAutoAttempt();
    await beginSso();
    expect(signInWithSSO).toHaveBeenCalledTimes(1);
  });

  it('reports what went wrong rather than swallowing it', async () => {
    const { beginSso } = await fresh();
    signInWithSSO.mockResolvedValueOnce({
      data: {},
      error: { message: 'No SSO provider assigned for this domain' },
    } as never);
    expect(await beginSso()).toBe('No SSO provider assigned for this domain');
  });
});
