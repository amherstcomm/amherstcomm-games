// How people sign in, decided at build time.
//
// Three routes exist and which one works is a property of the identity
// provider and the GoTrue build, not of this code — so the choice is
// configuration, and getting it wrong costs a rebuild rather than an edit.
// That mattered immediately: `keycloak` looked like the obvious route for
// Zitadel and turned out not to be one.
//
//   VITE_SSO_PROVIDER          signInWithOAuth, for GoTrue's named OAuth
//                              providers.
//   VITE_SSO_SAML_DOMAIN       signInWithSSO by email domain, for GoTrue's
//                              native SAML. The domain routes to whichever
//                              IdP was registered for it.
//   VITE_SSO_SAML_PROVIDER_ID  signInWithSSO by provider UUID — the same
//                              route when a domain hasn't been mapped.
//
// **`keycloak` does not reach Zitadel.** GoTrue's Keycloak provider appends
// fixed Keycloak paths to the configured URL rather than doing OIDC discovery
// — `/protocol/openid-connect/auth`, `/token`, `/userinfo` — and Zitadel
// serves `/oauth/v2/authorize`, `/oauth/v2/token` and `/oidc/v1/userinfo`.
// Read out of supabase/auth's keycloak.go, not inferred. The OAuth route only
// works against Zitadel with a proxy rewriting those three paths; without one,
// SAML is the route.
import type { Provider } from '@supabase/supabase-js';

function trimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Where the sign-in button sends someone. Null means no SSO is configured,
 *  and the modal keeps the routes it shipped with. */
export type SsoRoute =
  | { kind: 'oauth'; provider: Provider }
  | { kind: 'saml'; by: 'domain'; domain: string }
  | { kind: 'saml'; by: 'providerId'; providerId: string };

const provider = trimmed(import.meta.env.VITE_SSO_PROVIDER);
const samlDomain = trimmed(import.meta.env.VITE_SSO_SAML_DOMAIN);
const samlProviderId = trimmed(import.meta.env.VITE_SSO_SAML_PROVIDER_ID);

/** Precedence, rather than an error, when more than one is set.
 *
 *  Fixed order and pinned by a test, because the two ways of getting this
 *  wrong are not equally bad. Treating a double-configuration as "no SSO"
 *  silently reopens the email form on a deployment meant to be SSO-only;
 *  refusing to render a button at all locks everyone out. Choosing
 *  deterministically does neither, and the order is specific-to-general:
 *  a provider UUID names one IdP exactly, a domain names one by mapping, and
 *  the OAuth provider is the general case. */
export const SSO_ROUTE: SsoRoute | null = samlProviderId
  ? { kind: 'saml', by: 'providerId', providerId: samlProviderId }
  : samlDomain
    ? { kind: 'saml', by: 'domain', domain: samlDomain }
    : provider
      ? { kind: 'oauth', provider: provider as Provider }
      : null;

/** What the button calls it. A person recognises their employer, not a
 *  protocol — "Continue with Amherst Communications", never "Continue with
 *  custom:zitadel" or a provider UUID. */
export const SSO_LABEL: string = trimmed(import.meta.env.VITE_SSO_LABEL) || 'single sign-on';

/** When a route is configured it is the *only* one: the OAuth buttons and the
 *  magic-link form both come down.
 *
 *  This is the half that makes "sign-in is through SSO" true rather than
 *  merely intended. Leaving the email form up would leave a second door open
 *  to anyone with an address GoTrue would mail, which is the opposite of what
 *  a single sign-on deployment is for. The other half is on the server —
 *  GoTrue's email provider has to be disabled too, or the door is still there
 *  for anyone calling the API directly instead of using this page. */
export const SSO_ONLY: boolean = SSO_ROUTE !== null;
