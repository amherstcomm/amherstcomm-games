// A live session, from both sides of the room.
//
// One component for two addresses, because they are the same screen with
// different permissions — and keeping them together is what stops the two
// drifting into disagreeing about what is on screen. What differs is bounded
// and explicit: the presenter gets controls and a count, everybody gets the
// question.
//
// The answer is never in this file's hands until the server sends it. There is
// no "hide it in the UI" branch here because there is nothing to hide: an
// unrevealed item comes back with `answer` null, and that is enforced two
// layers down in a table with no grant.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Radio, Send } from 'lucide-react';
import {
  advance,
  onSessionMoved,
  readCurrentItem,
  readPresenterView,
  readTally,
  sendAnswer,
  type LiveItem,
  type PresenterView,
} from '@/live';

/** How often the presenter's count refreshes while answers are arriving.
 *
 *  A poll rather than a subscription, and only on the presenter's screen. The
 *  doorbell fires when the *session* moves, which is the presenter's own
 *  clicks; answers landing do not move it, and making them would put one row
 *  through the WAL per participant per question — the room's traffic in the
 *  replication stream, to animate a number on one screen. */
const COUNT_MS = 2000;

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
      <Radio className="w-6 h-6 animate-pulse" aria-hidden="true" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

/** One or more of these is correct. Also serves `survey`, which is the same
 *  control with nothing to be right about — the difference is whether an
 *  answer ever arrives, and that is the server's business rather than this
 *  component's. */
