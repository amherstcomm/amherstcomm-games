// The way in.
//
// Everything about running a session worked before this file existed — the
// schema, the presenter controls, answering, the reveal. What did not exist was
// any way for the room to arrive: the only links to /live/<id> were on the
// authoring screen, so joining meant somebody pasting a URL with a raw UUID in
// it. A feature nobody can reach is not a feature.
//
// Two doors, because they fail differently. The list is right when everyone is
// already signed in at their own screen and nobody should have to type
// anything; the code is right when "how do I get in" has to fit on a slide or
// be said out loud across a room. Both end at the same address.
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Loader2, Radio } from 'lucide-react';
import { readLiveSessions, resolveCode, type LiveSessionSummary } from '@/live';
import { pathOf } from '@/routes';

/** Codes are four characters from an alphabet with no 0/O/1/I/L, so anything
 *  else somebody types — spaces, dashes, lower case — is noise to strip rather
 *  than a reason to refuse. The server normalises too; this is so the box looks
 *  like it is listening. */
const clean = (raw: string) => raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);

export default function JoinSession({ code }: { code?: string }) {
  const [sessions, setSessions] = useState<LiveSessionSummary[] | null>(null);
  const [typed, setTyped] = useState(clean(code ?? ''));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const pull = useCallback(async () => setSessions(await readLiveSessions()), []);

  useEffect(() => {
    void pull();
    // Refetch when the tab comes back, which is exactly when somebody has been
    // told "it's starting" and has switched to it. Not a poll: a session going
    // live is a once-an-hour event and every signed-in browser asking every few
    // seconds would be the room's traffic, to change a list that is usually
    // empty.
    const wake = () => void pull();
    window.addEventListener('focus', wake);
    return () => window.removeEventListener('focus', wake);
  }, [pull]);

  const go = useCallback(
    async (raw: string) => {
      setBusy(true);
      const res = await resolveCode(raw);
      setBusy(false);
      if (res.ok && res.id) {
        window.location.assign(pathOf({ kind: 'live', session: res.id, host: false }));
        return;
      }
      setNote(res.reason ?? 'That code did not work');
    },
    []
  );

  // A link off a slide — /join/ABCD — should land in the room, not on a form
  // with the code already typed into it.
  useEffect(() => {
    const from = clean(code ?? '');
    if (from.length === 4) void go(from);
  }, [code, go]);

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-white mb-1">Join a session</h1>
      <p className="text-sm text-slate-400 mb-8">
        Pick what is running, or type the code from the screen.
      </p>

      <label className="block mb-2">
        <span className="text-xs uppercase tracking-wider text-slate-500">Code</span>
        <input
          value={typed}
          onChange={(e) => {
            setTyped(clean(e.target.value));
            setNote('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && typed.length === 4) void go(typed);
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCD"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white text-2xl tracking-[0.4em] font-semibold text-center placeholder:text-slate-600 focus:outline-none focus:border-accent"
        />
      </label>
      <button
        onClick={() => void go(typed)}
        disabled={busy || typed.length !== 4}
        className="w-full h-11 rounded-xl bg-emerald-400 text-ink font-semibold disabled:opacity-50"
      >
        {busy ? 'Looking…' : 'Join'}
      </button>
      {note && (
        <p className="text-sm text-danger mt-3" role="status">
          {note}
        </p>
      )}

      <div className="mt-10">
        <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Running now</p>
        {sessions === null && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
        {sessions?.length === 0 && (
          <p className="text-sm text-slate-400">
            Nothing is running at the moment. This page will notice when something
            starts, next time you come back to it.
          </p>
        )}
        <ul className="space-y-2">
          {(sessions ?? []).map((s) => (
            <li key={s.id}>
              <a
                href={pathOf({ kind: 'live', session: s.id, host: false })}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/15 px-4 py-3 hover:bg-white/5"
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <Radio className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                  <span className="text-white font-medium truncate">{s.title}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
