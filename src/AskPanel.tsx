// Questions for the host, running alongside everything else.
//
// Not an item. The `open` kind is a question the presenter asks and the room
// answers, in its turn, when it is on screen. This is the other direction and
// has no turn: anybody asks anything at any point while the session runs, and
// the host works through them when there is a gap.
//
// The votes are the reason this is a queue rather than a list. Forty questions
// in the order they arrived is something nobody can act on, and the host ends
// up picking by eye — which is the same as picking their favourites. Ordered by
// what the room wanted asked, it answers "what next" by itself.
import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, EyeOff, MessagesSquare, Send } from 'lucide-react';
import { askQuestion, markAsk, readAsks, voteAsk, type Ask } from '@/live';

/** How often the list refreshes. Slower than the room's own screen: a question
 *  arriving a few seconds late costs nothing, and this runs on every phone in
 *  the room for the whole session rather than only while a question is up. */
const ASK_POLL_MS = 8000;

export default function AskPanel({ session, host }: { session: string; host: boolean }) {
  const [asks, setAsks] = useState<Ask[] | null>(null);
  const [open, setOpen] = useState(false);
  const [hosting, setHosting] = useState(false);
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // Collapsed by default on a phone and open on the host's screen: a
  // participant is here to answer questions and this is beside that, while the
  // host is here to work through it.
  const [shown, setShown] = useState(host);

  const pull = useCallback(async () => {
    const res = await readAsks(session);
    if (!res.ok) {
      setAsks(null);
      return;
    }
    setAsks(res.asks ?? []);
    setOpen(res.open === true);
    setHosting(res.hosting === true);
  }, [session]);

  useEffect(() => {
    void pull();
    const id = window.setInterval(() => void pull(), ASK_POLL_MS);
    return () => window.clearInterval(id);
  }, [pull]);

  if (asks === null) return null;
  // Nothing to show and nothing to add: the panel is not drawn at all rather
  // than sitting there empty for a session that never wanted it.
  if (!open && asks.length === 0) return null;

  async function send() {
    setBusy(true);
    const res = await askQuestion(session, text.trim(), anon);
    setBusy(false);
    if (!res.ok) {
      setNote(res.reason ?? 'That did not send');
      return;
    }
    setText('');
    setNote('');
    await pull();
  }

  async function act(fn: () => Promise<{ ok: boolean; reason?: string }>) {
    const res = await fn();
    if (!res.ok) setNote(res.reason ?? 'That did not work');
    await pull();
  }

  const waiting = asks.filter((a) => !a.answered).length;

  return (
    <section className="mt-8 rounded-xl border border-white/15">
      <button
        onClick={() => setShown((v) => !v)}
        aria-expanded={shown}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <MessagesSquare className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-slate-200 flex-1">
          Questions for the host
          {waiting > 0 && <span className="text-slate-400 font-normal"> · {waiting} waiting</span>}
        </span>
        {shown ? (
          <ChevronUp className="w-4 h-4 text-slate-400" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
        )}
      </button>

      {shown && (
        <div className="px-4 pb-4 space-y-4">
          {open && (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 500))}
                rows={2}
                placeholder="Ask the host something"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-accent"
              />
              <div className="flex items-center justify-between gap-3">
                {/* Worded as what it does rather than as "anonymous", because
                    what it does is narrower than that word promises: the room
                    sees no name, an admin still can. */}
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={anon}
                    onChange={(e) => setAnon(e.target.checked)}
                  />
                  Don&apos;t show my name
                </label>
                <button
                  onClick={() => void send()}
                  disabled={busy || text.trim().length === 0}
                  className="inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold bg-emerald-400 text-ink disabled:opacity-50"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                  {busy ? 'Sending…' : 'Ask'}
                </button>
              </div>
            </div>
          )}

          {!open && (
            <p className="text-xs text-slate-500">
              Questions are closed. What was already asked is still here.
            </p>
          )}

          {note && (
            <p className="text-sm text-danger" role="status">
              {note}
            </p>
          )}

          {asks.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing asked yet.</p>
          ) : (
            <ul className="space-y-2">
              {asks.map((a) => (
                <li
                  key={a.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    a.answered ? 'border-white/10 opacity-60' : 'border-white/15'
                  }`}
                >
                  {/* The vote is the control, so it is the thing you can hit
                      with a thumb without reading anything first. */}
                  <button
                    onClick={() => void act(() => voteAsk(a.id))}
                    disabled={!open}
                    aria-pressed={a.voted}
                    aria-label={`Vote for "${a.body}"`}
                    className={`shrink-0 w-11 py-1 rounded-lg border text-center disabled:opacity-50 ${
                      a.voted
                        ? 'border-accent bg-accent/15 text-white'
                        : 'border-white/15 text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <ChevronUp className="w-4 h-4 mx-auto" aria-hidden="true" />
                    <span className="block text-xs tabular-nums">{a.votes}</span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-200 break-words">{a.body}</p>
                    <p className="text-xs text-slate-500">
                      {a.who ?? 'anonymous'}
                      {/* Said where a name appears on something that was asked
                          without one, so nobody is caught out by an admin's
                          view looking like everybody's. */}
                      {a.anonymous && a.who && ' — asked anonymously'}
                      {a.mine && ' · yours'}
                      {a.answered && ' · answered'}
                    </p>
                  </div>

                  {hosting && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => void act(() => markAsk(a.id, !a.answered, null))}
                        aria-label={a.answered ? 'Mark as still to answer' : 'Mark as answered'}
                        className="px-2 h-8 rounded-lg bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15"
                      >
                        <Check className="w-4 h-4" aria-hidden="true" />
                      </button>
                      {/* Off the wall, not deleted. Nothing here erases what
                          somebody said on another person's say-so. */}
                      <button
                        onClick={() => void act(() => markAsk(a.id, null, true))}
                        aria-label="Take off the wall"
                        className="px-2 h-8 rounded-lg bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15"
                      >
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