function Choice({
  item,
  onSend,
  sending,
}: {
  item: LiveItem;
  onSend: (value: unknown) => void;
  sending: boolean;
}) {
  const options = Array.isArray(item.payload?.options) ? (item.payload.options as string[]) : [];
  const multi = item.payload?.multi === true;
  const revealed = item.state === 'revealed';
  const correct = new Set(
    revealed && item.answer && Array.isArray((item.answer as { correct?: string[] }).correct)
      ? (item.answer as { correct: string[] }).correct
      : []
  );
  const mine = new Set(Array.isArray(item.mine) ? (item.mine as string[]) : item.mine ? [item.mine as string] : []);
  const [picked, setPicked] = useState<string[]>([...mine] as string[]);

  // A reload mid-question should show what you already sent, and the server
  // hands it back with the item for exactly that reason.
  useEffect(() => {
    setPicked([...mine] as string[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const locked = item.state !== 'open';

  function toggle(option: string) {
    if (locked) return;
    const next = multi
      ? picked.includes(option)
        ? picked.filter((p) => p !== option)
        : [...picked, option]
      : [option];
    setPicked(next);
    // Single choice sends immediately: the tiebreak is speed, and making
    // somebody press a second button after they have decided is charging them
    // for the interface.
    if (!multi) onSend(next[0]);
  }

  return (
    <div className="space-y-2">
      {options.map((option) => {
        const chosen = picked.includes(option);
        const right = revealed && correct.has(option);
        const wrongPick = revealed && chosen && !correct.has(option);
        return (
          <button
            key={option}
            onClick={() => toggle(option)}
            disabled={locked || sending}
            aria-pressed={chosen}
            className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors
              ${right ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200' : ''}
              ${wrongPick ? 'border-rose-400 bg-rose-400/15 text-rose-200' : ''}
              ${!revealed && chosen ? 'border-accent bg-white/10 text-white' : ''}
              ${!revealed && !chosen ? 'border-white/15 text-slate-200 hover:bg-white/5' : ''}
              ${revealed && !right && !wrongPick ? 'border-white/10 text-slate-400' : ''}
              ${locked && !revealed ? 'opacity-70' : ''}`}
          >
            <span className="flex items-center justify-between gap-3">
              {option}
              {right && <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />}
            </span>
          </button>
        );
      })}
      {multi && !locked && (
        <button
          onClick={() => onSend(picked)}
          disabled={sending || picked.length === 0}
          className="w-full h-11 rounded-xl bg-emerald-400 text-ink font-semibold disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send answer'}
        </button>
      )}
    </div>
  );
}

/** Ask anything. Anonymous is offered here and nowhere else, and the label
 *  says what it actually means — the room and the presenter see no name, an
 *  admin can still see who asked. Saying "anonymous" unqualified would be a
 *  bigger promise than the database keeps. */
function Ask({ onSend, sending }: { onSend: (value: unknown, anon: boolean) => void; sending: boolean }) {
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 500))}
        rows={3}
        placeholder="What would you like to ask?"
        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-accent"
      />
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
        Don&apos;t show my name to the room
      </label>
      <button
        onClick={() => {
          onSend(text.trim(), anon);
          setText('');
        }}
        disabled={sending || text.trim().length === 0}
        className="w-full h-11 rounded-xl bg-emerald-400 text-ink font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        <Send className="w-4 h-4" aria-hidden="true" />
        {sending ? 'Sending…' : 'Send'}
      </button>
    </div>
  );
}

export default function LiveSession({ session, host }: { session: string; host: boolean }) {
  const [item, setItem] = useState<LiveItem>({ state: 'not-live' });
  const [view, setView] = useState<PresenterView | null>(null);
  const [tally, setTally] = useState<Record<string, number> | null>(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const itemId = useRef<string | undefined>(undefined);

  const pull = useCallback(async () => {
    const next = await readCurrentItem(session);
    setItem(next);
    if (next.id !== itemId.current) {
      itemId.current = next.id;
      setTally(null);
      setNote('');
    }
    if (next.state === 'revealed' && next.id) {
      const t = await readTally(next.id);
      if (t.ok) setTally(t.counts ?? {});
    }
  }, [session]);

  useEffect(() => {
    void pull();
    return onSessionMoved(session, () => void pull());
  }, [session, pull]);

  // The presenter's count, which the doorbell cannot provide — see COUNT_MS.
  useEffect(() => {
    if (!host || !item.id) return;
    let alive = true;
    const tick = async () => {
      const v = await readPresenterView(item.id!);
      if (alive) setView(v);
    };
    void tick();
    const id = window.setInterval(tick, COUNT_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [host, item.id, item.state]);

  async function send(value: unknown, anon = false) {
    if (!item.id) return;
    setSending(true);
    const res = await sendAnswer(item.id, value, anon);
    setSending(false);
    // Say when it did not land. A tick over a rejected answer is the failure
    // this whole flow exists to avoid — somebody who was told "sent" and
    // scored nothing has been lied to.
    setNote(res.ok ? 'Sent' : (res.reason ?? 'That did not send'));
    if (res.ok) void pull();
  }

  async function control(action: 'start' | 'show' | 'lock' | 'reveal' | 'close') {
    const res = await advance(session, action);
    if (!res.ok) setNote(res.reason ?? 'That did not work');
    void pull();
  }

  const kind = item.kind ?? '';
  const answering = item.state === 'open';

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {host && (
        <div className="mb-6 rounded-xl border border-accent/40 bg-accent/5 p-3">
          <p className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">
            Presenting
          </p>
          <div className="flex flex-wrap gap-2">
            {(['start', 'show', 'lock', 'reveal', 'close'] as const).map((a) => (
              <button
                key={a}
                onClick={() => void control(a)}
                // slate-200, not slate-100: the palette defines 950 down to 200, and a
                // tier it does not define falls through to Tailwind's own — which is
                // near-white, and invisible on the light theme's page. Caught by
                // looking at it; now also covered by the a11y sweep below.
                className="px-3 h-9 rounded-lg text-sm font-semibold bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15"
              >
                {a === 'show' ? 'Next question' : a[0].toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
          {view?.ok && (
            <p className="mt-3 text-sm text-slate-300">
              {view.answered ?? 0} answered
              {item.state === 'open' ? ' so far' : ''}
            </p>
          )}
        </div>
      )}

      {item.state === 'not-live' && <Waiting text="This session has not started yet." />}
      {item.state === 'waiting' && <Waiting text="Waiting for the next question…" />}

      {item.id && (
        <>
          <h1 className="text-xl sm:text-2xl font-bold mb-1 text-white">{item.prompt}</h1>
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-5">
            {item.state === 'open'
              ? 'Answers open'
              : item.state === 'locked'
                ? 'Answers closed'
                : 'Revealed'}
          </p>

          {(kind === 'choice' || kind === 'survey') && (
            <Choice item={item} onSend={(v) => void send(v)} sending={sending} />
          )}
          {kind === 'open' && answering && (
            <Ask onSend={(v, anon) => void send(v, anon)} sending={sending} />
          )}
          {kind === 'open' && !answering && (
            <p className="text-sm text-slate-400">Questions are closed for this one.</p>
          )}

          {/* A kind the server knows about and this build does not. Says so
              rather than rendering an empty box: item_kinds is a table so a
              kind can be added ahead of the component that draws it. */}
          {!['choice', 'survey', 'open'].includes(kind) && (
            <p className="text-sm text-slate-400">
              This kind of question ({kind}) is not supported by this version of the site
              yet.
            </p>
          )}

          {tally && Object.keys(tally).length > 0 && (
            <div className="mt-6 space-y-1.5">
              <p className="text-xs uppercase tracking-wider text-slate-500">What the room said</p>
              {Object.entries(tally).map(([value, count]) => (
                <p key={value} className="text-sm text-slate-300 flex justify-between gap-4">
                  <span>{value.replace(/^"|"$/g, '')}</span>
                  <span className="tabular-nums text-slate-400">{count}</span>
                </p>
              ))}
            </div>
          )}

          {host && view?.ok && kind === 'open' && (
            <div className="mt-6 space-y-2">
              <p className="text-xs uppercase tracking-wider text-slate-500">Asked so far</p>
              {(view.responses ?? []).map((r, i) => (
                <p key={i} className="text-sm text-slate-300">
                  {String(r.value).replace(/^"|"$/g, '')}
                  <span className="text-slate-500"> — {r.who ?? 'anonymous'}</span>
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {note && (
        <p
          className={`mt-4 text-sm ${note === 'Sent' ? 'text-emerald-300' : 'text-danger'}`}
          role="status"
        >
          {note === 'Sent' ? (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Sent
            </span>
          ) : (
            note
          )}
        </p>
      )}

      {sending && (
        <Loader2 className="w-4 h-4 animate-spin text-slate-500 mt-2" aria-hidden="true" />
      )}
    </div>
  );
}
