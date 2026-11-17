// The suggestion boxes page: leave a suggestion in somebody's box, with your
// name or without; read the "You said, we did" board; follow your own; and --
// for a box's readers -- the inbox, and for an administrator, the boxes.
import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Avatar from '@/Avatar';
import Waiting from '@/Waiting';
import PersonSearch from '@/PersonSearch';
import type { Entrant } from '@/contests';
import {
  deleteBox,
  deleteSuggestion,
  followUp,
  keyLink,
  markSuggestion,
  readInbox,
  readMine,
  readPage,
  readSetup,
  reply,
  saveBox,
  setReply,
  submit,
  takeKeyFromAddress,
  when,
  type InboxBox,
  type InboxItem,
  type Message,
  type Mine,
  type Page,
  type SetupBox,
} from '@/suggestions';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';
const PRIMARY =
  'inline-flex items-center justify-center px-4 h-9 rounded-lg text-sm font-semibold ' +
  'bg-accent text-slate-950 hover:brightness-110 disabled:opacity-50';
const CARD = 'rounded-xl border border-white/15 bg-white/5 p-4';
const LABEL = 'block text-xs font-semibold text-slate-400 mb-1';
const H2 = 'text-sm font-semibold text-slate-200';

export default function SuggestionsView() {
  const [page, setPage] = useState<Page | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);
  const [inbox, setInbox] = useState<InboxBox[] | null>(null);
  const load = useCallback(async () => {
    const got = await readPage();
    setPage(got);
    if (!got.ok) return;
    const m = await readMine();
    setMine(m.ok ? m.suggestions : []);
    if (got.reads) {
      const i = await readInbox();
      setInbox(i.ok ? i.boxes : []);
    }
  }, []);
  useEffect(() => {
    takeKeyFromAddress();
    void load();
  }, [load]);

  if (!page) return <Waiting what="the suggestion boxes" onRetry={() => void load()} />;
  if (!page.ok) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold text-slate-200">Suggestion box</h1>
        <p className="text-sm text-slate-400 mt-3">
          {page.reason === 'not signed in' ? 'Sign in to leave a suggestion.' : 'This did not load.'}
        </p>
      </div>
    );
  }

  const board = page.board ?? [];
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-200">Suggestion box</h1>
        <p className="text-sm text-slate-400">
          Like the boxes outside the offices: pick whose box, say what you think, and put your name to it or don’t.
        </p>
      </div>

      {(page.boxes ?? []).length === 0 ? (
        <p className={`${CARD} text-sm text-slate-300`}>There are no suggestion boxes up yet.</p>
      ) : (
        <SendForm page={page} onSent={load} />
      )}

      {inbox && inbox.length > 0 && <Inbox boxes={inbox} onChange={load} />}

      <section aria-label="You said, we did">
        <h2 className={H2}>You said, we did</h2>
        {board.length === 0 ? (
          <p className="text-sm text-slate-400 mt-2">Nothing here yet. Answers given for everybody to see go here.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {board.map((b) => (
              <li key={b.id} className={CARD}>
                <p className="text-xs text-slate-400">To {b.box} · {when(b.sent_at)}</p>
                <p className="text-sm text-slate-200 mt-1 whitespace-pre-line break-words">“{b.body}”</p>
                {b.replies.map((r, n) => (
                  <div key={n} className="mt-3 border-l-2 border-accent/60 pl-3">
                    <p className="text-xs font-semibold text-accent">{r.by ?? 'The reader'} · {when(r.at)}</p>
                    <p className="text-sm text-slate-200 whitespace-pre-line break-words">{r.body}</p>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {mine.length > 0 && <MineList mine={mine} onChange={load} />}

      {page.can_set_up && <Setup onChange={load} />}
    </div>
  );
}

function SendForm({ page, onSent }: { page: Page; onSent: () => Promise<void> }) {
  const boxes = page.boxes ?? [];
  const [box, setBox] = useState(boxes.length === 1 ? boxes[0].id : '');
  const [body, setBody] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<{ key: string | null } | null>(null);

  if (sent) {
    return (
      <section className={CARD} aria-label="Sent" role="status">
        <p className="text-sm font-semibold text-emerald-300">Thank you. It’s in the box.</p>
        {sent.key ? (
          <>
            <p className="text-sm text-slate-300 mt-2">
              It went in without your name, and nothing stored with it leads back to you. This browser will remember
              it so you can see any answer below. To check from anywhere else, keep this private link: anybody who
              has it can read the answers and write back.
            </p>
            <div className="mt-2 flex gap-2">
              <input className={`${FIELD} font-mono text-xs`} readOnly value={keyLink(sent.key)} aria-label="Your private link"
                     onFocus={(e) => e.target.select()} />
              <button type="button" className={BUTTON}
                      onClick={() => void navigator.clipboard?.writeText(keyLink(sent.key!))}>
                Copy
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-300 mt-2">You’ll get an email when somebody answers.</p>
        )}
        <button type="button" className={`${BUTTON} mt-3`} onClick={() => setSent(null)}>Leave another</button>
      </section>
    );
  }

  return (
    <form
      className={`${CARD} space-y-4`}
      aria-label="Leave a suggestion"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!box) return setProblem('Pick whose box.');
        setBusy(true);
        const res = await submit(box, body, anonymous);
        setBusy(false);
        if (!res.ok) return setProblem(res.reason ?? 'That did not go in');
        setProblem(null);
        setBody('');
        setSent({ key: res.key ?? null });
        await onSent();
      }}
    >
      <fieldset>
        <legend className={LABEL}>Whose box?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {boxes.map((b) => (
            <label key={b.id}
                   className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                     box === b.id ? 'border-accent bg-accent/10' : 'border-white/15 hover:bg-white/5'
                   }`}>
              <input type="radio" name="box" className="mt-1" checked={box === b.id} onChange={() => setBox(b.id)} />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  {b.readers.slice(0, 3).map((r) => (
                    <Avatar key={r.user} avatar={r.avatar} name={r.name} seed={r.user} size="sm" />
                  ))}
                  <span className="text-sm font-semibold text-slate-200">{b.name}</span>
                </span>
                <span className="block text-xs text-slate-400 mt-1">
                  Read by {b.readers.map((r) => r.name).join(', ')}{b.blurb ? `. ${b.blurb}` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className={LABEL}>Your suggestion</span>
        <textarea className={FIELD} rows={5} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-200">
        <input type="checkbox" className="mt-1" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span>
          Leave my name off
          <span className="block text-xs text-slate-400">
            Nothing stored with it will lead back to you, not even for the site’s administrators. You can still see
            answers here, and write back.
          </span>
        </span>
      </label>
      <p className="text-xs text-slate-400">
        Answers come to you, or go on the “You said, we did” board below for everybody, with your suggestion and
        never your name.
      </p>
      {problem && <p className="text-sm text-rose-300">{problem}</p>}
      <button type="submit" className={PRIMARY} disabled={busy || !box || body.trim().length < 10}>Put it in the box</button>
    </form>
  );
}

function Thread({ thread, me }: { thread: Message[]; me: 'reader' | 'sender' }) {
  if (thread.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2">
      {thread.map((m) => (
        <li key={m.id} className={`border-l-2 pl-3 ${m.author === 'reader' ? 'border-accent/60' : 'border-white/20'}`}>
          <p className="text-xs font-semibold text-slate-400">
            {m.author === 'reader' ? (m.by ?? 'The reader') : me === 'sender' ? 'You' : 'The sender'} · {when(m.at)}
            {m.public && <span className="text-accent"> · on the board</span>}
          </p>
          <p className="text-sm text-slate-200 whitespace-pre-line break-words">{m.body}</p>
        </li>
      ))}
    </ul>
  );
}

function MineList({ mine, onChange }: { mine: Mine[]; onChange: () => Promise<void> }) {
  return (
    <section aria-label="Your suggestions">
      <h2 className={H2}>Your suggestions</h2>
      <ul className="mt-2 space-y-3">
        {mine.map((m) => <MineItem key={m.id} m={m} onChange={onChange} />)}
      </ul>
    </section>
  );
}

function MineItem({ m, onChange }: { m: Mine; onChange: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const answered = m.thread.some((t) => t.author === 'reader');
  return (
    <li className={CARD} aria-label={`Your suggestion to ${m.box}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-slate-400">To {m.box} · {when(m.at)}{m.anonymous ? ' · without your name' : ''}</p>
        <p className={`text-xs font-semibold ${answered ? 'text-emerald-300' : 'text-slate-400'}`}>
          {answered ? 'Answered' : m.read ? 'Read' : 'Not read yet'}
        </p>
      </div>
      <p className="text-sm text-slate-200 mt-1 whitespace-pre-line break-words">{m.body}</p>
      <Thread thread={m.thread} me="sender" />
      <form className="mt-3 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const res = await followUp(m.id, m.key, text);
              setBusy(false);
              if (!res.ok) return window.alert(res.reason ?? 'That did not go in');
              setText('');
              await onChange();
            }}>
        <input className={FIELD} value={text} maxLength={4000} placeholder="Write back" aria-label="Write back"
               onChange={(e) => setText(e.target.value)} />
        <button type="submit" className={BUTTON} disabled={busy || !text.trim()}>Send</button>
      </form>
      {m.anonymous && m.key && (
        <details className="mt-2">
          <summary className="text-xs text-accent cursor-pointer">Your private link</summary>
          <input className={`${FIELD} font-mono text-xs mt-1`} readOnly value={keyLink(m.key)} aria-label="Your private link"
                 onFocus={(e) => e.target.select()} />
        </details>
      )}
    </li>
  );
}

// --- the readers' inbox -----------------------------------------------------------

function Inbox({ boxes, onChange }: { boxes: InboxBox[]; onChange: () => Promise<void> }) {
  const [showFiled, setShowFiled] = useState(false);
  return (
    <section className="space-y-4" aria-label="Your box">
      {boxes.map((b) => {
        const live = b.suggestions.filter((s) => !s.archived);
        const filed = b.suggestions.filter((s) => s.archived);
        const unread = live.filter((s) => !s.read).length;
        return (
          <div key={b.id}>
            <h2 className={H2}>
              {b.name} {unread > 0 && <span className="text-accent">({unread} new)</span>}
            </h2>
            {live.length === 0 ? (
              <p className="text-sm text-slate-400 mt-2">Nothing waiting.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {live.map((s) => <InboxCard key={s.id} s={s} onChange={onChange} />)}
              </ul>
            )}
            {filed.length > 0 && (
              <div className="mt-2">
                <button type="button" className="text-xs text-accent hover:underline" onClick={() => setShowFiled((x) => !x)}>
                  {showFiled ? 'Hide' : 'Show'} filed away ({filed.length})
                </button>
                {showFiled && (
                  <ul className="mt-2 space-y-3">
                    {filed.map((s) => <InboxCard key={s.id} s={s} onChange={onChange} />)}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function InboxCard({ s, onChange }: { s: InboxItem; onChange: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [toAll, setToAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = async (p: Promise<{ ok: boolean; reason?: string }>) => {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (!res.ok) window.alert(res.reason ?? 'That did not work');
    await onChange();
  };
  return (
    <li className={`${CARD} ${s.read ? '' : 'border-accent/50'}`} aria-label={`Suggestion from ${s.from ?? 'somebody anonymous'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-slate-400">
          {!s.read && <span className="font-semibold text-accent">New · </span>}
          {s.from ?? 'Anonymous'} · {when(s.at)}
        </p>
        <span className="flex gap-3 text-xs">
          <button type="button" className="text-accent hover:underline" disabled={busy}
                  onClick={() => void act(markSuggestion(s.id, !s.read))}>
            Mark {s.read ? 'unread' : 'read'}
          </button>
          <button type="button" className="text-accent hover:underline" disabled={busy}
                  onClick={() => void act(markSuggestion(s.id, true, !s.archived))}>
            {s.archived ? 'Put back' : 'File away'}
          </button>
          <button type="button" className="text-rose-300 hover:underline" disabled={busy}
                  onClick={() => window.confirm('Delete this suggestion and its answers? This cannot be undone.') &&
                                 void act(deleteSuggestion(s.id))}>
            Delete
          </button>
        </span>
      </div>
      <p className="text-sm text-slate-200 mt-1 whitespace-pre-line break-words">{s.body}</p>
      <Thread thread={s.thread} me="reader" />
      {s.thread.filter((m) => m.author === 'reader').length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {s.thread.filter((m) => m.author === 'reader').map((m, n) => (
            <li key={m.id} className="flex gap-3">
              <span className="text-slate-500">Answer {n + 1}:</span>
              <button type="button" className="text-accent hover:underline" disabled={busy}
                      onClick={() => void act(setReply(m.id, !m.public))}>
                {m.public ? 'Take off the board' : 'Put on the board'}
              </button>
              <button type="button" className="text-rose-300 hover:underline" disabled={busy}
                      onClick={() => window.confirm('Delete this answer?') && void act(setReply(m.id, null, true))}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(reply(s.id, text, toAll)).then(() => setText(''));
            }}>
        <label className="block">
          <span className={LABEL}>Answer</span>
          <textarea className={FIELD} rows={2} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-200">
          <legend className="sr-only">Who sees the answer</legend>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name={`to-${s.id}`} checked={!toAll} onChange={() => setToAll(false)} />
            Just to {s.anonymous ? 'the sender' : s.from}
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name={`to-${s.id}`} checked={toAll} onChange={() => setToAll(true)} />
            On the board, for everybody (no name)
          </label>
        </fieldset>
        <button type="submit" className={PRIMARY} disabled={busy || !text.trim()}>Send the answer</button>
      </form>
    </li>
  );
}

// --- setting the boxes up -----------------------------------------------------------

type Draft = { id: string | null; name: string; blurb: string; readers: { user: string; name: string }[]; active: boolean; position: number };

function Setup({ onChange }: { onChange: () => Promise<void> }) {
  const [boxes, setBoxes] = useState<SetupBox[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const load = useCallback(async () => {
    const got = await readSetup();
    setBoxes(got.ok ? got.boxes : []);
  }, []);
  useEffect(() => void load(), [load]);
  if (!boxes) return null;
  return (
    <section className="space-y-3" aria-label="Setting up the boxes">
      <div className="flex items-center justify-between gap-3">
        <h2 className={H2}>Setting up the boxes</h2>
        {!draft && (
          <button type="button" className={BUTTON}
                  onClick={() => setDraft({ id: null, name: '', blurb: '', readers: [], active: true, position: boxes.length })}>
            New box
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400">You see how many are in each box, never what they say: that is for its readers.</p>
      {draft && (
        <BoxEditor start={draft} onDone={async (saved) => {
          setDraft(null);
          if (saved) {
            await load();
            await onChange();
          }
        }} />
      )}
      <ul className="space-y-2">
        {boxes.map((b) => (
          <li key={b.id} className="rounded-xl border border-white/15 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-200">
                {b.name}{!b.active && <span className="text-xs text-slate-500"> (switched off)</span>}
              </span>
              <span className="block text-xs text-slate-400">
                Read by {b.readers.map((r) => r.name).join(', ')} · {b.count} {b.count === 1 ? 'suggestion' : 'suggestions'}
              </span>
            </span>
            <span className="flex gap-2">
              <button type="button" className={BUTTON}
                      onClick={() => setDraft({ id: b.id, name: b.name, blurb: b.blurb ?? '', readers: b.readers, active: b.active, position: b.position })}>
                Change
              </button>
              <button type="button" className={BUTTON}
                      onClick={async () => {
                        if (!window.confirm(`Delete ${b.name}?`)) return;
                        const res = await deleteBox(b.id);
                        if (!res.ok) window.alert(res.reason ?? 'That did not work');
                        await load();
                        await onChange();
                      }}>
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BoxEditor({ start, onDone }: { start: Draft; onDone: (saved: boolean) => void }) {
  const [d, setD] = useState(start);
  const [adding, setAdding] = useState<Entrant | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className={`${CARD} space-y-3`}
      aria-label={d.id ? 'Change the box' : 'New box'}
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await saveBox({ ...d, readers: d.readers.map((r) => r.user) });
        if (!res.ok) return setProblem(res.reason ?? 'That did not save');
        onDone(true);
      }}
    >
      <label className="block">
        <span className={LABEL}>Name</span>
        <input className={FIELD} value={d.name} maxLength={80} placeholder="The CEO’s box"
               onChange={(e) => setD({ ...d, name: e.target.value })} />
      </label>
      <label className="block">
        <span className={LABEL}>A line about it (optional)</span>
        <input className={FIELD} value={d.blurb} maxLength={500} onChange={(e) => setD({ ...d, blurb: e.target.value })} />
      </label>
      <div>
        <span className={LABEL}>Who reads it</span>
        {d.readers.length > 0 && (
          <ul className="flex flex-wrap gap-2 mb-2">
            {d.readers.map((r) => (
              <li key={r.user} className="inline-flex items-center gap-1 rounded-full bg-white/10 pl-3 pr-1 py-0.5 text-sm text-slate-200">
                {r.name}
                <button type="button" aria-label={`Take ${r.name} off`} className="w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-white/10"
                        onClick={() => setD({ ...d, readers: d.readers.filter((x) => x.user !== r.user) })}>
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <PersonSearch chosen={adding} label="Add a reader" listLabel="People" chosenWord="Adding"
                      onChoose={(who) => {
                        if (who && !d.readers.some((r) => r.user === who.user)) {
                          setD({ ...d, readers: [...d.readers, { user: who.user, name: who.name ?? who.email }] });
                        }
                        setAdding(null);
                      }} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />
        Open for suggestions
      </label>
      {problem && <p className="text-sm text-rose-300">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY}>{d.id ? 'Save' : 'Put the box up'}</button>
        <button type="button" className={BUTTON} onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  );
}
