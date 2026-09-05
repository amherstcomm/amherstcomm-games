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
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Radio,
  Send,
  Timer,
  Trophy,
} from 'lucide-react';
import {
  advance,
  onSessionMoved,
  readCurrentItem,
  readItemWinner,
  readLeaderboard,
  readMyStanding,
  playGuess,
  readGameState,
  readPresenterView,
  readSessionDoor,
  readTally,
  sendAnswer,
  type GuessRow,
  type Leaderboard,
  type LiveItem,
  type PresenterView,
} from '@/live';
import { JOIN_HOST, ORIGIN, pathOf } from '@/routes';
import { formatGuess, guessAffixes } from '@/guessFormat';
import type { NumberPayload } from '@/authoring';
import QrCode from '@/QrCode';
import AskPanel from '@/AskPanel';
import MobileKeyInput from '@/MobileKeyInput';
import {
  nextMove,
  otherMoves,
  secondsLeft,
  whereWeAre,
  type Action,
  type Door,
} from '@/presenting';

/** How often the presenter's count refreshes while answers are arriving.
 *
 *  A poll rather than a subscription, and only on the presenter's screen. The
 *  doorbell fires when the *session* moves, which is the presenter's own
 *  clicks; answers landing do not move it, and making them would put one row
 *  through the WAL per participant per question — the room's traffic in the
 *  replication stream, to animate a number on one screen. */
const COUNT_MS = 2000;

/** How often the room re-reads regardless of the doorbell.
 *
 *  **This reverses part of the note above.** The doorbell was written to
 *  replace polling, and the argument still holds for the presenter's answer
 *  count. It does not hold for "is there a new question on screen", because
 *  that is the one read the whole feature rests on and it had a single point of
 *  failure nobody could see.
 *
 *  It failed twice over. `sessions` had row-level security enabled and not one
 *  policy, and Realtime applies RLS to delivery — so there was no row the room
 *  was allowed to be sent and postgres_changes said nothing about it. That is
 *  fixed in the schema. The second reason is the one that cannot be fixed from
 *  here: a websocket has to survive whatever sits in front of the site, and a
 *  proxy that does not upgrade the connection breaks the doorbell without
 *  breaking anything else on the page.
 *
 *  Five seconds is chosen against the room rather than the server: it is the
 *  longest somebody stares at a stale screen before deciding it is broken. Even
 *  at fifty people that is ten reads a second on a VM that is already serving
 *  them, which is the cheap half of this trade. */
const LIVE_POLL_MS = 5000;

/** The address the QR points at — absolute, because a phone scanning it has no
 *  page to be relative to. */
