import {
  forwardRef,
  Fragment,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CornerDownLeft, Delete, RefreshCw, RotateCcw } from 'lucide-react';
import MobileKeyInput from '@/MobileKeyInput';
import { isStep } from '@/ladder';
import { findGridPath, solveGrid, gridNeighbors } from '@/solvers';
import type { Mode } from '@/storage';
import { colorWords, type ColorWords, type Palette } from '@/theme';

export type LearnModeHandle = { pressKey: (k: string) => void };

// demos register a key handler so both the physical keyboard and the
// on-screen keyboard can drive them
type RegisterKeys = (fn: ((k: string) => void) | null) => void;

function useDemoKeys(register: RegisterKeys, handle: (k: string) => void) {
  useEffect(() => {
    register(handle);
  });
  useEffect(() => () => register(null), [register]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Enter') handle('enter');
      else if (e.key === 'Backspace') handle('backspace');
      else if (/^[a-zA-Z]$/.test(e.key)) handle(e.key.toLowerCase());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
}

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-xs font-semibold text-accent uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Rules({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm text-slate-300 list-disc list-outside pl-4 marker:text-slate-600 text-left max-w-lg mx-auto">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function useFlash(): [{ text: string; good: boolean } | null, (t: string, good?: boolean) => void] {
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = (text: string, good = false) => {
    setFlash({ text, good });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 1800);
  };
  return [flash, show];
}

function FlashLine({ flash }: { flash: { text: string; good: boolean } | null }) {
  return (
    <div className="h-6 mt-3">
      {flash && (
        <p className={`text-sm font-medium ${flash.good ? 'text-emerald-300' : 'text-amber-300'}`}>
          {flash.text}
        </p>
      )}
    </div>
  );
}

function DemoButton({
  onClick,
  children,
  ariaLabel,
}: {
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
    >
      {children}
    </button>
  );
}

function FoundChips({ words, strong }: { words: string[]; strong?: (w: string) => boolean }) {
  if (!words.length) return null;
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-1.5 max-w-md mx-auto">
      {words.map((w) => (
        <span
          key={w}
          className={`px-2.5 py-1 rounded-lg border text-sm tracking-wide
            ${strong?.(w)
              ? 'bg-emerald-400/25 border-emerald-300 text-emerald-100 font-semibold'
              : 'bg-emerald-400/10 border-emerald-400/30 text-emerald-200'}`}
        >
          {w}
        </span>
      ))}
    </div>
  );
}

const LOADING_NOTE = 'Dictionary still loading…';

type LetterState = 'correct' | 'present' | 'absent';

function scoreGuess(secret: string, guess: string): LetterState[] {
  const n = secret.length;
  const result: LetterState[] = Array(n).fill('absent');
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    if (guess[i] === secret[i]) result[i] = 'correct';
    else counts[secret[i]] = (counts[secret[i]] ?? 0) + 1;
  }
  for (let i = 0; i < n; i++) {
    if (result[i] !== 'correct' && (counts[guess[i]] ?? 0) > 0) {
      result[i] = 'present';
      counts[guess[i]]--;
    }
  }
  return result;
}

const TILE_TONES: Record<LetterState | 'empty' | 'pending', string> = {
  correct: 'bg-emerald-500/80 border-emerald-400 text-white',
  present: 'bg-amber-400/80 border-amber-300 text-ink',
  absent: 'bg-white/[0.04] border-white/45 text-slate-500',
  pending: 'bg-white/5 border-white/30 text-white',
  empty: 'bg-white/[0.02] border-white/55 text-transparent',
};

