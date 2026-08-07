import { useState } from 'react';
import { BarChart3, HardDrive } from 'lucide-react';
import { GA_ID, disableAnalytics, initAnalytics } from '@/analytics';
import { clearAnalyticsCookies, gpcEnabled, readConsent, writeConsent } from '@/consent';
import { readLevel, setLevel, STORAGE_OPTIONS, type StorageLevel } from '@/siteStorage';

// Two questions, asked separately, because they are not the same question.
// One is the site remembering what you did here; the other is data going to
// Google. Bundling them into one accept/reject makes "yes" the only easy
// answer, and quietly costs someone their saved games when they meant to
// refuse the tracking.
//
// Not a modal: nothing is being tracked while it sits there, so there's no
// reason to hold the page hostage. And declining is exactly as easy as
// accepting — a banner where "no" is harder than "yes" isn't really asking.
// Every button here is deliberately identical: highlighting the one that
// shares the most would be a nudge dressed up as a default, and "equally
// easy" is meant to include how the choices look.
export default function ConsentBanner({ onReadPolicy }: { onReadPolicy: () => void }) {
  const [askStorage, setAskStorage] = useState(() => readLevel() === null);
  // A browser sending GPC has already answered the analytics question.
  const [askAnalytics, setAskAnalytics] = useState(
    () => !!GA_ID && !gpcEnabled() && readConsent() === null
  );

  if (!askStorage && !askAnalytics) return null;

  function chooseStorage(next: StorageLevel) {
    setLevel(next);
    setAskStorage(false);
  }

  function chooseAnalytics(value: 'granted' | 'denied') {
    writeConsent(value);
    if (value === 'granted') initAnalytics();
    else {
      disableAnalytics();
      clearAnalyticsCookies();
    }
    setAskAnalytics(false);
  }

  const choice =
    'inline-flex items-center px-3.5 h-9 rounded-lg text-sm font-semibold transition-colors ' +
    'bg-white/5 border border-white/25 text-slate-200 hover:bg-white/10 hover:text-white';

  return (
    <div
      role="region"
      aria-label="Privacy choices"
      className="fixed inset-x-0 bottom-0 z-[70] p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl bg-slate-900 border border-white/15 shadow-2xl p-4 sm:p-5 space-y-4">
        {askStorage && (
          <div className="flex flex-wrap items-center justify-center sm:justify-between gap-x-5 gap-y-3">
            <p className="flex items-start gap-2.5 text-sm text-slate-300 max-w-lg">
              <HardDrive className="w-4 h-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                <strong className="font-semibold text-slate-200">
                  What may we keep on this device?
                </strong>{' '}
                Every game and solver works in full either way. Keeping things here is
                what lets today&apos;s board still be there tomorrow; the alternative
                forgets it all when you close the tab.
              </span>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {STORAGE_OPTIONS.map(({ id, label }) => (
                <button key={id} onClick={() => chooseStorage(id)} className={choice}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {askStorage && askAnalytics && <div className="h-px bg-white/10" />}

        {askAnalytics && (
          <div className="flex flex-wrap items-center justify-center sm:justify-between gap-x-5 gap-y-3">
            <p className="flex items-start gap-2.5 text-sm text-slate-300 max-w-lg">
              <BarChart3 className="w-4 h-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                <strong className="font-semibold text-slate-200">
                  May we use Google Analytics to count visits?
                </strong>{' '}
                This one leaves your device. Playing and solving work exactly the same
                either way, and we never send it the letters you type.{' '}
                <button
                  onClick={onReadPolicy}
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  Privacy policy
                </button>
              </span>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button onClick={() => chooseAnalytics('denied')} className={choice}>
                No thanks
              </button>
              <button onClick={() => chooseAnalytics('granted')} className={choice}>
                Allow
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
