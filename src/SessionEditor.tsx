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
  GAME_PLAYABLE,
  KIND_LABEL,
  createSession,
  deleteItem,
  deleteSession,
  deletionWarning,
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
  type MatchAnswer,
  type MatchPayload,
  type GameAnswer,
  type NumberAnswer,
  type NumberPayload,
  type Sheet,
  type SheetItem,
  type SessionMode,
  type SessionSummary,
} from '@/authoring';
import { JOIN_HOST, pathOf } from '@/routes';
import { INTL_UNITS, formatGuess } from '@/guessFormat';

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-accent';
// `inline-flex items-center justify-center` is not decoration. A <button>
// centres its own content, an <a> does not — so the same class on a link gave
// a fixed-height box with the text sitting at the top of it, and a row mixing
// the two came out ragged. Centring here rather than at each link is the point
// of having the class at all: "Presenter screen" happened to carry its own
// inline-flex for an icon and looked right, which is exactly how the other two
// went unnoticed.
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';
const PRIMARY =
  'inline-flex items-center justify-center px-4 h-10 rounded-lg text-sm font-semibold bg-emerald-400 text-ink hover:opacity-90 disabled:opacity-50';

/** What goes in `payload` — what the room is shown — for each kind.
 *
 *  Exhaustive over AUTHORABLE, so a kind added to that list without deciding
 *  what its question looks like fails to compile rather than saving `{}` and
 *  rendering an empty box in front of a room.
 *
 *  Note what is *not* here: nothing correct. `rank` sends its options in the
 *  right order because that is how the answer is expressed, and save_item
 *  shuffles them before storing — see the note there. */
function payloadFor(
  kind: string,
  parts: {
    options: string[];
    multi: boolean;
    left: string[];
    right: string[];
    number: NumberPayload;
    word: string;
  }
): Record<string, unknown> {
  switch (kind) {
    case 'choice':
      return { options: parts.options, multi: parts.multi };
    case 'survey':
      return { options: parts.options };
    case 'rank':
      return { options: parts.options };
    case 'match':
      return { left: parts.left, right: parts.right };
    case 'number':
      return parts.number;
    case 'game':
      // length so the room can draw the board before it knows anything else,
      // and never the word
      return { slug: 'guess', length: parts.word.length, tries: 6 };
    default:
      return {};
  }
}

/** And what goes in `item_answers`, which no web role can read. Null for the
 *  kinds that have no right answer — the server drops one sent for them, and
 *  sending it anyway would be asking it to invent a correct answer to a
 *  question that did not have one. */
