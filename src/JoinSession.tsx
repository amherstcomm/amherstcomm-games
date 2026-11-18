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
import RouteLink from '@/RouteLink';
import PageWithRail, { RailCard } from '@/PageWithRail';

/** Codes are four characters from an alphabet with no 0/O/1/I/L, so anything
 *  else somebody types — spaces, dashes, lower case — is noise to strip rather
 *  than a reason to refuse. The server normalises too; this is so the box looks
 *  like it is listening. */
const clean = (raw: string) => raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);

export default function JoinSession({ code, host }: {
  code?: string;
  /** where whoever can build sessions goes to do it; absent for everybody else */
  host?: { to: string; onGo: () => void };
}) {
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
    <PageWithRail
      section="Events"
      title="Join a session"
      blurb="Type the code from the screen, or pick what is running."
      rail={
        host && (
          <RailCard label="Running one?">
            <p className="text-sm text-slate-400">Build the questions and host from your laptop.</p>
            <RouteLink {...host} className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
              Your sessions
            </RouteLink>
          </RailCard>
        )
      }
    >
      <section aria-label="Join with a code" className="rounded-2xl border border-white/10 bg-slate-900 p-5 sm:p-6">
        <form
          className="max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            // Said, not greyed out: a dimmed button on the dark theme looks
            // like one that is broken.
            if (typed.length !== 4) {
              setNote(typed.length === 0 ? 'Type the four-letter code first.' : 'The code is four letters long.');
              return;
            }
            void go(typed);
          }}
        >
          <label className="block mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Code</span>
            <input
              value={typed}
              onChange={(e) => {
                setTyped(clean(e.target.value));
                setNote('');
              }}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="ABCD"
              className="mt-1.5 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white text-3xl tracking-[0.4em] font-bold text-center placeholder:text-slate-600 focus:outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-xl bg-accent text-slate-950 font-semibold hover:brightness-110"
          >
            {busy ? 'Looking…' : 'Join'}
          </button>
          {note && (
            <p className="text-sm text-danger mt-3" role="status">
              {note}
            </p>
          )}
        </form>
      </section>

      <section aria-label="Running now">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Running now</h2>
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
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 hover:border-white/25"
              >
                <span className="inline-flex items-center gap-3 min-w-0">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-300 shrink-0">
                    <Radio className="w-3.5 h-3.5" aria-hidden="true" /> LIVE
                  </span>
                  <span className="text-white font-medium truncate">{s.title}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent shrink-0">
                  Join <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </PageWithRail>
  );
}
