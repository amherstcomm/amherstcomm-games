// Analytics consent.
//
// GA4 sets cookies and hands Google an IP address, which in the EEA and the UK
// is supposed to happen only after someone agrees to it. We have no geo-IP and
// don't want one — asking a third party where a visitor is, in order to decide
// whether to track them, is its own privacy problem. The browser's own time
// zone is a good enough proxy and costs nothing.
//
// The check errs toward asking: an over-broad guess shows a banner to someone
// who didn't need one, while an under-broad guess tracks someone who never
// agreed. Only one of those is a problem.

const CONSENT_KEY = 'anagrimoire:analytics-consent:v1';

// EEA + UK + Switzerland. Europe/* also catches Moscow, Istanbul and Kyiv,
// which aren't in scope — harmless, and those places have their own rules.
// The Atlantic, Indian and America entries are EEA territories that don't
// sit under a Europe/ zone.
const OUTLYING_ZONES = new Set([
  'Atlantic/Azores',
  'Atlantic/Canary',
  'Atlantic/Faroe',
  'Atlantic/Madeira',
  'Atlantic/Reykjavik',
  'America/Cayenne',
  'America/Guadeloupe',
  'America/Martinique',
  'America/Miquelon',
  'Indian/Mayotte',
  'Indian/Reunion',
]);

export function needsConsent(): boolean {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return true;
    return zone.startsWith('Europe/') || OUTLYING_ZONES.has(zone);
  } catch {
    // no Intl, or a browser that won't say — ask rather than assume
    return true;
  }
}

export type Consent = 'granted' | 'denied';

export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: Consent): void {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // private mode — the choice holds for this page view only
  }
}

// Global Privacy Control — a browser-level "don't sell or share my data"
// signal. Honouring it costs one line and means the answer is already no for
// anyone who set it, whichever region they're in.
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

// Whether analytics may load right now: everywhere that doesn't require
// asking, plus everywhere that asked and got a yes.
export function analyticsAllowed(): boolean {
  if (gpcEnabled()) return false;
  return needsConsent() ? readConsent() === 'granted' : true;
}
