// Optional Google Analytics (GA4). Loads only when VITE_GA_ID is set at
// build time — without it nothing is injected and no data leaves the page.
// Set the env var on the production site only to keep dev traffic out.
//
// Where consent is required it also waits for one: nothing is injected until
// analyticsAllowed() says so, which is the whole point — a script that loads
// first and asks afterwards has already done the thing it was asking about.

import { analyticsAllowed } from '@/consent';

export const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;

let loaded = false;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer: any[];
  }
}

// Turning analytics off mid-visit can't unload a script that's already in the
// page, so use Google's own kill switch. It stops gtag sending anything for
// the rest of this page view; the reload after that never loads it at all.
export function disableAnalytics(): void {
  if (!GA_ID) return;
  (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = true;
}

// Safe to call more than once — the consent banner calls it again on accept.
export function initAnalytics(): void {
  if (!GA_ID || !/^G-[A-Z0-9]+$/.test(GA_ID)) return;
  if (!analyticsAllowed()) return;
  // lift an opt-out from earlier in this same visit, before the early return —
  // turning it back on has to undo the switch, not just skip reloading gtag
  (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = false;
  if (loaded) return;
  loaded = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  // gtag requires the literal arguments object, not a spread array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function gtag(..._args: any[]) {
    void _args;
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  }
  gtag('js', new Date());
  gtag('config', GA_ID);
}
