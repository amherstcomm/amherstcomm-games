import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Delete, RefreshCw, RotateCcw } from 'lucide-react';
import { solveGrid, gridNeighbors } from '@/solvers';
import type { Mode } from '@/storage';

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-xs font-semibold text-amber-400/90 uppercase tracking-wider mb-3">
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

const TILE_TONES: Record<LetterState | 'empty', string> = {
  correct: 'bg-emerald-500/80 border-emerald-400 text-white',
  present: 'bg-amber-400/80 border-amber-300 text-slate-950',
  absent: 'bg-white/[0.04] border-white/10 text-slate-500',
  empty: 'bg-white/[0.02] border-white/10 text-transparent',
};

function GuessRow({ word, secret }: { word?: string; secret: string }) {
  const score = word ? scoreGuess(secret, word) : null;
  return (
    <div className="flex gap-1.5 justify-center">
      {Array.from({ length: secret.length }, (_, i) => (
        <div
          key={i}
          className={`w-10 h-12 flex items-center justify-center font-bold uppercase rounded-lg border-2 transition-colors text-xl
            ${score ? TILE_TONES[score[i]] : TILE_TONES.empty}`}
        >
          {word?.[i] ?? '·'}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guess the Word (pattern)
// ---------------------------------------------------------------------------

const GUESS_SECRET = 'grape';
const GUESS_STEPS = [
  {
    w: 'pearl',
    note: 'A is green — right letter, right spot. P, E, and R are amber: they’re in the word, but somewhere else. L is dark — not in the word at all.',
  },
  {
    w: 'grace',
    note: 'Moving the amber letters around pays off: G, R, A, and E lock in green. Only the fourth letter is still a mystery — and C is now ruled out.',
  },
  {
    w: 'grape',
    note: 'Solved in three! Each guess narrowed the field until only one word fit.',
  },
];

function LearnGuess() {
  const [step, setStep] = useState(0);
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
            'After each guess, the tiles color: green is the right letter in the right spot, amber is a letter that’s in the word but placed wrong, dark means it’s not in the word.',
            'Duplicate letters color precisely — a repeated letter lights up only as many times as it appears in the answer.',
            'The timer counts your thinking time while the board is on screen, and stops when you finish.',
          ]}
        />
      </Section>

      <Section title="Try it — watch a game unfold">
        <p className="text-sm text-slate-400 mb-4">
          The secret word is <span className="font-bold uppercase text-slate-200">grape</span>.
          Step through a real solve:
        </p>
        <div className="space-y-1.5">
          {GUESS_STEPS.map((s, i) => (
            <GuessRow key={i} word={i < step ? s.w : undefined} secret={GUESS_SECRET} />
          ))}
        </div>
        <div className="h-12 mt-3 max-w-md mx-auto">
          {step > 0 && <p className="text-sm text-slate-400">{GUESS_STEPS[step - 1].note}</p>}
        </div>
        <div className="mt-1 flex justify-center gap-2.5">
          {step < GUESS_STEPS.length ? (
            <DemoButton onClick={() => setStep((s) => s + 1)}>
              {step === 0 ? 'Make the first guess' : 'Next guess'}
            </DemoButton>
          ) : (
            <DemoButton onClick={() => setStep(0)}>
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
            'Answers come from the Common dictionary so they’re always fair; guesses are checked against the Full one.',
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

function LearnScramble({ dict }: { dict: Set<string> | null }) {
  const [current, setCurrent] = useState('');
  const [found, setFound] = useState<string[]>([]);
  const [flash, show] = useFlash();

  const score = found.reduce((n, w) => n + scrambleScore(w), 0);

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
          Tap letters to build a word, then press Enter. (Psst: this rack hides more than one
          7-letter word.)
        </p>
        <div className="mb-4 mx-auto max-w-sm h-12 px-4 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden">
          <span className="text-2xl font-bold tracking-[0.2em] uppercase text-white whitespace-nowrap">
            {current}
            <span className="text-amber-400 animate-pulse">|</span>
          </span>
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
        <div className="mt-4 flex items-center justify-center gap-2.5">
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

function LearnHive({ dict }: { dict: Set<string> | null }) {
  const [current, setCurrent] = useState('');
  const [found, setFound] = useState<string[]>([]);
  const [flash, show] = useFlash();
  const allowed = useMemo(() => new Set([HIVE_CENTER, ...HIVE_OUTERS]), []);

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
          Build words from seven letters. Every word must use the amber center letter, and
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
          Tap letters, then Enter. Every word needs the{' '}
          <span className="text-amber-300 font-bold uppercase">{HIVE_CENTER}</span>. One word
          here uses all seven letters…
        </p>
        <div className="mb-3 mx-auto max-w-sm h-12 px-4 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden">
          <span className="text-2xl font-bold tracking-[0.2em] uppercase whitespace-nowrap">
            {current.split('').map((c, i) => (
              <span key={i} className={c === HIVE_CENTER ? 'text-amber-300' : 'text-white'}>
                {c}
              </span>
            ))}
            <span className="text-amber-400 animate-pulse">|</span>
          </span>
        </div>
        <div className="relative w-48 h-48 mx-auto">
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
        <div className="mt-3 flex items-center justify-center gap-2.5">
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
            'Words are checked against our Standard dictionary; rejected guesses collect in an amber list.',
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

function LearnGrid({ standardWords }: { standardWords: string[] | null }) {
  const [found, setFound] = useState<string[]>([]);
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

  function endDrag() {
    const path = dragRef.current;
    if (!path.length) return;
    setPath([]);
    if (path.length < 3) {
      if (path.length === 2) show('Too short — words need 3+ letters');
      return;
    }
    const word = path.map((i) => GRID_CELLS[i]).join('');
    if (found.includes(word)) {
      show('Already found');
      return;
    }
    if (!answers) {
      show(LOADING_NOTE);
      return;
    }
    if (!answers.has(word)) {
      show('Not in dictionary');
      return;
    }
    setFound((f) => [word, ...f]);
    show(`+${gridScore(word)}`, true);
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
          Drag across the cells to trace a word, release to submit. Diagonals count! Try{' '}
          <span className="uppercase font-semibold text-slate-300">cat</span>,{' '}
          <span className="uppercase font-semibold text-slate-300">dog</span>… then hunt for
          longer paths.
        </p>
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          className="grid grid-cols-3 gap-2 w-fit mx-auto touch-none select-none"
        >
          {GRID_CELLS.map((c, i) => (
            <button
              key={i}
              data-learn-cell={i}
              className={`w-12 h-14 rounded-xl border-2 text-2xl font-bold uppercase transition-colors
                ${dragPath.includes(i)
                  ? 'bg-emerald-400/30 border-emerald-300 text-white'
                  : 'bg-amber-400/10 border-amber-400/40 text-amber-200 hover:bg-amber-400/20'}`}
            >
              {c}
            </button>
          ))}
        </div>
        <FlashLine flash={flash} />
        <FoundChips words={found} strong={(w) => w.length >= 5} />
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

// twelve distinct letters from the chain PLUMBING -> GOTHIC, sides assigned
// so no consecutive pair in either word shares one
const BOX_SIDES = ['pub', 'lmi', 'noh', 'gtc'];
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

function LearnBoxed({ dict }: { dict: Set<string> | null }) {
  const [chain, setChain] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
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
          Tap letters to build words; notice how same-side letters refuse to connect. Cover
          all twelve. (Stuck? PLUMBING → GOTHIC does it in two.)
        </p>
        <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5 text-sm min-h-5">
          {chain.map((w, i) => (
            <span key={i} className="text-emerald-300">
              {w}
              {(!solved || i < chain.length - 1) && <span className="text-slate-600"> →</span>}
            </span>
          ))}
        </div>
        {!solved && (
          <div className="mb-4 mx-auto max-w-sm h-11 px-4 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden">
            <span className="text-lg font-bold tracking-[0.15em] uppercase text-white whitespace-nowrap">
              {current}
              <span className="text-amber-400 animate-pulse">|</span>
            </span>
          </div>
        )}
        <div className="relative w-64 h-64 mx-auto">
          <div className="absolute inset-10 rounded-xl border-2 border-white/15 bg-white/[0.02]" />
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
        <div className="mt-3 flex items-center justify-center gap-2.5">
          <DemoButton onClick={backspace} ariaLabel="Delete letter">
            <Delete className="w-4 h-4" />
          </DemoButton>
          <DemoButton
            onClick={() => {
              setChain([]);
              setCurrent('');
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

function LearnWeave({ dict }: { dict: Set<string> | null }) {
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
            'Theme words lock in blue. The spangram — a word that sums up the theme and spans the board edge to edge — locks in gold.',
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
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          className="grid grid-cols-4 gap-1.5 w-fit mx-auto touch-none select-none"
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
// shell
// ---------------------------------------------------------------------------

const TITLES: Record<Mode, string> = {
  pattern: 'Guess the Word',
  descramble: 'Scramble',
  bee: 'Hive',
  grid: 'Grid',
  boxed: 'Boxed',
  weave: 'Weave',
};

export default function LearnMode({
  mode,
  standardWords,
}: {
  mode: Mode;
  standardWords: string[] | null;
}) {
  const dict = useMemo(() => (standardWords ? new Set(standardWords) : null), [standardWords]);

  return (
    <div className="text-center">
      <h2 className="text-lg font-bold mb-1">Learn to play {TITLES[mode]}</h2>
      <p className="text-sm text-slate-500 mb-8">
        The rules, the scoring, and a hands-on demo — no clock, no stakes.
      </p>

      {mode === 'pattern' && <LearnGuess />}
      {mode === 'descramble' && <LearnScramble dict={dict} />}
      {mode === 'bee' && <LearnHive dict={dict} />}
      {mode === 'grid' && <LearnGrid standardWords={standardWords} />}
      {mode === 'boxed' && <LearnBoxed dict={dict} />}
      {mode === 'weave' && <LearnWeave dict={dict} />}

      <p className="mt-2 text-xs text-slate-500 border-t border-white/10 pt-5 max-w-lg mx-auto">
        Daily puzzles refresh about 15 minutes after 3:00&nbsp;a.m. Eastern. Progress and stats
        save in your browser — sign in to sync them across devices. Ready? Hit{' '}
        <span className="text-emerald-300 font-semibold">Play</span> above.
      </p>
    </div>
  );
}