const joinUrl = (code: string) => ORIGIN + pathOf({ kind: 'join', code });

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
  readOnly,
}: {
  item: LiveItem;
  onSend: (value: unknown) => void;
  sending: boolean;
  /** the presenter's screen: the question is on it because it is pointed at a
   *  room, and whoever is running the session is not playing in it */
  readOnly?: boolean;
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

  const locked = readOnly || item.state !== 'open';

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
      {/* Said before they answer, because it changes how they answer. Somebody
          who thinks it is all-or-nothing does not tick the two they are sure
          of, and somebody who thinks there is no downside ticks everything. */}
      {multi && !locked && (
        <p className="text-xs text-slate-400 pt-1">
          Part marks for each right one — but a wrong pick cancels a right one
          out, so ticking everything is not a way to win.
        </p>
      )}
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

/** Pair each thing on the left with one on the right.
 *
 *  A select per row rather than dragging. Dragging is the obvious gesture and
 *  the wrong one here: half the room is on a phone, it needs a keyboard story
 *  that does not come for free, and the whole interaction has to work first
 *  time with no practice, in public, against a clock. */
function Match({
  item,
  onSend,
  sending,
  readOnly,
}: {
  item: LiveItem;
  onSend: (value: unknown) => void;
  sending: boolean;
  /** the presenter's screen: the question is on it because it is pointed at a
   *  room, and whoever is running the session is not playing in it */
  readOnly?: boolean;
}) {
  const left = Array.isArray(item.payload?.left) ? (item.payload.left as string[]) : [];
  const right = Array.isArray(item.payload?.right) ? (item.payload.right as string[]) : [];
  const [pairs, setPairs] = useState<Record<string, string>>(
    (item.mine as Record<string, string>) ?? {}
  );
  useEffect(() => {
    setPairs((item.mine as Record<string, string>) ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const locked = readOnly || item.state !== 'open';
  const answer =
    item.state === 'revealed' ? (item.answer as { pairs?: Record<string, string> } | null) : null;

  return (
    <div className="space-y-2">
      {left.map((l) => {
        const chosen = pairs[l] ?? '';
        const should = answer?.pairs?.[l];
        const got = should != null && chosen === should;
        return (
          <div key={l} className="flex items-center gap-2">
            <span className="text-sm text-slate-200 w-1/3 truncate">{l}</span>
            <select
              value={chosen}
              disabled={locked || sending}
              onChange={(e) => setPairs({ ...pairs, [l]: e.target.value })}
              aria-label={l}
              className={`flex-1 px-3 py-2 rounded-lg bg-white/5 border text-white text-sm focus:outline-none focus:border-accent disabled:opacity-70 ${
                answer ? (got ? 'border-emerald-400' : 'border-rose-400') : 'border-white/15'
              }`}
            >
              <option value="">…</option>
              {right.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {/* After the reveal a wrong row says what it should have been,
                rather than only that it was wrong. */}
            {answer && !got && (
              <span className="text-xs text-slate-400 w-1/4 truncate">{should}</span>
            )}
          </div>
        );
      })}
      {!locked && (
        <>
          <button
            onClick={() => onSend(pairs)}
            disabled={sending || Object.keys(pairs).length === 0}
            className="w-full h-11 rounded-xl bg-emerald-400 text-ink font-semibold disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send answer'}
          </button>
          <p className="text-xs text-slate-400 pt-1">
            A fraction of the question for each pair you get right.
          </p>
        </>
      )}
    </div>
  );
}

/** Guess a number. Closest wins — which is not "close enough wins", and the
 *  screen says so, because those are two different games and only one of them
 *  is being played. */
function Guess({
  item,
  onSend,
  sending,
  readOnly,
}: {
  item: LiveItem;
  onSend: (value: unknown) => void;
  sending: boolean;
  /** the presenter's screen: the question is on it because it is pointed at a
   *  room, and whoever is running the session is not playing in it */
  readOnly?: boolean;
}) {
  const payload = item.payload as NumberPayload | undefined;
  // Where the symbol goes is Intl's business, not ours — see src/guessFormat.ts
  const { prefix, suffix } = guessAffixes(payload);
  const [text, setText] = useState(item.mine != null ? String(item.mine) : '');
  useEffect(() => {
    setText(item.mine != null ? String(item.mine) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const locked = readOnly || item.state !== 'open';
  const actual =
    item.state === 'revealed' ? (item.answer as { value?: number } | null)?.value : undefined;
  const usable = text.trim() !== '' && Number.isFinite(Number(text));

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">Your guess</span>
        {/* The affixes sit on the box rather than in the label, so what is
            being typed looks like what the answer will look like. */}
        <span className="flex items-stretch gap-2 rounded-xl bg-white/5 border border-white/15 focus-within:border-accent px-4">
          {prefix && (
            <span className="self-center text-lg text-slate-400" aria-hidden="true">
              {prefix}
            </span>
          )}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={locked || sending}
            inputMode="decimal"
            className="flex-1 min-w-0 py-3 bg-transparent text-white text-lg tabular-nums focus:outline-none disabled:opacity-70"
          />
          {suffix && (
            <span className="self-center text-lg text-slate-400" aria-hidden="true">
              {suffix}
            </span>
          )}
        </span>
      </label>
      {!locked && (
        <>
          <button
            onClick={() => onSend(Number(text))}
            disabled={sending || !usable}
            className="w-full h-11 rounded-xl bg-emerald-400 text-ink font-semibold disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send guess'}
          </button>
          <p className="text-xs text-slate-400">
            The closest guess takes the question — not everyone who was close.
          </p>
        </>
      )}
      {actual != null && (
        <p className="text-sm text-slate-300">
          It was{' '}
          <span className="text-white font-semibold tabular-nums">
            {formatGuess(actual, payload)}
          </span>
          .
        </p>
      )}
    </div>
  );
}

/** Put them in order. Up and down rather than dragging, for the reasons in
 *  Match — and because a button says what it does, which a drop target does
 *  not. */
function Rank({
  item,
  onSend,
  sending,
  readOnly,
}: {
  item: LiveItem;
  onSend: (value: unknown) => void;
  sending: boolean;
  /** the presenter's screen: the question is on it because it is pointed at a
   *  room, and whoever is running the session is not playing in it */
  readOnly?: boolean;
}) {
  const options = Array.isArray(item.payload?.options) ? (item.payload.options as string[]) : [];
  const [order, setOrder] = useState<string[]>(
    Array.isArray(item.mine) ? (item.mine as string[]) : options
  );
  useEffect(() => {
    setOrder(Array.isArray(item.mine) ? (item.mine as string[]) : options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const locked = readOnly || item.state !== 'open';
  const right =
    item.state === 'revealed' ? (item.answer as { order?: string[] } | null)?.order : undefined;

  function move(i: number, delta: -1 | 1) {
    const next = [...order];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {order.map((option, i) => {
          const placed = right != null && right[i] === option;
          return (
            <li
              key={option}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${
                right && placed ? 'border-emerald-400' : 'border-white/15'
              }`}
            >
              <span className="text-slate-500 tabular-nums w-5">{i + 1}</span>
              <span className="flex-1 text-slate-200 truncate">{option}</span>
              {right ? (
                placed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                ) : (
                  <span className="text-xs text-slate-400 truncate">was {right[i]}</span>
                )
              ) : (
                <span className="flex gap-1 shrink-0">
                  <button
                    aria-label={`Move ${option} up`}
                    disabled={locked || sending || i === 0}
                    onClick={() => move(i, -1)}
                    className="px-2 h-8 rounded-lg bg-white/10 border border-white/15 text-slate-200 disabled:opacity-40"
                  >
                    <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    aria-label={`Move ${option} down`}
                    disabled={locked || sending || i === order.length - 1}
                    onClick={() => move(i, 1)}
                    className="px-2 h-8 rounded-lg bg-white/10 border border-white/15 text-slate-200 disabled:opacity-40"
                  >
                    <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!locked && (
        <>
          <button
            onClick={() => onSend(order)}
            disabled={sending}
            className="w-full h-11 rounded-xl bg-emerald-400 text-ink font-semibold disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send order'}
          </button>
          <p className="text-xs text-slate-400 pt-1">
            A fraction of the question for each one in the right place.
          </p>
        </>
      )}
    </div>
  );
}

/** A word game, played in the room.
 *
 *  Only `guess` so far — see GAME_PLAYABLE in authoring.ts, which is the list
 *  that moves when another game learns to be a question.
 *
 *  The board is its own, not the daily one. Embedding GuessGame would have
 *  meant a round in a session writing over somebody's daily progress, its
 *  streak and its stats, all of which live in one store keyed by the game. A
 *  round against a clock in front of a room wants none of that: no persistence,
 *  no difficulty, no practice mode. What it does share is the rule, and the
 *  rule is not here either — the server marks, because a client that could
 *  colour the tiles would be a client that had been sent the word.
 *
 *  What it also shares, and must, is how you type into it. This had a text box
 *  under the grid for about a day: it worked, and it was a different game from
 *  the one on the rest of the site, which is worse than a missing feature —
 *  somebody who plays the daily arrives with hands that already know what to
 *  do. So: letters land in the row, Backspace takes one back, Enter sends, and
 *  MobileKeyInput raises the device keyboard for a thumb, exactly as every
 *  other board here does. */
function WordGame({
  item,
  readOnly,
  onFinished,
}: {
  item: LiveItem;
  readOnly?: boolean;
  /** A word game never goes through `send` — every guess is its own call — so
   *  the screen around it has no way to know the round is over. In an open
   *  session that left the player looking at a solved board with no way on. */
  onFinished?: () => void;
}) {
  const length = Number(item.payload?.length) || 5;
  const tries = Number(item.payload?.tries) || 6;
  const [rows, setRows] = useState<GuessRow[]>([]);
  const [solved, setSolved] = useState(false);
  const [word, setWord] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const flashTimer = useRef(0);

  /** Transient, and clears itself after a beat — the same shape GuessGame and
   *  BoxGame use for "Not enough letters". A message that stays put reads as
   *  the state of the board rather than as a reaction to the last keystroke. */
  const showFlash = useCallback((msg: string) => {
    setNote(msg);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setNote(''), 1600);
  }, []);

  // What they had already, so a reload mid-round is not a fresh start.
  useEffect(() => {
    let alive = true;
    if (!item.id) return;
    void readGameState(item.id).then((s) => {
      if (!alive || !s.ok) return;
      setRows(s.guesses ?? []);
      setSolved(s.solved === true);
      setWord(s.word ?? null);
      // a reload onto a board already finished is still finished
      if (s.solved === true || (s.guesses?.length ?? 0) >= tries) onFinished?.();
    });
    return () => {
      alive = false;
    };
  }, [item.id, tries, onFinished]);

  const locked = readOnly || item.state !== 'open';
  const done = solved || rows.length >= tries;
  const playing = !locked && !done;

  // A ref, because the physical-keyboard listener is attached once per render
  // and `submit` closes over state — the same shape GuessGame uses.
  const sending = useRef(false);

  const submit = useCallback(async () => {
    if (!item.id || sending.current) return;
    if (current.length !== length) {
      // the daily board's words, because it is the same complaint
      showFlash('Not enough letters');
      return;
    }
    sending.current = true;
    setBusy(true);
    const res = await playGuess(item.id, current);
    setBusy(false);
    sending.current = false;
    if (!res.ok) {
      showFlash(res.reason ?? 'That did not work');
      return;
    }
    setNote('');
    setRows((prev) => [...prev, { word: current.toUpperCase(), marks: res.marks ?? [] }]);
    setCurrent('');
    if (res.solved) setSolved(true);
    if (res.word) setWord(res.word);
    if (res.solved || res.left === 0) onFinished?.();
  }, [current, item.id, length, showFlash, onFinished]);

  const pressKey = useCallback(
    (k: string) => {
      if (!playing || busy) return;
      setNote('');
      if (k === 'enter') {
        void submit();
        return;
      }
      if (k === 'backspace') {
        setCurrent((c) => c.slice(0, -1));
        return;
      }
      if (/^[a-z]$/.test(k)) setCurrent((c) => (c.length < length ? c + k : c));
    },
    [playing, busy, submit, length]
  );

  // Physical keyboard, guarded the same way GuessGame guards it: modifier
  // combinations are the browser's, and a keystroke aimed at a text field is
  // that field's. The presenter's screen has both a board and controls, so the
  // second guard is doing real work here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Enter') pressKey('enter');
      else if (e.key === 'Backspace') pressKey('backspace');
      else if (/^[a-zA-Z]$/.test(e.key)) pressKey(e.key.toLowerCase());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pressKey]);

  const tile = (state: string | undefined) =>
    state === 'correct'
      ? 'border-emerald-400 bg-emerald-400/20 text-emerald-100'
      : state === 'present'
        ? 'border-amber-400 bg-amber-400/20 text-amber-100'
        : state === 'absent'
          ? 'border-white/10 bg-white/5 text-slate-400'
          : 'border-white/15 text-slate-200';

  return (
    <div className="space-y-3">
      {/* `relative`, and it is load-bearing. MobileKeyInput is `absolute
          inset-0`, so it fills its nearest *positioned* ancestor — and with
          none it filled the page, sat invisibly over the presenter's controls
          and swallowed every click on Close, Reveal and Finish. The board
          looked perfect and the room could not be moved on.
          Every other game wraps it round its entry box for exactly this
          reason; here the grid is the entry box. */}
      <div className="relative">
        <div className="space-y-1.5">
          {Array.from({ length: tries }, (_, r) => {
          const row = rows[r];
          const isCurrent = playing && r === rows.length;
          return (
            <div key={r} className="flex gap-1.5 justify-center">
              {Array.from({ length }, (_, c) => {
                const typed = isCurrent ? current[c] : undefined;
                return (
                  <span
                    key={c}
                    className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg border flex items-center justify-center text-lg font-bold uppercase transition-colors ${tile(
                      row?.marks?.[c]
                    )} ${typed ? 'border-accent text-white' : ''}`}
                  >
                    {row?.word?.[c] ?? typed ?? ''}
                  </span>
                );
              })}
            </div>
          );
        })}
        </div>
        {/* No text box. The grid is the input — this raises the device
            keyboard for a thumb and feeds the same pressKey the physical one
            does, which is how every other board on the site works. Inside the
            relative wrapper above, so it covers the grid and nothing else. */}
        {playing && <MobileKeyInput onKey={pressKey} label="Type your guess" />}
      </div>

      {playing && (
        <p className="text-xs text-slate-400 text-center">
          Type your guess, then press Enter. {tries - rows.length} left.
        </p>
      )}

      {note && (
        <p className="text-sm text-danger text-center" role="status">
          {note}
        </p>
      )}

      {solved && (
        <p className="text-sm text-emerald-300 text-center">
          Got it in {rows.length} {rows.length === 1 ? 'guess' : 'guesses'}.
        </p>
      )}
      {/* Told once it is out of reach, and not before: the server decides that,
          and only sends the word when it does. */}
      {!solved && word && <p className="text-sm text-slate-300 text-center">It was {word}.</p>}
      {locked && !solved && !word && (
        <p className="text-sm text-slate-400 text-center">Answers are closed for this one.</p>
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
  // The presenter's header — the code to read out. Only fetched on the host
  // screen, because only the host is allowed it and only the host needs it.
  const [door, setDoor] = useState<Door | null>(null);
  // What the server's clock read minus what this browser's did, measured on
  // every read. The countdown is drawn against the clock that decides whether
  // an answer counts, not against this laptop's.
  const [skewMs, setSkewMs] = useState(0);
  const [tick, setTick] = useState(0);
  // Whether the live connection actually came up. Null until it answers, so a
  // page that has not finished connecting does not accuse itself of being
  // broken.
  const [connected, setConnected] = useState<boolean | null>(null);
  /** Open mode only: the question they have just answered, marked, kept on
   *  screen until they press on. A live session does not need it — the
   *  presenter's reveal is what puts the answer up, for everybody at once. */
  const [justAnswered, setJustAnswered] = useState<LiveItem | null>(null);
  /** The word game's equivalent: it marks its own board, so there is nothing
   *  to hold, only the fact that it is over. */
  const [gameOver, setGameOver] = useState(false);
  /** Open mode, timed question, clock run out before they answered. The server
   *  will not take an answer and there is no presenter to move them on, so
   *  without this the round simply stopped. */
  const [outOfTime, setOutOfTime] = useState(false);

  /** Open mode: they have finished with the question on screen and are looking
   *  at how they did, waiting to move on. Declared here rather than beside the
   *  other derived values because the poll below reads it. */
  const holding = !host && (justAnswered !== null || gameOver || outOfTime);
  // Stable, so WordGame's effects do not re-run on every render of this one.
  const finishGame = useCallback(() => setGameOver(true), []);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [mine, setMine] = useState<{ points?: number; scored?: number } | null>(null);
  const [first, setFirst] = useState<{ name?: string | null; seconds?: number | null } | null>(
    null
  );
  const itemId = useRef<string | undefined>(undefined);

  const pull = useCallback(async () => {
    // The presenter's header comes back on the same beat as the item, inside
    // the one read the doorbell already drives.
    //
    // It had its own onSessionMoved subscription for about ten minutes.
    // supabase-js keys channels by name, so a second `live:<id>` resolved to
    // the channel this component had already subscribed, and adding a listener
    // to a subscribed channel throws — which took the whole page down. Found by
    // opening it; nothing else would have.
    let hosting: Door | null = null;
    if (host) {
      const d = await readSessionDoor(session);
      if (d.ok) {
        hosting = d;
        setDoor(d);
      }
    }

    // The host of an open session is not a player in it.
    //
    // Two reasons, and the second is the one that made this a bug rather than
    // a tidiness question. There is nothing for this screen to show — the room
    // is not looking at one question, everybody is somewhere different — and
    // current_item does not merely report in open mode, it *serves*: asking
    // what you are looking at is what puts a question in front of you and
    // starts your clock. So the host opening this page was being dealt into
    // their own session.
    //
    // They can still play it. That is the player's address, which this screen
    // links to.
    if (hosting?.mode === 'open') {
      setItem({ state: 'waiting', mode: 'open' });
      setFirst(null);
      const b = await readLeaderboard(session);
      setBoard(b.ok ? b : null);
      return;
    }

    const next = await readCurrentItem(session);
    // Measured around the read rather than from it: `now` is what the server
    // said, and the closest this browser can get to "at the same moment" is
    // when the answer arrived.
    if (next.now) setSkewMs(Date.parse(next.now) - Date.now());
    setItem(next);
    if (next.id !== itemId.current) {
      itemId.current = next.id;
      setTally(null);
      setNote('');
      setGameOver(false);
      setOutOfTime(false);
    }
    if (next.state === 'revealed' && next.id) {
      const t = await readTally(next.id);
      if (t.ok) setTally(t.counts ?? {});
      // Who got there first — only the presenter may ask, and only after the
      // reveal, which the server enforces either way.
      if (host) {
        const w = await readItemWinner(next.id);
        setFirst(w.ok ? w : null);
      }
    } else {
      setFirst(null);
    }
    // Scores follow every move rather than only the reveal: a question skipped
    // or a session closed both change what the board says.
    if (host) {
      const b = await readLeaderboard(session);
      setBoard(b.ok ? b : null);
    } else {
      const m = await readMyStanding(session);
      setMine(m.ok ? m : null);
    }
  }, [session, host]);

  useEffect(() => {
    void pull();
    return onSessionMoved(session, () => void pull(), setConnected);
  }, [session, pull]);

  // The safety net — see LIVE_POLL_MS. Unconditional rather than only when the
  // channel reports trouble, because the failure it exists for is a channel
  // that reports SUBSCRIBED and delivers nothing.
  useEffect(() => {
    // Not while they are looking at how they did. In open mode current_item
    // does not report, it *serves* — so a poll here hands them the next
    // question and starts its clock while they are still reading the last
    // one's answer. On a timed question that is seconds off the clock for
    // something they have not been shown yet.
    if (holding) return;
    const id = window.setInterval(() => void pull(), LIVE_POLL_MS);
    return () => window.clearInterval(id);
  }, [pull, holding]);


  // Four times a second while a clock is running, and not at all otherwise. Not
  // once a second: at that rate the displayed number skips whenever the tick
  // and the second boundary drift apart, and a countdown that jumps from 8 to 6
  // in front of a room reads as broken. A question with no clock re-renders
  // nothing.
  const clock = secondsLeft(item.opened_at, item.seconds, skewMs, Date.now());
  const running = item.state === 'open' && clock !== null;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [running, item.id]);
  void tick;

  // When the clock runs out the presenter's screen closes the answers, so the
  // room sees it happen rather than sitting on a question the server has
  // already stopped accepting. The server refuses late answers on its own — see
  // answer_item — so this is the visible half of a rule, not the rule.
  const expired = running && clock === 0;
  useEffect(() => {
    if (!host || !expired) return;
    void advance(session, 'lock');
  }, [host, expired, session]);

  // Open mode has nobody to close the answers, so running out is the end of
  // that question for that person and they are shown the way on.
  useEffect(() => {
    if (expired && item.mode === 'open' && !host) setOutOfTime(true);
  }, [expired, item.mode, host]);

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
    // Open mode hands the answer back with the acknowledgement, because nobody
    // is going to reveal it. Held here rather than re-read, so the marked
    // question stays on screen until they choose to move on.
    if (res.ok && item.mode === 'open') {
      setJustAnswered({ ...item, state: 'revealed', mine: value, answer: res.answer });
      return;
    }
    if (res.ok) void pull();
  }

  async function control(action: Action) {
    const res = await advance(session, action);
    if (!res.ok) setNote(res.reason ?? 'That did not work');
    void pull();
  }

  // What is actually on screen: the marked question they just answered, if
  // there is one, otherwise whatever the server last served.
  const shown = justAnswered ?? item;
  /** Hosting an open session: no question on this screen, and none asked for.
   *  See the note in pull(). */
  const openHost = host && door?.mode === 'open';
  /** Read-only because the server will refuse, not because of the address.
   *  `host` is which screen this is; `yours` is whether the person looking at
   *  it runs the session, and the second is the one the rule is about. */
  const readOnly = host || item.yours === true;
  /** Inert, for any reason. `expired` was computed and then only consulted by
   *  the open-question box — so a choice, a match, a guess or a ranking went on
   *  offering a Send after the clock had run out, and the server refused it.
   *  Offering a control that will be refused is the screen lying. */
  const inert = readOnly || expired;
  const kind = shown.kind ?? '';
  // Not just `state === 'open'`: once the clock has run out the server refuses,
  // so leaving the controls live would be inviting an answer that cannot land.
  // What is on screen, which in open mode is the held marked question after
  // they answer rather than the next one the server would serve.
  const answering = shown.state === 'open' && !expired;
  const move = host ? nextMove(door ?? { ok: false }) : null;
  const others = host ? otherMoves(door ?? { ok: false }) : [];

  return (
    <div className={`mx-auto px-4 py-8 ${host ? 'max-w-5xl' : 'max-w-xl'}`}>
      {host && (
        /* The presenter's screen is a room's screen, not a page in a column.
           It was a small card at the top of the same narrow measure everybody
           else reads on, which is right for a phone and wrong for the thing
           pointed at forty people: the code was too small to read from the
           back and the QR was a stamp. Wider, and the join block gets the
           weight it needs. */
        <div className="mb-8 rounded-2xl border border-accent/40 bg-accent/5 p-4 sm:p-6">
          <p className="text-xs uppercase tracking-wider text-accent font-semibold mb-4">
            Presenting{door?.title ? ` — ${door.title}` : ''}
          </p>

          <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
            {/* The way in, on the screen already pointed at the room: the code
                to read out, and the same link as a QR so nobody has to type
                anything. Both, because a phone camera and a laptop keyboard
                are different people in the same room.
                Sized to be scanned across a room rather than from a desk —
                a QR the size of a stamp is a QR everybody walks up to. */}
            {door?.code && door.state !== 'closed' && (
              <div className="flex items-center gap-5">
                <QrCode
                  text={joinUrl(door.code)}
                  className="w-36 h-36 sm:w-48 sm:h-48 rounded-lg shrink-0 p-2"
                  label={`Scan to join with code ${door.code}`}
                />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-slate-500">To join</p>
                  <p className="text-4xl sm:text-6xl font-bold text-white tracking-[0.15em] leading-none my-1">
                    {door.code}
                  </p>
                  <p className="text-sm sm:text-base text-slate-400 break-words">
                    {JOIN_HOST}/join
                  </p>
                </div>
              </div>
            )}

            <div className="min-w-0">
              <p className="text-base sm:text-lg text-slate-300 mb-3">
                {whereWeAre(door ?? { ok: false })}
              </p>

              {/* One move, and it says what it will do. The five verbs this
                  replaced — Start, Next question, Lock, Reveal, Close, all at
                  once — left the presenter working out which was next in front
                  of a room. See src/presenting.ts. */}
              {move && (
                <button
                  onClick={() => void control(move.action)}
                  className="w-full h-14 rounded-xl bg-emerald-400 text-ink font-semibold text-lg hover:opacity-90"
                >
                  {move.label}
                </button>
              )}

              {others.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {others.map((m) => (
                    <button
                      key={`${m.action}-${m.label}`}
                      onClick={() => void control(m.action)}
                      // slate-200, not slate-100: the palette defines 950 down
                      // to 200, and a tier it does not define falls through to
                      // Tailwind's own — near-white, invisible on the light
                      // theme's page. Caught by looking at it; now covered by
                      // the a11y sweep.
                      className="px-3 h-10 rounded-lg text-sm font-semibold bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}

              {view?.ok && item.id && (
                <p className="mt-3 text-base text-slate-300 tabular-nums">
                  {view.answered ?? 0} answered
                  {item.state === 'open' ? ' so far' : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Said out loud rather than left to be discovered. The screen still
          keeps up — it re-reads every few seconds — but "updates arrive a
          moment late" is a different thing to be told than nothing at all, and
          on the day it is the sentence that identifies the problem. */}
      {connected === false && (
        <p className="mb-4 text-xs text-slate-500" role="status">
          Live updates are not connected — this screen is refreshing every few
          seconds instead.
        </p>
      )}

      {/* The board on its own address, for the other screen. Under the panel
          rather than in it: it opens a different page, which is not the same
          kind of thing as the buttons that move the room. */}
      {host && (
        <a
          href={pathOf({ kind: 'scores', session })}
          className="inline-block mb-6 text-sm text-accent hover:brightness-110"
        >
          Open the scoreboard
        </a>
      )}

      {/* Where they are in it. Their own progress, which nobody else's affects
          — the whole difference between this and a room moving together. */}
      {item.mode === 'open' && (item.total ?? 0) > 0 && shown.state !== 'not-live' && (
        <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
          {shown.state === 'done'
            ? `All ${item.total} answered`
            : `Question ${(item.done ?? 0) + 1} of ${item.total}`}
        </p>
      )}

      {shown.state === 'done' && (
        <div className="py-10 text-center">
          <p className="text-lg text-white font-semibold">That is all of them.</p>
          <p className="text-sm text-slate-400 mt-1">
            {mine && (mine.scored ?? 0) > 0
              ? `You got ${mine.points} of ${mine.scored}.`
              : 'Thanks for playing.'}
          </p>
        </div>
      )}

      {/* The host of an open session has no question to look at — everybody is
          somewhere different, which is the point of the mode. What they need is
          the code, the count and the way to close it, all of which are in the
          panel above. */}
      {openHost ? (
        <div className="py-10 text-center">
          <p className="text-sm text-slate-400">
            Nobody is looking at the same question, so there is nothing to show
            here. The questions are in the editor, and how everyone is doing is
            on the scoreboard.
          </p>
        </div>
      ) : (
        <>
          {shown.state === 'not-live' && item.shared && !host && (
            <p className="text-center pt-6">
              <a
                href={pathOf({ kind: 'scores', session })}
                className="text-sm text-accent hover:brightness-110"
              >
                See how it went
              </a>
            </p>
          )}
          {shown.state === 'not-live' && (
            <Waiting
              text={
                item.yours
                  ? 'You are running this one, so there is nothing here for you to play.'
                  : 'This session has not started yet.'
              }
            />
          )}
          {shown.state === 'waiting' && <Waiting text="Waiting for the next question…" />}
        </>
      )}

      {/* Said once, where somebody might otherwise reach for an option. The
          server refuses either way — see runs_session — and a screen that
          offers a button the server will refuse is the screen lying. */}
      {readOnly && shown.id && shown.state === 'open' && (
        <p className="mb-3 text-xs text-slate-500">
          You are running this one, so you are not scored on it.
        </p>
      )}

      {shown.id && !openHost && (
        <>
          <h1
            className={`font-bold mb-1 text-white ${
              host ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-2xl'
            }`}
          >
            {shown.prompt}
          </h1>
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            {shown.state === 'open'
              ? expired
                ? 'Time is up'
                : 'Answers open'
              : item.state === 'locked'
                ? 'Answers closed'
                : 'Revealed'}
          </p>

          {/* The clock. Only while it is running: a bar that sits at zero after
              the question closes is a bar that says "too late" for the rest of
              the round, and the state line above already says so once. */}
          {running && (
            <div className="mb-5" aria-hidden={expired}>
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                <Timer className="w-4 h-4" aria-hidden="true" />
                <span className="tabular-nums" role="timer" aria-live="off">
                  {clock}s
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ease-linear ${
                    (clock ?? 0) <= 5 ? 'bg-danger' : 'bg-accent'
                  }`}
                  style={{ width: `${((clock ?? 0) / (item.seconds || 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {(kind === 'choice' || kind === 'survey') && (
            <Choice item={shown} onSend={(v) => void send(v)} sending={sending} readOnly={inert} />
          )}
          {kind === 'match' && (
            <Match item={shown} onSend={(v) => void send(v)} sending={sending} readOnly={inert} />
          )}
          {kind === 'number' && (
            <Guess item={shown} onSend={(v) => void send(v)} sending={sending} readOnly={inert} />
          )}
          {kind === 'rank' && <Rank item={shown} onSend={(v) => void send(v)} sending={sending} readOnly={inert} />}
          {/* The only kind that does not go through `send`: a word game is a
              sequence of guesses, each marked by the server as it arrives. */}
          {kind === 'game' && (
            <WordGame item={shown} readOnly={inert} onFinished={finishGame} />
          )}
          {kind === 'open' && answering && !readOnly && (
            <Ask onSend={(v, anon) => void send(v, anon)} sending={sending} />
          )}
          {kind === 'open' && !answering && (
            <p className="text-sm text-slate-400">
              {expired ? 'Time is up for this one.' : 'Questions are closed for this one.'}
            </p>
          )}

          {/* A kind the server knows about and this build does not. Says so
              rather than rendering an empty box: item_kinds is a table so a
              kind can be added ahead of the component that draws it. */}
          {!['choice', 'survey', 'open', 'match', 'number', 'rank', 'game'].includes(kind) && (
            <p className="text-sm text-slate-400">
              This kind of question ({kind}) is not supported by this version of the site
              yet.
            </p>
          )}

          {/* The tiebreak made visible, at the moment the room can still check it
              against what they just watched happen. */}
          {host && item.state === 'revealed' && first && (
            <p className="mt-5 text-sm text-slate-300 inline-flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-accent" aria-hidden="true" />
              {first.name
                ? `First correct: ${first.name}${
                    first.seconds != null ? ` — ${first.seconds}s` : ''
                  }`
                : 'Nobody got that one.'}
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

      {/* The board, on the screen that is already pointed at the room. Only
          revealed questions count — the server refuses to score the one on
          screen, so putting this on a projector mid-round cannot give away the
          answer people are still working on. */}
      {host && board?.ok && (board.standings?.length ?? 0) > 0 && (
        <div className="mt-8">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
            Scores after {board.scored} {board.scored === 1 ? 'question' : 'questions'}
          </p>
          <ol className="space-y-1">
            {(board.standings ?? []).map((s, i) => (
              <li
                key={`${s.name}-${i}`}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className="text-slate-500 tabular-nums mr-2">{s.place}</span>
                  <span className="text-slate-200">{s.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-slate-400">
                  {s.points}
                  {/* The tiebreak, shown because it is the thing somebody will
                      ask about when they came second on the same score. */}
                  {s.seconds != null && (
                    <span className="text-slate-500"> · {s.seconds}s</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Your own, and nobody else's. */}
      {!host && mine && (mine.scored ?? 0) > 0 && (
        <p className="mt-8 text-sm text-slate-300">
          You have {mine.points} of {mine.scored} so far.
        </p>
      )}

      {/* Open mode: they have seen how they did, and they move on when they
          are ready rather than being moved. */}
      {holding && (
        <button
          onClick={() => {
            setJustAnswered(null);
            setGameOver(false);
            setOutOfTime(false);
            setNote('');
            void pull();
          }}
          className="w-full h-11 mt-5 rounded-xl bg-emerald-400 text-ink font-semibold"
        >
          {outOfTime && !justAnswered
            ? 'Move on'
            : (item.done ?? 0) + 1 >= (item.total ?? 0)
              ? 'Finish'
              : 'Next question'}
        </button>
      )}

      {/* Alongside, not in the sequence. It is here on both screens because a
          question gets asked while somebody is looking at something else —
          that is the whole point of it — and the host answers it in the gap
          between two questions. */}
      <AskPanel session={session} host={host} />

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
