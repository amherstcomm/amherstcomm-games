// Which identity provider signs people in, decided at build time.
//
// The provider is configuration rather than a literal because two different
// routes reach the same place, and which one works is a property of the GoTrue
// build on the server, not of this code:
//
//   keycloak       the long-standing generic-OIDC provider. Not actually
//                  Keycloak-specific — it takes an issuer URL, so it points at
//                  any OIDC provider, Zitadel included.
//   custom:<name>  newer GoTrue's named generic-OIDC providers. Cleaner, and
//                  honest about what it is, but only if the server has it.
//
// Both are in supabase-js's Provider union, so the client cannot tell them
// apart. Making this a build arg means finding out which one the server
// supports costs a rebuild rather than a code change — which matters while
// the identity provider is still being wired up.
//
// Unset is a supported state and the default: without it the modal keeps the
// public-internet sign-in routes it shipped with.
import type { Provider } from '@supabase/supabase-js';

function trimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** The provider to hand `signInWithOAuth`, or null when none is configured. */
export const SSO_PROVIDER: Provider | null =
  (trimmed(import.meta.env.VITE_SSO_PROVIDER) as Provider) || null;

/** What the button calls it. A person recognises their company, not a
 *  protocol — "Continue with Amherst Communications", never "Continue with
 *  custom:zitadel". */
export const SSO_LABEL: string = trimmed(import.meta.env.VITE_SSO_LABEL) || 'single sign-on';

/** When a provider is configured it is the *only* route: the OAuth buttons and
 *  the magic-link form both come down.
 *
 *  This is the half that makes "sign-in is required through SSO" true rather
 *  than merely intended. Leaving the email form up would leave a second door
 *  open to anyone with any address GoTrue would mail, which is the opposite of
 *  what a single sign-on deployment is for. The other half is on the server —
 *  the email provider has to be disabled in GoTrue too, or the door is still
 *  there for anyone who calls the API directly instead of using this page. */
export const SSO_ONLY: boolean = SSO_PROVIDER !== null;
