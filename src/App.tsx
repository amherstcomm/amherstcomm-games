import { useCallback, useMemo, useState, useEffect, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Search, Eraser, ArrowDown, ArrowUp, X, BookOpen, Grid3x3, Shuffle, Hexagon, Check, Keyboard, Delete, Github, Info, Square, CalendarDays, Star, Gamepad2, CornerDownLeft, LayoutGrid, Puzzle, BarChart3, UserRound, Scale, Settings, Home, Table2, KeyRound } from 'lucide-react';
import LearnMode, { type LearnModeHandle } from '@/LearnMode';
import type { Session } from '@supabase/supabase-js';
import StatsModal from '@/StatsModal';
import AccountModal from '@/AccountModal';
import { stashInvite } from '@/friends';
import { OskContext } from '@/MobileKeyInput';
import SettingsModal from '@/SettingsModal';
import KeyboardHelp from '@/KeyboardHelp';
import { PALETTES, PaletteContext, TEXT_SCALES, THEME_MODES, useTheme, type Palette, type TextScale, type ThemeMode } from '@/theme';
import { PrefsContext } from '@/prefs';
import OnboardingCard from '@/OnboardingCard';
import { useModalA11y } from '@/useModalA11y';
import { supabase } from '@/supabase';
import { importBaselineOnce } from '@/stats';
import GuessGame, { type GuessGameHandle, type LetterState } from '@/GuessGame';
import HiveGame, { type HiveGameHandle } from '@/HiveGame';
import BoxGame, { type BoxGameHandle } from '@/BoxGame';
import ScrambleGame, { type ScrambleGameHandle } from '@/ScrambleGame';
import GridGame, { type GridGameHandle } from '@/GridGame';
import WeaveGame, { type WeaveGameHandle } from '@/WeaveGame';
import { fetchDailyData } from '@/dailyData';
import { DICTIONARIES, getAcceptPool, getDictionary, getDifficultyPool, getDisplayFilter } from '@/dictionaries';
import { solvePattern, solveDescramble, solveBee, solveBoxed, solveGrid, findGridPath } from '@/solvers';
import ConsentBanner from '@/ConsentBanner';
import { PrivacyPolicy, Terms } from '@/LegalDocs';
import { onDailyReport, requestDaily } from '@/dailyBus';
import { solveSquare } from '@/squares';
import HomeView from '@/HomeView';
import RouteLink from '@/RouteLink';
import SquaresGame, { type SquaresGameHandle } from '@/SquaresGame';
import CryptogramGame, { type CryptogramGameHandle } from '@/CryptogramGame';
import {
  analyse,
  buildPatternIndex,
  parseCryptogram,
  type InputMode,
} from '@/cryptogramSolver';
import {
  MODE_SLUG,
  initialGame,
  initialRoute,
  modeOf,
  parsePath,
  pathOf,
  titleOf,
  type AccountTab,
  type Panel,
  type Route,
  type SettingsTab,
  type StatsTab,
} from '@/routes';
import {
  difficulty as currentDifficulty,
  setDifficulty,
  difficultyMode,
  onDifficultyChange,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  type Difficulty,
} from '@/difficulty';
import { ALL_MODES, ALL_START_PAGES, ALL_VIEWS, asDifficulty, lengthChoices, visibleModes, visibleViews, type LengthRange, type StartPage, type View, loadState, saveState, GRID_PRESET_DIMS, WEAVE_DIMS, type GridPreset, type Mode, type NavKeys, type SortPref, type SquareSolverSize, type WeaveSize } from '@/storage';

// longest rack the scramble solver accepts; word lengths come from the
// player's own range now, in storage
const MAX_LEN = 15;

// description sells the solver, which is the wrong pitch for someone who has
// hidden it — playDescription is what they get instead.
const MODES: { id: Mode; label: string; blurb: string; description: string; playDescription: string }[] = [
  {
    id: 'pattern',
    // the slug stays 'pattern' — it's in shared links — but nothing else calls
    // it that, so the label matches Learn, the boards and the home page
    label: 'Guess',
    blurb: 'Wordle, crosswords, hangman — clues about positions',
    description:
      "Lock in the letters you know, list the ones you've seen, and exclude the rest. We'll surface every dictionary word that fits.",
    playDescription:
      // no colour names — they change with the palette
      'Six guesses at a hidden word. Each one tells you which letters are in the right place and which are merely in there somewhere.',
  },
  {
    id: 'descramble',
    label: 'Scramble',
    blurb: 'Scrabble, Jumble — what can these letters spell?',
    description:
      "Type the letters you're holding — with ? for blank tiles — and we'll show every word they can spell.",
    playDescription:
      'Three minutes, seven letters, as many words as you can find. Longer words score more.',
  },
  {
    id: 'bee',
    label: 'Hive',
    blurb: 'Seven letters, 4+ letter words, center letter required — Spelling Bee style',
    description:
      "Enter the hive's seven letters and we'll find every word that uses the center — pangrams first.",
    playDescription:
      'Every word uses the centre letter and at least four letters. Use all seven for a pangram.',
  },
  {
    id: 'grid',
    label: 'Grid',
    blurb: 'Boggle style — chain adjacent letters, each cell once',
    description:
      "Enter the grid letters and we'll find every word traceable through adjacent cells.",
    playDescription:
      'Three minutes to trace words through touching letters, each cell used once per word.',
  },
  {
    id: 'boxed',
    label: 'Boxed',
    blurb: "Twelve letters on four sides, no two in a row from the same side — Letter Boxed style",
    description:
      "Enter the twelve letters, three per side. We'll find every legal word and the two-word solutions that use all twelve.",
    playDescription:
      'Use all twelve letters in a chain of words, never twice in a row from the same side.',
  },
  {
    id: 'squares',
    label: 'Squares',
    blurb: 'Fill the grid so every row and column is a word',
    description:
      "Type the letters you're sure of and we'll fill the rest, so every row and every column spells a word.",
    playDescription:
      'Fill the blanks so that every row and every column spells a word.',
  },
  {
    id: 'weave',
    label: 'Weave',
    blurb: 'Themed words tile the whole board — Strands style',
    description:
      'Play the themed tiling puzzle, or use Solve to list every traceable word on a Strands-style board.',
    playDescription:
      'Find the themed words that tile the whole board, plus the one that spans it corner to corner.',
  },
  {
    id: 'cryptogram',
    label: 'Cryptogram',
    blurb: 'A passage in code — work out which letter is which',
    description:
      'Play the daily cipher. The solver is still being built: it has to offer the readings that fit rather than guess one, which is a different thing from the word solvers.',
    playDescription:
      'Every letter stands for another one, the same way throughout. Work out the passage.',
  },
];

const MODE_ICONS: Record<Mode, typeof Grid3x3> = {
  pattern: Grid3x3,
  descramble: Shuffle,
  bee: Hexagon,
  grid: LayoutGrid,
  boxed: Square,
  weave: Puzzle,
  squares: Table2,
  cryptogram: KeyRound,
};

function normalizeLetters(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z]/g, '').split('');
}

// iOS Safari ignores inputmode="none" and raises its keyboard on focus
// anyway, stacking it on top of ours. These fields have to stay focusable so
// the on-screen keyboard knows where to type, and read-only is the one state
// that keeps focus while reliably suppressing the device keyboard — writes
// still land, since the on-screen keyboard sets the value programmatically.
// Only on touch pointers, so a desktop user with the panel open can still
// type on a real keyboard.
const COARSE_POINTER =
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

function Tile({
  value,
  onChange,
  state,
  index,
  size,
  group,
  osk,
  tone,
}: {
  value: string;
  onChange: (v: string) => void;
  state: 'known' | 'empty' | 'center';
  index: number;
  size: 'sm' | 'md';
  group: string;
  osk?: boolean; // on-screen keyboard active: suppress the device keyboard
  tone?: { empty: string; filled: string }; // color override, e.g. boxed side hues
}) {
  const ref = useRef<HTMLInputElement>(null);
  const dims =
    size === 'sm'
      ? 'w-9 h-11 sm:w-10 sm:h-12 text-xl sm:text-2xl'
      : 'w-12 h-14 sm:w-14 sm:h-16 text-2xl sm:text-3xl';

  const focusTile = (i: number) => {
    const el = document.querySelector<HTMLInputElement>(
      `input[data-tile-group="${group}"][data-tile-index="${i}"]`
    );
    el?.focus();
    el?.select();
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        data-tile-group={group}
        data-tile-index={index}
        value={value}
        onChange={(e) => {
          const raw = e.target.value.toLowerCase().replace(/[^a-z]/g, '');
          const c = raw.slice(-1);
          onChange(c);
          if (c) focusTile(index + 1);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && !value) focusTile(index - 1);
          else if (e.key === 'ArrowLeft') focusTile(index - 1);
          else if (e.key === 'ArrowRight') focusTile(index + 1);
          // read-only fields swallow typing, so a physical keyboard on a
          // touch device (an iPad with a case, say) is served here instead
          else if (osk && COARSE_POINTER && /^[a-zA-Z]$/.test(e.key)) {
            e.preventDefault();
            onChange(e.key.toLowerCase());
            focusTile(index + 1);
          } else if (osk && COARSE_POINTER && e.key === 'Backspace' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        maxLength={1}
        inputMode={osk ? 'none' : undefined}
        readOnly={osk && COARSE_POINTER}
        aria-label={`Letter at position ${index + 1}`}
        placeholder="·"
        className={`${dims} text-center font-bold uppercase rounded-xl border-2 transition-all duration-150 outline-none
          ${state === 'known'
            ? tone?.filled ?? 'bg-emerald-500/15 border-emerald-400 text-emerald-200 shadow-[0_0_20px_-6px] shadow-emerald-500/40'
            : state === 'center'
              ? 'bg-amber-400/15 border-amber-400 text-amber-200 shadow-[0_0_20px_-6px] shadow-amber-400/50 placeholder-amber-200/30'
              : tone?.empty ?? 'bg-white/5 border-white/55 text-white placeholder-white/25 hover:border-white/75'}
          focus:border-amber-400 focus:bg-amber-400/10 focus:shadow-[0_0_24px_-6px] focus:shadow-amber-400/50`}
      />
      {value && (
        <button
          onClick={() => {
            onChange('');
            ref.current?.focus();
          }}
          tabIndex={-1}
          aria-label={`Clear letter at position ${index + 1}`}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-slate-800 border border-white/25 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-white/50 transition-colors shadow-md"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

type ChainEntry = { w: string; m: number; last: string };

type ChainIndex = {
  entries: ChainEntry[];
  byFirst: Map<string, ChainEntry[]>;
  fullMask: number;
};

// outer hive cells, clockwise from the top, as [left%, top%] of the container
const BEE_POSITIONS: [number, number][] = [
  [50, 14],
  [81, 32],
  [81, 68],
  [50, 86],
  [19, 68],
  [19, 32],
];

// boxed solver tiles share the play board's side hues (top, right, bottom, left)
const BOX_SIDE_TONES = [
  {
    empty: 'bg-sky-400/10 border-sky-400 text-sky-100 placeholder-sky-200/40 hover:bg-sky-400/20',
    filled: 'bg-sky-400/20 border-sky-400 text-sky-100 shadow-[0_0_20px_-6px] shadow-sky-400/40',
  },
  {
    empty: 'bg-violet-400/10 border-violet-400 text-violet-100 placeholder-violet-200/40 hover:bg-violet-400/20',
    filled: 'bg-violet-400/20 border-violet-400 text-violet-100 shadow-[0_0_20px_-6px] shadow-violet-400/40',
  },
  {
    empty: 'bg-rose-400/10 border-rose-400 text-rose-100 placeholder-rose-200/40 hover:bg-rose-400/20',
    filled: 'bg-rose-400/20 border-rose-400 text-rose-100 shadow-[0_0_20px_-6px] shadow-rose-400/40',
  },
  {
    empty: 'bg-amber-400/10 border-amber-400 text-amber-100 placeholder-amber-200/40 hover:bg-amber-400/20',
    filled: 'bg-amber-400/20 border-amber-400 text-amber-100 shadow-[0_0_20px_-6px] shadow-amber-400/40',
  },
];

// highlight for grid solver tiles while a result word's path is previewed
const GRID_TRACE_TONE = {
  empty: 'bg-sky-400/25 border-sky-300 text-white',
  filled: 'bg-sky-400/30 border-sky-300 text-white shadow-[0_0_20px_-6px] shadow-sky-400/50',
};

const CHAIN_CAP = 500;
const CHAIN_BUDGET = 2_000_000;

// depth-first search for k-word chains that cover every letter of the box;
// capped by solution count and visited-node budget so the UI stays snappy
function findChains(index: ChainIndex, k: number, cap = CHAIN_CAP, budget = CHAIN_BUDGET) {
  const { entries, byFirst, fullMask } = index;
  const solutions: string[][] = [];
  const chain: string[] = [];
  let nodes = 0;
  let capped = false;

  const dfs = (covered: number, last: string, depth: number) => {
    const candidates = depth === 0 ? entries : byFirst.get(last) ?? [];
    for (const e of candidates) {
      if (solutions.length >= cap || ++nodes > budget) {
        capped = true;
        return;
      }
      const next = covered | e.m;
      if (depth === k - 1) {
        if (next === fullMask) {
          chain.push(e.w);
          solutions.push([...chain]);
          chain.pop();
        }
      } else {
        // chains that finish early belong to a shorter solution length
        if (next === fullMask) continue;
        chain.push(e.w);
        dfs(next, e.last, depth + 1);
        chain.pop();
      }
    }
  };
  dfs(0, '', 0);

  const total = (s: string[]) => s.reduce((n, w) => n + w.length, 0);
  solutions.sort((a, b) => total(a) - total(b) || (a.join(' ') < b.join(' ') ? -1 : 1));
  return { solutions, capped };
}

function LetterChipInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  maxLen,
  allowWildcard = false,
  tone,
  osk,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder: string;
  maxLen: number;
  allowWildcard?: boolean;
  tone: 'amber' | 'rose';
  osk?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const tones = {
    amber: {
      container: 'focus-within:border-amber-400 focus-within:bg-amber-400/5',
      pill: 'bg-amber-400/15 border-amber-400/30 text-amber-200',
    },
    rose: {
      container: 'focus-within:border-rose-400 focus-within:bg-rose-400/5',
      pill: 'bg-rose-400/15 border-rose-400/30 text-rose-300',
    },
  }[tone];

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={`w-full min-h-[3rem] px-2.5 py-2 rounded-xl bg-white/5 border-2 border-white/10 flex flex-wrap items-center justify-center gap-x-2 gap-y-2.5 cursor-text transition-all ${tones.container}`}
    >
      {value.split('').map((c, i) => (
        <span
          key={i}
          className={`relative inline-flex items-center justify-center w-8 h-8 rounded-lg border text-base font-bold uppercase ${tones.pill}`}
        >
          {c}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange(value.slice(0, i) + value.slice(i + 1));
              inputRef.current?.focus();
            }}
            tabIndex={-1}
            aria-label={`Remove ${c === '?' ? 'wildcard' : c}`}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-slate-800 border border-white/25 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-white/50 transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value=""
        onChange={(e) => {
          const add = e.target.value
            .toLowerCase()
            .replace(allowWildcard ? /[^a-z?]/g : /[^a-z]/g, '');
          if (add) onChange((value + add).slice(0, maxLen));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && value) onChange(value.slice(0, -1));
          // as above: read-only swallows typing, so accept it from the key event
          else if (osk && COARSE_POINTER) {
            const ok = allowWildcard ? /^[a-zA-Z?]$/ : /^[a-zA-Z]$/;
            if (ok.test(e.key)) {
              e.preventDefault();
              onChange((value + e.key.toLowerCase()).slice(0, maxLen));
            }
          }
        }}
        inputMode={osk ? 'none' : undefined}
        readOnly={osk && COARSE_POINTER}
        aria-label={ariaLabel}
        placeholder={value ? '' : placeholder}
        className={`h-8 bg-transparent outline-none text-white placeholder-slate-600 text-base text-center ${value ? 'w-2 p-0' : 'flex-1 min-w-[4rem] px-1'}`}
      />
    </div>
  );
}

function WordChip({
  word,
  className,
  children,
  hoverProps,
}: {
  word: string;
  className: string;
  children?: ReactNode;
  hoverProps?: ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      {...hoverProps}
      onClick={() => {
        navigator.clipboard.writeText(word).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1000);
        });
      }}
      title="Click to copy"
      className={`px-3 py-2.5 rounded-lg text-center text-lg tracking-wide transition-colors ${className}`}
    >
      {copied ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-300 text-base font-medium">
          <Check className="w-4 h-4" /> Copied
        </span>
      ) : (
        children ?? word
      )}
    </button>
  );
}

