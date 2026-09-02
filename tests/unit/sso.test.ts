// The rule worth pinning is not "the variable is read". It is that a
// half-configured .env must not take the other sign-in routes away.
//
// SSO_ONLY hides the OAuth buttons and the magic-link form. If a blank or
// whitespace-only VITE_SSO_PROVIDER counted as configured, the modal would
// offer one button that hands `signInWithOAuth` an empty provider — no way in,
// and no way back to the email form either. On a deployment where sign-in is
// required, that is everybody locked out, arriving from a stray space in a
// file nobody thinks of as code.

import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, '');
    else vi.stubEnv(k, v);
  }
  return import('@/sso');
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('the SSO provider', () => {
  it('is absent when nothing is configured, and the other routes stay', async () => {
    const { SSO_PROVIDER, SSO_ONLY } = await loadWith({ VITE_SSO_PROVIDER: undefined });
    expect(SSO_PROVIDER).toBeNull();
    expect(SSO_ONLY).toBe(false);
  });

  it('treats whitespace as unconfigured rather than as a provider', async () => {
    const { SSO_PROVIDER, SSO_ONLY } = await loadWith({ VITE_SSO_PROVIDER: '   ' });
    expect(SSO_PROVIDER).toBeNull();
    expect(SSO_ONLY).toBe(false);
  });

  it('passes the provider through untouched, whichever route the server took', async () => {
    for (const provider of ['keycloak', 'custom:zitadel']) {
      const mod = await loadWith({ VITE_SSO_PROVIDER: provider });
      expect(mod.SSO_PROVIDER).toBe(provider);
      expect(mod.SSO_ONLY).toBe(true);
    }
  });

  it('trims a stray space rather than sending it to the server', async () => {
    const { SSO_PROVIDER } = await loadWith({ VITE_SSO_PROVIDER: ' keycloak ' });
    expect(SSO_PROVIDER).toBe('keycloak');
  });
});

describe('the SSO label', () => {
  it('falls back to something a person can read, never to the provider string', async () => {
    const { SSO_LABEL } = await loadWith({ VITE_SSO_PROVIDER: 'custom:zitadel' });
    expect(SSO_LABEL).toBe('single sign-on');
    expect(SSO_LABEL).not.toContain('custom:');
  });

  it('uses the configured name when there is one', async () => {
    const { SSO_LABEL } = await loadWith({
      VITE_SSO_PROVIDER: 'custom:zitadel',
      VITE_SSO_LABEL: 'Amherst Communications',
    });
    expect(SSO_LABEL).toBe('Amherst Communications');
  });
});
