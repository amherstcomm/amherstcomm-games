// What a reporter sees at /report/<ticket>.
//
// A report that vanishes into a thank-you is indistinguishable from one that
// was dropped, and the people filing these mostly have no account to check
// anything under. So the ticket is the account: a code they were handed, a URL
// that holds it, and one honest sentence about where it got to.
//
// It shows a status and nothing else — not the board, not the name, not their
// own words back. There is no version of this page that should be able to tell
// a stranger what somebody else reported.
import { useEffect, useState } from 'react';
import { Flag, Search } from 'lucide-react';
import { ticketStatus, type TicketStatus } from '@/reports';

const OUTCOME: Record<string, string> = {
  dismissed: 'We looked and decided nothing needed changing.',
  blocked: 'The word has been blocked — it won’t be published again.',
  banned: 'The name has been removed and blocked.',
};

export default function TicketView({ ticket }: { ticket: string }) {
  const [typed, setTyped] = useState(ticket);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>(ticket ? 'loading' : 'idle');
  const [status, setStatus] = useState<TicketStatus | null>(null);

  useEffect(() => {
    if (!ticket) {
      setState('idle');
      setStatus(null);
      return;
    }
    let alive = true;
    setState('loading');
    ticketStatus(ticket).then((s) => {
      if (!alive) return;
      setStatus(s);
      setState(s ? 'idle' : 'error');
    });
    return () => {
      alive = false;
    };
  }, [ticket]);

  const look = () => {
    const code = typed.trim().toLowerCase();
    if (code) window.history.pushState(null, '', `/report/${code}`);
    // the app's own popstate plumbing does the rest
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Flag className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
        Report status
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Look up a report with the reference you were given when you filed it.
      </p>

      <div className="mt-4 flex gap-2">
        <label htmlFor="ticket-code" className="sr-only">
          Report reference
        </label>
        <input
          id="ticket-code"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && look()}
          placeholder="e.g. 4f2ba9c17d"
          className="flex-1 min-w-0 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          onClick={look}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 rounded-lg bg-accent text-slate-950 text-sm font-semibold hover:brightness-110 transition"
        >
          <Search className="w-3.5 h-3.5" aria-hidden="true" />
          Look up
        </button>
      </div>

      <div className="mt-5" aria-live="polite">
        {state === 'loading' && <p className="text-sm text-slate-400">Looking…</p>}
        {state === 'error' && (
          <p className="text-sm text-slate-400">
            Couldn’t reach the server just now. Try again in a moment.
          </p>
        )}
        {state === 'idle' && status?.found === false && (
          // A wrong code and a real one read alike from the server, so this is
          // as much as can honestly be said.
          <p className="text-sm text-slate-400">
            Nothing found under that reference. Check the code and try again.
          </p>
        )}
        {state === 'idle' && status?.found === true && (
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <p className="text-sm font-semibold text-white">
              {status.open ? 'Still open' : 'Closed'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Filed {new Date(status.filed).toLocaleDateString()}
              {status.closed && ` · closed ${new Date(status.closed).toLocaleDateString()}`}
            </p>
            <p className="mt-3 text-sm text-slate-300">
              {status.open
                ? 'It’s in the queue and hasn’t been dealt with yet. Nothing else is needed from you.'
                : (status.resolution && OUTCOME[status.resolution]) ||
                  'It has been dealt with.'}
            </p>
            {/* What was actually written about it, which is more use than the
                canned sentence above and is the same text the outcome email
                carries. */}
            {!status.open && status.note && (
              <p className="mt-2 text-sm text-slate-400 break-words">{status.note}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
