// The owner's page for a single report, reached from a link in the digest.
//
// Two keys open it and both are checked on the server: the token in the
// address, and being signed in as an owner. Either alone gets 'not allowed',
// which is the whole reason an action link is safe to email — the one thing
// reliably true about email links is that other people read them, and a
// corporate scanner pre-clicking every URL in a message is a thing that has
// already happened here.
//
// The page shows the report before it offers to act on it. A one-click ban
// straight from an inbox would be a ban decided without looking.
import { useEffect, useState } from 'react';
import { AlertTriangle, Flag } from 'lucide-react';
import { actOnReport, reportForAction, type ReportForAction } from '@/reports';

const ACTIONS = [
  { id: 'dismiss', label: 'Dismiss', hint: 'Nothing needs changing. Closes the report.' },
  {
    id: 'blocklist',
    label: 'Block the word',
    hint: 'Adds it to blocked_words at both scope — never published, never accepted.',
  },
  { id: 'ban', label: 'Remove the name', hint: 'Clears the display name and blocks it exactly. The account stays.' },
] as const;

export default function ReportActionView({
  id,
  token,
  action,
}: {
  id: string;
  token: string;
  action: string;
}) {
  const [report, setReport] = useState<ReportForAction | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [chosen, setChosen] = useState<string>(action);
  const [note, setNote] = useState('');
  const [word, setWord] = useState('');
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    reportForAction(id, token).then((r) => {
      if (!alive) return;
      if (r === 'denied') setState('denied');
      else if (!r) setState('error');
      else {
        setReport(r);
        setState('ready');
      }
    });
    return () => {
      alive = false;
    };
  }, [id, token]);

  const act = async () => {
    setSaving(true);
    const r = await actOnReport(id, token, chosen, note, word);
    setSaving(false);
    setOutcome(r);
  };

  if (state === 'loading') return <p className="text-sm text-slate-400">Loading…</p>;

  if (state === 'denied') {
    return (
      <div className="max-w-lg mx-auto">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          Not allowed
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          This page needs both the link from the digest and an owner account signed in on this
          browser. Sign in under Account and open the link again.
        </p>
      </div>
    );
  }

  if (state === 'error' || !report) {
    return <p className="text-sm text-slate-400">Couldn’t load that report. Try again in a moment.</p>;
  }

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Flag className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
        Report {report.ticket}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {report.kind} · filed {new Date(report.filed).toLocaleString()}
        {report.status !== 'new' && ` · already ${report.resolution}`}
      </p>

      <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">The evidence</p>
        {/* As the server holds it, which is the point of the whole design —
            this is what was served, not what the reporter said was served. */}
        <pre className="mt-2 overflow-x-auto text-xs text-slate-300 whitespace-pre-wrap break-words">
          {JSON.stringify(report.evidence, null, 2)}
        </pre>
        <p className="mt-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          What they said
        </p>
        <p className="mt-1 text-sm text-slate-300">{report.reason || '(nothing given)'}</p>
      </div>

      {outcome ? (
        <p className="mt-5 text-sm text-slate-300" role="status">
          {outcome === 'ok'
            ? 'Done — the report is closed.'
            : outcome === 'already handled'
              ? 'Somebody already handled this one.'
              : outcome === 'no word given'
                ? 'That needs a word to block. Type it and try again.'
                : 'That didn’t go through.'}
        </p>
      ) : (
        <>
          <fieldset className="mt-5">
            <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              What to do
            </legend>
            <div className="mt-2 space-y-2">
              {ACTIONS.filter(
                (a) =>
                  (a.id !== 'ban' || report.kind === 'player') &&
                  (a.id !== 'blocklist' || report.kind === 'puzzle')
              ).map((a) => (
                <label key={a.id} className="flex gap-2 items-start cursor-pointer">
                  <input
                    type="radio"
                    name="action"
                    value={a.id}
                    checked={chosen === a.id}
                    onChange={() => setChosen(a.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="text-sm font-semibold text-slate-200">{a.label}</span>
                    <span className="block text-xs text-slate-500">{a.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {chosen === 'blocklist' && (
            <>
              <label htmlFor="block-word" className="mt-4 block text-xs text-slate-500">
                {/* Typed rather than read off the board: the offending word is
                    not always the answer, and a rule that guessed would guess
                    wrong on exactly the boards that matter. */}
                Which word to block
              </label>
              <input
                id="block-word"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                className="mt-1 w-full rounded-lg bg-slate-950 border border-white/10 px-3 py-2 font-mono text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </>
          )}

          <label htmlFor="action-note" className="mt-4 block text-xs text-slate-500">
            Why — the reporter sees this, on their ticket page and by email if
            they left an address
          </label>
          <textarea
            id="action-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={2}
            className="mt-1 w-full rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent"
          />

          <button
            onClick={act}
            disabled={saving || !chosen}
            className="mt-4 px-4 py-2 rounded-lg bg-accent text-slate-950 text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition"
          >
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </>
      )}
    </div>
  );
}
