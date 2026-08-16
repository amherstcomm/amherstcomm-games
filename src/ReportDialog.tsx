// One dialog for both kinds of report, because they are the same act: a
// player says "this one is wrong" about a thing the server can already
// identify. What differs is the subject line, so that is all this takes.
//
// The form is deliberately small. There is no category picker, because every
// scheme anyone invents for this ends up with a wrong box that gets picked
// anyway, and the digest is read by a person who can see the board.
//
// What it does insist on is giving something back. A report that vanishes into
// a thank-you is indistinguishable from one that was dropped, so this hands
// over a ticket and a link that will answer for it later — and an address is
// optional on top, for people who would rather be told than remember to check.
import { useRef, useState } from 'react';
import { Check, Copy, Flag, X } from 'lucide-react';
import { REASON_MAX, type ReportResult } from '@/reports';
import { ORIGIN } from '@/routes';
import { useModalA11y } from '@/useModalA11y';

export default function ReportDialog({
  subject,
  detail,
  extra,
  reasonRequired = false,
  onSend,
  onClose,
}: {
  /** what is being reported, in the player's terms — "this puzzle" */
  subject: string;
  /** the smaller line underneath, where a date or a name belongs */
  detail?: string;
  /** whatever the chosen kind needs beyond a reason — a name, a difficulty */
  extra?: React.ReactNode;
  /** true where there is nothing for the server to look up, so the words are
   *  the whole report and an empty one would be no report at all */
  reasonRequired?: boolean;
  onSend: (reason: string, email: string) => Promise<ReportResult>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, onClose);
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [copied, setCopied] = useState(false);

  const send = async () => {
    setSending(true);
    setResult(await onSend(reason, email));
    setSending(false);
  };

  const ticket = result?.state === 'filed' ? result.ticket : null;
  const ticketUrl = ticket ? `${ORIGIN}/report/${ticket}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ticketUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // no clipboard permission; the code is on screen to be read either way
    }
  };

  const done = result?.state === 'filed' || result?.state === 'unknown';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Report ${subject}`}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 text-left shadow-2xl p-6"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-bold flex items-center gap-2 pr-8">
          <Flag className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
          Report {subject}
        </h2>
        {detail && !done && <p className="mt-1 text-xs text-slate-500">{detail}</p>}

        {done ? (
          <>
            {result?.state === 'unknown' ? (
              <p className="mt-4 text-sm text-slate-300">
                This board isn’t one we can look up any more — the tab may have been open a while.
                Reload and report it again if it’s still there.
              </p>
            ) : (
              <>
                <p className="mt-4 text-sm text-slate-300">
                  Thank you — this has been passed on.
                </p>
                {ticket ? (
                  <>
                    <p className="mt-3 text-xs text-slate-500">
                      Your reference, if you want to check on it later:
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      {/* The address, not just the code. A ten-character string
                          with a Copy button beside it is a code somebody has to
                          work out what to do with; the link is the instruction
                          and the reference at once, and it survives being
                          pasted into a note to yourself. */}
                      <a
                        href={`/report/${ticket}`}
                        className="flex-1 min-w-0 truncate rounded-lg bg-slate-950 border border-white/10 px-3 py-2 font-mono text-sm text-accent hover:brightness-110"
                      >
                        {ticketUrl.replace(/^https?:\/\//, '')}
                      </a>
                      <button
                        onClick={copy}
                        aria-label="Copy the link to this report"
                        className="shrink-0 h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300 hover:bg-white/10 transition"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy link'}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      {email.trim()
                        ? 'We’ll email you when it’s been dealt with.'
                        : 'Nothing else is needed from you — the link says whether it’s still open.'}
                    </p>
                  </>
                ) : (
                  // No ticket: the subject is already at its cap, so this
                  // report was folded into the ones already filed. Saying so
                  // plainly beats inventing a reference that names nothing.
                  <p className="mt-2 text-xs text-slate-600">
                    Others have reported this one too, so it’s already in hand.
                  </p>
                )}
              </>
            )}
            <div className="mt-5 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-accent text-slate-950 text-sm font-semibold hover:brightness-110 transition"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-400">
              {reasonRequired
                ? 'Tell us what happened — as much detail as you can.'
                : 'We look it up ourselves, so there’s nothing you need to copy out. Say what’s wrong with it if you like — it’s optional.'}
            </p>

            {extra}

            <label
              htmlFor="report-reason"
              className={reasonRequired ? 'mt-3 block text-xs text-slate-500' : 'sr-only'}
            >
              What’s wrong with it
            </label>
            <textarea
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
              rows={3}
              placeholder={reasonRequired ? '' : 'Optional'}
              className="mt-3 w-full rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="mt-1 text-right text-xs text-slate-600 tabular-nums">
              {reason.length} / {REASON_MAX}
            </p>

            <label htmlFor="report-email" className="mt-3 block text-xs text-slate-500">
              Email, if you’d like to be told what came of it
            </label>
            <input
              id="report-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Optional"
              className="mt-1 w-full rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="mt-1 text-xs text-slate-600">
              Used only to send you a receipt and the outcome. It isn&apos;t shown with the
              report — not on the page where these get handled, and not in the daily summary,
              which says only that someone asked to be told — and it&apos;s deleted once the
              outcome has been sent.
            </p>

            {(result?.state === 'error' || result?.state === 'offline') && (
              <p role="alert" className="mt-2 text-sm text-rose-300">
                {result.state === 'offline'
                  ? 'Reporting needs a connection to the server, and there isn’t one right now.'
                  : 'That didn’t go through. Try again in a moment.'}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={sending || (reasonRequired && !reason.trim())}
                className="px-4 py-2 rounded-lg bg-accent text-slate-950 text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition"
              >
                {sending ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
