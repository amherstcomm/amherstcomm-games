import { useEffect, useRef, useState } from 'react';
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
  const card = useRef<HTMLDivElement>(null);

  // Room made for it at the bottom of the page, for exactly as long as it is
  // asking.
  //
  // This is here because the banner used to sit on top of the footer: every
  // footer control -- Report a problem included -- was present, visible, and
  // unclickable until somebody answered a question they had not been given a
  // reason to answer. The report tests found it while a sibling test asserting
  // the button was *visible* passed, which is what `toBeVisible` promises and
  // is not the same as usable.
  //
  // Measured rather than a guessed constant: the card is two lines on a phone
  // and one on a laptop, and a fixed number would be wrong on one of them.
  useEffect(() => {
    if (!askStorage) return;
    const fit = () => {
      const height = card.current?.getBoundingClientRect().height ?? 0;
      document.body.style.paddingBottom = height ? `${Math.ceil(height) + 16}px` : '';
    };
    fit();
    const watch = new ResizeObserver(fit);
    if (card.current) watch.observe(card.current);
    window.addEventListener('resize', fit);
    return () => {
      watch.disconnect();
      window.removeEventListener('resize', fit);
      document.body.style.paddingBottom = '';
    };
  }, [askStorage]);

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
      // The wrapper spans the width and catches nothing: it is margin around
      // the card, and a transparent strip that swallows clicks is the same bug
      // in a smaller form.
      className="fixed inset-x-0 bottom-0 z-[70] p-3 sm:p-4 pointer-events-none"
    >
      <div
        ref={card}
        className="mx-auto max-w-3xl rounded-2xl bg-slate-900 border border-white/15 shadow-2xl p-4 sm:p-5 space-y-4 pointer-events-auto"
      >
        {askStorage && (
          <div className="flex flex-wrap items-center justify-center sm:justify-between gap-x-5 gap-y-3">
            <p className="flex items-start gap-2.5 text-sm text-slate-300 max-w-lg">
              <HardDrive className="w-4 h-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                <strong className="font-semibold text-slate-200">
                  What may we keep on this device?
                </strong>{' '}
                Every game works in full either way. Keeping things here is
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