function answerFor(
  kind: string,
  parts: {
    live: string[];
    livePairs: Record<string, string>;
    options: string[];
    value: string;
    word: string;
  }
): Record<string, unknown> | null {
  switch (kind) {
    case 'choice':
      return { correct: parts.live };
    case 'match':
      return { pairs: parts.livePairs };
    case 'rank':
      return { order: parts.options };
    case 'number':
      return { value: Number(parts.value) };
    case 'game':
      return { word: parts.word };
    default:
      return null;
  }
}

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
    // Widened from ChoicePayload/ChoiceAnswer now that six kinds go through
    // here. The named shapes still live in authoring.ts and are what
    // payloadFor and answerFor build; this is the union at the boundary, and
    // narrowing it back would mean this signature naming every kind.
    payload: Record<string, unknown>;
    answer: Record<string, unknown> | null;
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
  // Ranking reuses the options box, and the order typed is the correct order —
  // said on screen, because there is nothing else to indicate it. save_item
  // shuffles what the room is shown, so typing the answer here is safe.
  const [leftText, setLeftText] = useState(
    ((item?.payload as MatchPayload | undefined)?.left ?? []).join('\n')
  );
  const [rightText, setRightText] = useState(
    ((item?.payload as MatchPayload | undefined)?.right ?? []).join('\n')
  );
  const [pairs, setPairs] = useState<Record<string, string>>(
    ((item?.answer as MatchAnswer | null)?.pairs ?? {}) as Record<string, string>
  );
  const existingNumber = item?.payload as NumberPayload | undefined;
  const [unit, setUnit] = useState(existingNumber?.unit ?? '');
  const [gameWord, setGameWord] = useState(
    ((item?.answer as GameAnswer | null)?.word ?? '').toUpperCase()
  );
  const [currency, setCurrency] = useState(existingNumber?.currency ?? '');
  // One control rather than three fields that can disagree — a question cannot
  // be in dollars and a percentage at once.
  const [style, setStyle] = useState<'plain' | 'currency' | 'percent' | 'unit'>(
    existingNumber?.currency
      ? 'currency'
      : existingNumber?.percent
        ? 'percent'
        : existingNumber?.unit
          ? 'unit'
          : 'plain'
  );
  const [value, setValue] = useState(
    (item?.answer as NumberAnswer | null)?.value?.toString() ?? ''
  );

  const options = parseOptions(optionText);
  // Only options that still exist can be correct — deleting an option's line
  // should not leave it marked as the right answer nobody can pick.
  const live = correct.filter((c) => options.includes(c));
  const left = parseOptions(leftText);
  const right = parseOptions(rightText);
  // A pairing whose right-hand side has since been deleted is not a pairing.
  const livePairs = Object.fromEntries(
    Object.entries(pairs).filter(([l, r]) => left.includes(l) && right.includes(r))
  );
  const problem = problemWith({
    kind,
    prompt,
    options,
    correct: live,
    left,
    right,
    pairs: livePairs,
    value,
    word: gameWord,
  });
  const clock = seconds === '' ? null : secondsOf({ seconds: Number(seconds) });
  // Typed something that is not a usable clock — distinct from having left it
  // empty, which is a valid choice and the default.
  const badClock = seconds !== '' && clock === null;

  /** The three format fields collapsed back into the one shape the payload
   *  holds, so the preview and the save cannot disagree about it. */
  function numberPayload(): NumberPayload {
    switch (style) {
      case 'currency':
        return currency.trim() ? { currency: currency.trim() } : {};
      case 'percent':
        return { percent: true };
      case 'unit':
        return unit.trim() ? { unit: unit.trim() } : {};
      default:
        return {};
    }
  }

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
            {KIND_LABEL[k as keyof typeof KIND_LABEL] ?? k}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="block text-xs uppercase tracking-wider text-slate-500">Question</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
          rows={2}
          className={FIELD}
          placeholder="What are you asking the room?"
        />
      </label>

      {(kind === 'choice' || kind === 'survey' || kind === 'rank') && (
        <>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500">
              {kind === 'rank'
                ? 'Options, one per line, in the correct order'
                : 'Options, one per line'}
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

          {/* Said here because nothing else indicates it, and because the
              instinct is to worry about it: the room is shown these shuffled.
              save_item does the shuffling, so the correct order never reaches
              anybody's screen even if this page forgets. */}
          {kind === 'rank' && (
            <p className="text-xs text-slate-400">
              Type them in the right order. The room sees them shuffled, and
              scores a fraction of the question for each one they put in the
              right place.
            </p>
          )}
        </>
      )}

      {kind === 'match' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs uppercase tracking-wider text-slate-500">
                These, one per line
              </span>
              <textarea
                value={leftText}
                onChange={(e) => setLeftText(e.target.value)}
                rows={4}
                className={FIELD}
                placeholder="One per line"
              />
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wider text-slate-500">
                Pair with one of these
              </span>
              <textarea
                value={rightText}
                onChange={(e) => setRightText(e.target.value)}
                rows={4}
                className={FIELD}
                placeholder="One per line"
              />
            </label>
          </div>
          <fieldset>
            <legend className="text-xs uppercase tracking-wider text-slate-500">
              The right pairings
            </legend>
            <div className="space-y-2 mt-1">
              {left.map((l) => (
                <label key={l} className="flex items-center gap-2 text-sm">
                  <span className="text-slate-300 w-1/3 truncate">{l}</span>
                  <select
                    value={livePairs[l] ?? ''}
                    onChange={(e) => setPairs({ ...pairs, [l]: e.target.value })}
                    className={FIELD + ' flex-1'}
                  >
                    <option value="">…</option>
                    {right.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {left.length === 0 && (
                <p className="text-sm text-slate-500">Fill in both columns first.</p>
              )}
            </div>
          </fieldset>
          {/* More on the right than on the left is a good question rather than
              a mistake — spare options are what stop it being answerable by
              elimination. */}
          {right.length > left.length && left.length > 0 && (
            <p className="text-xs text-slate-400">
              {right.length - left.length} spare on the right, so the last pair
              cannot be got by elimination.
            </p>
          )}
        </>
      )}

      {kind === 'game' && (
        <>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500">
              The word to find
            </span>
            <input
              value={gameWord}
              onChange={(e) =>
                setGameWord(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8))
              }
              className={FIELD + ' tracking-[0.3em] uppercase'}
              placeholder="OWNERS"
            />
          </label>
          {/* Said plainly because it is the surprising part: the word never
              reaches anybody's browser. The server marks each guess and sends
              back the colours, so there is no arrangement of what the room is
              sent that contains it. */}
          <p className="text-xs text-slate-400">
            The room gets six guesses at a {gameWord.length || '—'}-letter word. The
            word itself stays on the server — each guess is marked there, so it is
            never sent to anybody's browser.
          </p>
          {gameWord.length > 0 && (
            <p className="text-xs text-slate-500">
              It does not have to be in the dictionary — a name or something only
              this company says is fine, and it will still be accepted as a guess.
            </p>
          )}
          {GAME_PLAYABLE.length === 1 && (
            <p className="text-xs text-slate-500">
              Guess is the only game a session can run so far.
            </p>
          )}
        </>
      )}

      {kind === 'number' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs uppercase tracking-wider text-slate-500">
                The actual value
              </span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                className={FIELD}
                placeholder="41.5"
              />
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wider text-slate-500">
                Written as
              </span>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as typeof style)}
                className={FIELD}
              >
                <option value="plain">A plain number</option>
                <option value="currency">Money</option>
                <option value="percent">A percentage</option>
                <option value="unit">Something else</option>
              </select>
            </label>
          </div>

          {style === 'currency' && (
            <label className="block">
              <span className="block text-xs uppercase tracking-wider text-slate-500">
                Currency code
              </span>
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                className={FIELD + ' max-w-24'}
                placeholder="USD"
              />
            </label>
          )}

          {style === 'unit' && (
            <label className="block">
              <span className="block text-xs uppercase tracking-wider text-slate-500">
                Units
              </span>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value.slice(0, 24))}
                className={FIELD}
                list="intl-units"
                placeholder="employees"
              />
              {/* The listed ones get proper formatting from Intl; anything else
                  is printed after the number as typed. Both work, so this is a
                  suggestion rather than a constraint. */}
              <datalist id="intl-units">
                {INTL_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
          )}

          {/* What the room will see, from the same function that will draw it.
              Guessing at the placement is exactly the mistake this replaced. */}
          {value.trim() !== '' && Number.isFinite(Number(value)) && (
            <p className="text-sm text-slate-400">
              The room sees{' '}
              <span className="text-slate-200 tabular-nums">
                {formatGuess(Number(value), numberPayload())}
              </span>
              .
            </p>
          )}
        </>
      )}

      {/* The clock is optional and off by default. A countdown is right for a
          scored round and wrong for "any questions for the board?", and the
          same controls have to run both.

          `block` on the caption is load-bearing on this field and on the
          currency one. Every other input here is `w-full`, so its caption is
          pushed onto its own line by the input rather than by anything about
          the caption; these two are capped narrow, so an inline caption let the
          box sit beside the words with nothing between them. */}
      <label className="block">
        <span className="block text-xs uppercase tracking-wider text-slate-500">
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
                ...payloadFor(kind, {
                  options,
                  multi,
                  left,
                  right,
                  number: numberPayload(),
                  word: gameWord,
                }),
                // Omitted rather than sent as null: item_seconds() reads the key
                // being absent as "no clock", and a key holding null would be
                // the same thing said in a way that has to be handled.
                ...(clock === null ? {} : { seconds: clock }),
              },
              // survey and open are unscored; the server drops an answer sent
              // for them, and sending one anyway would be asking it to.
              answer: answerFor(kind, { live, livePairs, options, value, word: gameWord }),
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
  const [mode, setMode] = useState<SessionMode>('live');
  const [qa, setQa] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const pull = useCallback(async () => setSessions(await readSessions()), []);
  useEffect(() => void pull(), [pull]);

  async function add() {
    setBusy(true);
    const res = await createSession(title.trim(), lateJoin, mode, qa);
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
          <span className="block text-xs uppercase tracking-wider text-slate-500">New session</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            className={FIELD}
            placeholder="Employee Ownership Month, week one"
          />
        </label>
        {/* The choice that shapes everything else about it, so it is made
            here rather than found later. */}
        <fieldset>
          <legend className="text-xs uppercase tracking-wider text-slate-500 mb-1">
            How it runs
          </legend>
          <div className="space-y-2">
            {(
              [
                ['live', 'With a presenter', 'You run it in the room. Everyone sees the same question at the same time, and you decide when to close the answers and show them.'],
                ['open', 'On their own time', 'No presenter. People join whenever, get the questions one at a time and answer at their own pace. Their clock starts when each question reaches them, so the scores still compare.'],
              ] as const
            ).map(([value, label, what]) => (
              <label
                key={value}
                className={`block rounded-xl border p-3 cursor-pointer ${
                  mode === value ? 'border-accent bg-accent/10' : 'border-white/15 hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="session-mode"
                    checked={mode === value}
                    onChange={() => setMode(value)}
                  />
                  <span className="text-sm font-semibold text-slate-200">{label}</span>
                </span>
                <span className="block text-xs text-slate-400 mt-1 ml-6">{what}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={qa} onChange={(e) => setQa(e.target.checked)} />
          Let people ask the host questions while it runs
        </label>

        {mode === 'live' && (
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={lateJoin === 'open'}
              onChange={(e) => setLateJoin(e.target.checked ? 'open' : 'strict')}
            />
            Let people who arrive late catch up on questions they missed
          </label>
        )}
        {/* Said here rather than discovered on the night. The column is stored
            and nothing reads it yet — see the note on sessions.late_join. */}
        {mode === 'live' && lateJoin === 'open' && (
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
                <span className="block text-xs uppercase tracking-wider text-slate-500">
                  {s.mode === 'open' ? 'on their own time' : 'presented'} · {s.state}
                </span>
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

  /** Two calls when it has run: the first comes back asking, with the counts.
   *  A draft goes on the first. */
  async function removeSession() {
    const first = await deleteSession(session);
    if (first.ok) {
      window.location.assign(pathOf({ kind: 'sessions' }));
      return;
    }
    if (first.reason !== 'confirm') {
      setNote(first.reason ?? 'That did not work');
      return;
    }
    if (!window.confirm(deletionWarning(sheet?.session?.title ?? 'this session', first))) return;
    const second = await deleteSession(session, true);
    if (second.ok) window.location.assign(pathOf({ kind: 'sessions' }));
    else setNote(second.reason ?? 'That did not work');
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
        {meta.mode === 'open' ? 'Played on their own time. ' : 'Run by a presenter. '}
        {meta.state === 'draft'
          ? 'Not open yet — nobody can see it.'
          : meta.state === 'live'
            ? meta.mode === 'open'
              ? 'Open for playing.'
              : 'Running now.'
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
          className={BUTTON + ' gap-1.5'}
          href={pathOf({ kind: 'live', session, host: true })}
        >
          <Radio className="w-4 h-4" aria-hidden="true" />
          {meta.mode === 'open' ? 'Open and close it' : 'Presenter screen'}
        </a>
        <a className={BUTTON} href={pathOf({ kind: 'live', session, host: false })}>
          {meta.mode === 'open' ? 'What a player sees' : 'What the room sees'}
        </a>
        <a className={BUTTON} href={pathOf({ kind: 'scores', session })}>
          Scores
        </a>
        {/* Any session, not only a draft. Old ones pile up and they are the
            operator's to keep or not — see the note on delete_session. What is
            left of the old refusal is that a session which has run says what
            would be lost before it goes. */}
        <button
          className={BUTTON}
          disabled={busy}
          onClick={() => void removeSession()}
        >
          Delete session
        </button>
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
