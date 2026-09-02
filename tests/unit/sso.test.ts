// Two rules worth pinning, neither of which is "the variable is read".
//
// First: a half-configured .env must not take the other sign-in routes away.
// SSO_ONLY hides the OAuth buttons and the magic-link form, so if a blank or
// whitespace-only value counted as configured, the modal would offer one
// button handing the client an empty provider — no way in, and no way back to
// the email form. On a deployment where sign-in is required that is everybody
// locked out, arriving from a stray space in a file nobody thinks of as code.
//
// Second: when more than one route is configured, which one wins is fixed and
// documented rather than incidental. Both ways of getting that wrong are worse
// than choosing: treating it as "no SSO" silently reopens the email form on an
// SSO-only deployment, and refusing to render a button locks everyone out.

import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadWith(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('@/sso');
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('no route configured', () => {
  it('leaves the other sign-in routes in place', async () => {
    const { SSO_ROUTE, SSO_ONLY } = await loadWith({ VITE_SSO_PROVIDER: '' });
    expect(SSO_ROUTE).toBeNull();
    expect(SSO_ONLY).toBe(false);
  });

  it('treats whitespace as unconfigured rather than as a route', async () => {
    const { SSO_ROUTE, SSO_ONLY } = await loadWith({
      VITE_SSO_PROVIDER: '   ',
      VITE_SSO_SAML_DOMAIN: '  ',
      VITE_SSO_SAML_PROVIDER_ID: '\t',
    });
    expect(SSO_ROUTE).toBeNull();
    expect(SSO_ONLY).toBe(false);
  });
});

describe('the OAuth route', () => {
  it('passes the provider through untouched', async () => {
    const { SSO_ROUTE, SSO_ONLY } = await loadWith({ VITE_SSO_PROVIDER: 'keycloak' });
    expect(SSO_ROUTE).toEqual({ kind: 'oauth', provider: 'keycloak' });
    expect(SSO_ONLY).toBe(true);
  });

  it('trims a stray space rather than sending it to the server', async () => {
    const { SSO_ROUTE } = await loadWith({ VITE_SSO_PROVIDER: ' keycloak ' });
    expect(SSO_ROUTE).toEqual({ kind: 'oauth', provider: 'keycloak' });
  });
});

describe('the SAML routes', () => {
  it('signs in by domain', async () => {
    const { SSO_ROUTE, SSO_ONLY } = await loadWith({ VITE_SSO_SAML_DOMAIN: 'amherstcomm.net' });
    expect(SSO_ROUTE).toEqual({ kind: 'saml', by: 'domain', domain: 'amherstcomm.net' });
    expect(SSO_ONLY).toBe(true);
  });

  it('signs in by provider id', async () => {
    const { SSO_ROUTE } = await loadWith({ VITE_SSO_SAML_PROVIDER_ID: 'a1b2c3d4' });
    expect(SSO_ROUTE).toEqual({ kind: 'saml', by: 'providerId', providerId: 'a1b2c3d4' });
  });
});

describe('precedence when more than one is set', () => {
  it('takes the provider id over a domain — it names one IdP exactly', async () => {
    const { SSO_ROUTE } = await loadWith({
      VITE_SSO_SAML_PROVIDER_ID: 'a1b2c3d4',
      VITE_SSO_SAML_DOMAIN: 'amherstcomm.net',
      VITE_SSO_PROVIDER: 'keycloak',
    });
    expect(SSO_ROUTE).toEqual({ kind: 'saml', by: 'providerId', providerId: 'a1b2c3d4' });
  });

  it('takes a SAML domain over the OAuth provider', async () => {
    const { SSO_ROUTE } = await loadWith({
      VITE_SSO_SAML_DOMAIN: 'amherstcomm.net',
      VITE_SSO_PROVIDER: 'keycloak',
    });
    expect(SSO_ROUTE).toEqual({ kind: 'saml', by: 'domain', domain: 'amherstcomm.net' });
  });

  it('never resolves to null while any route is configured', async () => {
    const { SSO_ROUTE, SSO_ONLY } = await loadWith({
      VITE_SSO_SAML_PROVIDER_ID: 'a1b2c3d4',
      VITE_SSO_PROVIDER: 'keycloak',
    });
    expect(SSO_ROUTE).not.toBeNull();
    expect(SSO_ONLY).toBe(true);
  });
});

describe('the SSO label', () => {
  it('falls back to something a person can read, never to the route value', async () => {
    const { SSO_LABEL } = await loadWith({ VITE_SSO_SAML_PROVIDER_ID: 'a1b2c3d4' });
    expect(SSO_LABEL).toBe('single sign-on');
    expect(SSO_LABEL).not.toContain('a1b2c3d4');
  });

  it('uses the configured name when there is one', async () => {
    const { SSO_LABEL } = await loadWith({
      VITE_SSO_SAML_DOMAIN: 'amherstcomm.net',
      VITE_SSO_LABEL: 'Amherst Communications',
    });
    expect(SSO_LABEL).toBe('Amherst Communications');
  });
});
