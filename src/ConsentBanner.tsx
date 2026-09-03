import { useState } from 'react';
import { HardDrive } from 'lucide-react';
import { readLevel, setLevel, STORAGE_OPTIONS, type StorageLevel } from '@/siteStorage';

// One question: may the site remember what you did here. There used to be a
// second, about data going to Google, deliberately asked separately so that
// bundling them could not make "yes" the only easy answer. There is no
// analytics on this deployment at all now, so there is nothing to ask.
//
// Not a modal: nothing is being tracked while it sits there, so there's no
// reason to hold the page hostage. And declining is exactly as easy as
// accepting — a banner where "no" is harder than "yes" isn't really asking.
// Every button here is deliberately identical: highlighting the one that
// shares the most would be a nudge dressed up as a default, and "equally
// easy" is meant to include how the choices look.
export default function ConsentBanner() {
  const [askStorage, setAskStorage] = useState(() => readLevel() === null);

  if (!askStorage) return null;

  function chooseStorage(next: StorageLevel) {
    setLevel(next);
    setAskStorage(false);
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

      </div>
    </div>
  );
}