const initial = loadState();

// Arriving at "/" with a start page set to one particular game is the same
// kind of instruction a link gives, so it travels the same path. 'home' stays
// on the front page; 'last' falls through to whatever was stored.
const startTarget =
  initialRoute.kind === 'home' &&
  initial.startPage !== 'home' &&
  initial.startPage !== 'last'
    ? ({ view: 'play', slug: MODE_SLUG[initial.startPage] } as const)
    : null;

// A link names both a game and a tab. It only overrides the game it names —
// every other game keeps whatever the visitor last had open.
const entryGame = initialGame ?? startTarget;
const linkMode = entryGame ? modeOf(entryGame.slug) : null;
const linkView = entryGame?.view === 'play' ? true : entryGame?.view === 'solve' ? false : null;
function initialPlay(mode: Mode, stored: boolean): boolean {
  return linkMode === mode && linkView !== null ? linkView : stored;
}

// Panels and legal documents are addresses too, so arriving at one opens it.
const panelAtLoad = (p: Panel) => initialRoute.kind === 'panel' && initialRoute.panel === p;
const isOverlay = (r: Route) => r.kind === 'panel' || r.kind === 'account' || r.kind === 'legal';

// An invite link stashes its code before anything else happens: accepting may
// need a sign-in first, and OAuth leaves the page entirely — the stash is what
// survives the round trip. The account panel picks it up from there.
if (initialRoute.kind === 'friend') stashInvite(initialRoute.code);

