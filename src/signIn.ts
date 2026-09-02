// Starting a sign-in, and starting one without being asked.
//
// Separate from sso.ts, which stays pure configuration so its tests can load
// it with stubbed env and nothing else. This is the half that touches the
// client.
import { supabase } from '@/supabase';
import { SSO_ROUTE } from '@/sso';

/** Send the browser to the configured identity provider.
 *
 *  SAML and OAuth are different client calls — signInWithSSO against
 *  signInWithOAuth — which is why SSO_ROUTE is a union rather than a string.
 *  Both redirect the page themselves rather than returning a URL to follow. */
export async function beginSso(): Promise<string | null> {
  if (!supabase || !SSO_ROUTE) return null;
  const back = { redirectTo: window.location.origin };
  const { error } =
    SSO_ROUTE.kind === 'oauth'
      ? await supabase.auth.signInWithOAuth({ provider: SSO_ROUTE.provider, options: back })
      : SSO_ROUTE.by === 'domain'
        ? await supabase.auth.signInWithSSO({ domain: SSO_ROUTE.domain, options: back })
        : await supabase.auth.signInWithSSO({ providerId: SSO_ROUTE.providerId, options: back });
  return error?.message ?? null;
}

// The guard lives in sessionStorage rather than in `store`, which is a
// deliberate exception to "all storage goes through one place".
//
// `store` falls back to an in-memory Map when the storage level is
// 'essential', and memory does not survive a navigation — which is precisely
// the event being guarded against. A flag that clears on redirect cannot stop
// a redirect loop. sessionStorage has the one lifetime that fits: longer than
// a navigation, shorter than the browser session, gone when the tab closes.
// It holds a marker and nothing about anyone.
const GUARD = 'anagrimoire:sso-auto';

/** True if we managed to record that an attempt is being made.
 *
 *  Fails toward *not* redirecting. If sessionStorage cannot be written or read
 *  back — private mode, a locked-down browser, a quota — then a loop cannot be
 *  detected, and an auto-redirect that cannot be stopped is worse than a
 *  button that always works. */
function claimAttempt(): boolean {
  try {
    if (sessionStorage.getItem(GUARD)) return false;
    sessionStorage.setItem(GUARD, '1');
    return sessionStorage.getItem(GUARD) === '1';
  } catch {
    return false;
  }
}

/** Sign in without being asked, once per tab.
 *
 *  Everyone reaching this page has already authenticated at the proxy in front
 *  of it, so a button offering the only route they can take is a second login
 *  for something they just did. This takes it for them.
 *
 *  Deliberately not retried. A second attempt after a failure is a redirect
 *  loop with extra steps, and the failure a person needs to see — SAML
 *  misconfigured, the domain not mapped to an IdP — is invisible from inside
 *  one. One attempt, then the modal's button, which reports what went wrong.
 *
 *  Signing out is the other reason this must not repeat: it would sign the
 *  person straight back in, and there would be no way to leave. The claim is
 *  already spent by then, so it doesn't. */
export async function autoSignIn(hasSession: boolean): Promise<void> {
  if (!supabase || !SSO_ROUTE || hasSession) return;
  if (!claimAttempt()) return;
  await beginSso();
}

/** Let a deliberate sign-in start fresh. Called when someone clicks the
 *  button, so an auto-attempt that failed does not also disable the manual
 *  route for the rest of the tab's life. */
export function releaseAutoAttempt(): void {
  try {
    sessionStorage.removeItem(GUARD);
  } catch {
    // nothing held it in the first place
  }
}
