// Building a session, without writing SQL.
//
// This is the screen that decides whether an event can be run by whoever is
// running it, rather than by whoever last had a psql prompt open. Everything
// here was previously an INSERT statement.
//
// Two shapes, one component: with no session id it is the list, with one it is
// that session's questions. Same file because the list's only job is to get you
// into the editor, and splitting them would mean two places that have to agree
// about what a session looks like.
import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Radio, Trash2 } from 'lucide-react';
import {
  AUTHORABLE,
  createSession,
  deleteItem,
  deleteSession,
  moveItem,
  parseOptions,
  problemWith,
  secondsOf,
  SECONDS_MAX,
  SECONDS_MIN,
  readSessions,
  readSheet,
  saveItem,
  type ChoiceAnswer,
  type ChoicePayload,
  type Sheet,
  type SheetItem,
  type SessionSummary,
} from '@/authoring';
import { JOIN_HOST, pathOf } from '@/routes';

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-accent';
const BUTTON =
  'px-3 h-9 rounded-lg text-sm font-semibold bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';
const PRIMARY =
  'px-4 h-10 rounded-lg text-sm font-semibold bg-emerald-400 text-ink hover:opacity-90 disabled:opacity-50';

function Note({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="text-sm text-danger mt-2" role="status">
      {text}
    </p>
  );
}

/** The form for one question, used for both adding and editing. Held open on
 *  its own state rather than writing on every keystroke: a half-typed question
 *  saved into a live session is a half-typed question on the projector. */