function App() {
  const [mode, setMode] = useState<Mode>(linkMode ?? initial.mode);
  const [dictionaries, setDictionaries] = useState(initial.dictionaries);
  const [length, setLength] = useState(initial.pattern.length);
  const [known, setKnown] = useState<string[]>(initial.pattern.known);
  const [containsStr, setContainsStr] = useState(initial.pattern.contains);
  const [excludedStr, setExcludedStr] = useState(initial.pattern.excluded);
  const [rackStr, setRackStr] = useState(initial.descramble.rack);
  const [useAll, setUseAll] = useState(initial.descramble.useAll);
  const [minLength, setMinLength] = useState(initial.descramble.minLength);
  const [beeCenter, setBeeCenter] = useState(initial.bee.center);
  const [beeOuters, setBeeOuters] = useState<string[]>(initial.bee.outers);
  const [boxedLetters, setBoxedLetters] = useState<string[]>(initial.boxed.letters);
  const [solutionWords, setSolutionWords] = useState(initial.boxed.solutionWords);
  const [squaresLetters, setSquaresLetters] = useState<string[]>(initial.squares.letters);
  const [squaresSize, setSquaresSize] = useState<SquareSolverSize>(initial.squares.size);
  const [gridLetters, setGridLetters] = useState<string[]>(initial.grid.letters);
  const [gridPreset, setGridPreset] = useState<GridPreset>(initial.grid.preset);
  const [gridPlay, setGridPlay] = useState(initialPlay('grid', initial.gridPlay));
  const [weaveLetters, setWeaveLetters] = useState<string[]>(initial.weave.letters);
  const [weaveSize, setWeaveSize] = useState<WeaveSize>(initial.weave.size);
  const [weavePlay, setWeavePlay] = useState(initialPlay('weave', initial.weavePlay));
  const [squaresPlay, setSquaresPlay] = useState(initialPlay('squares', initial.squaresPlay));
  const [cryptogramPlay, setCryptogramPlay] = useState(
    initialPlay('cryptogram', initial.cryptogramPlay)
  );
  const [cryptoText, setCryptoText] = useState('');
  const [cryptoMode, setCryptoMode] = useState<InputMode>('letters');
  // marks the player has settled by picking a reading; propagation takes these
  // as fixed and narrows everything else against them
  const [cryptoPins, setCryptoPins] = useState<Record<string, string>>({});

  const weaveDims = WEAVE_DIMS[weaveSize];

  function changeWeaveSize(size: WeaveSize) {
    setWeaveSize(size);
    setStrandsClue(null);
    const dims = WEAVE_DIMS[size];
    setWeaveLetters((prev) => {
      const next = Array(dims.rows * dims.cols).fill('');
      for (let i = 0; i < Math.min(prev.length, next.length); i++) next[i] = prev[i];
      return next;
    });
  }

  const gridDims = GRID_PRESET_DIMS[gridPreset];

  const [strandsClue, setStrandsClue] = useState<string | null>(null);

  async function fillTodaysStrands() {
    setTodayStatus('loading');
    try {
      const r = await fetch(
        'https://raw.githubusercontent.com/rptetzloff/anagrimoire/puzzle-data/data/strands.json',
        { cache: 'no-store' }
      );
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      const board = d.board as string[];
      if (!Array.isArray(board) || board.length !== 8 || !board.every((row) => /^[a-z]{6}$/.test(row))) {
        throw new Error('bad payload');
      }
      setWeaveSize('6x8');
      setWeaveLetters(board.join('').split(''));
      setStrandsClue(typeof d.clue === 'string' ? d.clue : null);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  async function fillTodaysWeave() {
    setTodayStatus('loading');
    try {
      const d = await fetchDailyData('daily-weave');
      const board = d.board as string[];
      if (!Array.isArray(board) || board.length !== 8 || !board.every((row) => /^[a-z]{6}$/.test(row))) {
        throw new Error('bad payload');
      }
      setWeaveSize('6x8');
      setWeaveLetters(board.join('').split(''));
      setStrandsClue(typeof d.clue === 'string' ? d.clue : null);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  // hover-trace preview for grid solver results
  const [gridTrace, setGridTrace] = useState<number[] | null>(null);
  const [gridTracePts, setGridTracePts] = useState<{ x: number; y: number }[]>([]);
  const gridBoardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!gridTrace || !gridBoardRef.current) {
      setGridTracePts([]);
      return;
    }
    const wrap = gridBoardRef.current.getBoundingClientRect();
    setGridTracePts(
      gridTrace.map((i) => {
        const r = gridBoardRef.current!
          .querySelector(`[data-tile-index="${i}"]`)!
          .getBoundingClientRect();
        return { x: r.left + r.width / 2 - wrap.left, y: r.top + r.height / 2 - wrap.top };
      })
    );
  }, [gridTrace]);

  useEffect(() => {
    setGridTrace(null);
  }, [gridLetters, gridPreset, weaveLetters, weaveSize, mode]);

  function traceHandlersFor(word: string, letters: string[], cols: number): ButtonHTMLAttributes<HTMLButtonElement> {
    const show = () => setGridTrace(findGridPath(letters, cols, word));
    const hide = () => setGridTrace(null);
    return {
      onMouseEnter: show,
      onMouseLeave: hide,
      onPointerDown: show, // press-hold on touch
      onPointerUp: hide,
      onPointerCancel: hide,
    };
  }

  const gridTraceHandlers = (word: string) => traceHandlersFor(word, gridLetters, gridDims.cols);
  const weaveTraceHandlers = (word: string) => traceHandlersFor(word, weaveLetters, weaveDims.cols);

  // boxed solver: hover a word (or a solution chain) to draw its criss-cross
  // chords on the box — each word in a chain gets its own color
  const BOX_TRACE_COLORS = [
    'rgb(var(--chord-1) / 0.9)',
    'rgb(var(--chord-2) / 0.9)',
    'rgb(var(--chord-3) / 0.9)',
    'rgb(var(--chord-4) / 0.9)',
    'rgb(var(--chord-5) / 0.9)',
  ];
  // text classes matching BOX_TRACE_COLORS, so chain chips double as a legend
  const BOX_TRACE_TEXT = [
    'text-sky-300',
    'text-rose-300',
    'text-violet-300',
    'text-emerald-300',
    'text-amber-300',
  ];
  const [boxedTrace, setBoxedTrace] = useState<string[] | null>(null);
  const [boxedTracePts, setBoxedTracePts] = useState<{ x: number; y: number }[][]>([]);
  const boxedBoardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!boxedTrace || !boxedBoardRef.current) {
      setBoxedTracePts([]);
      return;
    }
    const wrap = boxedBoardRef.current.getBoundingClientRect();
    const measure = (word: string) => {
      const pts: { x: number; y: number }[] = [];
      for (const c of word) {
        const idx = boxedLetters.findIndex((l) => l === c);
        if (idx === -1) continue;
        const el = boxedBoardRef.current!.querySelector(
          `input[data-tile-group="boxed"][data-tile-index="${idx}"]`
        );
        if (!el) continue;
        const r = el.getBoundingClientRect();
        pts.push({ x: r.left + r.width / 2 - wrap.left, y: r.top + r.height / 2 - wrap.top });
      }
      return pts;
    };
    setBoxedTracePts(boxedTrace.map(measure));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxedTrace]);

  function boxedTraceHandlers(words: string[]): ButtonHTMLAttributes<HTMLButtonElement> {
    const show = () => setBoxedTrace(words);
    const hide = () => setBoxedTrace(null);
    return {
      onMouseEnter: show,
      onMouseLeave: hide,
      onPointerDown: show,
      onPointerUp: hide,
      onPointerCancel: hide,
    };
  }

  function changeGridPreset(preset: GridPreset) {
    setGridPreset(preset);
    const dims = GRID_PRESET_DIMS[preset];
    setGridLetters((prev) => {
      const next = Array(dims.rows * dims.cols).fill('');
      for (let i = 0; i < Math.min(prev.length, next.length); i++) next[i] = prev[i];
      return next;
    });
  }
  const [todayStatus, setTodayStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [commonSet, setCommonSet] = useState<Set<string> | null>(null);

  // common-word set used to rank recommended Letter Boxed solutions
  useEffect(() => {
    if (mode === 'boxed' && !commonSet) {
      getDictionary('common').then((ws) => setCommonSet(new Set(ws)));
    }
  }, [mode, commonSet]);
  const [showAll, setShowAll] = useState(false);
  const [sorts, setSorts] = useState(initial.sort);
  const [kbOpen, setKbOpen] = useState(initial.keyboard);
  // "/" is a page now, not a synonym for wherever you left off
  const [atHome, setAtHome] = useState(
    initialRoute.kind === 'home' && initial.startPage === 'home'
  );
  const [startPage, setStartPage] = useState(initial.startPage);
  const [aboutOpen, setAboutOpen] = useState(panelAtLoad('about'));
  const [legalOpen, setLegalOpen] = useState(initialRoute.kind === 'legal');
  const [legalTab, setLegalTab] = useState<'notices' | 'privacy' | 'terms'>(
    initialRoute.kind === 'legal' ? initialRoute.doc : 'notices'
  );
  const [statsOpen, setStatsOpen] = useState(initialRoute.kind === 'stats');
  const [statsTab, setStatsTab] = useState<StatsTab>(
    initialRoute.kind === 'stats' ? initialRoute.tab : 'overall'
  );
  const [learnMode, setLearnMode] = useState(initialGame?.view === 'learn');
  const [accountOpen, setAccountOpen] = useState(
    initialRoute.kind === 'account' || initialRoute.kind === 'friend'
  );
  // an invite link goes straight to the tab it's about
  const [accountTab, setAccountTab] = useState<AccountTab>(
    initialRoute.kind === 'account'
      ? initialRoute.tab
      : initialRoute.kind === 'friend'
        ? 'friends'
        : 'personal'
  );
  const [settingsOpen, setSettingsOpen] = useState(initialRoute.kind === 'settings');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(
    initialRoute.kind === 'settings' ? initialRoute.tab : 'site'
  );
  const [keysOpen, setKeysOpen] = useState(panelAtLoad('keys'));
  const [theme, setTheme] = useState<ThemeMode>(initial.theme);
  const [palette, setPalette] = useState<Palette>(initial.palette);
  const [navKeys, setNavKeys] = useState<NavKeys>(initial.navKeys);
  const [textScale, setTextScale] = useState<TextScale>(initial.textScale);
  const [hiddenModes, setHiddenModes] = useState<Mode[]>(initial.hiddenModes);
  const [hiddenViews, setHiddenViews] = useState<View[]>(initial.hiddenViews);
  const [lengthRange, setLengthRange] = useState<LengthRange>(initial.lengthRange);
  const [practiceAllowed, setPracticeAllowed] = useState(initial.practiceAllowed);
  const [highlightMatches, setHighlightMatches] = useState(initial.highlightMatches);
  const [helpAllowed, setHelpAllowed] = useState(initial.helpAllowed);
  const [solverDictionary, setSolverDictionary] = useState(initial.solverDictionary);
  const [wordFilter, setWordFilter] = useState(initial.wordFilter);
  // the display-filter predicate, shared by Grid's missed-words list; the
  // solver filters its own list where it loads
  const [showWord, setShowWord] = useState<(w: string) => boolean>(() => () => true);
  useEffect(() => {
    let alive = true;
    getDisplayFilter(wordFilter).then((f) => alive && setShowWord(() => f));
    return () => {
      alive = false;
    };
  }, [wordFilter]);
  const [onboarded, setOnboarded] = useState(initial.onboarded);
  const [session, setSession] = useState<Session | null>(null);

  useTheme(theme, palette, textScale);

  // track the auth session when Supabase is configured
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // on sign-in, snapshot this browser's pre-account stats once as the baseline
  useEffect(() => {
    if (session) void importBaselineOnce();
  }, [session]);

  // appearance settings follow the account: pull on sign-in (and whenever the
  // tab comes back to the foreground, so a change made on another device
  // lands here), then push edits
  // State, not a ref: the push effect is gated on this, and a ref changing
  // doesn't re-run an effect. As a ref, the first pull flipped it silently and
  // nothing was ever written back unless the player happened to change a
  // setting afterwards — so a value that was already true locally at load,
  // like onboarded, never reached the account at all.
  const [settingsPulled, setSettingsPulled] = useState(false);
  const pushPending = useRef(false);

  const pullSettings = useCallback(async () => {
    // don't clobber an edit that hasn't been written yet
    if (!supabase || !session || pushPending.current) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error) {
      console.warn('Anagrimoire settings pull failed:', error.message);
      return;
    }
    const s = data?.settings as
      | {
          theme?: ThemeMode;
          palette?: Palette;
          navKeys?: NavKeys;
          textScale?: TextScale;
          hiddenModes?: Mode[];
          hiddenViews?: View[];
          lengthRange?: LengthRange;
          practiceAllowed?: boolean;
          highlightMatches?: boolean;
          helpAllowed?: boolean;
          solverDictionary?: string;
          wordFilter?: string;
          startPage?: StartPage;
          onboarded?: boolean;
        }
      | null;
    if (s?.theme && THEME_MODES.includes(s.theme)) setTheme(s.theme);
    if (s?.palette && PALETTES.includes(s.palette)) setPalette(s.palette);
    if (s?.navKeys === 'numpad' || s?.navKeys === 'wasd') setNavKeys(s.navKeys);
    if (s?.textScale && TEXT_SCALES.includes(s.textScale)) setTextScale(s.textScale);
    if (Array.isArray(s?.hiddenModes)) setHiddenModes(s.hiddenModes.filter((m) => ALL_MODES.includes(m)));
    if (Array.isArray(s?.hiddenViews)) setHiddenViews(s.hiddenViews.filter((v) => ALL_VIEWS.includes(v)));
    if (s?.lengthRange) setLengthRange(s.lengthRange);
    if (typeof s?.practiceAllowed === 'boolean') setPracticeAllowed(s.practiceAllowed);
    if (typeof s?.highlightMatches === 'boolean') setHighlightMatches(s.highlightMatches);
    if (typeof s?.helpAllowed === 'boolean') setHelpAllowed(s.helpAllowed);
    if (s?.solverDictionary)
      setSolverDictionary(asDifficulty(s.solverDictionary) ?? 'per-game');
    if (s?.wordFilter === 'none' || s?.wordFilter === 'strong' || s?.wordFilter === 'all')
      setWordFilter(s.wordFilter);
    if (s?.startPage && ALL_START_PAGES.includes(s.startPage)) setStartPage(s.startPage);
    if (s?.onboarded) setOnboarded(true);
    setSettingsPulled(true);
  }, [session]);

  useEffect(() => {
    if (!session) {
      setSettingsPulled(false);
      return;
    }
    void pullSettings();
  }, [session, pullSettings]);

  useEffect(() => {
    if (!supabase || !session) return;
    const onWake = () => {
      if (document.visibilityState === 'visible') void pullSettings();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [session, pullSettings]);

  useEffect(() => {
    if (!supabase || !session || !settingsPulled) return;
    pushPending.current = true;
    const id = window.setTimeout(async () => {
      const settings = { theme, palette, navKeys, textScale, hiddenModes, hiddenViews, lengthRange, practiceAllowed, highlightMatches, helpAllowed, solverDictionary, wordFilter, startPage, onboarded };
      // update first — it needs only the update policy, which every install
      // has. `select` reveals whether a row actually matched.
      const { data, error } = await supabase!
        .from('profiles')
        .update({ settings })
        .eq('id', session.user.id)
        .select('id');
      if (error) {
        console.warn('Anagrimoire settings sync failed:', error.message);
      } else if (!data?.length) {
        // no profile row yet (the signup trigger never fired) — create one
        const { error: insertError } = await supabase!
          .from('profiles')
          .insert({ id: session.user.id, settings });
        if (insertError) {
          console.warn(
            'Anagrimoire settings sync failed: no profile row, and creating one was refused —',
            insertError.message
          );
        }
      }
      pushPending.current = false;
    }, 500);
    return () => {
      window.clearTimeout(id);
      pushPending.current = false;
    };
  }, [session, settingsPulled, theme, palette, navKeys, textScale, hiddenModes, hiddenViews, lengthRange, practiceAllowed, highlightMatches, helpAllowed, solverDictionary, wordFilter, startPage, onboarded]);

  // surface auth errors that come back in the redirect URL (expired or
  // already-used magic links land here with no other visible sign)
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const desc = params.get('error_description') || params.get('error');
    if (desc) {
      setAuthNotice(desc);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const [patternPlay, setPatternPlay] = useState(initialPlay('pattern', initial.patternPlay));
  const [beePlay, setBeePlay] = useState(initialPlay('bee', initial.beePlay));
  const [boxedPlay, setBoxedPlay] = useState(initialPlay('boxed', initial.boxedPlay));
  const [descramblePlay, setDescramblePlay] = useState(initialPlay('descramble', initial.descramblePlay));
  const [letterStates, setLetterStates] = useState<Record<string, LetterState>>({});
  const [commonWordsArr, setCommonWordsArr] = useState<string[] | null>(null);
  const [fullWordsArr, setFullWordsArr] = useState<string[] | null>(null);
  const [standardWordsArr, setStandardWordsArr] = useState<string[] | null>(null);

  const gameRef = useRef<GuessGameHandle>(null);
  const hiveRef = useRef<HiveGameHandle>(null);
  const boxRef = useRef<BoxGameHandle>(null);
  const scrambleRef = useRef<ScrambleGameHandle>(null);
  const gridRef = useRef<GridGameHandle>(null);
  const learnRef = useRef<LearnModeHandle>(null);
  const weaveRef = useRef<WeaveGameHandle>(null);
  const squaresRef = useRef<SquaresGameHandle>(null);
  const cryptogramRef = useRef<CryptogramGameHandle>(null);

  // The switch and the games both read the same stored value; this only
  // mirrors it so the pressed state re-renders.
  const [level, setLevel] = useState(currentDifficulty);
  useEffect(() => onDifficultyChange(() => setLevel(currentDifficulty())), []);

  // Practice puzzles are built in the browser, so the words a difficulty means
  // have to be here too — the same bands the daily generator draws from.
  const [practiceWordsArr, setPracticeWordsArr] = useState<string[] | null>(null);
  // What this difficulty accepts, one band wider than it sets from.
  const [acceptWordsArr, setAcceptWordsArr] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    setPracticeWordsArr(null);
    getDifficultyPool(level).then((ws) => alive && setPracticeWordsArr(ws));
    getAcceptPool(level).then((ws) => alive && setAcceptWordsArr(ws));
    return () => {
      alive = false;
    };
  }, [level]);

  const patternPlayActive = mode === 'pattern' && patternPlay && !learnMode;
  const beePlayActive = mode === 'bee' && beePlay && !learnMode;
  const boxedPlayActive = mode === 'boxed' && boxedPlay && !learnMode;
  const descramblePlayActive = mode === 'descramble' && descramblePlay && !learnMode;
  const gridPlayActive = mode === 'grid' && gridPlay && !learnMode;
  const weavePlayActive = mode === 'weave' && weavePlay && !learnMode;
  const squaresPlayActive = mode === 'squares' && squaresPlay && !learnMode;
  const cryptogramPlayActive = mode === 'cryptogram' && cryptogramPlay && !learnMode;
  const playActive =
    patternPlayActive || beePlayActive || boxedPlayActive || descramblePlayActive || gridPlayActive || weavePlayActive || squaresPlayActive || cryptogramPlayActive;



  // the guess game validates against the full dictionary and picks practice
  // words from the common one; hive, box, scramble, grid play — and the
  // Learn demos — use standard
  useEffect(() => {
    if (!playActive && !learnMode) return;
    if (!commonWordsArr) getDictionary('common').then(setCommonWordsArr);
    if (patternPlayActive && !fullWordsArr) getDictionary('full').then(setFullWordsArr);
    if (
      (learnMode || beePlayActive || boxedPlayActive || descramblePlayActive || gridPlayActive || weavePlayActive || squaresPlayActive) &&
      !standardWordsArr
    ) {
      getDictionary('standard').then(setStandardWordsArr);
    }
  }, [playActive, learnMode, patternPlayActive, beePlayActive, boxedPlayActive, descramblePlayActive, gridPlayActive, weavePlayActive, squaresPlayActive, commonWordsArr, fullWordsArr, standardWordsArr]);

  const aboutRef = useRef<HTMLDivElement>(null);
  const legalRef = useRef<HTMLDivElement>(null);
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const closeLegal = useCallback(() => setLegalOpen(false), []);
  useModalA11y(aboutRef, closeAbout, aboutOpen);
  useModalA11y(legalRef, closeLegal, legalOpen);

  // the input the on-screen keyboard types into
  const lastFocused = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement) lastFocused.current = e.target;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  // 'per-game' keeps each solver's own pick; anything else is the whole site's
  const dictionaryId = solverDictionary === 'per-game' ? dictionaries[mode] : solverDictionary;
  const setDictionaryId = (id: Difficulty) =>
    setDictionaries((prev) => ({ ...prev, [mode]: id }));

  const sort = sorts[mode];
  const setSort = (s: Partial<SortPref>) =>
    setSorts((prev) => ({ ...prev, [mode]: { ...prev[mode], ...s } }));

  // A shared link names a game and a tab deliberately, so it outranks hiding
  // for this visit: dropping someone on the wrong page because of a setting
  // they made months ago is worse than showing them one game they'd switched
  // off. It doesn't unhide anything — the setting is untouched.
  const shownModes = useMemo(() => {
    const vis = visibleModes(hiddenModes);
    return ALL_MODES.filter((m) => vis.includes(m) || m === linkMode);
  }, [hiddenModes]);

  const shownViews = useMemo(() => {
    const vis = visibleViews(hiddenViews);
    return ALL_VIEWS.filter((v) => vis.includes(v) || v === initialGame?.view);
  }, [hiddenViews]);

  // Words grouped by shape, built only while the cryptogram solver is on
  // screen — it is a pass over the whole dictionary and no other mode wants it.
  const patternIndex = useMemo(() => {
    if (mode !== 'cryptogram' || cryptogramPlay) return null;
    const words = acceptWordsArr ?? standardWordsArr;
    // ordinary words first inside each shape, so a short list is a list of
    // plausible readings rather than whatever happens to sort first
    return words
      ? buildPatternIndex(words, commonWordsArr ? new Set(commonWordsArr) : undefined)
      : null;
  }, [mode, cryptogramPlay, acceptWordsArr, standardWordsArr, commonWordsArr]);

  const cryptoWords = useMemo(
    () => (cryptoText.trim() ? parseCryptogram(cryptoText, cryptoMode) : []),
    [cryptoText, cryptoMode]
  );

  const cryptoAnalysis = useMemo(
    () => (patternIndex && cryptoWords.length ? analyse(cryptoWords, patternIndex, cryptoPins) : null),
    [patternIndex, cryptoWords, cryptoPins]
  );

  /** settle a word on one reading, which propagation then spreads */
  function pinWord(tokens: string[], plain: string) {
    setCryptoPins((prev) => {
      const next = { ...prev };
      tokens.forEach((t, i) => {
        next[t] = plain[i];
      });
      return next;
    });
  }

  const playFlags: Record<Mode, [boolean, (v: boolean) => void]> = {
    pattern: [patternPlay, setPatternPlay],
    descramble: [descramblePlay, setDescramblePlay],
    bee: [beePlay, setBeePlay],
    boxed: [boxedPlay, setBoxedPlay],
    grid: [gridPlay, setGridPlay],
    weave: [weavePlay, setWeavePlay],
    squares: [squaresPlay, setSquaresPlay],
    cryptogram: [cryptogramPlay, setCryptogramPlay],
  };

  const prefs = useMemo(
    () => ({ practiceAllowed, highlightMatches }),
    [practiceAllowed, highlightMatches]
  );

  const currentView: View = learnMode ? 'learn' : playFlags[mode][0] ? 'play' : 'solve';

  function goToView(view: View) {
    if (view === 'learn') {
      setLearnMode(true);
      return;
    }
    setLearnMode(false);
    playFlags[mode][1](view === 'play');
  }

  // Which board each game has open. The games own this — they persist it and
  // they draw the toggle — so they report it up rather than being told. The
  // handle is only for the other direction, when an address asks for the board
  // the player isn't currently on.
  const [dailyByMode, setDailyByMode] = useState<Record<Mode, boolean>>(() => {
    const seed = Object.fromEntries(ALL_MODES.map((m) => [m, true])) as Record<Mode, boolean>;
    if (initialGame?.view === 'play') seed[modeOf(initialGame.slug)] = initialGame.daily;
    return seed;
  });

  // Three boards a day, and you may play all of them — so the switch belongs
  // beside the board rather than buried in settings.
  //
  // On practice as much as on the daily. Practice is the same board generated
  // on the fly and not recorded, so it needs the same control — and since the
  // size pickers are gone, this is the only way to choose a shape there.
  //
  // Grid is here too now: it varies by board size, 4x4 then 5x5. Not shown
  // when someone has asked to be left with one puzzle.
  const showDifficultySwitch = playActive && difficultyMode() === 'all';

  useEffect(
    () =>
      onDailyReport((m, daily) =>
        setDailyByMode((prev) => (prev[m] === daily ? prev : { ...prev, [m]: daily }))
      ),
    []
  );

  // Where the app is, written as an address.
  const currentRoute: Route = useMemo(() => {
    if (legalOpen) return { kind: 'legal', doc: legalTab };
    if (statsOpen) return { kind: 'stats', tab: statsTab };
    if (settingsOpen) return { kind: 'settings', tab: settingsTab };
    if (accountOpen) return { kind: 'account', tab: accountTab };
    const panel: Panel | null = keysOpen ? 'keys' : aboutOpen ? 'about' : null;
    if (panel) return { kind: 'panel', panel };
    if (atHome) return { kind: 'home' };
    return { kind: 'game', view: currentView, slug: MODE_SLUG[mode], daily: dailyByMode[mode] };
  }, [legalOpen, legalTab, statsOpen, statsTab, settingsOpen, settingsTab, keysOpen, accountOpen, accountTab, aboutOpen, atHome, currentView, mode, dailyByMode]);

  // Did we put the panel in the history ourselves? Closing one we pushed is a
  // step back rather than a new address, so Back doesn't reopen what was just
  // dismissed. False at load: arriving straight at /stats leaves nothing of
  // ours behind it, and going back from there should leave the site.
  // the tab, the bookmark, and what a search result would show
  useEffect(() => {
    document.title = titleOf(currentRoute);
  }, [currentRoute]);

  const ourOverlay = useRef(false);
  const settled = useRef(false);
  const prevRoute = useRef<Route | null>(null);

  useEffect(() => {
    const path = pathOf(currentRoute);
    // "/" is a real page when it's the home page, and a placeholder when the
    // start page sends you straight to a game. Leaving the first should be a
    // step you can come back from; overwriting the second is the whole point.
    const leavingHome = prevRoute.current?.kind === 'home';
    prevRoute.current = currentRoute;
    // The first render writes nothing: someone who typed "/" keeps the tidy
    // link they typed, and a route asked for by hand is already on screen.
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (path === window.location.pathname) return;

    // one panel swapped for another replaces the entry rather than stacking it
    if (isOverlay(currentRoute) && ourOverlay.current) {
      history.replaceState(null, '', path + window.location.hash);
      return;
    }
    if (!isOverlay(currentRoute) && ourOverlay.current) {
      ourOverlay.current = false;
      history.back();
      return;
    }
    if (window.location.pathname === '/' && !leavingHome) {
      history.replaceState(null, '', path + window.location.hash);
    } else {
      history.pushState(null, '', path + window.location.hash);
    }
    ourOverlay.current = isOverlay(currentRoute);
  }, [currentRoute]);

  // Back and Forward. The browser has already changed the URL by the time this
  // runs, so the effect above sees a match and stays quiet.
  function applyRoute(r: Route) {
    setAboutOpen(r.kind === 'panel' && r.panel === 'about');
    setKeysOpen(r.kind === 'panel' && r.panel === 'keys');
    if (r.kind === 'friend') stashInvite(r.code);
    setAccountOpen(r.kind === 'account' || r.kind === 'friend');
    if (r.kind === 'account') setAccountTab(r.tab);
    if (r.kind === 'friend') setAccountTab('friends');
    setStatsOpen(r.kind === 'stats');
    setSettingsOpen(r.kind === 'settings');
    setLegalOpen(r.kind === 'legal');
    if (r.kind === 'stats') setStatsTab(r.tab);
    if (r.kind === 'settings') setSettingsTab(r.tab);
    if (r.kind === 'legal') setLegalTab(r.doc);
    setAtHome(r.kind === 'home');
    if (r.kind === 'game') {
      const m = modeOf(r.slug);
      setMode(m);
      if (r.view === 'learn') {
        setLearnMode(true);
      } else {
        setLearnMode(false);
        playFlags[m][1](r.view === 'play');
        if (r.view === 'play') requestDaily(m, r.daily);
      }
    }
    ourOverlay.current = false;
  }

  // through a ref so the listener is registered once, but always runs the
  // current closure rather than one holding last render's state
  const applyRef = useRef(applyRoute);
  applyRef.current = applyRoute;
  useEffect(() => {
    const onPop = () =>
      applyRef.current(parsePath(window.location.pathname) ?? { kind: 'home' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const shownLengths = useMemo(() => lengthChoices(lengthRange), [lengthRange]);

  // hiding the game or tab you're standing on shouldn't leave you nowhere
  useEffect(() => {
    if (!shownModes.includes(mode)) setMode(shownModes[0]);
  }, [shownModes, mode]);

  // narrowing the range around the length you're on moves you to the nearest
  // one still offered, rather than leaving nothing selected
  useEffect(() => {
    if (length < lengthRange.min) setLength(lengthRange.min);
    else if (length > lengthRange.max) setLength(lengthRange.max);
  }, [lengthRange, length]);

  useEffect(() => {
    if (!shownViews.includes(currentView)) goToView(shownViews[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownViews, currentView, mode]);

  // persist tool, per-tool dictionary, and last inputs
  useEffect(() => {
    saveState({
      mode,
      dictionaries,
      sort: sorts,
      keyboard: kbOpen,
      theme,
      palette,
      textScale,
      navKeys,
      hiddenModes,
      hiddenViews,
      lengthRange,
      practiceAllowed,
      highlightMatches,
      helpAllowed,
      solverDictionary,
      wordFilter,
      startPage,
      onboarded,
      patternPlay,
      beePlay,
      boxedPlay,
      descramblePlay,
      gridPlay,
      pattern: { length, known, contains: containsStr, excluded: excludedStr },
      descramble: { rack: rackStr, useAll, minLength },
      bee: { center: beeCenter, outers: beeOuters },
      boxed: { letters: boxedLetters, solutionWords },
      grid: { letters: gridLetters, preset: gridPreset },
      squares: { letters: squaresLetters, size: squaresSize },
      weave: { letters: weaveLetters, size: weaveSize },
      weavePlay,
      squaresPlay,
      cryptogram: { cipher: '' },
      cryptogramPlay,
    });
  }, [mode, dictionaries, sorts, kbOpen, theme, palette, textScale, navKeys, hiddenModes, hiddenViews, lengthRange, practiceAllowed, highlightMatches, helpAllowed, solverDictionary, wordFilter, startPage, onboarded, patternPlay, beePlay, boxedPlay, descramblePlay, gridPlay, length, known, containsStr, excludedStr, rackStr, useAll, minLength, beeCenter, beeOuters, boxedLetters, solutionWords, gridLetters, gridPreset, weaveLetters, weaveSize, weavePlay, squaresPlay, squaresLetters, squaresSize, cryptogramPlay]);

  // keep known array sized to length
  useEffect(() => {
    setKnown((prev) => {
      const next = Array(length).fill('');
      for (let i = 0; i < Math.min(prev.length, length); i++) next[i] = prev[i] ?? '';
      return next;
    });
  }, [length]);

  const contains = useMemo(() => normalizeLetters(containsStr), [containsStr]);
  const excluded = useMemo(() => normalizeLetters(excludedStr), [excludedStr]);

  const [words, setWords] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    // The accept pool, not the raw tier: the solver's Hard is what Hard
    // accepts in a game, so a word the solver finds is a word that scores.
    // The display filter then hides what this player asked not to be shown —
    // display only, so two players on one board still play the same rules.
    Promise.all([getAcceptPool(dictionaryId), getDisplayFilter(wordFilter)]).then(
      ([w, show]) => {
        if (alive) setWords(wordFilter === 'none' ? w : w.filter(show));
      }
    );
    return () => {
      alive = false;
    };
  }, [dictionaryId, wordFilter]);

  const rackLetters = useMemo(
    () => rackStr.toLowerCase().replace(/[^a-z]/g, '').split('').filter(Boolean),
    [rackStr]
  );
  const wildcards = useMemo(() => (rackStr.match(/\?/g) ?? []).length, [rackStr]);

  const beeAllowed = useMemo(
    () => new Set([beeCenter, ...beeOuters].filter(Boolean)),
    [beeCenter, beeOuters]
  );

  const boxedSides = useMemo(
    () => [0, 3, 6, 9].map((s) => boxedLetters.slice(s, s + 3).filter(Boolean)),
    [boxedLetters]
  );

  const results = useMemo(() => {
    if (mode === 'descramble') {
      return solveDescramble(words, { letters: rackLetters, wildcards, useAll, minLength });
    }
    if (mode === 'bee') {
      return solveBee(words, { center: beeCenter, outers: beeOuters });
    }
    if (mode === 'boxed') {
      return solveBoxed(words, { sides: boxedSides });
    }
    if (mode === 'grid') {
      return solveGrid(words, { cells: gridLetters, cols: gridDims.cols });
    }
    if (mode === 'weave') {
      return weavePlay ? [] : solveGrid(words, { cells: weaveLetters, cols: weaveDims.cols });
    }
    return solvePattern(words, { length, known, contains, excluded });
  }, [mode, words, length, known, contains, excluded, rackLetters, wildcards, useAll, minLength, beeCenter, beeOuters, boxedSides, gridLetters, gridDims, weavePlay, weaveLetters, weaveDims]);

  // shared index for Letter Boxed chain searches; null until all 12 letters are in
  const boxedIndex = useMemo<ChainIndex | null>(() => {
    if (mode !== 'boxed') return null;
    const letters = [...new Set(boxedLetters.filter(Boolean))];
    if (letters.length !== 12) return null;
    const idx = new Map(letters.map((c, i) => [c, i]));
    const popcount = (m: number) => {
      let n = 0;
      while (m) {
        m &= m - 1;
        n++;
      }
      return n;
    };
    const entries: ChainEntry[] = results.map((w) => {
      let m = 0;
      for (let i = 0; i < w.length; i++) m |= 1 << (idx.get(w[i]) ?? 0);
      return { w, m, last: w[w.length - 1] };
    });
    // trying letter-rich words first surfaces good solutions before the budget runs out
    entries.sort((a, b) => popcount(b.m) - popcount(a.m));
    const byFirst = new Map<string, ChainEntry[]>();
    for (const e of entries) {
      const g = byFirst.get(e.w[0]) ?? [];
      g.push(e);
      byFirst.set(e.w[0], g);
    }
    return { entries, byFirst, fullMask: (1 << 12) - 1 };
  }, [mode, results, boxedLetters]);

  const boxedChains = useMemo(
    () => (boxedIndex ? findChains(boxedIndex, solutionWords) : { solutions: [], capped: false }),
    [boxedIndex, solutionWords]
  );

  // recommended: fewest words, preferring everyday vocabulary, then fewest letters
  const boxedRecommended = useMemo(() => {
    if (!boxedIndex) return null;
    for (let k = 1; k <= 5; k++) {
      const { solutions } =
        k === solutionWords ? boxedChains : findChains(boxedIndex, k, 200, 1_000_000);
      if (solutions.length) {
        const score = (s: string[]) => {
          const allCommon = commonSet ? s.every((w) => commonSet.has(w)) : true;
          return (allCommon ? 0 : 1000) + s.reduce((n, w) => n + w.length, 0);
        };
        let best = solutions[0];
        for (const s of solutions) if (score(s) < score(best)) best = s;
        return { words: best, allCommon: commonSet ? best.every((w) => commonSet.has(w)) : false };
      }
    }
    return null;
  }, [boxedIndex, boxedChains, solutionWords, commonSet]);

  async function fillTodaysBee() {
    setTodayStatus('loading');
    try {
      const r = await fetch(
        'https://raw.githubusercontent.com/rptetzloff/anagrimoire/puzzle-data/data/spellingbee.json',
        { cache: 'no-store' }
      );
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      const center = String(d.center).toLowerCase();
      const outers = (d.outers as string[]).map((c) => String(c).toLowerCase());
      if (!/^[a-z]$/.test(center) || outers.length !== 6 || !outers.every((c) => /^[a-z]$/.test(c))) {
        throw new Error('bad payload');
      }
      setBeeCenter(center);
      setBeeOuters(outers);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  async function fillTodaysPuzzle() {
    setTodayStatus('loading');
    try {
      const r = await fetch(
        'https://raw.githubusercontent.com/rptetzloff/anagrimoire/puzzle-data/data/letterboxed.json',
        { cache: 'no-store' }
      );
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      const letters = (d.sides as string[])
        .flatMap((s) => s.toLowerCase().replace(/[^a-z]/g, '').split(''))
        .slice(0, 12);
      if (letters.length !== 12) throw new Error('bad payload');
      setBoxedLetters(letters);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  // our own generated dailies, loadable into every solver
  async function fillDailyHive() {
    setTodayStatus('loading');
    try {
      const d = await fetchDailyData('daily-hive');
      const center = String(d.center).toLowerCase();
      const outers = (d.outers as string[]).map((c) => String(c).toLowerCase());
      if (!/^[a-z]$/.test(center) || outers.length !== 6 || !outers.every((c) => /^[a-z]$/.test(c))) {
        throw new Error('bad payload');
      }
      setBeeCenter(center);
      setBeeOuters(outers);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  async function fillDailyBox() {
    setTodayStatus('loading');
    try {
      const d = await fetchDailyData('daily-box');
      const letters = (d.sides as string[])
        .flatMap((s) => String(s).toLowerCase().replace(/[^a-z]/g, '').split(''))
        .slice(0, 12);
      if (letters.length !== 12) throw new Error('bad payload');
      setBoxedLetters(letters);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  async function fillDailyGrid() {
    setTodayStatus('loading');
    try {
      const d = await fetchDailyData('daily-grid');
      const cells = (d.cells as string[]).map((c) => String(c).toLowerCase());
      if (cells.length !== 16 || !cells.every((c) => /^[a-z]$/.test(c))) {
        throw new Error('bad payload');
      }
      setGridPreset('4x4');
      setGridLetters(cells);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  async function fillDailyRack() {
    setTodayStatus('loading');
    try {
      const d = await fetchDailyData('daily-scramble');
      const letters = (d.letters as string[]).map((c) => String(c).toLowerCase());
      if (letters.length !== 7 || !letters.every((c) => /^[a-z]$/.test(c))) {
        throw new Error('bad payload');
      }
      setRackStr(letters.join(''));
      setUseAll(false);
      setTodayStatus('idle');
    } catch {
      setTodayStatus('error');
    }
  }

  const squareFill = useMemo(() => {
    if (mode !== 'squares' || squaresPlay) return null;
    const n = squaresSize;
    const grid = Array.from({ length: n * n }, (_, i) => {
      const r = Math.floor(i / n);
      const c = i % n;
      return squaresLetters[r * 5 + c] || null;
    });
    return solveSquare(words, grid, n, 6);
  }, [mode, squaresPlay, squaresSize, squaresLetters, words]);

  const sorted = useMemo(() => {
    const arr = [...results];
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'alpha') {
      arr.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0) * dir);
    } else {
      // direction applies to length; ties stay alphabetical
      arr.sort((a, b) => (a.length - b.length) * dir || (a < b ? -1 : a > b ? 1 : 0));
    }
    return arr;
  }, [results, sort]);

  const visible = showAll ? sorted : sorted.slice(0, 200);

  const pangrams =
    mode === 'bee' && beeAllowed.size === 7
      ? visible.filter((w) => new Set(w).size === 7)
      : [];
  const pangramSet = new Set(pangrams);
  const groupSource = mode === 'bee' ? visible.filter((w) => !pangramSet.has(w)) : visible;

  const containsSet = new Set(contains);

  function highlight(word: string) {
    return word.split('').map((ch, i) => {
      const isKnown = known[i] === ch;
      const isContains = !isKnown && containsSet.has(ch);
      return (
        <span
          key={i}
          className={
            isKnown
              ? 'text-emerald-300 font-semibold'
              : isContains
                ? 'text-amber-300 font-semibold'
                : 'text-slate-300'
          }
        >
          {ch}
        </span>
      );
    });
  }

  function pickDefaultTarget(): HTMLInputElement | null {
    if (mode === 'descramble') {
      return document.querySelector<HTMLInputElement>('input[aria-label="Letters to descramble"]');
    }
    const group =
      mode === 'bee'
        ? 'bee'
        : mode === 'boxed'
          ? 'boxed'
          : mode === 'grid'
            ? 'grid'
            : mode === 'weave'
              ? 'weave'
              : 'known';
    const tiles = [...document.querySelectorAll<HTMLInputElement>(`input[data-tile-group="${group}"]`)];
    return tiles.find((t) => !t.value) ?? tiles[0] ?? null;
  }

  function pressKey(k: string) {
    if (learnMode) {
      learnRef.current?.pressKey(k);
      return;
    }
    if (weavePlayActive) {
      weaveRef.current?.pressKey(k);
      return;
    }
    if (squaresPlayActive) {
      squaresRef.current?.pressKey(k);
      return;
    }
    if (cryptogramPlayActive) {
      cryptogramRef.current?.pressKey(k);
      return;
    }
    if (patternPlayActive) {
      gameRef.current?.pressKey(k);
      return;
    }
    if (beePlayActive) {
      hiveRef.current?.pressKey(k);
      return;
    }
    if (boxedPlayActive) {
      boxRef.current?.pressKey(k);
      return;
    }
    if (descramblePlayActive) {
      scrambleRef.current?.pressKey(k);
      return;
    }
    if (gridPlayActive) {
      gridRef.current?.pressKey(k);
      return;
    }
    const remembered =
      lastFocused.current && document.contains(lastFocused.current) ? lastFocused.current : null;
    const target = remembered ?? pickDefaultTarget();
    if (!target) return;
    target.focus();

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const isTile = target.hasAttribute('data-tile-group');

    if (k === 'backspace') {
      if (isTile) {
        if (target.value) {
          setValue.call(target, '');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const g = target.getAttribute('data-tile-group');
          const i = Number(target.getAttribute('data-tile-index'));
          const prev = document.querySelector<HTMLInputElement>(
            `input[data-tile-group="${g}"][data-tile-index="${i - 1}"]`
          );
          if (prev) {
            prev.focus();
            prev.select();
          }
        }
      } else {
        // chip inputs keep their inner input empty; their own Backspace
        // handler removes the last pill
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      }
      return;
    }

    setValue.call(target, isTile ? k : target.value + k);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function resetAll() {
    setKnown(Array(length).fill(''));
    setContainsStr('');
    setExcludedStr('');
    setRackStr('');
    setBeeCenter('');
    setBeeOuters(Array(6).fill(''));
    setBoxedLetters(Array(12).fill(''));
    setGridLetters(Array(gridDims.rows * gridDims.cols).fill(''));
    setWeaveLetters(Array(weaveDims.rows * weaveDims.cols).fill(''));
    setStrandsClue(null);
  }

  return (
    <PaletteContext.Provider value={palette}>
    <PrefsContext.Provider value={prefs}>
    <OskContext.Provider value={kbOpen}>
    <div className="min-h-screen bg-slate-950 text-white relative overflow-x-clip">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 -right-40 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px]" />

      {/* keyboard users can jump the mode tabs and land on the puzzle */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:px-4 focus:py-2.5 focus:rounded-lg focus:bg-amber-400 focus:text-ink focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Top nav bar — gone entirely with one game. A bar holding a single
          tab is a switch with one position, and dropping to just the wordmark
          would only print the site's name directly above the h1 that already
          says it. The page header below carries the identity instead. */}
      {shownModes.length > 1 && (
      <nav
        aria-label="Game modes"
        className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur border-b border-white/10"
      >
        {/* No wordmark up here any more — the page header carries the name,
            and without it the tabs can sit centred at every width instead of
            being pushed to one side on desktop. */}
        <div className="max-w-3xl mx-auto px-2 sm:px-5 flex items-center justify-center">
          {/* the column count follows what's actually shown, so hiding games
              widens the rest rather than leaving gaps */}
          <div
            className="flex-1 md:flex-none grid md:flex gap-0.5 sm:gap-1 py-1.5"
            style={{ gridTemplateColumns: `repeat(${shownModes.length}, minmax(0, 1fr))` }}
          >
            {MODES.filter((m) => shownModes.includes(m.id)).map((m) => {
              const Icon = MODE_ICONS[m.id];
              return (
                <RouteLink
                  key={m.id}
                  to={pathOf({
                    kind: 'game',
                    view: currentView,
                    slug: MODE_SLUG[m.id],
                    daily: dailyByMode[m.id],
                  })}
                  onGo={() => {
                    // picking a game from the nav is also how you leave home
                    setAtHome(false);
                    setMode(m.id);
                  }}
                  title={m.blurb}
                  className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1.5 px-1 md:px-3 py-1.5 rounded-lg whitespace-nowrap text-[0.625rem] md:text-sm font-medium md:font-semibold transition-colors
                    ${!atHome && mode === m.id
                      ? 'bg-emerald-400/15 text-emerald-300'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                  <Icon className="w-5 h-5 md:w-4 md:h-4" />
                  <span>{m.label}</span>
                </RouteLink>
              );
            })}
          </div>
        </div>
      </nav>
      )}

      <main
        id="main"
        tabIndex={-1}
        className={`relative max-w-3xl mx-auto px-5 py-10 sm:py-16 outline-none ${kbOpen ? 'pb-64 sm:pb-64' : ''}`}
      >
        {/* header */}
        <header className="text-center mb-8">
          {/* The wordmark is a lockup rather than an image file: the mark is
              the only part that has to be drawn, and the name is real text, so
              it themes itself, follows the text-size setting, and can't render
              in the wrong font on someone else's machine. The mark is alt=""
              because the text beside it already names the heading.
              Dimensions on the tag so it can't shove the page down as it
              loads. */}
          <h1 className="mb-4 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-1">
            <img
              src="/logo.png"
              alt=""
              width={512}
              height={512}
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl shadow-lg shadow-black/30 shrink-0"
            />
            {/* bg-clip-text paints inside the element's box, so the g's tail
                needs padding below the line or it gets sliced off. The
                matching negative margin keeps that padding out of the layout,
                so the name still sits centred against the mark. */}
            <span className="pb-[0.4em] -mb-[0.4em] text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent">
              Anagrimoire
            </span>
          </h1>
          {!atHome && (
            <p className="text-slate-400 max-w-md mx-auto text-sm sm:text-base">
              {shownViews.includes('solve')
                ? MODES.find((m) => m.id === mode)?.description
                : MODES.find((m) => m.id === mode)?.playDescription}
            </p>
          )}
        </header>

        {atHome && (
          <HomeView
            modes={shownModes}
            onOpen={(m) => {
              setAtHome(false);
              setMode(m);
              // not goToView: that reads `mode`, which is still the game we're
              // leaving until this render commits, so it would flip the wrong
              // game's tab
              setLearnMode(false);
              playFlags[m][1](true);
              requestDaily(m, true);
            }}
            onBoards={() => {
              setStatsTab('boards');
              setStatsOpen(true);
            }}
          />
        )}

        {!atHome && (
        <>
        {/* Only where there's a Learn tab to point at, and only until it's
            been answered either way. `currentView` keeps it off the Learn tab
            itself, where it would be telling someone about the page they're
            already reading. */}
        {!onboarded &&
          // signed in, the account gets the deciding vote — wait for it rather
          // than flashing "new here?" at someone who answered on another device
          (!session || settingsPulled) &&
          shownViews.includes('learn') &&
          currentView !== 'learn' && (
          <OnboardingCard
            game={MODES.find((m) => m.id === mode)?.label ?? 'this game'}
            onLearn={() => {
              goToView('learn');
              setOnboarded(true);
            }}
            onDismiss={() => setOnboarded(true)}
          />
        )}

        {/* solve / play / learn toggle — gone entirely when only one is left,
            since a switch with one position is just clutter. Hiding Solve and
            Learn is how the site becomes a game site rather than a tool with
            games attached. */}
        <section className={`mb-7 text-center ${shownViews.length > 1 ? '' : 'hidden'}`}>
          {/* wraps rather than overflowing: at 320px with the largest text
              this row is wider than the viewport, and the page clips its
              horizontal overflow, so Learn was cut off with no way to reach
              it */}
          <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
              {(
                [
                  { view: 'solve', label: 'Solve', Icon: Search },
                  { view: 'play', label: 'Play', Icon: Gamepad2 },
                  { view: 'learn', label: 'Learn', Icon: BookOpen },
                ] as const
              )
                .filter(({ view }) => shownViews.includes(view))
                .map(({ view, label, Icon }) => {
                const active = currentView === view;
                return (
                  <RouteLink
                    key={label}
                    to={pathOf({
                      kind: 'game',
                      view,
                      slug: MODE_SLUG[mode],
                      daily: dailyByMode[mode],
                    })}
                    onGo={() => goToView(view)}
                    className={`inline-flex items-center gap-1.5 px-4 sm:px-5 h-10 rounded-lg text-sm font-semibold transition-all duration-150
                      ${active
                        ? 'bg-emerald-400 text-ink shadow-lg shadow-emerald-500/30'
                        : 'text-slate-300 hover:bg-white/10'}`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </RouteLink>
                );
              })}
          </div>
        </section>

        {showDifficultySwitch && (
          <section className="mb-7 text-center">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
              Difficulty
            </label>
            <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
              {DIFFICULTIES.map((id) => (
                <button
                  key={id}
                  onClick={() => setDifficulty(id)}
                  aria-pressed={level === id}
                  className={`px-3.5 h-9 rounded-lg text-sm font-semibold transition-colors
                    ${level === id
                      ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30'
                      : 'text-slate-300 hover:bg-white/10'}`}
                >
                  {DIFFICULTY_LABEL[id]}
                </button>
              ))}
            </div>
          </section>
        )}

        {learnMode && (
          <div className="mb-8">
            <LearnMode
              ref={learnRef}
              mode={mode}
              standardWords={standardWordsArr}
              palette={palette}
            />
          </div>
        )}

        {!learnMode && (
        <>
        {squaresPlayActive && (
        <div className="mb-8">
          <SquaresGame ref={squaresRef} standardWords={acceptWordsArr ?? standardWordsArr} />
        </div>
        )}

        {cryptogramPlayActive && (
        <div className="mb-8">
          <CryptogramGame ref={cryptogramRef} />
        </div>
        )}

        {/* Deduce, then offer. This never picks a reading: it settles what the
            word shapes force and hands back the choices for what they don't,
            because a passage can have several readings where every word is
            real and only a person can tell which one means anything. */}
        {mode === 'cryptogram' && !cryptogramPlay && (
        <div className="mb-8 max-w-2xl mx-auto">
          <label htmlFor="crypto-in" className="block text-sm text-slate-300 mb-2">
            Paste a cryptogram. Every mark has to stand for the same letter throughout.
          </label>
          <textarea
            id="crypto-in"
            value={cryptoText}
            onChange={(e) => {
              setCryptoText(e.target.value);
              setCryptoPins({});
            }}
            rows={3}
            spellCheck={false}
            placeholder={cryptoMode === 'letters' ? 'WKH TXLFN EURZQ IRA' : '17 42 42 / 8 9 3'}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 placeholder:text-slate-600 text-sm font-mono"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div role="group" aria-label="How the marks are written" className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
              {([['letters', 'Letters'], ['tokens', 'Numbers or symbols']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setCryptoMode(id); setCryptoPins({}); }}
                  aria-pressed={cryptoMode === id}
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors
                    ${cryptoMode === id ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400 hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {Object.keys(cryptoPins).length > 0 && (
              <button
                onClick={() => setCryptoPins({})}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Eraser className="w-4 h-4" />
                Undo my picks
              </button>
            )}
          </div>

          {cryptoMode === 'tokens' && (
            <p className="mt-2 text-xs text-slate-500">
              Marks separated by spaces, words by a slash — nothing about &ldquo;17 42&rdquo;
              says whether that is one word or two.
            </p>
          )}

          {cryptoAnalysis && (
            <div className="mt-5" aria-live="polite">
              <p className="text-lg text-white leading-relaxed font-mono break-words">
                {cryptoWords
                  .map((w) => w.map((t) => cryptoAnalysis.mapping[t] ?? '·').join(''))
                  .join(' ')}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {cryptoAnalysis.contradiction
                  ? 'No reading fits — one of your picks can’t be right. Undo them and try another.'
                  : `${Object.keys(cryptoAnalysis.mapping).length} marks settled. A dot is a mark the shapes can’t pin yet.`}
              </p>
              {!cryptoAnalysis.contradiction &&
                !cryptoAnalysis.words.some(
                  (w) => w.candidates.length > 1 && w.candidates.length <= 40
                ) &&
                cryptoAnalysis.words.some((w) => w.candidates.length > 40) && (
                  <p className="mt-2 text-xs text-slate-500">
                    Nothing is narrow enough to choose from yet — every word still has
                    hundreds of readings. Pick a word below, or come back once you have a
                    letter or two of your own.
                  </p>
                )}

              {/* Most-constrained first, and only words narrow enough to act
                  on. A five-letter word with three thousand readings is not a
                  choice, it is a wall — and listing it buries the word with
                  four, which is where the deduction actually is. */}
              <div className="mt-4 space-y-2">
                {cryptoAnalysis.words
                  .filter((w) => w.candidates.length > 1 && w.candidates.length <= 40)
                  .sort((a, b) => a.candidates.length - b.candidates.length)
                  .slice(0, 12)
                  .map((w) => (
                    <div key={w.tokens.join(' ')} className="flex flex-wrap items-baseline gap-2">
                      <span className="text-xs font-mono text-slate-500 shrink-0">
                        {w.tokens.join(cryptoMode === 'letters' ? '' : ' ')}
                      </span>
                      {w.candidates.slice(0, 10).map((c) => (
                        <button
                          key={c}
                          onClick={() => pinWord(w.tokens, c)}
                          className="px-2 py-0.5 rounded-md text-sm bg-white/5 border border-white/10 text-slate-300 hover:bg-emerald-400/15 hover:text-emerald-300 transition-colors"
                        >
                          {c}
                        </button>
                      ))}
                      {w.candidates.length > 10 && (
                        <span className="text-xs text-slate-600">
                          +{w.candidates.length - 10} more
                        </span>
                      )}
                    </div>
                  ))}
              </div>

              {!cryptoAnalysis.contradiction &&
                cryptoAnalysis.words.every((w) => w.candidates.length === 1) && (
                  <p className="mt-3 text-xs text-emerald-300">
                    Every word has one reading left, so that is the answer.
                  </p>
                )}
            </div>
          )}
        </div>
        )}

        {weavePlayActive && (
        <div className="mb-8">
          <WeaveGame ref={weaveRef} standardWords={acceptWordsArr ?? standardWordsArr} navKeys={navKeys} />
        </div>
        )}

        {mode === 'squares' && !squaresPlay && (
        <div className="mb-8 text-center">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            Grid size
          </label>
          <div className="mb-5 inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
            {([4, 5] as SquareSolverSize[]).map((sz) => (
              <button
                key={sz}
                onClick={() => setSquaresSize(sz)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors
                  ${squaresSize === sz ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {sz}×{sz}
              </button>
            ))}
          </div>

          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            Known letters
          </label>
          {/* letters live in a 25-slot array indexed by row*5+col, so dropping
              to 4×4 and back doesn't throw away what was typed */}
          <div className="w-fit mx-auto">
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${squaresSize}, auto)` }}
            >
              {Array.from({ length: squaresSize * squaresSize }, (_, i) => {
                const slot = Math.floor(i / squaresSize) * 5 + (i % squaresSize);
                return (
                  <Tile
                    key={slot}
                    index={i}
                    group="squares"
                    osk={kbOpen}
                    value={squaresLetters[slot]}
                    state={squaresLetters[slot] ? 'known' : 'empty'}
                    size="sm"
                    onChange={(c) =>
                      setSquaresLetters((prev) => prev.map((x, j) => (j === slot ? c : x)))
                    }
                  />
                );
              })}
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-400">
            Leave a cell blank and we&apos;ll fill it. Every row and every column
            comes out a word.
          </p>

          {squareFill && (
            <div className="mt-6">
              {squareFill.solutions.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {squareFill.exhausted
                    ? 'No square fits those letters.'
                    : 'Gave up looking — pin down another letter or two and try again.'}
                </p>
              ) : (
                <>
                  <p className="text-sm text-slate-400 mb-4">
                    {squareFill.solutions.length}
                    {squareFill.exhausted ? '' : '+'}{' '}
                    {squareFill.solutions.length === 1 ? 'square' : 'squares'} fit
                  </p>
                  <div className="flex flex-wrap justify-center gap-5">
                    {squareFill.solutions.map((rows, k) => (
                      <div
                        key={k}
                        className="grid gap-1"
                        style={{ gridTemplateColumns: `repeat(${squaresSize}, auto)` }}
                      >
                        {rows.flatMap((w, r) =>
                          w.split('').map((ch, c) => {
                            const typed = !!squaresLetters[r * 5 + c];
                            return (
                              <span
                                key={`${r}-${c}`}
                                className={`w-7 h-8 flex items-center justify-center rounded-md border text-sm font-bold uppercase
                                  ${typed
                                    ? 'bg-white/15 border-white/25 text-white'
                                    : 'bg-transparent border-white/10 text-accent'}`}
                              >
                                {ch}
                              </span>
                            );
                          })
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        )}

        {mode === 'weave' && !weavePlay && (
        <div className="mb-8 text-center">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            Board size
          </label>
          <div className="mb-5 inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
            {(
              [
                { id: '6x8', label: '6×8' },
                { id: '8x10', label: '8×10' },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => changeWeaveSize(id)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap transition-colors
                  ${weaveSize === id ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
            The board
          </label>
          <div ref={gridBoardRef} className="relative w-fit mx-auto">
            <div className={`grid gap-1.5 ${weaveDims.cols === 8 ? 'grid-cols-8' : 'grid-cols-6'}`}>
              {weaveLetters.map((v, i) => (
                <Tile
                  key={i}
                  index={i}
                  group="weave"
                  osk={kbOpen}
                  value={v}
                  state={v ? 'known' : 'empty'}
                  size="sm"
                  tone={gridTrace?.includes(i) ? GRID_TRACE_TONE : undefined}
                  onChange={(c) =>
                    setWeaveLetters((prev) => prev.map((x, j) => (j === i ? c : x)))
                  }
                />
              ))}
            </div>
            {gridTracePts.length > 1 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <polyline
                  points={gridTracePts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="rgb(var(--trace) / 0.9)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={gridTracePts[0].x} cy={gridTracePts[0].y} r="6" fill="rgb(var(--trace))" />
              </svg>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={fillTodaysStrands}
              disabled={todayStatus === 'loading'}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
            >
              <CalendarDays className="w-4 h-4" />
              {todayStatus === 'loading' ? 'Fetching…' : "Today's NYT Strands"}
            </button>
            <button
              onClick={fillTodaysWeave}
              disabled={todayStatus === 'loading'}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
            >
              <CalendarDays className="w-4 h-4" />
              {todayStatus === 'loading' ? 'Fetching…' : "Today's daily weave"}
            </button>
          </div>
          {todayStatus === 'error' && (
            <p className="mt-2 text-xs text-danger">
              Couldn&apos;t fetch today&apos;s puzzle — try again in a minute.
            </p>
          )}
          {strandsClue && (
            <p className="mt-2 text-sm text-amber-300">
              Theme: <span className="font-semibold">{strandsClue}</span>
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Words are 3+ letters traced through adjacent cells (diagonals count), using each
            cell once. Hover a result to trace it on the board. Today&apos;s Strands becomes
            available here about 15 minutes after the NYT publishes it (3:00&nbsp;a.m. Eastern).
          </p>
        </div>
        )}

        {/* dictionary selector — hidden when one dictionary has been chosen
            for the whole site, since there'd be nothing left for it to pick */}
        {!playActive && solverDictionary === 'per-game' && (
        <section className="mb-7 text-center">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            Word list
          </label>
          <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
            {DICTIONARIES.map((d) => (
              <button
                key={d.id}
                onClick={() => setDictionaryId(d.id)}
                title={d.blurb}
                className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold transition-all duration-150
                  ${dictionaryId === d.id
                    ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30'
                    : 'text-slate-300 hover:bg-white/10'}`}
              >
                {d.id === 'easy' && <BookOpen className="w-3.5 h-3.5" />}
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {DICTIONARIES.find((d) => d.id === dictionaryId)?.blurb}
          </p>
        </section>
        )}

        {mode === 'pattern' && (
        <>
        {/* length selector — gone when the range allows only one, the same way
            the view switch goes when one tab is left */}
        <section className={`mb-7 text-center ${shownLengths.length > 1 ? '' : 'hidden'}`}>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            Word length
          </label>
          <div className="flex flex-wrap gap-2 justify-center">
            {shownLengths.map((n) => (
              <button
                key={n}
                onClick={() => setLength(n)}
                className={`w-11 h-11 rounded-xl text-sm font-semibold transition-all duration-150
                  ${length === n
                    ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30 scale-105'
                    : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        {patternPlay ? (
        <div className="mb-8">
          <GuessGame
            ref={gameRef}
            length={length}
            commonWords={commonWordsArr}
            practiceWords={practiceWordsArr}
            fullWords={acceptWordsArr ?? fullWordsArr}
            onLetterStates={setLetterStates}
            onReveal={!shownViews.includes('solve') || !helpAllowed ? undefined : ({ length: len, known: k, contains, excluded }) => {
              setLength(len);
              setKnown(k);
              setContainsStr(contains);
              setExcludedStr(excluded);
              setPatternPlay(false);
            }}
          />
        </div>
        ) : (
        <>
        {/* known positions */}
        <section className="mb-7 text-center">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            Known positions
          </label>
          <div className="flex flex-wrap gap-2 justify-center">
            {known.map((v, i) => (
              <Tile
                key={i}
                index={i}
                group="known"
                osk={kbOpen}
                value={v}
                state={v ? 'known' : 'empty'}
                size={length > 10 ? 'sm' : 'md'}
                onChange={(c) =>
                  setKnown((prev) => prev.map((x, j) => (j === i ? c : x)))
                }
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Fill a box only when you're certain of the letter in that spot.
          </p>
        </section>

        {/* contains + excluded */}
        <div className="grid sm:grid-cols-2 gap-5 mb-8">
          <section>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
              Must contain <span className="text-accent normal-case">(position unknown)</span>
            </label>
            <LetterChipInput
              value={containsStr}
              onChange={setContainsStr}
              ariaLabel="Letters the word must contain"
              placeholder="e.g. d"
              maxLen={15}
              tone="amber"
              osk={kbOpen}
            />
          </section>
          <section>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
              Excluded letters
            </label>
            <LetterChipInput
              value={excludedStr}
              onChange={setExcludedStr}
              ariaLabel="Excluded letters"
              placeholder="letters not in the word"
              maxLen={26}
              tone="rose"
              osk={kbOpen}
            />
          </section>
        </div>
        </>
        )}
        </>
        )}

        {descramblePlayActive && (
        <div className="mb-8">
          <ScrambleGame
            ref={scrambleRef}
            standardWords={acceptWordsArr ?? standardWordsArr}
            commonWords={commonWordsArr}
            practiceWords={practiceWordsArr}
            onLetterStates={setLetterStates}
            onReveal={!shownViews.includes('solve') || !helpAllowed ? undefined : (letters) => {
              setRackStr(letters);
              setUseAll(false);
              setMinLength(3);
              setDescramblePlay(false);
            }}
          />
        </div>
        )}

        {mode === 'descramble' && !descramblePlay && (
        <div className="mb-8">
          <section className="mb-5">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5 text-center">
              Your letters <span className="text-accent normal-case">(use ? for a blank tile)</span>
            </label>
            <LetterChipInput
              value={rackStr}
              onChange={setRackStr}
              ariaLabel="Letters to descramble"
              placeholder="e.g. aetrsn?"
              maxLen={MAX_LEN}
              allowWildcard
              tone="amber"
              osk={kbOpen}
            />
          </section>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={fillDailyRack}
              disabled={todayStatus === 'loading'}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
            >
              <CalendarDays className="w-4 h-4" />
              {todayStatus === 'loading' ? 'Fetching…' : "Today's daily rack"}
            </button>
            <button
              onClick={() => setUseAll((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold transition-all duration-150 border
                ${useAll
                  ? 'bg-amber-400 text-ink border-amber-400 shadow-lg shadow-amber-500/30'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
            >
              Use every letter
            </button>
            {!useAll && (
              <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                Min length
                <select
                  value={minLength}
                  onChange={(e) => setMinLength(Number(e.target.value))}
                  className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm font-semibold text-white outline-none focus:border-amber-400 [&>option]:bg-slate-900"
                >
                  {[2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {todayStatus === 'error' && (
            <p className="mt-2 text-xs text-danger text-center">
              Couldn&apos;t fetch today&apos;s rack — try again in a minute.
            </p>
          )}
        </div>
        )}

        {beePlayActive && (
        <div className="mb-8">
          <HiveGame
            ref={hiveRef}
            standardWords={acceptWordsArr ?? standardWordsArr}
            commonWords={commonWordsArr}
            practiceWords={practiceWordsArr}
            onLetterStates={setLetterStates}
            onReveal={!shownViews.includes('solve') || !helpAllowed ? undefined : (center, outers) => {
              setBeeCenter(center);
              setBeeOuters(outers);
              setBeePlay(false);
            }}
          />
        </div>
        )}

        {mode === 'bee' && !beePlay && (
        <div className="mb-8 text-center">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
            The hive
          </label>
          <div className="relative w-full max-w-[14rem] aspect-square mx-auto">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Tile
                index={0}
                group="bee"
                osk={kbOpen}
                value={beeCenter}
                state="center"
                size="sm"
                onChange={(c) => setBeeCenter(c)}
              />
            </div>
            {BEE_POSITIONS.map(([x, y], i) => (
              <div
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <Tile
                  index={i + 1}
                  group="bee"
                  osk={kbOpen}
                  value={beeOuters[i]}
                  state={beeOuters[i] ? 'known' : 'empty'}
                  size="sm"
                  onChange={(c) =>
                    setBeeOuters((prev) => prev.map((x2, j) => (j === i ? c : x2)))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={fillDailyHive}
              disabled={todayStatus === 'loading'}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
            >
              <CalendarDays className="w-4 h-4" />
              {todayStatus === 'loading' ? 'Fetching…' : "Today's daily hive"}
            </button>
            <button
              onClick={fillTodaysBee}
              disabled={todayStatus === 'loading'}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
            >
              <CalendarDays className="w-4 h-4" />
              {todayStatus === 'loading' ? 'Fetching…' : "Today's NYT bee"}
            </button>
          </div>
          {todayStatus === 'error' && (
            <p className="mt-2 text-xs text-danger">
              Couldn&apos;t fetch today&apos;s puzzle — try again in a minute.
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Words are 4+ letters, must use the amber center letter, and may repeat letters.
            Words using all seven letters are pangrams. Both today&apos;s puzzles become
            available about 15 minutes after 3:00&nbsp;a.m. Eastern.
          </p>
        </div>
        )}

        {gridPlayActive && (
        <div className="mb-8">
          <GridGame
            ref={gridRef}
            standardWords={acceptWordsArr ?? standardWordsArr}
            displayWord={showWord}
            onLetterStates={setLetterStates}
            onReveal={!shownViews.includes('solve') || !helpAllowed ? undefined : (cells) => {
              setGridPreset(cells.length === 9 ? '3x3' : cells.length === 25 ? '5x5' : '4x4');
              setGridLetters(cells);
              setGridPlay(false);
            }}
          />
        </div>
        )}

        {mode === 'grid' && !gridPlay && (
        <div className="mb-8 text-center">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            Grid size
          </label>
          <div className="mb-5 inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
            {(
              [
                { id: '3x3', label: '3×3' },
                { id: '4x4', label: '4×4' },
                { id: '5x5', label: '5×5' },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => changeGridPreset(id)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap transition-colors
                  ${gridPreset === id ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
            The grid
          </label>
          <div ref={gridBoardRef} className="relative w-fit mx-auto">
            <div
              className={`grid gap-2 ${
                gridDims.cols === 3 ? 'grid-cols-3' : gridDims.cols === 5 ? 'grid-cols-5' : 'grid-cols-4'
              }`}
            >
              {gridLetters.map((v, i) => (
                <Tile
                  key={i}
                  index={i}
                  group="grid"
                  osk={kbOpen}
                  value={v}
                  state={v ? 'known' : 'empty'}
                  size="sm"
                  tone={gridTrace?.includes(i) ? GRID_TRACE_TONE : undefined}
                  onChange={(c) =>
                    setGridLetters((prev) => prev.map((x, j) => (j === i ? c : x)))
                  }
                />
              ))}
            </div>
            {gridTracePts.length > 1 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <polyline
                  points={gridTracePts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="rgb(var(--trace) / 0.9)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={gridTracePts[0].x} cy={gridTracePts[0].y} r="6" fill="rgb(var(--trace))" />
              </svg>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={fillDailyGrid}
              disabled={todayStatus === 'loading'}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
            >
              <CalendarDays className="w-4 h-4" />
              {todayStatus === 'loading' ? 'Fetching…' : "Today's daily grid"}
            </button>
          </div>
          {todayStatus === 'error' && (
            <p className="mt-2 text-xs text-danger">
              Couldn&apos;t fetch today&apos;s grid — try again in a minute.
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Words are 3+ letters traced through adjacent cells (diagonals count), using each
            cell once. Hover a result to trace it on the board.
          </p>
        </div>
        )}

        {boxedPlayActive && (
        <div className="mb-8">
          <BoxGame
            ref={boxRef}
            standardWords={acceptWordsArr ?? standardWordsArr}
            commonWords={commonWordsArr}
            practiceWords={practiceWordsArr}
            onLetterStates={setLetterStates}
            onReveal={!shownViews.includes('solve') || !helpAllowed ? undefined : (sides) => {
              setBoxedLetters(sides.flatMap((s) => s.split('')).slice(0, 12));
              setBoxedPlay(false);
            }}
          />
        </div>
        )}

        {mode === 'boxed' && !boxedPlay && (() => {
          const boxTile = (i: number) => (
            <Tile
              key={i}
              index={i}
              group="boxed"
              osk={kbOpen}
              value={boxedLetters[i]}
              state={boxedLetters[i] ? 'known' : 'empty'}
              size="sm"
              tone={BOX_SIDE_TONES[Math.floor(i / 3)]}
              onChange={(c) =>
                setBoxedLetters((prev) => prev.map((x, k) => (k === i ? c : x)))
              }
            />
          );
          return (
            <div className="mb-8 text-center">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                Sides of the box
              </label>
              <div ref={boxedBoardRef} className="relative w-full max-w-[18rem] aspect-square mx-auto">
                <div className="absolute inset-14 rounded-xl border-2 border-white/15 bg-white/[0.02]" />
                {/* top */}
                <div className="absolute top-0 left-14 right-14 flex justify-around">
                  {[0, 1, 2].map(boxTile)}
                </div>
                {/* right */}
                <div className="absolute right-0 top-14 bottom-14 flex flex-col justify-around items-end">
                  {[3, 4, 5].map(boxTile)}
                </div>
                {/* bottom */}
                <div className="absolute bottom-0 left-14 right-14 flex justify-around">
                  {[6, 7, 8].map(boxTile)}
                </div>
                {/* left */}
                <div className="absolute left-0 top-14 bottom-14 flex flex-col justify-around items-start">
                  {[9, 10, 11].map(boxTile)}
                </div>
                {boxedTracePts.some((pts) => pts.length > 1) && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {boxedTracePts.map((pts, wi) =>
                      pts.length > 1 ? (
                        <g key={wi}>
                          <polyline
                            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke={BOX_TRACE_COLORS[wi % BOX_TRACE_COLORS.length]}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle
                            cx={pts[0].x}
                            cy={pts[0].y}
                            r="5"
                            fill={BOX_TRACE_COLORS[wi % BOX_TRACE_COLORS.length]}
                          />
                        </g>
                      ) : null
                    )}
                  </svg>
                )}
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={fillDailyBox}
                  disabled={todayStatus === 'loading'}
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                >
                  <CalendarDays className="w-4 h-4" />
                  {todayStatus === 'loading' ? 'Fetching…' : "Today's daily box"}
                </button>
                <button
                  onClick={fillTodaysPuzzle}
                  disabled={todayStatus === 'loading'}
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                >
                  <CalendarDays className="w-4 h-4" />
                  {todayStatus === 'loading' ? 'Fetching…' : "Today's NYT box"}
                </button>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  Solution words
                  <span className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setSolutionWords(n)}
                        className={`w-8 h-8 rounded-md text-sm font-semibold transition-colors
                          ${solutionWords === n
                            ? 'bg-white/15 text-white'
                            : 'text-slate-400 hover:text-white'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </span>
                </label>
              </div>
              {todayStatus === 'error' && (
                <p className="mt-2 text-xs text-danger">
                  Couldn&apos;t fetch today&apos;s puzzle — try again in a minute.
                </p>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Words are 3+ letters and may reuse letters, but consecutive letters can&apos;t
                come from the same side. Both today&apos;s puzzles become available about
                15 minutes after the NYT publishes it (3:00&nbsp;a.m. Eastern).
              </p>
            </div>
          );
        })()}

        {!playActive && mode !== 'squares' && mode !== 'cryptogram' && (
        <>
        {/* results header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-white/10">
              <Search className="w-4 h-4 text-slate-300" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">
                {results.length}
                <span className="text-base font-normal text-slate-400 ml-1.5">
                  {results.length === 1 ? 'match' : 'matches'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode !== 'pattern' && (
              <div className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
                {(['length', 'alpha'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSort({ key: k })}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors
                      ${sort.key === k
                        ? 'bg-white/15 text-white'
                        : 'text-slate-400 hover:text-white'}`}
                  >
                    {k === 'length' ? 'Length' : 'A–Z'}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setSort({ dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
              title={
                sort.key === 'alpha'
                  ? sort.dir === 'asc'
                    ? 'A to Z — click for Z to A'
                    : 'Z to A — click for A to Z'
                  : sort.dir === 'asc'
                    ? 'Shortest first — click for longest first'
                    : 'Longest first — click for shortest first'
              }
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              {sort.dir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={resetAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <Eraser className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        </div>

        {/* results */}
        {results.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
            <p className="text-slate-400">
              {mode === 'descramble'
                ? rackLetters.length + wildcards === 0
                  ? 'Type your letters above to see what they can spell.'
                  : 'Nothing spells from those letters. Try adding a wildcard (?) or lowering the minimum length.'
                : mode === 'bee'
                  ? beeCenter === ''
                    ? 'Enter the center letter and the six outer letters to find words.'
                    : 'No words found from those letters. Double-check the puzzle.'
                  : mode === 'boxed'
                    ? boxedLetters.filter(Boolean).length < 12
                      ? 'Enter the twelve letters, three per side, to find words.'
                      : 'No words fit this box. Double-check the puzzle.'
                    : mode === 'grid'
                      ? gridLetters.filter(Boolean).length < gridLetters.length
                        ? `Fill in all ${gridLetters.length} grid letters to find words.`
                        : 'No words can be traced on this grid.'
                      : mode === 'weave'
                        ? weaveLetters.filter(Boolean).length < weaveLetters.length
                          ? `Fill in all ${weaveLetters.length} board letters to find words.`
                          : 'No words can be traced on this board.'
                        : 'No words fit those clues. Try loosening a constraint.'}
            </p>
          </div>
        ) : (
          <>
            {mode === 'pattern' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {visible.map((w) => (
                  <WordChip
                    key={w}
                    word={w}
                    className="bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20"
                  >
                    {highlight(w)}
                  </WordChip>
                ))}
              </div>
            ) : (
              <>
              {boxedRecommended && (
                <div className="mb-6">
                  <p className="mb-2.5 text-xs font-medium text-accent uppercase tracking-wider inline-flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5" />
                    Recommended
                    <span className="text-accent normal-case tracking-normal">
                      · {boxedRecommended.words.length}{' '}
                      {boxedRecommended.words.length === 1 ? 'word' : 'words'}
                      {boxedRecommended.allCommon ? ', everyday vocabulary' : ''}
                    </span>
                  </p>
                  <div className="grid grid-cols-1 gap-2.5">
                    <WordChip
                      word={boxedRecommended.words.join(' ')}
                      hoverProps={boxedTraceHandlers(boxedRecommended.words)}
                      className="bg-amber-400/10 border border-amber-400/30 text-amber-200 font-semibold hover:bg-amber-400/20"
                    >
                      {boxedRecommended.words.map((w, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-slate-500"> → </span>}
                          <span className={BOX_TRACE_TEXT[i % BOX_TRACE_TEXT.length]}>{w}</span>
                        </span>
                      ))}
                    </WordChip>
                  </div>
                </div>
              )}
              {mode === 'boxed' && boxedIndex && (
                <div className="mb-6">
                  <p className="mb-2.5 text-xs font-medium text-success uppercase tracking-wider">
                    {solutionWords}-word solutions{' '}
                    <span className="text-success">
                      · {boxedChains.capped ? `${boxedChains.solutions.length}+` : boxedChains.solutions.length}
                    </span>
                  </p>
                  {boxedChains.solutions.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No {solutionWords}-word solutions found — try allowing more words.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {boxedChains.solutions.slice(0, 24).map((s) => (
                          <WordChip
                            key={s.join(' ')}
                            word={s.join(' ')}
                            hoverProps={boxedTraceHandlers(s)}
                            className="bg-emerald-400/10 border border-emerald-400/30 text-emerald-200 font-semibold hover:bg-emerald-400/20"
                          >
                            {s.map((w, i) => (
                              <span key={i}>
                                {i > 0 && <span className="text-slate-500"> → </span>}
                                <span className={BOX_TRACE_TEXT[i % BOX_TRACE_TEXT.length]}>{w}</span>
                              </span>
                            ))}
                          </WordChip>
                        ))}
                      </div>
                      {boxedChains.solutions.length > 24 && (
                        <p className="mt-2 text-xs text-slate-500">
                          Showing the 24 shortest of{' '}
                          {boxedChains.capped
                            ? `${boxedChains.solutions.length}+ (search capped)`
                            : boxedChains.solutions.length}{' '}
                          solutions.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              {pangrams.length > 0 && (
                <div className="mb-6">
                  <p className="mb-2.5 text-xs font-medium text-accent uppercase tracking-wider">
                    Pangrams <span className="text-accent">· {pangrams.length}</span>
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {pangrams.map((w) => (
                      <WordChip
                        key={w}
                        word={w}
                        className="bg-amber-400/10 border border-amber-400/30 text-amber-200 font-semibold hover:bg-amber-400/20"
                      />
                    ))}
                  </div>
                </div>
              )}
              {sort.key === 'length' ? (
                [...groupSource.reduce((m, w) => {
                  const g = m.get(w.length) ?? [];
                  g.push(w);
                  return m.set(w.length, g);
                }, new Map<number, string[]>())].map(([len, ws]) => (
                  <div key={len} className="mb-6">
                    <p className="mb-2.5 text-xs font-medium text-slate-400 uppercase tracking-wider">
                      {len} letters <span className="text-slate-600">· {ws.length}</span>
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                      {ws.map((w) => (
                        <WordChip
                          key={w}
                          word={w}
                          hoverProps={mode === 'grid' ? gridTraceHandlers(w) : mode === 'weave' ? weaveTraceHandlers(w) : mode === 'boxed' ? boxedTraceHandlers([w]) : undefined}
                          className="bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] hover:border-white/20"
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {groupSource.map((w) => (
                    <WordChip
                      key={w}
                      word={w}
                      hoverProps={mode === 'grid' ? gridTraceHandlers(w) : mode === 'weave' ? weaveTraceHandlers(w) : mode === 'boxed' ? boxedTraceHandlers([w]) : undefined}
                      className="bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] hover:border-white/20"
                    />
                  ))}
                </div>
              )}
              </>
            )}
            {results.length > 200 && (
              <button
                onClick={() => setShowAll((s) => !s)}
                className="mt-5 mx-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-amber-300 bg-amber-400/10 border border-amber-400/20 hover:bg-amber-400/20 transition-colors"
              >
                {showAll ? (
                  <>
                    <X className="w-4 h-4" /> Show fewer
                  </>
                ) : (
                  <>
                    <ArrowDown className="w-4 h-4" /> Show all {results.length}
                  </>
                )}
              </button>
            )}
          </>
        )}
        </>
        )}
        </>
        )}
        </>
        )}

        {/* pb keeps the last row clear of the floating keyboard button */}
        <footer className="mt-14 pb-24 sm:pb-4 text-center text-xs text-slate-500">
          {!playActive && !learnMode && (
            <p>
              Searching {words.length.toLocaleString()} English words (the{' '}
              {DICTIONARIES.find((d) => d.id === dictionaryId)?.label.toLowerCase()} word
              list).
            </p>
          )}
          {/* wraps into centered rows rather than one overflowing line */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
            <RouteLink
              to="/"
              onGo={() => setAtHome(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              Home
            </RouteLink>
            <a
              href="https://github.com/rptetzloff/anagrimoire"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
            <RouteLink
              to="/stats/overall"
              onGo={() => setStatsOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Stats
            </RouteLink>
            <RouteLink
              to="/settings/site"
              onGo={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </RouteLink>
            <RouteLink
              to="/keys"
              onGo={() => setKeysOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Keyboard className="w-3.5 h-3.5" />
              Keys
            </RouteLink>
            {supabase && (
              <RouteLink
                to={session ? '/account' : '/sign-in'}
                onGo={() => setAccountOpen(true)}
                className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
              >
                <UserRound className="w-3.5 h-3.5" />
                {session ? 'Account' : 'Sign in'}
              </RouteLink>
            )}
            <RouteLink
              to="/about"
              onGo={() => setAboutOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
              About &amp; FAQ
            </RouteLink>
            <RouteLink
              to="/legal/notices"
              onGo={() => setLegalOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Scale className="w-3.5 h-3.5" />
              Legal
            </RouteLink>
          </div>
        </footer>
      </main>

      {authNotice && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] max-w-md w-[calc(100%-2rem)] rounded-xl bg-rose-950/95 border border-rose-500/40 px-4 py-3 shadow-2xl flex items-start gap-3">
          <p className="text-sm text-rose-200 flex-1">
            Sign-in didn&apos;t complete: {authNotice}. Request a fresh link, or use the
            emailed code instead.
          </p>
          <button
            onClick={() => setAuthNotice(null)}
            aria-label="Dismiss"
            className="text-rose-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {statsOpen && (
        <StatsModal
          signedIn={!!session}
          view={statsTab}
          onView={setStatsTab}
          onClose={() => setStatsOpen(false)}
        />
      )}

      {accountOpen && (
        <AccountModal
          session={session}
          tab={accountTab}
          onTab={setAccountTab}
          onClose={() => setAccountOpen(false)}
        />
      )}

      <ConsentBanner
        onReadPolicy={() => {
          setLegalTab('privacy');
          setLegalOpen(true);
        }}
      />

      {keysOpen && (
        <KeyboardHelp
          navKeys={navKeys}
          shownModes={shownModes}
          onClose={() => setKeysOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          tab={settingsTab}
          onTab={setSettingsTab}
          startPage={startPage}
          onStartPage={setStartPage}
          theme={theme}
          palette={palette}
          navKeys={navKeys}
          textScale={textScale}
          hiddenModes={hiddenModes}
          hiddenViews={hiddenViews}
          lengthRange={lengthRange}
          practiceAllowed={practiceAllowed}
          highlightMatches={highlightMatches}
          helpAllowed={helpAllowed}
          solverDictionary={solverDictionary}
          signedIn={!!session}
          onTheme={setTheme}
          onPalette={setPalette}
          onNavKeys={setNavKeys}
          onTextScale={setTextScale}
          onToggleMode={(m) =>
            setHiddenModes((prev) =>
              prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
            )
          }
          onLengthRange={setLengthRange}
          onPracticeAllowed={setPracticeAllowed}
          onHighlightMatches={setHighlightMatches}
          onHelpAllowed={setHelpAllowed}
          onSolverDictionary={setSolverDictionary}
          wordFilter={wordFilter}
          onWordFilter={setWordFilter}
          onToggleView={(v) =>
            setHiddenViews((prev) =>
              prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
            )
          }
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* about & FAQ modal */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setAboutOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="About and FAQ"
            ref={aboutRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-slate-900 border border-white/10 text-left shadow-2xl"
          >
            {/* outside the scroll, so it can't slide away mid-read */}
            <button
              onClick={() => setAboutOpen(false)}
              aria-label="Close"
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900/95 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="overflow-y-auto p-6 sm:p-8">
            <h2 className="text-xl font-bold mb-5">About Anagrimoire</h2>

            <div className="space-y-5 text-sm text-slate-300">
              <p>
                Anagrimoire is a free companion for word games: solvers for seven kinds of
                puzzles, our own daily and practice versions of each to play, and
                interactive guides to learn them.
              </p>
              <p className="text-slate-400">
                The name is a portmanteau of <em>anagram</em> and <em>grimoire</em> — a
                grimoire being an old book of spells. A spellbook for words, more or less.
              </p>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  FAQ
                </h3>
                <div className="space-y-3 text-slate-400">
                  <div>
                    <p className="text-slate-300 font-medium">How do you say it?</p>
                    <p>
                      <span className="whitespace-nowrap">/ ˈæn ə grimˈwɑr /</span> —{' '}
                      <em>AN-uh-grim-WAHR</em>. <em>Anagram</em> up front, then{' '}
                      <em>grimoire</em> the French way, rhyming with <em>memoir</em>.
                      Stress on the first syllable and the last.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      Are the daily puzzles the same as the NYT&apos;s?
                    </p>
                    <p>
                      No — every daily here is our own, generated fresh each morning, so
                      playing never spoils (or copies) anyone else&apos;s puzzle. The solvers
                      can load today&apos;s NYT Spelling Bee, Letter Boxed, and Strands where
                      noted.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      What do Easy, Hard and Extreme change?
                    </p>
                    <p>
                      They&apos;re three separate puzzles each day, not one puzzle with a
                      setting — each difficulty keeps its own progress, statistics,
                      streaks and leaderboards, and you can play all three. What changes
                      depends on the game: Guess, Scramble, Hive and Boxed draw their
                      answers from progressively less common words; Squares and Weave
                      grow their boards; Grid keeps its dice and widens what scores.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">Which words count?</p>
                    <p>
                      Each difficulty is scored against its own word list — Easy is
                      everyday English, Hard adds the less common words, Extreme takes
                      nearly everything. What a puzzle <em>accepts</em> is deliberately
                      one size more generous than the list its <em>answers</em> come
                      from, so the answer is always something you might recognise while
                      your long shots get the benefit of the doubt. The solvers use the
                      same three lists under the same names, so a word the solver finds
                      at Hard is a word Hard accepts.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      Why was my word rejected?
                    </p>
                    <p>
                      The lists are built from open dictionaries (SCOWL and friends —
                      see Legal for credits), lowercase letters only: no proper nouns,
                      no hyphens or apostrophes, no accents. Nothing is checked against
                      any publisher&apos;s list, so our Hive and the NYT&apos;s bee will
                      disagree at the margins. If a real word is missing, open an issue
                      — the lists do get amended.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      Do you filter offensive words?
                    </p>
                    <p>
                      From what we publish, yes: no puzzle will hand you a slur as its
                      answer. From what you type, no — refusing to publish a word and
                      refusing to accept one you played are different things, and only
                      the first is ours to decide.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">Do I need an account?</p>
                    <p>
                      No. Everything works without one. Signing in carries your
                      statistics <em>and</em> today&apos;s unfinished puzzles between
                      devices — start on a phone, finish on a laptop, and a daily you
                      have already played won&apos;t come back as a fresh board
                      somewhere else. Without an account each browser keeps its own
                      separate progress, which can look like syncing until you compare
                      two of them. The site-wide daily numbers (&quot;across all
                      registered players&quot;) accumulate only from signed-in accounts.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">Where does my data live?</p>
                    <p>
                      In your browser. Solving never leaves your device; if you sign in,
                      your completed games sync to your account.
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">When do new dailies arrive?</p>
                    <p>About 15 minutes after 3:00&nbsp;a.m. Eastern, every day.</p>
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium">
                      Found a bug, or have an idea?
                    </p>
                    <p>
                      <a
                        href="https://github.com/rptetzloff/anagrimoire/issues"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                      >
                        Open an issue on GitHub
                      </a>{' '}
                      — reports and suggestions are both welcome.
                    </p>
                  </div>
                </div>
              </div>

              <p>
                The code is free and open-source, released under the{' '}
                <a
                  href="https://github.com/rptetzloff/anagrimoire/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  MIT License
                </a>{' '}
                and lives on{' '}
                <a
                  href="https://github.com/rptetzloff/anagrimoire"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  GitHub
                </a>
                .
              </p>

              <p>
                Also by me:{' '}
                <a
                  href="https://getrandompassword.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  getrandompassword.net
                </a>
                , a password generator.
              </p>

              <p className="text-slate-500 text-xs">
                Vibe-coded with{' '}
                <a
                  href="https://claude.com/claude-code"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-300 underline underline-offset-2"
                >
                  Claude
                </a>
                .
              </p>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* legal, privacy & licenses modal */}
      {legalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setLegalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Legal and licenses"
            ref={legalRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-slate-900 border border-white/10 text-left shadow-2xl"
          >
            {/* outside the scroll — the privacy policy is the longest thing on
                the site, and losing the close button partway down it is grim */}
            <button
              onClick={() => setLegalOpen(false)}
              aria-label="Close"
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900/95 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="overflow-y-auto p-6 sm:p-8">
            <h2 className="text-xl font-bold mb-4">Legal</h2>

            <div className="inline-flex flex-wrap rounded-xl bg-white/5 border border-white/10 p-1 gap-1 mb-5">
              {(
                [
                  ['notices', 'Notices'],
                  ['privacy', 'Privacy'],
                  ['terms', 'Terms'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setLegalTab(id)}
                  aria-current={legalTab === id ? 'page' : undefined}
                  className={`px-4 h-9 rounded-lg text-sm font-semibold transition-colors
                    ${legalTab === id
                      ? 'bg-emerald-400 text-ink'
                      : 'text-slate-300 hover:bg-white/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {legalTab === 'privacy' && <PrivacyPolicy />}
            {legalTab === 'terms' && <Terms />}

            <div className={`space-y-5 text-sm text-slate-300 ${legalTab === 'notices' ? '' : 'hidden'}`}>
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Disclaimer
                </h3>
                <p className="text-slate-400">
                  Anagrimoire is an independent project. It is not affiliated with,
                  endorsed by, or sponsored by The New York Times Company (Wordle, Spelling
                  Bee, Letter Boxed, Strands), Hasbro or Mattel (Scrabble, Boggle), Tribune Content Agency (Jumble), or any
                  other puzzle publisher. All game names and trademarks are the property of
                  their respective owners and are used here only to describe the kinds of
                  puzzles this tool can help with.
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Word lists
                </h3>
                <ul className="space-y-1.5 text-slate-400 list-disc list-inside">
                  <li>
                    All three word lists — Easy, Hard and Extreme — are built from{' '}
                    <a
                      href="https://github.com/jacksonrayhamilton/wordlist-english"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      wordlist-english
                    </a>{' '}
                    (MIT) and, for the largest tier, from{' '}
                    <a
                      href="http://wordlist.aspell.net/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      SCOWL
                    </a>{' '}
                    itself © Kevin Atkinson — each difficulty cuts deeper into
                    SCOWL&apos;s frequency sizes (55, 70, 80), and every word a game
                    asks or accepts comes from these.
                  </li>
                  <li>
                    Words we won&apos;t use as puzzle answers are drawn from the{' '}
                    <a
                      href="https://github.com/en-wl/wordlist"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      English Speller Database
                    </a>{' '}
                    © 2000–2026 Kevin Atkinson, which marks offensive and vulgar
                    words, and from the{' '}
                    <a
                      href="https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      LDNOOBW list
                    </a>{' '}
                    (CC BY 4.0). They filter what we publish, never what
                    you&apos;re allowed to type — though the word lists
                    themselves contain no slurs, at any tier.
                  </li>
                  <li>
                    Word categories in our shared data files come from{' '}
                    <a
                      href="https://wordnet.princeton.edu/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      WordNet
                    </a>
                    &reg; © Princeton University, used under the{' '}
                    <a
                      href="https://wordnet.princeton.edu/license-and-commercial-use"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      WordNet License
                    </a>
                    . They label words (animal, food, plant&hellip;) and never
                    decide what a puzzle asks or accepts.
                  </li>
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  No word list is guaranteed to match any game&apos;s official dictionary.
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  License
                </h3>
                <p className="text-slate-400">
                  The site&apos;s code is released under the{' '}
                  <a
                    href="https://github.com/rptetzloff/anagrimoire/blob/main/LICENSE"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                  >
                    MIT License
                  </a>
                  .
                </p>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* on-screen keyboard */}
      {kbOpen ? (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-slate-900/95 backdrop-blur border-t border-white/10 px-2 pt-3 pb-4">
          <button
            onClick={() => setKbOpen(false)}
            aria-label="Hide keyboard"
            className="absolute -top-11 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 border border-white/15 text-slate-400 hover:text-white hover:bg-slate-700 hover:border-white/30 shadow-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-full max-w-md mx-auto flex flex-col gap-1.5">
            {[
              'qwertyuiop'.split(''),
              'asdfghjkl'.split(''),
              [
                ...(playActive || learnMode ? ['enter'] : []),
                ...(mode === 'descramble' ? ['?'] : []),
                ...'zxcvbnm'.split(''),
                'backspace',
              ],
            ].map((row, r) => (
              <div key={r} className={`flex w-full gap-1 sm:gap-1.5 ${r === 1 ? 'px-[4.5%]' : ''}`}>
                {row.map((k) => {
                  const state = playActive && /^[a-z]$/.test(k) ? letterStates[k] : undefined;
                  const tone =
                    state === 'correct'
                      ? 'bg-emerald-500/80 hover:bg-emerald-500 text-white'
                      : state === 'present'
                        ? 'bg-amber-400/80 hover:bg-amber-400 text-ink'
                        : state === 'absent'
                          ? 'bg-white/[0.04] hover:bg-white/10 text-slate-600'
                          : 'bg-white/10 hover:bg-white/20 active:bg-white/30 text-white';
                  return (
                    <button
                      key={k}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pressKey(k)}
                      aria-label={k === 'backspace' ? 'Backspace' : k === 'enter' ? 'Enter' : `Key ${k}`}
                      className={`h-11 min-w-0 rounded-md text-sm font-semibold uppercase transition-colors flex items-center justify-center ${tone}
                        ${k === 'backspace' || k === 'enter' ? 'flex-[1.5]' : 'flex-1'}`}
                    >
                      {k === 'backspace' ? (
                        <Delete className="w-4 h-4" />
                      ) : k === 'enter' ? (
                        <CornerDownLeft className="w-4 h-4" />
                      ) : (
                        k
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setKbOpen(true)}
          aria-label="Show keyboard"
          title="Show on-screen keyboard"
          className="fixed bottom-4 right-4 z-50 w-12 h-12 flex items-center justify-center rounded-full bg-slate-800 border border-white/15 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-white/30 shadow-lg transition-colors"
        >
          <Keyboard className="w-5 h-5" />
        </button>
      )}
    </div>
    </OskContext.Provider>
    </PrefsContext.Provider>
    </PaletteContext.Provider>
  );
}

export default App;
