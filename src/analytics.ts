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

// Safe to call more than once — the consent banner calls it again on accept.
export function initAnalytics(): void {
  if (loaded) return;
  if (!GA_ID || !/^G-[A-Z0-9]+$/.test(GA_ID)) return;
  if (!analyticsAllowed()) return;
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