function ItemForm({
  kinds,
  item,
  onSave,
  onCancel,
  busy,
}: {
  kinds: string[];
  item?: SheetItem;
  onSave: (args: {
    kind: string;
    prompt: string;
    payload: ChoicePayload | Record<string, unknown>;
    answer: ChoiceAnswer | null;
  }) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const existing = item?.payload as ChoicePayload | undefined;
  const [kind, setKind] = useState(item?.kind ?? kinds[0] ?? 'choice');
  const [prompt, setPrompt] = useState(item?.prompt ?? '');
  const [optionText, setOptionText] = useState((existing?.options ?? []).join('\n'));
  const [multi, setMulti] = useState(existing?.multi === true);
  const [seconds, setSeconds] = useState<string>(
    secondsOf(item?.payload)?.toString() ?? ''
  );
  const [correct, setCorrect] = useState<string[]>(
    ((item?.answer as ChoiceAnswer | null)?.correct ?? []) as string[]
  );

  const options = parseOptions(optionText);
  // Only options that still exist can be correct — deleting an option's line
  // should not leave it marked as the right answer nobody can pick.
  const live = correct.filter((c) => options.includes(c));
  const problem = problemWith({ kind, prompt, options, correct: live });
  const clock = seconds === '' ? null : secondsOf({ seconds: Number(seconds) });
  // Typed something that is not a usable clock — distinct from having left it
  // empty, which is a valid choice and the default.
  const badClock = seconds !== '' && clock === null;

  return (
    <div className="rounded-xl border border-white/15 p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`px-3 h-8 rounded-lg text-xs font-semibold border ${
              kind === k
                ? 'border-accent bg-accent/15 text-white'
                : 'border-white/15 text-slate-300 hover:bg-white/5'
            }`}
          >
            {k === 'choice' ? 'Multiple choice' : k === 'survey' ? 'Survey' : 'Open question'}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">Question</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
          rows={2}
          className={FIELD}
          placeholder="What are you asking the room?"
        />
      </label>

      {kind !== 'open' && (
        <>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-slate-500">
              Options, one per line
            </span>
            <textarea
              value={optionText}
              onChange={(e) => setOptionText(e.target.value)}
              rows={4}
              className={FIELD}
              // No example options. A placeholder listing 2019 / 2021 / 2023 in
              // a box whose whole job is to hold options reads as content
              // somebody already typed — on the light theme especially, where
              // the placeholder tier is dark — and the first thing it does is
              // refuse to save with "give it at least two options". The label
              // above already says the format.
              placeholder="One per line"
            />
          </label>

          {kind === 'choice' && (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={multi}
                  onChange={(e) => setMulti(e.target.checked)}
                />
                More than one may be picked
              </label>
              <fieldset>
                <legend className="text-xs uppercase tracking-wider text-slate-500">
                  Correct
                </legend>
                <div className="space-y-1 mt-1">
                  {options.map((option) => (
                    <label key={option} className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={live.includes(option)}
                        onChange={(e) =>
                          setCorrect(
                            e.target.checked
                              ? [...live, option]
                              : live.filter((c) => c !== option)
                          )
                        }
                      />
                      {option}
                    </label>
                  ))}
                  {options.length === 0 && (
                    <p className="text-sm text-slate-500">Add some options first.</p>
                  )}
                </div>
              </fieldset>
            </>
          )}
        </>
      )}

      {/* The clock is optional and off by default. A countdown is right for a
          scored round and wrong for "any questions for the board?", and the
          same controls have to run both. */}
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">
          Seconds to answer — leave empty for no clock
        </span>
        <input
          value={seconds}
          onChange={(e) => setSeconds(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          inputMode="numeric"
          placeholder="none"
          className={FIELD + ' max-w-32'}
        />
      </label>
      {seconds !== '' && secondsOf({ seconds: Number(seconds) }) === null && (
        <p className="text-sm text-slate-400">
          Between {SECONDS_MIN} and {SECONDS_MAX} seconds, or empty for no clock.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          className={PRIMARY}
          disabled={busy || problem !== null || badClock}
          onClick={() =>
            onSave({
              kind,
              prompt: prompt.trim(),
              payload: {
                ...(kind === 'open' ? {} : { options, multi: kind === 'choice' && multi }),
                // Omitted rather than sent as null: item_seconds() reads the key
                // being absent as "no clock", and a key holding null would be
                // the same thing said in a way that has to be handled.
                ...(clock === null ? {} : { seconds: clock }),
              },
              // survey and open are unscored; the server drops an answer sent
              // for them, and sending one anyway would be asking it to.
              answer: kind === 'choice' ? { correct: live } : null,
            })
          }
        >
          {item ? 'Save changes' : 'Add question'}
        </button>
        {onCancel && (
          <button className={BUTTON} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        {problem && <span className="text-sm text-slate-400">{problem}</span>}
      </div>
    </div>
  );
}

function SessionList() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [title, setTitle] = useState('');
  const [lateJoin, setLateJoin] = useState<'strict' | 'open'>('strict');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const pull = useCallback(async () => setSessions(await readSessions()), []);
  useEffect(() => void pull(), [pull]);

  async function add() {
    setBusy(true);
    const res = await createSession(title.trim(), lateJoin);
    setBusy(false);
    if (!res.ok) {
      setNote(res.reason ?? 'That did not work');
      return;
    }
    setTitle('');
    // Straight into the new session: the reason for making one is to put
    // questions in it.
    window.location.assign(pathOf({ kind: 'sessions', session: res.id! }));
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Sessions</h1>
      <p className="text-sm text-slate-400 mb-6">
        A session is one run of questions — a round of trivia, a survey, a set of
        questions for a speaker.
      </p>

      <div className="rounded-xl border border-white/15 p-4 space-y-3 mb-8">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-slate-500">New session</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            className={FIELD}
            placeholder="Employee Ownership Month, week one"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={lateJoin === 'open'}
            onChange={(e) => setLateJoin(e.target.checked ? 'open' : 'strict')}
          />
          Let people who arrive late catch up on questions they missed
        </label>
        {/* Said here rather than discovered on the night. The column is stored
            and nothing reads it yet — see the note on sessions.late_join. */}
        {lateJoin === 'open' && (
          <p className="text-xs text-slate-500">
            Not in effect yet: answering is limited to the question on screen, so
            late arrivals miss what has gone either way.
          </p>
        )}
        <button className={PRIMARY} onClick={() => void add()} disabled={busy || !title.trim()}>
          <span className="inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" aria-hidden="true" /> Create
          </span>
        </button>
        <Note text={note} />
      </div>

      {sessions === null && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
      {sessions?.length === 0 && (
        <p className="text-sm text-slate-400">Nothing here yet.</p>
      )}
      <ul className="space-y-2">
        {(sessions ?? []).map((s) => (
          <li key={s.id}>
            <a
              href={pathOf({ kind: 'sessions', session: s.id })}
              className="block rounded-xl border border-white/15 px-4 py-3 hover:bg-white/5"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-white font-medium">{s.title}</span>
                <span className="text-xs uppercase tracking-wider text-slate-500">{s.state}</span>
              </span>
              <span className="text-sm text-slate-400">
                {s.items} {s.items === 1 ? 'question' : 'questions'}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionEditorFor({ session }: { session: string }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const pull = useCallback(async () => setSheet(await readSheet(session)), [session]);
  useEffect(() => void pull(), [pull]);

  async function run(action: () => Promise<{ ok: boolean; reason?: string }>) {
    setBusy(true);
    const res = await action();
    setBusy(false);
    setNote(res.ok ? '' : (res.reason ?? 'That did not work'));
    if (res.ok) {
      setEditing(null);
      setAdding(false);
      await pull();
    }
  }

  if (sheet === null) return <Loader2 className="w-4 h-4 animate-spin text-slate-500 m-8" />;
  if (!sheet.ok || !sheet.session) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-slate-400">{sheet.reason ?? 'That session is not available.'}</p>
      </div>
    );
  }

  const { session: meta, items = [], kinds = [] } = sheet;
  // What the server knows about, narrowed to what this build can draw — see
  // AUTHORABLE. The rest are real kinds that LiveSession has not learned yet,
  // and offering them would let somebody build a round that fails on screen.
  // Ordered by AUTHORABLE rather than by what the server sends, which is
  // alphabetical: choice and survey are the same control with and without a
  // right answer, and putting `open` between them made them look unrelated.
  const known = new Set(kinds.map((k) => k.kind));
  const offer = AUTHORABLE.filter((k) => known.has(k));
  const missing = kinds.length - offer.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        <a href={pathOf({ kind: 'sessions' })} className="hover:text-accent">
          Sessions
        </a>
      </p>
      <h1 className="text-2xl font-bold text-white mt-1">{meta.title}</h1>
      <p className="text-sm text-slate-400 mb-4">
        {meta.state === 'draft'
          ? 'Not started. Nobody can see it yet.'
          : meta.state === 'live'
            ? 'Running now.'
            : 'Finished.'}
      </p>

      {/* The code, at the size it needs to be read at. This is the thing that
          goes on the slide, and the whole reason a session is reachable by
          anyone who was not sent a link. */}
      {meta.code && meta.state !== 'closed' && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-4 mb-6">
          <p className="text-xs uppercase tracking-wider text-accent font-semibold">
            To join
          </p>
          <p className="text-3xl font-bold text-white tracking-[0.3em] mt-1">{meta.code}</p>
          <p className="text-sm text-slate-400 mt-2">
            Go to <span className="text-slate-300">{JOIN_HOST}/join</span> and type it,
            or open <span className="text-slate-300">{JOIN_HOST}/join/{meta.code}</span>{' '}
            directly.
          </p>
          {meta.state === 'draft' && (
            <p className="text-xs text-slate-500 mt-2">
              It will not work until you start the session from the presenter screen.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-8">
        <a
          className={BUTTON + ' inline-flex items-center gap-1.5'}
          href={pathOf({ kind: 'live', session, host: true })}
        >
          <Radio className="w-4 h-4" aria-hidden="true" /> Presenter screen
        </a>
        <a className={BUTTON} href={pathOf({ kind: 'live', session, host: false })}>
          What the room sees
        </a>
        {meta.state === 'draft' && (
          <button
            className={BUTTON}
            disabled={busy}
            onClick={() => {
              // No confirm dialog: this refuses on anything that has run, and
              // a draft nobody has seen is not a thing worth guarding.
              void run(async () => {
                const res = await deleteSession(session);
                if (res.ok) window.location.assign(pathOf({ kind: 'sessions' }));
                return res;
              });
            }}
          >
            Delete session
          </button>
        )}
      </div>

      <ol className="space-y-3">
        {items.map((item, i) => {
          const shown = item.state !== 'pending';
          return (
            <li key={item.id} className="rounded-xl border border-white/15 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    {item.position}. {item.kind}
                    {secondsOf(item.payload) !== null && ` · ${secondsOf(item.payload)}s`}
                    {shown && ` — ${item.state}, ${item.responses} answered`}
                  </p>
                  <p className="text-white">{item.prompt}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    className={BUTTON + ' px-2'}
                    aria-label="Move up"
                    disabled={busy || i === 0}
                    onClick={() => void run(() => moveItem(item.id, -1))}
                  >
                    <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    className={BUTTON + ' px-2'}
                    aria-label="Move down"
                    disabled={busy || i === items.length - 1}
                    onClick={() => void run(() => moveItem(item.id, 1))}
                  >
                    <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    className={BUTTON + ' px-2'}
                    aria-label="Delete question"
                    disabled={busy}
                    onClick={() => void run(() => deleteItem(item.id))}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* The rule the server enforces, said where somebody can act on
                  it. A question people have answered is a question whose
                  answers mean something. */}
              {shown ? (
                <p className="text-sm text-slate-400 mt-2">
                  Already shown, so it can no longer be edited — delete it and add
                  another if it was wrong.
                </p>
              ) : editing === item.id ? (
                <div className="mt-3">
                  <ItemForm
                    kinds={offer}
                    item={item}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={(args) => void run(() => saveItem({ session, item: item.id, ...args }))}
                  />
                </div>
              ) : (
                <button className={BUTTON + ' mt-3'} onClick={() => setEditing(item.id)}>
                  Edit
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {items.length === 0 && (
        <p className="text-sm text-slate-400">No questions yet.</p>
      )}

      <div className="mt-6">
        {adding ? (
          <ItemForm
            kinds={offer}
            busy={busy}
            onCancel={() => setAdding(false)}
            onSave={(args) => void run(() => saveItem({ session, ...args }))}
          />
        ) : (
          <button className={PRIMARY} onClick={() => setAdding(true)}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" aria-hidden="true" /> Add a question
            </span>
          </button>
        )}
        {missing > 0 && (
          <p className="text-xs text-slate-500 mt-3">
            {missing} other {missing === 1 ? 'kind of question exists' : 'kinds of question exist'}{' '}
            in the database that this version of the site cannot show yet.
          </p>
        )}
      </div>

      <Note text={note} />
    </div>
  );
}

export default function SessionEditor({ session }: { session?: string }) {
  return session ? <SessionEditorFor session={session} /> : <SessionList />;
}