// pending rows show what's being typed, uncolored until it's submitted
function GuessRow({
  word,
  secret,
  pending,
}: {
  word?: string;
  secret: string;
  pending?: boolean;
}) {
  const score = word && !pending ? scoreGuess(secret, word) : null;
  return (
    <div className="flex gap-1.5 justify-center">
      {Array.from({ length: secret.length }, (_, i) => {
        const ch = word?.[i];
        return (
          <div
            key={i}
            className={`w-10 h-12 flex items-center justify-center font-bold uppercase rounded-lg border-2 transition-colors text-xl
              ${score ? TILE_TONES[score[i]] : ch ? TILE_TONES.pending : TILE_TONES.empty}`}
          >
            {ch ?? '·'}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guess the Word (pattern)
// ---------------------------------------------------------------------------

const GUESS_SECRET = 'grape';


const guessSteps = (c: ColorWords) => [
  {
    w: 'pearl',
    note: `A is ${c.right} — right letter, right spot. P, E, and R are ${c.wrong}: they’re in the word, but somewhere else. L is dark — not in the word at all.`,
  },
  {
    w: 'drape',
    note: `Every clue gets used: A stays planted in its ${c.right} spot, and the ${c.wrong} letters find new homes — R, P, and E all turn ${c.right}. Only the first letter is still wrong, and now D is out too.`,
  },
  {
    w: 'grape',
    note: 'Solved in three! Each guess narrowed the field until only one word fit.',
  },
];

const GUESS_ROWS = 6;

function LearnGuess({
  dict,
  register,
  colors,
}: {
  dict: Set<string> | null;
  register: RegisterKeys;
  colors: ColorWords;
}) {
  const GUESS_STEPS = useMemo(() => guessSteps(colors), [colors]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [flash, show] = useFlash();

  const won = guesses.includes(GUESS_SECRET);
  const done = won || guesses.length >= GUESS_ROWS;
  // the scripted commentary appears whenever the latest guess is one of the
  // example words — whether you typed it or clicked the example button
  const note = GUESS_STEPS.find((s) => s.w === guesses[guesses.length - 1])?.note ?? null;
  const nextExample = GUESS_STEPS.find((s) => !guesses.includes(s.w));

  function submit() {
    if (done) return;
    if (current.length !== GUESS_SECRET.length) {
      show(`Guesses are ${GUESS_SECRET.length} letters`);
      return;
    }
    if (!dict) {
      show(LOADING_NOTE);
      return;
    }
    if (current !== GUESS_SECRET && !dict.has(current)) {
      show('Not in dictionary');
      return;
    }
    setGuesses((g) => [...g, current]);
    setCurrent('');
    if (current === GUESS_SECRET) show('That’s it — solved! 🎉', true);
  }

  function handleKey(k: string) {
    if (done) return;
    if (k === 'enter') return submit();
    if (k === 'backspace') return setCurrent((c) => c.slice(0, -1));
    if (/^[a-z]$/.test(k)) {
      setCurrent((c) => (c.length < GUESS_SECRET.length ? c + k : c));
    }
  }
  useDemoKeys(register, handleKey);

  return (
    <>
      <Section title="The goal">
        <p className="text-sm text-slate-300 max-w-lg mx-auto">
          Guess the secret word in six tries. Pick any length from 3 to 15 letters — each
          length is its own daily puzzle.
        </p>
      </Section>

      <Section title="The rules">
        <Rules
          items={[
            'Every guess must be a real word of the right length. Type it and press Enter.',
            `After each guess, the tiles color: ${colors.right} is the right letter in the right spot, ${colors.wrong} is a letter that’s in the word but placed wrong, dark means it’s not in the word.`,
            'Duplicate letters color precisely — a repeated letter lights up only as many times as it appears in the answer.',
            'The timer counts your thinking time while the board is on screen, and stops when you finish.',
          ]}
        />
      </Section>

      <Section title="Try it — the answer is GRAPE">
        <p className="text-sm text-slate-400 mb-4">
          We&apos;ve given away this one so you can watch the colors work. Type any
          five-letter word and press Enter — or let the example play itself out.
        </p>
        <div className="relative space-y-1.5 w-fit mx-auto">
          {!done && <MobileKeyInput onKey={handleKey} label="Type a five-letter guess" />}
          {Array.from({ length: GUESS_ROWS }, (_, row) => (
            <GuessRow
              key={row}
              word={guesses[row] ?? (row === guesses.length ? current : undefined)}
              pending={row === guesses.length}
              secret={GUESS_SECRET}
            />
          ))}
        </div>
        <FlashLine flash={flash} />
        <div className="min-h-12 mb-3 max-w-md mx-auto">
          {!flash && note && <p className="text-sm text-slate-400">{note}</p>}
        </div>
        <div className="flex flex-wrap justify-center gap-2.5">
          {!done && nextExample && (
            <DemoButton
              onClick={() => {
                setCurrent('');
                setGuesses((g) => [...g, nextExample.w]);
              }}
            >
              {guesses.length === 0 ? 'Show me a first guess' : 'Show me the next guess'}
            </DemoButton>
          )}
          {(done || guesses.length > 0) && (
            <DemoButton
              onClick={() => {
                setGuesses([]);
                setCurrent('');
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Start over
            </DemoButton>
          )}
        </div>
      </Section>

      <Section title="Daily & practice">
        <Rules
          items={[
            'Daily serves the same word to everyone for each length, once per day, and tracks your win streak.',
            'Practice deals unlimited random words — press New word anytime.',
            'Answers come from the word list one rung below what’s accepted, so the answer is always something you’d recognise while your guesses get the benefit of the doubt.',
            'Stuck? Reveal hands everything the board has taught you to the solver, which lists every word that still fits.',
          ]}
        />
      </Section>

      <Section title="Tips">
        <Rules
          items={[
            'Open with letter-rich words — lots of vowels and common consonants like R, S, T, L, N.',
            'Use the second guess to test new letters rather than reusing grays.',
          ]}
        />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Scramble (descramble)
// ---------------------------------------------------------------------------

const SCRAMBLE_RACK = ['g', 'a', 'r', 'n', 'e', 't', 's'];

function scrambleScore(word: string): number {
  return (word.length === 3 ? 1 : word.length) + (word.length === SCRAMBLE_RACK.length ? 7 : 0);
}

function LearnScramble({ dict, register }: { dict: Set<string> | null; register: RegisterKeys }) {
  const [current, setCurrent] = useState('');
  const [found, setFound] = useState<string[]>([]);
  const [flash, show] = useFlash();

  const score = found.reduce((n, w) => n + scrambleScore(w), 0);

  function handleKey(k: string) {
    if (k === 'enter') return submit();
    if (k === 'backspace') return setCurrent((c) => c.slice(0, -1));
    const inRack = SCRAMBLE_RACK.filter((c) => c === k).length;
    const inCurrent = current.split('').filter((c) => c === k).length;
    if (inRack === 0) return show('Not on the rack');
    if (inCurrent >= inRack) return show('No more of that letter');
    setCurrent((c) => c + k);
  }
  useDemoKeys(register, handleKey);

  // rack letters not yet used by the current entry
  const remaining = useMemo(() => {
    const used: Record<string, number> = {};
    for (const c of current) used[c] = (used[c] ?? 0) + 1;
    return SCRAMBLE_RACK.map((c) => {
      if ((used[c] ?? 0) > 0) {
        used[c]--;
        return { c, spent: true };
      }
      return { c, spent: false };
    });
  }, [current]);

  function submit() {
    const word = current;
    setCurrent('');
    if (word.length < 3) {
      show('Too short — words need 3+ letters');
      return;
    }
    if (found.includes(word)) {
      show('Already found');
      return;
    }
    if (!dict) {
      show(LOADING_NOTE);
      return;
    }
    if (!dict.has(word)) {
      show('Not in dictionary');
      return;
    }
    setFound((f) => [word, ...f]);
    show(
      word.length === SCRAMBLE_RACK.length
        ? `Full rack! +${scrambleScore(word)}`
        : `+${scrambleScore(word)}`,
      true
    );
  }

  return (
    <>
      <Section title="The goal">
        <p className="text-sm text-slate-300 max-w-lg mx-auto">
          A three-minute sprint: find every word you can spell from a seven-letter rack. Each
          rack letter can be used once per word.
        </p>
      </Section>

      <Section title="Scoring">
        <Rules
          items={[
            '3-letter words score 1 point; longer words score their length.',
            'Using the whole rack earns a +7 bonus — and every rack is a shuffled real word, so a full-rack word always exists.',
            'Example: RAT scores 1, ANGST scores 5, and a 7-letter word scores 7 + 7 = 14.',
          ]}
        />
      </Section>

      <Section title="Try it — no clock, just the rack">
        <p className="text-sm text-slate-400 mb-4">
          Tap letters or type to build a word, then press Enter. (Psst: this rack hides more
          than one 7-letter word.)
        </p>
        <div className="relative mb-4 mx-auto max-w-sm h-12 px-4 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden">
          <span className="text-2xl font-bold tracking-[0.2em] uppercase text-white whitespace-nowrap">
            {current}
            <span className="text-accent animate-pulse">|</span>
          </span>
          <MobileKeyInput onKey={handleKey} />
        </div>
        <div className="flex justify-center gap-2">
          {remaining.map(({ c, spent }, i) => (
            <button
              key={i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => !spent && setCurrent((cur) => cur + c)}
              className={`w-10 h-12 rounded-xl border-2 text-xl font-bold uppercase transition-colors
                ${spent
                  ? 'bg-white/[0.02] border-white/5 text-slate-600'
                  : 'bg-amber-400/10 border-amber-400/40 text-amber-200 hover:bg-amber-400/20'}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          <DemoButton onClick={() => setCurrent((c) => c.slice(0, -1))} ariaLabel="Delete letter">
            <Delete className="w-4 h-4" />
          </DemoButton>
          <DemoButton onClick={submit}>
            <CornerDownLeft className="w-4 h-4" />
            Enter
          </DemoButton>
        </div>
        <FlashLine flash={flash} />
        {found.length > 0 && (
          <p className="text-xs text-slate-500">
            {score} point{score === 1 ? '' : 's'} so far
          </p>
        )}
        <FoundChips words={found} strong={(w) => w.length === SCRAMBLE_RACK.length} />
      </Section>

      <Section title="Daily & practice">
        <Rules
          items={[
            'The rack stays face-down until you press Start — then the three-minute clock runs.',
            'Daily gives everyone the same rack; Practice deals unlimited racks (Quit swaps in a fresh rack and clock).',
            'When time’s up, Reveal all in solver shows every word you missed.',
          ]}
        />
      </Section>

      <Section title="Tips">
        <Rules
          items={[
            'Work the suffixes: -s, -ed, -er, and -ing multiply words you’ve already found.',
            'Scan systematically — pick two or three letters and try every arrangement before moving on.',
          ]}
        />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Hive (bee)
// ---------------------------------------------------------------------------

const HIVE_CENTER = 'a';
const HIVE_OUTERS = ['n', 'o', 't', 'b', 'l', 'e'];
const HIVE_POSITIONS: [number, number][] = [
  [50, 12],
  [84, 31],
  [84, 69],
  [50, 88],
  [16, 69],
  [16, 31],
];

function hiveScore(word: string): number {
  const pangram = new Set(word).size === 7;
  return (word.length === 4 ? 1 : word.length) + (pangram ? 7 : 0);
}

function LearnHive({
  dict,
  register,
  colors,
}: {
  dict: Set<string> | null;
  register: RegisterKeys;
  colors: ColorWords;
}) {
  const [current, setCurrent] = useState('');
  const [found, setFound] = useState<string[]>([]);
  const [flash, show] = useFlash();
  const allowed = useMemo(() => new Set([HIVE_CENTER, ...HIVE_OUTERS]), []);

  function handleKey(k: string) {
    if (k === 'enter') return submit();
    if (k === 'backspace') return setCurrent((c) => c.slice(0, -1));
    if (allowed.has(k)) setCurrent((c) => c + k);
  }
  useDemoKeys(register, handleKey);

  function submit() {
    const word = current;
    setCurrent('');
    if (word.length < 4) {
      show('Too short — words need 4+ letters');
      return;
    }
    if (!word.includes(HIVE_CENTER)) {
      show('Missing the center letter');
      return;
    }
    if (found.includes(word)) {
      show('Already found');
      return;
    }
    if (!dict) {
      show(LOADING_NOTE);
      return;
    }
    if (!dict.has(word)) {
      show('Not in word list');
      return;
    }
    setFound((f) => [word, ...f]);
    show(new Set(word).size === 7 ? `Pangram! +${hiveScore(word)} 🎉` : `+${hiveScore(word)}`, true);
  }

  return (
    <>
      <Section title="The goal">
        <p className="text-sm text-slate-300 max-w-lg mx-auto">
          Build words from seven letters. Every word must use the {colors.key} center letter, and
          letters can be reused as often as you like.
        </p>
      </Section>

      <Section title="Scoring & ranks">
        <Rules
          items={[
            'Words are 4+ letters: 4-letter words score 1 point, longer words score their length.',
            'A pangram — one word using all seven letters — earns a +7 bonus.',
            'Your rank climbs with your score, from Beginner through Genius (70% of the possible points) to Queen Bee (every word found).',
          ]}
        />
      </Section>

      <Section title="Try it — a mini hive">
        <p className="text-sm text-slate-400 mb-2">
          Tap letters or type, then Enter. Every word needs the{' '}
          <span className="text-amber-300 font-bold uppercase">{HIVE_CENTER}</span>. One{' '}
          <span className="italic text-slate-300">notable</span> word here uses all seven
          letters…
        </p>
        <div className="relative mb-3 mx-auto max-w-sm h-12 px-4 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden">
          <MobileKeyInput onKey={handleKey} />
          <span className="text-2xl font-bold tracking-[0.2em] uppercase whitespace-nowrap">
            {current.split('').map((c, i) => (
              <span key={i} className={c === HIVE_CENTER ? 'text-amber-300' : 'text-white'}>
                {c}
              </span>
            ))}
            <span className="text-accent animate-pulse">|</span>
          </span>
        </div>
        <div className="relative w-full max-w-[12rem] aspect-square mx-auto">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setCurrent((c) => c + HIVE_CENTER)}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-12 rounded-xl border-2 bg-amber-400/20 border-amber-400 text-amber-200 text-xl font-bold uppercase hover:bg-amber-400/30 transition-colors"
          >
            {HIVE_CENTER}
          </button>
          {HIVE_OUTERS.map((c, i) => (
            <button
              key={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => allowed.has(c) && setCurrent((cur) => cur + c)}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-12 rounded-xl border-2 bg-white/5 border-white/15 text-white text-xl font-bold uppercase hover:bg-white/10 hover:border-white/30 transition-colors"
              style={{ left: `${HIVE_POSITIONS[i][0]}%`, top: `${HIVE_POSITIONS[i][1]}%` }}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5">
          <DemoButton onClick={() => setCurrent((c) => c.slice(0, -1))} ariaLabel="Delete letter">
            <Delete className="w-4 h-4" />
          </DemoButton>
          <DemoButton onClick={submit}>
            <CornerDownLeft className="w-4 h-4" />
            Enter
          </DemoButton>
        </div>
        <FlashLine flash={flash} />
        <FoundChips words={found} strong={(w) => new Set(w).size === 7} />
      </Section>

      <Section title="Daily & practice">
        <Rules
          items={[
            'Daily is our own generated hive — the same one for everyone, seeded from a pangram so one always exists. It is not the NYT’s puzzle.',
            'Practice deals unlimited fresh hives; Shuffle rearranges the outer letters for a new perspective.',
            'Words are checked against the list for the difficulty you’re playing; rejected guesses collect in a list of their own.',
            'Reveal gives up and shows every answer in the solver.',
          ]}
        />
      </Section>

      <Section title="Tips">
        <Rules
          items={[
            'Hunt the pangram early — it’s worth the most, and its letters unlock everything else.',
            'Run prefixes and suffixes past the center letter: re-, un-, -ing, -able.',
          ]}
        />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

const GRID_CELLS = ['c', 'a', 't', 'r', 'e', 's', 'd', 'o', 'g'];
const GRID_COLS = 3;

function gridScore(word: string): number {
  if (word.length <= 4) return 1;
  if (word.length === 5) return 2;
  if (word.length === 6) return 3;
  if (word.length === 7) return 5;
  return 11;
}

function LearnGrid({
  standardWords,
  register,
}: {
  standardWords: string[] | null;
  register: RegisterKeys;
}) {
  const [found, setFound] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [flash, show] = useFlash();
  const [dragPath, setDragPath] = useState<number[]>([]);
  const dragRef = useRef<number[]>([]);
  const setPath = (p: number[]) => {
    dragRef.current = p;
    setDragPath(p);
  };

  const answers = useMemo(
    () => (standardWords ? new Set(solveGrid(standardWords, { cells: GRID_CELLS, cols: GRID_COLS })) : null),
    [standardWords]
  );
  const standardSet = useMemo(
    () => (standardWords ? new Set(standardWords) : null),
    [standardWords]
  );

  function handleKey(k: string) {
    if (k === 'enter') {
      const word = current;
      setCurrent('');
      submitWord(word);
      return;
    }
    if (k === 'backspace') return setCurrent((c) => c.slice(0, -1));
    if (GRID_CELLS.includes(k)) setCurrent((c) => c + k);
  }
  useDemoKeys(register, handleKey);

  // hover / press-hold a found word to trace its path on the board
  const boardRef = useRef<HTMLDivElement>(null);
  const [trace, setTrace] = useState<number[] | null>(null);
  const [tracePts, setTracePts] = useState<{ x: number; y: number }[]>([]);
  useLayoutEffect(() => {
    if (!trace || !boardRef.current) {
      setTracePts([]);
      return;
    }
    const wrap = boardRef.current.getBoundingClientRect();
    setTracePts(
      trace.map((i) => {
        const r = boardRef.current!
          .querySelector(`[data-learn-cell="${i}"]`)!
          .getBoundingClientRect();
        return { x: r.left + r.width / 2 - wrap.left, y: r.top + r.height / 2 - wrap.top };
      })
    );
  }, [trace]);

  function traceHandlers(word: string) {
    const showTrace = () => setTrace(findGridPath(GRID_CELLS, GRID_COLS, word));
    const hide = () => setTrace(null);
    return {
      onMouseEnter: showTrace,
      onMouseLeave: hide,
      onPointerDown: showTrace,
      onPointerUp: hide,
      onPointerCancel: hide,
    };
  }

  function cellAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest('[data-learn-cell]');
    return el ? Number(el.getAttribute('data-learn-cell')) : null;
  }

  function onDown(e: React.PointerEvent) {
    const i = cellAt(e.clientX, e.clientY);
    if (i === null) return;
    e.preventDefault();
    setPath([i]);
  }

  function onMove(e: React.PointerEvent) {
    const prev = dragRef.current;
    if (!prev.length) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null) return;
    const last = prev[prev.length - 1];
    if (i === last) return;
    if (prev.length >= 2 && i === prev[prev.length - 2]) {
      setPath(prev.slice(0, -1));
      return;
    }
    if (prev.includes(i)) return;
    if (!gridNeighbors(GRID_COLS, GRID_COLS)[last].includes(i)) return;
    setPath([...prev, i]);
  }

  function submitWord(word: string) {
    if (word.length < 3) {
      if (word.length > 0) show('Too short — words need 3+ letters');
      return;
    }
    if (found.includes(word)) {
      show('Already found');
      return;
    }
    if (!answers) {
      show(LOADING_NOTE);
      return;
    }
    if (!answers.has(word)) {
      // a real word that can't be traced is different from a non-word
      if (standardSet?.has(word)) show('No path for that word on this grid');
      else show('Not in dictionary');
      return;
    }
    setFound((f) => [word, ...f]);
    show(`+${gridScore(word)}`, true);
  }

  function endDrag() {
    const path = dragRef.current;
    if (!path.length) return;
    setPath([]);
    if (path.length === 1) return; // a stray tap
    submitWord(path.map((i) => GRID_CELLS[i]).join(''));
  }

  useEffect(() => {
    const up = () => endDrag();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });

  return (
    <>
      <Section title="The goal">
        <p className="text-sm text-slate-300 max-w-lg mx-auto">
          A Boggle-style three-minute sprint: chain adjacent letters — including diagonals —
          into as many words as you can, using each cell at most once per word.
        </p>
      </Section>

      <Section title="Scoring">
        <Rules
          items={[
            '3–4 letter words score 1 point, 5 letters scores 2, 6 letters 3, 7 letters 5, and 8+ letters a whopping 11.',
            'Long words are worth disproportionately more — one 8-letter find beats eleven 3-letter words.',
          ]}
        />
      </Section>

      <Section title="Try it — a mini grid">
        <p className="text-sm text-slate-400 mb-4">
          Drag across the cells to trace a word (release to submit), or just type and press
          Enter. Diagonals count! Try{' '}
          <span className="uppercase font-semibold text-slate-300">cat</span>,{' '}
          <span className="uppercase font-semibold text-slate-300">dog</span>… then hunt for
          longer paths.
        </p>
        <div className="relative mb-4 mx-auto max-w-sm h-12 px-4 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden">
          <MobileKeyInput onKey={handleKey} />
          <span className="text-2xl font-bold tracking-[0.2em] uppercase whitespace-nowrap">
            {dragPath.length ? (
              <span className="text-emerald-300">
                {dragPath.map((i) => GRID_CELLS[i]).join('')}
              </span>
            ) : (
              <span className="text-white">{current}</span>
            )}
            <span className="text-accent animate-pulse">|</span>
          </span>
        </div>
        <div ref={boardRef} className="relative w-fit mx-auto">
          <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            className="grid grid-cols-3 gap-2 touch-none select-none"
          >
            {GRID_CELLS.map((c, i) => (
              <button
                key={i}
                data-learn-cell={i}
                className={`w-12 h-14 rounded-xl border-2 text-2xl font-bold uppercase transition-colors
                  ${trace?.includes(i)
                    ? 'bg-sky-400/30 border-sky-300 text-white'
                    : dragPath.includes(i)
                      ? 'bg-emerald-400/30 border-emerald-300 text-white'
                      : 'bg-amber-400/10 border-amber-400 text-amber-200 hover:bg-amber-400/20'}`}
              >
                {c}
              </button>
            ))}
          </div>
          {tracePts.length > 1 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <polyline
                points={tracePts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="rgb(var(--trace) / 0.9)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx={tracePts[0].x} cy={tracePts[0].y} r="6" fill="rgb(var(--trace))" />
            </svg>
          )}
        </div>
        <FlashLine flash={flash} />
        {found.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5 max-w-md mx-auto">
            {found.map((w) => (
              <span
                key={w}
                {...traceHandlers(w)}
                title="Hover to trace on the board"
                className={`px-2.5 py-1 rounded-lg border text-sm tracking-wide cursor-pointer select-none
                  ${w.length >= 5
                    ? 'bg-emerald-400/25 border-emerald-300 text-emerald-100 font-semibold'
                    : 'bg-emerald-400/10 border-emerald-400/30 text-emerald-200'}`}
              >
                {w}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Daily & practice">
        <Rules
          items={[
            'Cells stay face-down until you press Start — then the clock runs.',
            'You can also type words and press Enter; typed words only count if a valid path exists on the grid.',
            'Daily rolls a 4×4 from the classic sixteen dice; Practice offers 3×3, 4×4, and 5×5 (Big Boggle dice).',
            'After time’s up, the Missed words list opens — hover any word (or press-hold on touch) to see its path traced on the board.',
          ]}
        />
      </Section>

      <Section title="Tips">
        <Rules
          items={[
            'Found a word? Retrace it with -s, -ed, or -ing if the letters are there.',
            'Corners touch three to five neighbors, centers touch eight — words through the middle have more ways to continue.',
          ]}
        />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Boxed
// ---------------------------------------------------------------------------

// twelve distinct letters from the chain MAGNET -> TROPICAL (both Standard-
// dictionary words), sides assigned so no consecutive pair shares one
const BOX_SIDES = ['ant', 'ger', 'oim', 'pcl'];
const BOX_TONES = [
  'bg-sky-400/10 border-sky-400/40 text-sky-200 hover:bg-sky-400/20',
  'bg-violet-400/10 border-violet-400/40 text-violet-200 hover:bg-violet-400/20',
  'bg-rose-400/10 border-rose-400/40 text-rose-200 hover:bg-rose-400/20',
  'bg-amber-400/10 border-amber-400/40 text-amber-200 hover:bg-amber-400/20',
];
const BOX_TONES_USED = [
  'bg-sky-400/40 border-sky-300 text-white',
  'bg-violet-400/40 border-violet-300 text-white',
  'bg-rose-400/40 border-rose-300 text-white',
  'bg-amber-400/40 border-amber-300 text-white',
];
const BOX_POSITIONS: [number, number][][] = [
  [[24, 6], [50, 6], [76, 6]],
  [[94, 24], [94, 50], [94, 76]],
  [[24, 94], [50, 94], [76, 94]],
  [[6, 24], [6, 50], [6, 76]],
];

// letter -> [x, y] position around the square, for the hover chord trace
const BOX_LETTER_POS = new Map<string, [number, number]>();
BOX_SIDES.forEach((side, s) => {
  side.split('').forEach((c, j) => BOX_LETTER_POS.set(c, BOX_POSITIONS[s][j]));
});

// ---------------------------------------------------------------------------
// Word squares
// ---------------------------------------------------------------------------

// One board, small and mostly filled: the point is to feel the constraint bite
// — a letter you place has to satisfy a row and a column at once — not to sit
// through a whole puzzle before reaching Play.
// this/hide/area/neat reading down as than/hire/idea/seat — eight everyday
// words. Worth reading both directions before picking one: the first square I
// used here spelled something I wouldn't put in a tutorial.
const SQ_ANSWER = ['this', 'hide', 'area', 'neat'];
const SQ_GIVEN = [0, 3, 5, 6, 9, 11, 12, 15];

function LearnSquares({ dict, register }: { dict: Set<string> | null; register: RegisterKeys }) {
  const n = 4;
  const cells = useMemo(
    () => SQ_ANSWER.join('').split('').map((c, i) => (SQ_GIVEN.includes(i) ? c : null)),
    []
  );
  const [entries, setEntries] = useState<string[]>(() => Array(n * n).fill(''));
  const [cursor, setCursor] = useState(() => cells.findIndex((c) => c === null));
  const [flash, show] = useFlash();

  const at = (i: number) => cells[i] ?? entries[i] ?? '';
  const rows = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => at(r * n + c)).join('')
  );
  const cols = Array.from({ length: n }, (_, c) =>
    Array.from({ length: n }, (_, r) => at(r * n + c)).join('')
  );
  const ok = (w: string) => w.length === n && !!dict?.has(w);
  const solved = rows.every(ok) && cols.every(ok);

  function step(from: number, dir: 1 | -1) {
    for (let k = 1; k <= n * n; k++) {
      const i = (from + dir * k + n * n * 2) % (n * n);
      if (cells[i] === null) return i;
    }
    return from;
  }

  function handleKey(k: string) {
    if (solved) return;
    if (k === 'backspace') {
      setEntries((e) => e.map((v, i) => (i === cursor ? '' : v)));
      return;
    }
    if (!/^[a-z]$/.test(k)) return;
    setEntries((e) => e.map((v, i) => (i === cursor ? k : v)));
    setCursor((c) => step(c, 1));
  }
  useDemoKeys(register, handleKey);

  useEffect(() => {
    if (solved) show('Every row and every column — a word square! 🎉', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved]);

  const tone = (w: string) =>
    !w || w.length < n ? 'bg-white/25' : ok(w) ? 'bg-success' : 'bg-danger';

  return (
    <>
      <Section title="The goal">
        <p className="text-sm text-slate-400 mb-4">
          Fill the grid so that <strong className="text-slate-200">every row and every
          column</strong> spells a word. Some letters are given; the rest are yours.
        </p>
        <Rules
          items={[
            'A four-letter grid holds eight words — four across and four down',
            'Every letter you place has to work twice, once each way',
            'There is exactly one way to finish it',
          ]}
        />
      </Section>

      {/* The key overlay rides the focused square rather than sitting in a box
          of its own: the square you're typing into is the thing you tap. */}
      <Section title="Try it — half the grid is yours">
        <p className="text-sm text-slate-400 mb-4">
          Eight letters are given and eight are blank. Tap a square and type — the
          bar beside each line lights up once that line is a word.
        </p>

        <div className="w-fit mx-auto">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, auto) 0.375rem` }}>
            {cols.map((w, c) => (
              <div
                key={`c${c}`}
                aria-hidden
                style={{ gridRow: 1, gridColumn: c + 1 }}
                className={`h-1.5 rounded-full ${tone(w)}`}
              />
            ))}
            {Array.from({ length: n }, (_, r) => (
              <Fragment key={r}>
                {Array.from({ length: n }, (_, c) => {
                  const i = r * n + c;
                  const given = cells[i] !== null;
                  return (
                    <div
                      key={i}
                      className="relative"
                      style={{ gridRow: r + 2, gridColumn: c + 1 }}
                    >
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => !given && setCursor(i)}
                      // Same shape the real board uses. An empty cell has no
                      // text to be named by, so without this a screen reader
                      // reads the demo grid as eight buttons called "button".
                      aria-label={`row ${r + 1} column ${c + 1}${
                        given ? `, ${at(i)}, given` : at(i) ? `, ${at(i)}` : ', empty'
                      }`}
                      className={`w-11 h-12 rounded-xl border-2 text-xl font-bold uppercase transition-colors
                        ${given
                          ? 'bg-white/20 border-white/30 text-white'
                          : i === cursor && !solved
                            ? 'bg-amber-400/15 border-amber-400 text-accent'
                            : 'bg-transparent border-white/25 text-accent hover:bg-white/10'}`}
                    >
                      {at(i)}
                    </button>
                    </div>
                  );
                })}
                <div
                  aria-hidden
                  style={{ gridRow: r + 2, gridColumn: n + 1 }}
                  className={`w-1.5 h-full rounded-full ${tone(rows[r])}`}
                />
              </Fragment>
            ))}

            {/* moved, not remounted — see the board's copy of this */}
            {!solved && (
              <div
                className="relative"
                style={{ gridRow: Math.floor(cursor / n) + 2, gridColumn: (cursor % n) + 1 }}
              >
                <MobileKeyInput onKey={handleKey} label="Type a letter" />
              </div>
            )}
          </div>
        </div>

        {flash && (
          <p className={`mt-3 text-sm font-semibold ${flash.good ? 'text-emerald-300' : 'text-danger'}`}>
            {flash.text}
          </p>
        )}
      </Section>
    </>
  );
}

function LearnBoxed({ dict, register }: { dict: Set<string> | null; register: RegisterKeys }) {
  const [chain, setChain] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [trace, setTrace] = useState<string | null>(null);
  const [flash, show] = useFlash();

  const sideOf = useMemo(() => {
    const m = new Map<string, number>();
    BOX_SIDES.forEach((side, i) => {
      for (const c of side) m.set(c, i);
    });
    return m;
  }, []);

  const covered = useMemo(() => new Set(chain.join('')), [chain]);
  const solved = covered.size === 12;

  function handleKey(k: string) {
    if (k === 'enter') return submit();
    if (k === 'backspace') return backspace();
    if (sideOf.has(k)) tap(k);
  }
  useDemoKeys(register, handleKey);

  function traceHandlers(word: string) {
    const showTrace = () => setTrace(word);
    const hide = () => setTrace(null);
    return {
      onMouseEnter: showTrace,
      onMouseLeave: hide,
      onPointerDown: showTrace,
      onPointerUp: hide,
      onPointerCancel: hide,
    };
  }

  function tap(c: string) {
    if (solved) return;
    const last = current.slice(-1);
    if (last && sideOf.get(last) === sideOf.get(c)) {
      show('Same side — the next letter must come from a different side');
      return;
    }
    setCurrent((cur) => cur + c);
  }

  function submit() {
    if (solved) return;
    const word = current;
    if (word.length < 3) {
      show('Too short — words need 3+ letters');
      return;
    }
    if (chain.includes(word)) {
      show('Already played');
      return;
    }
    if (!dict) {
      show(LOADING_NOTE);
      return;
    }
    if (!dict.has(word)) {
      show('Not in dictionary');
      return;
    }
    const next = [...chain, word];
    setChain(next);
    const nextCovered = new Set(next.join(''));
    if (nextCovered.size === 12) {
      setCurrent('');
      show(`Solved in ${next.length} word${next.length === 1 ? '' : 's'}! 🎉`, true);
    } else {
      setCurrent(word.slice(-1));
      show(`+${new Set(word).size} letters`, true);
    }
  }

  function backspace() {
    if (current.length > (chain.length ? 1 : 0)) {
      setCurrent((c) => c.slice(0, -1));
    } else if (chain.length) {
      const prev = chain[chain.length - 1];
      setChain((ch) => ch.slice(0, -1));
      setCurrent(prev);
    }
  }

  return (
    <>
      <Section title="The goal">
        <p className="text-sm text-slate-300 max-w-lg mx-auto">
          Twelve letters sit on the four sides of a square. Chain words until every letter is
          used — in as few words as possible.
        </p>
      </Section>

      <Section title="The rules">
        <Rules
          items={[
            'Words are 3+ letters, and letters may be reused.',
            'Consecutive letters can never come from the same side — every step must cross the box.',
            'Each new word must start with the last letter of the previous word. That’s the chain.',
            'Every board here is solvable in two words.',
          ]}
        />
      </Section>

      <Section title="Try it — a mini box">
        <p className="text-sm text-slate-400 mb-2">
          Tap letters or type; notice how same-side letters refuse to connect. Cover all
          twelve. (Stuck? MAGNET → TROPICAL does it in two.)
        </p>
        <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5 text-sm min-h-5">
          {chain.map((w, i) => (
            <span key={i} className="text-emerald-300">
              <span
                {...traceHandlers(w)}
                title="Hover to trace on the box"
                className="cursor-pointer select-none hover:text-emerald-200 underline decoration-dotted decoration-emerald-500/40 underline-offset-2"
              >
                {w}
              </span>
              {(!solved || i < chain.length - 1) && <span className="text-slate-600"> →</span>}
            </span>
          ))}
        </div>
        {!solved && (
          <div className="relative mb-4 mx-auto max-w-sm h-11 px-4 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden">
            <span className="text-lg font-bold tracking-[0.15em] uppercase text-white whitespace-nowrap">
              {current}
              <span className="text-accent animate-pulse">|</span>
            </span>
            <MobileKeyInput onKey={handleKey} />
          </div>
        )}
        <div className="relative w-full max-w-[16rem] aspect-square mx-auto my-5">
          <div className="absolute inset-10 rounded-xl border-2 border-white/15 bg-white/[0.02]" />
          {(() => {
            // hovered chain word takes priority; the live entry draws dashed
            const word = trace ?? (current.length >= 2 ? current : null);
            if (!word) return null;
            const pts = word
              .split('')
              .map((c) => BOX_LETTER_POS.get(c))
              .filter((p): p is [number, number] => !!p);
            if (pts.length < 2) return null;
            const live = !trace;
            return (
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <polyline
                  points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="none"
                  stroke={live ? 'rgb(var(--span) / 0.65)' : 'rgb(var(--trace) / 0.9)'}
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={live ? '6 5' : undefined}
                />
                <circle
                  cx={pts[0][0]}
                  cy={pts[0][1]}
                  r="2"
                  fill={live ? 'rgb(var(--span))' : 'rgb(var(--trace))'}
                />
              </svg>
            );
          })()}
          {BOX_SIDES.map((side, s) =>
            side.split('').map((c, j) => {
              const [x, y] = BOX_POSITIONS[s][j];
              return (
                <button
                  key={c}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => tap(c)}
                  disabled={solved}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-11 rounded-lg border-2 text-lg font-bold uppercase transition-colors
                    ${covered.has(c) ? BOX_TONES_USED[s] : BOX_TONES[s]}`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  {c}
                </button>
              );
            })
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <DemoButton onClick={backspace} ariaLabel="Delete letter">
            <Delete className="w-4 h-4" />
          </DemoButton>
          <DemoButton
            onClick={() => {
              setChain([]);
              setCurrent('');
              setTrace(null);
            }}
            ariaLabel="Restart"
          >
            <RotateCcw className="w-4 h-4" />
          </DemoButton>
          {!solved && (
            <DemoButton onClick={submit}>
              <CornerDownLeft className="w-4 h-4" />
              Enter
            </DemoButton>
          )}
        </div>
        <FlashLine flash={flash} />
        <p className="text-xs text-slate-500">{covered.size} / 12 letters covered</p>
      </Section>

      <Section title="Daily & practice">
        <Rules
          items={[
            'Daily is our own generated box, built from two chainable words so a two-word solution always exists; Practice deals unlimited boxes.',
            'Backspace un-commits the previous word so you can rework the chain; Restart clears it.',
            'Reveal gives up and shows the solutions in the solver.',
          ]}
        />
      </Section>

      <Section title="Tips">
        <Rules
          items={[
            'Plan the bridge: pick a first word whose last letter starts plenty of words.',
            'Target the rare letters early — the common ones tend to get covered along the way.',
          ]}
        />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Weave
// ---------------------------------------------------------------------------

// hand-crafted 4x4 demo: theme "Pets", spangram GOLDFISH snaking rows 1-2,
// CATS and DOGS tiling the rest
const WEAVE_ROWS = ['gold', 'hsif', 'cats', 'dogs'];
const WEAVE_COLS = 4;
const WEAVE_CELLS = WEAVE_ROWS.join('').split('');
const WEAVE_ANSWERS: { w: string; path: number[]; span: boolean }[] = [
  { w: 'goldfish', path: [0, 1, 2, 3, 7, 6, 5, 4], span: true },
  { w: 'cats', path: [8, 9, 10, 11], span: false },
  { w: 'dogs', path: [12, 13, 14, 15], span: false },
];

function sameCells(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function LearnWeave({ dict, colors }: { dict: Set<string> | null; colors: ColorWords }) {
  const [found, setFound] = useState<string[]>([]);
  const [flash, show] = useFlash();
  const [dragPath, setDragPath] = useState<number[]>([]);
  const dragRef = useRef<number[]>([]);
  const setPath = (p: number[]) => {
    dragRef.current = p;
    setDragPath(p);
  };

  const locked = useMemo(() => {
    const m = new Map<number, 'theme' | 'span'>();
    for (const a of WEAVE_ANSWERS) {
      if (found.includes(a.w)) for (const i of a.path) m.set(i, a.span ? 'span' : 'theme');
    }
    return m;
  }, [found]);
  const complete = found.length === WEAVE_ANSWERS.length;

  // on completion, draw every word's path — just like the real game
  const boardRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ pts: { x: number; y: number }[]; span: boolean }[]>([]);
  useLayoutEffect(() => {
    if (!complete || !boardRef.current) {
      setLines([]);
      return;
    }
    const wrap = boardRef.current.getBoundingClientRect();
    const measure = (path: number[]) =>
      path.map((i) => {
        const r = boardRef.current!
          .querySelector(`[data-learn-wcell="${i}"]`)!
          .getBoundingClientRect();
        return { x: r.left + r.width / 2 - wrap.left, y: r.top + r.height / 2 - wrap.top };
      });
    setLines(WEAVE_ANSWERS.map((a) => ({ pts: measure(a.path), span: a.span })));
  }, [complete]);

  function cellAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest('[data-learn-wcell]');
    return el ? Number(el.getAttribute('data-learn-wcell')) : null;
  }

  function onDown(e: React.PointerEvent) {
    if (complete) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || locked.has(i)) return;
    e.preventDefault();
    setPath([i]);
  }

  function onMove(e: React.PointerEvent) {
    const prev = dragRef.current;
    if (!prev.length) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || locked.has(i)) return;
    const last = prev[prev.length - 1];
    if (i === last) return;
    if (prev.length >= 2 && i === prev[prev.length - 2]) {
      setPath(prev.slice(0, -1));
      return;
    }
    if (prev.includes(i)) return;
    if (!gridNeighbors(WEAVE_COLS, WEAVE_COLS)[last].includes(i)) return;
    setPath([...prev, i]);
  }

  function endDrag() {
    const path = dragRef.current;
    if (!path.length) return;
    setPath([]);
    if (path.length < 3) return;
    const word = path.map((i) => WEAVE_CELLS[i]).join('');
    if (found.includes(word)) {
      show('Already found');
      return;
    }
    const answer = WEAVE_ANSWERS.find((a) => a.w === word && sameCells(path, a.path));
    if (answer) {
      setFound((f) => [...f, word]);
      show(answer.span ? 'Spangram! 🎉' : 'Theme word!', true);
      return;
    }
    if (word.length >= 4 && dict?.has(word)) {
      show('Nice word — in the real game, three of these earn a hint', true);
      return;
    }
    show('Not a theme word');
  }

  useEffect(() => {
    const up = () => endDrag();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });

  return (
    <>
      <Section title="The goal">
        <p className="text-sm text-slate-300 max-w-lg mx-auto">
          A theme hunt: the themed words tile the whole board, and every letter belongs to
          exactly one of them. Find them all.
        </p>
      </Section>

      <Section title="The rules">
        <Rules
          items={[
            'Read the theme clue, then drag through adjacent letters — any direction, diagonals included — and release to submit.',
            `Theme words lock in ${colors.theme}. The spangram — a word that sums up the theme and spans the board edge to edge — locks in ${colors.span}.`,
            'A theme word only counts on its own cells; the same word traced elsewhere is just a regular word.',
            'Other real words (4+ letters) aren’t wasted: every three you find banks a hint, which outlines an unfound theme word.',
            'Reveal gives up and shows the full solution; either way, completion draws every word’s path.',
          ]}
        />
      </Section>

      <Section title="Try it — a mini board">
        <p className="text-sm text-slate-400 mb-1">
          <span className="text-amber-300 font-semibold">Theme: Pets.</span> Two theme words
          and a spangram tile these sixteen letters. The spangram touches both the left and
          right edges…
        </p>
        <p className="text-xs text-slate-500 mb-4">
          {found.length} / {WEAVE_ANSWERS.length} found
        </p>
        <div ref={boardRef} className="relative w-fit mx-auto">
          <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            className="grid grid-cols-4 gap-1.5 touch-none select-none"
          >
            {WEAVE_CELLS.map((c, i) => {
              const lock = locked.get(i);
              return (
                <button
                  key={i}
                  data-learn-wcell={i}
                  disabled={complete}
                  className={`w-11 h-12 rounded-lg border-2 text-xl font-bold uppercase transition-colors
                    ${lock === 'span'
                      ? 'bg-amber-400/50 border-amber-300 text-white'
                      : lock === 'theme'
                        ? 'bg-sky-400/40 border-sky-300 text-white'
                        : dragPath.includes(i)
                          ? 'bg-emerald-400/30 border-emerald-300 text-white'
                          : 'bg-white/5 border-white/15 text-white hover:bg-white/10'}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
          {lines.length > 0 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {lines.map((line, i) => (
                <polyline
                  key={i}
                  points={line.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={line.span ? 'rgb(var(--span) / 0.85)' : 'rgb(var(--trace) / 0.7)'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
          )}
        </div>
        <FlashLine flash={flash} />
        {complete && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-emerald-300">
              That’s the whole board — every letter used exactly once 🎉
            </p>
            <DemoButton
              onClick={() => {
                setFound([]);
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Reset the demo
            </DemoButton>
          </div>
        )}
      </Section>

      <Section title="Daily & practice">
        <Rules
          items={[
            'Daily is a 6×8 board, the same for everyone; Practice draws from a rotating pool in 6×8 or the harder 8×10.',
            'Puzzles are our own, generated from curated themes — never the NYT’s.',
          ]}
        />
      </Section>

      <Section title="Tips">
        <Rules
          items={[
            'Guess the theme first — knowing what kind of words to expect is half the puzzle.',
            'The spangram usually cuts through the middle; finding it splits the rest into manageable regions.',
            'Stuck? Trace any common words you see — three of them buy a hint.',
          ]}
        />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// cryptogram
// ---------------------------------------------------------------------------

// Taught with a Caesar shift rather than the real thing: every letter moves the
// same distance, so the whole mapping falls out of one deduction. That teaches
// the mechanic — letters stand for letters, consistently — in about fifteen
// seconds, and the daily's full substitution stops looking impenetrable.
const LEARN_PLAIN = 'time flies';
const LEARN_SHIFT = 5;
const shiftLetter = (c: string) =>
  /[a-z]/.test(c)
    ? String.fromCharCode(((c.charCodeAt(0) - 97 + LEARN_SHIFT) % 26) + 97).toUpperCase()
    : c;

// The letter the demo hands over, the way a daily does: the commonest one in
// the passage, which is the same opening a frequency table would suggest.
const LEARN_GIVEN = 'e';

function LearnCryptogram({ register }: { register: RegisterKeys }) {
  const cipher = useMemo(() => Array.from(LEARN_PLAIN, shiftLetter).join(''), []);
  const given = useMemo(() => shiftLetter(LEARN_GIVEN), []);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string>(() =>
    Array.from(cipher).find((c) => /[A-Z]/.test(c) && c !== shiftLetter(LEARN_GIVEN)) ?? cipher[0]
  );

  // the given letter is part of the reading, and can't be changed
  const solution = useMemo(
    () => ({ ...mapping, [given]: LEARN_GIVEN }),
    [mapping, given]
  );
  const solved =
    Array.from(cipher, (c) => (/[A-Z]/.test(c) ? solution[c] ?? ' ' : c)).join('') === LEARN_PLAIN;

  // the distinct cipher letters, in the order they appear — what the cursor
  // walks, since a letter solved once is solved everywhere
  const letters = useMemo(
    () => [...new Set(cipher.replace(/[^A-Z]/g, ''))].filter((l) => l !== given),
    [cipher, given]
  );

  const press = useCallback(
    (k: string) => {
      if (!/^[a-z]$/.test(k) || !selected || selected === given) return;
      // the given letter is not ours to take back, so typing its letter
      // elsewhere is simply refused rather than quietly stealing it
      if (k === LEARN_GIVEN) return;
      const next = { ...mapping };
      for (const [cl, pl] of Object.entries(next)) if (pl === k) delete next[cl];
      next[selected] = k;
      setMapping(next);
      // Move on, or every keystroke lands on the same letter and quietly
      // replaces the last — which reads as typing doing nothing at all.
      const from = letters.indexOf(selected);
      const after =
        letters.slice(from + 1).find((l) => next[l] === undefined) ??
        letters.find((l) => next[l] === undefined);
      if (after) setSelected(after);
    },
    [selected, mapping, letters, given]
  );
  // the shared hook, not a bare register(): it also puts the document keydown
  // listener in place, which is the only thing a physical keyboard reaches
  useDemoKeys(register, press);

  return (
    <div className="max-w-lg mx-auto">
      <p className="text-sm text-slate-300 mb-3">
        Every letter has been swapped for another one, the same way all the way
        through. Tap a letter, then type what you think it stands for.
      </p>
      {/* A first cryptogram with no way in is a wall, so one letter is given —
          the same head start an easy daily hands over, and an example of the
          thing being asked for. */}
      <p className="text-sm text-slate-400 mb-2">
        One letter is filled in already. The daily does the same: easy gives you its
        three commonest letters, hard gives one, extreme gives none.
      </p>
      <p className="text-sm text-slate-400 mb-4">
        Picking a mark lights up every other copy of it, so you don&apos;t have to hunt
        for the repeats. If you would rather do that yourself, it turns off under
        Settings.
      </p>

      <div className="flex flex-wrap justify-center gap-x-3 gap-y-3 mb-4">
        {cipher.split(' ').map((word, wi, all) => (
          <span key={wi} className="inline-flex">
            {Array.from(word, (ch, ci) => {
              const i = all.slice(0, wi).reduce((n, w) => n + w.length + 1, 0) + ci;
              const isGiven = ch === given;
              const shown = solution[ch];
              return (
                <button
                  key={i}
                  onClick={() => !isGiven && setSelected(ch)}
                  aria-label={`cipher letter ${ch}${shown ? `, solved as ${shown}` : ''}${
                    isGiven ? ', given' : ''
                  }`}
                  className={`inline-flex flex-col items-center w-6 rounded-md ${
                    isGiven ? '' : ch === selected ? 'bg-amber-400/20' : 'hover:bg-white/10'
                  }`}
                >
                  <span
                    className={`h-7 flex items-center justify-center w-5 text-lg font-bold uppercase border-b-2 ${
                      isGiven
                        ? 'text-white border-white/50'
                        : shown
                          ? 'text-accent border-white/40'
                          : 'text-transparent border-white/25'
                    }`}
                  >
                    {shown ?? ' '}
                  </span>
                  <span className="h-4 text-[0.625rem] font-semibold tracking-wider text-slate-500">
                    {ch}
                  </span>
                </button>
              );
            })}
          </span>
        ))}
      </div>

      <p className="text-sm text-slate-400" aria-live="polite">
        {solved
          ? 'That’s it. Every letter here moved five places along the alphabet — the daily uses a jumbled alphabet instead, so you work it out from the shape of the words.'
          : 'A two-letter word, a repeated letter, an apostrophe: those are the ways in.'}
      </p>

      <div className="mt-8 text-left">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Ways in
        </h3>
        <p className="text-sm text-slate-300 mb-6">
          A one-letter word is <span className="text-accent">a</span> or{' '}
          <span className="text-accent">I</span>. The letter after an apostrophe is almost
          always <span className="text-accent">s</span> or <span className="text-accent">t</span>.
          The commonest three-letter word is <span className="text-accent">the</span>, and the
          commonest letter is <span className="text-accent">e</span>. Everything else follows
          from those.
        </p>

        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          The ciphers
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Every board says which one it is, because knowing changes how you start. They all
          share a rule: one letter always stands for the same thing, the whole way through.
        </p>

        {/* Written out rather than generated from the pool: the generator is a
            build script and never reaches the browser. If a cipher joins or
            leaves VARIANTS in scripts/cryptogram.mjs, this list is what has to
            be brought back into step. */}
        <dl className="space-y-3">
          {CIPHER_GUIDE.map(({ tier, name, what }) => (
            <div key={name} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
              <dt className="flex items-baseline gap-2 text-sm font-semibold text-white">
                {name}
                <span className="text-[0.625rem] font-normal uppercase tracking-wider text-slate-500">
                  {tier}
                </span>
              </dt>
              <dd className="text-sm text-slate-400">{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

const CIPHER_GUIDE = [
  {
    name: 'Shift',
    tier: 'easy',
    what: 'Every letter moves the same distance along the alphabet. Work out one and you have all twenty-six.',
  },
  {
    name: 'Affine',
    tier: 'easy',
    what: 'The alphabet is stepped through at a fixed stride. Structured like a shift, but one letter is not enough to unlock it — two are.',
  },
  {
    name: 'Numbers',
    tier: 'easy',
    what: 'A shift wearing digits instead of letters. Nothing about the puzzle changes, but nothing on the board looks like the answer either.',
  },
  {
    name: 'Keyword',
    tier: 'hard',
    what: 'The cipher alphabet starts jumbled and then runs alphabetically to the end. Once you have a few letters, the tail tends to fall out in order.',
  },
  {
    name: 'Mixed',
    tier: 'hard',
    what: 'A fully shuffled alphabet, with no pattern to find. The plain cryptogram: only word shapes and letter frequencies will do it.',
  },
  {
    name: 'Symbols',
    tier: 'hard',
    what: 'A mixed alphabet drawn as shapes. Exactly as hard as Mixed, and easier to think in — no symbol pretends to be a letter it is not.',
  },
  {
    name: 'Mixed, grouped',
    tier: 'extreme',
    what: 'A mixed alphabet with the word divisions taken away, printed in blocks of five. You have to find where the words are before you can solve them.',
  },
  {
    name: 'Keyword, grouped',
    tier: 'extreme',
    what: 'The same, but the alphabet keeps its ordered tail — so the endgame collapses quickly once the words appear.',
  },
  {
    name: 'Polybius',
    tier: 'extreme',
    what: 'Each letter becomes two digits: a row and a column in a grid. Noticing that the board reads in pairs is the first thing to solve.',
  },
  {
    name: 'Homophonic',
    tier: 'extreme',
    what: 'Several numbers stand for the same letter, and the commonest letters get the most. Counting how often a mark appears stops telling you anything.',
  },
];

// ---------------------------------------------------------------------------
// shell
// ---------------------------------------------------------------------------

const TITLES: Record<Mode, string> = {
  pattern: 'Guess the Word',
  descramble: 'Scramble',
  bee: 'Hive',
  grid: 'Grid',
  boxed: 'Boxed',
  weave: 'Weave',
  squares: 'Word Squares',
  cryptogram: 'Cryptogram',
  ladder: 'Word Ladder',
};

function LearnLadder({
  dict,
  register,
}: {
  dict: Set<string> | null;
  register: RegisterKeys;
}) {
  // A real ladder, played the way the board plays: type a rung, press Enter,
  // and a rung that breaks a rule comes back with the rule it broke. COLD to
  // WARM is Carroll's own, and it is four steps, so the whole lesson fits on
  // one screen.
  const FROM = 'cold';
  const TO = 'warm';
  const PAR = 4;

  const [chain, setChain] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [flash, show] = useFlash();

  const last = chain.length ? chain[chain.length - 1] : FROM;
  const solved = chain.length > 0 && chain[chain.length - 1] === TO;

  const submit = () => {
    if (solved) return;
    const w = current.toLowerCase();
    if (!w) return;
    if (w.length !== FROM.length) {
      show(`${FROM.length} letters — ${w.toUpperCase()} has ${w.length}`);
      return;
    }
    if (w === last || chain.includes(w) || w === FROM) {
      show('Already used — a ladder cannot revisit a rung');
      return;
    }
    if (!isStep(last, w)) {
      show(`Change exactly one letter of ${last.toUpperCase()}`);
      return;
    }
    if (dict && !dict.has(w)) {
      show(`${w.toUpperCase()} is not in the word list`);
      return;
    }
    setChain((c) => [...c, w]);
    setCurrent('');
    show(w === TO ? 'That is the ladder!' : 'Good rung', true);
  };

  const handleKey = (k: string) => {
    if (solved) return;
    if (k === 'enter') submit();
    else if (k === 'backspace') setCurrent((c) => c.slice(0, -1));
    else if (/^[a-z]$/.test(k)) setCurrent((c) => (c.length < FROM.length ? c + k : c));
  };
  useDemoKeys(register, handleKey);

  return (
    <>
      <Section title="The goal">
        <p className="text-sm text-slate-300 max-w-lg mx-auto">
          Turn the first word into the last, changing one letter at a time. Every rung has to be
          a real word, and the board tells you the fewest steps it can be done in.
        </p>
      </Section>

      <Section title="Try it — COLD to WARM in four">
        <p className="text-sm text-slate-400 mb-4">
          Type a word and press Enter. One letter changes each time, and each rung has to be a
          word of its own. (Stuck? CORD is a good first move.)
        </p>

        <ol className="space-y-1.5 mb-3">
          <li className="text-center text-lg font-bold uppercase tracking-widest text-white">
            {FROM}
          </li>
          {chain.map((w, i) => (
            <li
              key={`${w}-${i}`}
              className="text-center text-lg font-bold uppercase tracking-widest text-emerald-300"
            >
              {w}
            </li>
          ))}
          {!solved && (
            <li className="relative mx-auto max-w-[10rem] h-11 rounded-xl bg-white/5 border-2 border-amber-400/50 flex items-center justify-center overflow-hidden">
              <span className="text-lg font-bold uppercase tracking-widest text-white">
                {current}
                <span className="text-accent animate-pulse">|</span>
              </span>
              <MobileKeyInput onKey={handleKey} />
            </li>
          )}
          {/* once the last rung IS the target, the target line would print it
              a second time */}
          {!solved && (
            <li className="text-center text-lg font-bold uppercase tracking-widest text-white">
              {TO}
            </li>
          )}
        </ol>

        <p aria-live="polite" className="min-h-[1.25rem] text-center text-xs mb-3">
          {flash && (
            <span className={flash.good ? 'text-emerald-300' : 'text-amber-300'}>{flash.text}</span>
          )}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <DemoButton onClick={() => setCurrent((c) => c.slice(0, -1))} ariaLabel="Delete letter">
            <Delete className="w-4 h-4" />
          </DemoButton>
          <DemoButton onClick={submit}>
            <CornerDownLeft className="w-4 h-4" />
          </DemoButton>
          <DemoButton
            onClick={() => {
              setChain([]);
              setCurrent('');
            }}
          >
            Start over
          </DemoButton>
        </div>

        <p className="mt-3 text-center text-xs text-slate-500">
          {solved
            ? `${chain.length} steps${chain.length === PAR ? ' — par' : `, par is ${PAR}`}.`
            : `${chain.length} of ${PAR} steps used.`}
        </p>
      </Section>

      <Section title="The rules">
        <Rules
          items={[
            'Exactly one letter changes per rung, and the word stays the same length throughout.',
            'Every rung has to be a word in the list for the difficulty you are playing.',
            'A rung cannot repeat one you have already used — a ladder that revisits a word is going backwards.',
            'A word that breaks a rule is refused rather than kept, and the board says which rule it was.',
            'Par is the shortest possible route, so matching it is the good result.',
            'Difficulty is distance, not vocabulary: easy is three or four steps, extreme is seven or eight, and the words stay ordinary at every level.',
          ]}
        />
      </Section>

      <Section title="Where the pairs come from">
        <p className="text-sm text-slate-300 max-w-lg mx-auto">
          The two ends are always related — opposites, or a cause and its effect, or a part and
          its whole. Nothing on the board says which, because both words are in front of you and
          the connection is the sort of thing you notice rather than need told.
        </p>
      </Section>
    </>
  );
}

const LearnMode = forwardRef<
  LearnModeHandle,
  { mode: Mode; standardWords: string[] | null; palette: Palette; theme: 'light' | 'dark' }
>(function LearnMode({ mode, standardWords, palette, theme }, ref) {
  const dict = useMemo(() => (standardWords ? new Set(standardWords) : null), [standardWords]);
  const colors = colorWords(palette, theme);

  // the active demo registers its key handler here; the on-screen keyboard
  // reaches it through the imperative handle
  const keyHandler = useRef<((k: string) => void) | null>(null);
  const register = useRef<RegisterKeys>((fn) => {
    keyHandler.current = fn;
  }).current;
  useImperativeHandle(ref, () => ({ pressKey: (k) => keyHandler.current?.(k) }));

  return (
    <div className="text-center">
      <h2 className="text-lg font-bold mb-1">Learn to play {TITLES[mode]}</h2>
      <p className="text-sm text-slate-500 mb-8">
        The rules, the scoring, and a hands-on demo — no clock, no stakes.
      </p>

      {mode === 'pattern' && <LearnGuess dict={dict} register={register} colors={colors} />}
      {mode === 'descramble' && <LearnScramble dict={dict} register={register} />}
      {mode === 'bee' && <LearnHive dict={dict} register={register} colors={colors} />}
      {mode === 'grid' && <LearnGrid standardWords={standardWords} register={register} />}
      {mode === 'boxed' && <LearnBoxed dict={dict} register={register} />}
      {mode === 'weave' && <LearnWeave dict={dict} colors={colors} />}
      {mode === 'squares' && <LearnSquares dict={dict} register={register} />}
      {mode === 'cryptogram' && <LearnCryptogram register={register} />}
      {mode === 'ladder' && <LearnLadder dict={dict} register={register} />}

      <p className="mt-2 text-xs text-slate-500 border-t border-white/10 pt-5 max-w-lg mx-auto">
        Daily puzzles refresh about 15 minutes after 3:00&nbsp;a.m. Eastern. Progress and stats
        save in your browser — sign in to sync them across devices. Ready? Hit{' '}
        <span className="text-emerald-300 font-semibold">Play</span> above.
      </p>
    </div>
  );
});

export default LearnMode;
