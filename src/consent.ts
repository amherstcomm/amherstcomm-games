// Analytics consent.
//
// GA4 sets cookies and hands Google an IP address, which is the kind of thing
// you ask about first. We ask everyone, everywhere.
//
// That used to depend on guessing the visitor's region from their time zone,
// which was cheap and mostly right — but the failure was one-sided. Being
// over-broad shows a banner to someone who didn't need one; being under-broad
// tracks someone who never agreed, and a VPN or a holiday was enough to do it.
// Asking everyone removes the guess, is a good deal less code, and gives the
// same answer in every jurisdiction: nothing loads until yes.

import { store } from '@/siteStorage';

const CONSENT_KEY = 'anagrimoire:analytics-consent:v2';

// Consent is meant to be current rather than perpetual — a yes from two years
// ago is doing more work than anyone agreed to. Both answers age out: a stale
// no is worth revisiting once as well, and re-asking annually is the common
// reading of what's expected.
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export type Consent = 'granted' | 'denied';

type Stored = { value: Consent; at: number };

function read(): Stored | null {
  try {
    const raw = store.getItem(CONSENT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Stored>;
    if (p?.value !== 'granted' && p?.value !== 'denied') return null;
    if (typeof p.at !== 'number' || !Number.isFinite(p.at)) return null;
    return { value: p.value, at: p.at };
  } catch {
    return null;
  }
}

/** The current answer, or null if never asked or the answer has aged out.
 *  Null means "ask" everywhere this is consulted.
 *
 *  This goes through the storage gate like everything else. The gate classes
 *  it as a privacy choice, so it's kept at every level including the
 *  strictest — remembering a no is the only way to act on one. */
export function readConsent(): Consent | null {
  const s = read();
  if (!s) return null;
  // a clock set far ahead shouldn't lock an answer in forever, so the window
  // is checked in both directions
  const age = Date.now() - s.at;
  if (age > MAX_AGE_MS || age < -MAX_AGE_MS) return null;
  return s.value;
}

/** When the current answer was given. Shown in Settings, so the record of what
 *  was agreed and when belongs to the visitor too, not only to us. */
export function consentGivenAt(): Date | null {
  const s = read();
  return s ? new Date(s.at) : null;
}

export function writeConsent(value: Consent): void {
  try {
    store.setItem(CONSENT_KEY, JSON.stringify({ value, at: Date.now() } satisfies Stored));
  } catch {
    // private mode — the choice holds for this page view only
  }
}

// Global Privacy Control — a browser-level "don't sell or share my data"
// signal. Honouring it costs one line and means the answer is already no for
// anyone who set it, without their being asked at all.
export function gpcEnabled(): boolean {
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

// Saying no should also undo any yes that came before it — someone who
// visited before we started asking already has _ga cookies sitting there, and
// leaving them behind makes the refusal cosmetic. GA writes on the registrable
// domain, so clear both that and the exact host.
export function clearAnalyticsCookies(): void {
  const names = document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((n) => n.startsWith('_ga') || n === '_gid');
  if (!names.length) return;
  const host = location.hostname;
  const parts = host.split('.');
  const domains = [undefined, host, `.${host}`];
  if (parts.length > 2) domains.push(`.${parts.slice(-2).join('.')}`);
  for (const name of names) {
    for (const domain of domains) {
      document.cookie =
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/` +
        (domain ? `; domain=${domain}` : '');
    }
  }
}

/** Whether analytics may load right now. One rule everywhere: an unexpired
 *  yes, and no GPC signal. */
export function analyticsAllowed(): boolean {
  if (gpcEnabled()) return false;
  return readConsent() === 'granted';
}
