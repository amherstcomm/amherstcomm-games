// What a fully anonymous survey promises, said where it is being answered
// (the survey spec, November 2026): a line above every question, and "How
// this works" for anybody who wants the mechanism rather than the word.
//
// Every sentence here is something the database does -- see "Fully anonymous
// surveys" in schema.sql -- and the limits are said too, because a promise
// that is bigger than what the software keeps is the one thing this must not
// make.
import { useId, useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';

export default function AnonymityBanner({ minResults, showComments, splitFloor }: {
  /** how many answers the results wait for */
  minResults: number;
  /** the smallest group the host sees broken down when splitting the
   *  results: 3 or more in a fully anonymous survey */
  splitFloor: number;
  /** whether the reasons people give are shown in the results at all */
  showComments: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <section aria-label="Fully anonymous" className="mb-5 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <Lock className="w-4 h-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 text-sm text-slate-200">
          <p>
            <strong className="text-white">Fully anonymous.</strong>{' '}
            <span className="hidden md:inline">
              Your answers are stored without your name. Nobody, including admins and the person
              who wrote this survey, can see what you picked.
            </span>
            <span className="md:hidden">Nobody, including admins, can see what you picked.</span>{' '}
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panel}
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-0.5 font-semibold text-accent hover:underline"
            >
              How this works
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          </p>

          {open && (
            <div id={panel} className="mt-3 space-y-3 text-slate-300">
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>We record that you answered, so nobody can answer twice. That record says nothing about what you picked.</li>
                <li>Your answers are saved separately, with no name and no time.</li>
                <li>
                  Your answers in this survey are linked to each other, but not to you, so the person running it
                  can see how people who gave one answer answered the rest. A group smaller than {splitFloor} is
                  never broken down.
                </li>
                <li>
                  This browser keeps a private key for this survey. It goes with each answer so we can check
                  the answer is yours to change, and it is never stored on our side. From another browser, or
                  if this one&apos;s data is cleared, your answers still count but can no longer be changed. If
                  you chose to keep essentials only, the key lasts until you close this tab.
                </li>
                <li>Results stay hidden until at least {minResults} people have answered.</li>
                {showComments ? (
                  <li>
                    Reasons are shown shuffled, with no name, once enough people have answered or the survey
                    closes. What you write is shown as written, so leave out anything that points to you.
                  </li>
                ) : (
                  <li>The reasons people give are not shown in the results.</li>
                )}
              </ol>
              <p className="text-xs text-slate-400">
                What software cannot do: if only a few people pick an option and one of them talks about it,
                that is outside what this can protect. The server&apos;s logs note when requests arrive, which
                somebody with access to them could try to match against when people answered; the answers
                themselves keep no time.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
