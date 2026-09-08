// A spinner that stops claiming to be loading.
//
// Every admin panel reads its rows on mount and renders a spinner until they
// arrive. When they never arrive the spinner never stops, so a database that
// cannot be reached looks exactly like one that is slow -- and on the morning a
// proxy in front of Supabase started dropping connections, the site read as
// "half of it loaded" rather than as a connection problem. The first guess was
// the deploy, which cost the time it takes to rule a deploy out.
//
// So: the spinner for a while, then a sentence saying what happened and a way
// to try again. It cannot say *why* -- the browser knows a request did not come
// back and nothing more -- but it can say which half of the problem it is in,
// and "this is the connection, not your permissions" is worth saying because a
// blank admin page invites exactly that suspicion. A refusal has its own path
// in every panel and does not come through here.
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/** How long a load may take before it is called a failure.
 *
 *  Ten seconds is a long wait for a page and a short one for a query that is
 *  genuinely working -- the heaviest of these reads a month of coverage. Too
 *  short and a slow morning reads as broken; too long and nobody waits for the
 *  message, which is the state this replaces. Not a timeout: nothing is
 *  cancelled, so an answer that arrives at fifteen seconds still renders. */
export const WAIT_MS = 10_000;

export default function Waiting({
  what,
  onRetry,
  className = 'm-8',
}: {
  /** what is being fetched, for the sentence: "the word lists" */
  what: string;
  /** ask again, where the panel can. Absent draws no button rather than a
   *  button that reloads the page and loses what somebody had typed. */
  onRetry?: () => void;
  className?: string;
}) {
  const [late, setLate] = useState(false);

  // Restarted whenever it goes back to waiting, which is what pressing Try
  // again does. With an empty dependency list the second attempt would spin for
  // ever -- the timer having already fired once -- which is the bug this
  // component exists to remove, reintroduced one layer up.
  useEffect(() => {
    if (late) return;
    const id = window.setTimeout(() => setLate(true), WAIT_MS);
    return () => window.clearTimeout(id);
  }, [late]);

  if (!late) {
    return (
      <div className={className}>
        <Loader2 className="w-4 h-4 animate-spin text-slate-500" aria-label={`Loading ${what}`} />
      </div>
    );
  }

  return (
    <div className={className} role="status">
      <p className="text-sm text-slate-300">Could not load {what}.</p>
      <p className="mt-1 text-xs text-slate-500">
        The server did not answer. This is the connection rather than your
        permissions — nothing has been changed, and it is worth trying again.
      </p>
      {onRetry && (
        <button
          onClick={() => {
            setLate(false);
            onRetry();
          }}
          className="mt-3 inline-flex items-center px-3 h-9 rounded-lg text-sm font-semibold bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15"
        >
          Try again
        </button>
      )}
    </div>
  );
}
