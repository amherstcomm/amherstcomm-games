import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { GA_ID, disableAnalytics, initAnalytics } from '@/analytics';
import { clearAnalyticsCookies, gpcEnabled, readConsent, writeConsent } from '@/consent';

// Shown until it's been answered — everywhere, not only where the law names a
// region. Guessing the region from a time zone was fine until someone used a
// VPN, and being tracked unasked is the only failure here that costs anything.
// Deliberately not a modal: nothing is being tracked while it sits there, so
// there's no reason to hold the page hostage until someone answers. Declining
// is one click, the same as accepting — a banner where "no" is harder than
// "yes" isn't really asking.
export default function ConsentBanner({ onReadPolicy }: { onReadPolicy: () => void }) {
  // A browser sending GPC has already answered; don't ask it again.
  const [asking, setAsking] = useState(
    () => !!GA_ID && !gpcEnabled() && readConsent() === null
  );

  if (!asking) return null;

  function answer(value: 'granted' | 'denied') {
    writeConsent(value);
    if (value === 'granted') initAnalytics();
    else {
      disableAnalytics();
      clearAnalyticsCookies();
    }
    setAsking(false);
  }

  return (
    <div
      role="region"
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-[70] p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl bg-slate-900 border border-white/15 shadow-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-center sm:justify-between gap-x-5 gap-y-3">
          <p className="flex items-start gap-2.5 text-sm text-slate-300 max-w-lg">
            <BarChart3 className="w-4 h-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <span>
              May we use Google Analytics to count visits? Playing and solving work
              exactly the same either way, and we never send it the letters you type.{' '}
              <button
                onClick={onReadPolicy}
                className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
              >
                Privacy policy
              </button>
            </span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              onClick={() => answer('denied')}
              className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              No thanks
            </button>
            <button
              onClick={() => answer('granted')}
              className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-emerald-400 text-ink hover:bg-emerald-300 transition-colors"
            >
              Allow
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
