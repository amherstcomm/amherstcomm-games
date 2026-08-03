import { useCallback, useMemo, useState, useEffect, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Search, Sparkles, Eraser, ArrowDown, ArrowUp, X, BookOpen, Grid3x3, Shuffle, Hexagon, Check, Keyboard, Delete, Github, Info, Square, CalendarDays, Star, Gamepad2, CornerDownLeft, LayoutGrid, Puzzle, BarChart3, UserRound, Scale, Settings } from 'lucide-react';
import LearnMode, { type LearnModeHandle } from '@/LearnMode';
import type { Session } from '@supabase/supabase-js';
import StatsModal from '@/StatsModal';
import AccountModal from '@/AccountModal';
import { OskContext } from '@/MobileKeyInput';
import SettingsModal from '@/SettingsModal';
import KeyboardHelp from '@/KeyboardHelp';
import { PALETTES, THEME_MODES, useTheme, type Palette, type ThemeMode } from '@/theme';
import { useModalA11y } from '@/useModalA11y';
import { supabase } from '@/supabase';
import { GA_ID } from '@/analytics';
import { importBaselineOnce } from '@/stats';
import GuessGame, { type GuessGameHandle, type LetterState } from '@/GuessGame';
import HiveGame, { type HiveGameHandle } from '@/HiveGame';
import BoxGame, { type BoxGameHandle } from '@/BoxGame';
import ScrambleGame, { type ScrambleGameHandle } from '@/ScrambleGame';
import GridGame, { type GridGameHandle } from '@/GridGame';
import WeaveGame, { type WeaveGameHandle } from '@/WeaveGame';
import { dailyDataUrl } from '@/dailyData';
import { DICTIONARIES, getDictionary, type DictionaryId } from '@/dictionaries';
import { solvePattern, solveDescramble, solveBee, solveBoxed, solveGrid, findGridPath } from '@/solvers';
import { loadState, saveState, GRID_PRESET_DIMS, WEAVE_DIMS, type GridPreset, type Mode, type NavKeys, type SortPref, type WeaveSize } from '@/storage';

const MIN_LEN = 3;
const MAX_LEN = 15;

const MODES: { id: Mode; label: string; blurb: string; description: string }[] = [
  {
    id: 'pattern',
    label: 'Pattern',
    blurb: 'Wordle, crosswords, hangman — clues about positions',
    description:
      "Lock in the letters you know, list the ones you've seen, and exclude the rest. We'll surface every dictionary word that fits.",
  },
  {
    id: 'descramble',
    label: 'Scramble',
    blurb: 'Scrabble, Jumble — what can these letters spell?',
    description:
      "Type the letters you're holding — with ? for blank tiles — and we'll show every word they can spell.",
  },
  {
    id: 'bee',
    label: 'Hive',
    blurb: 'Seven letters, 4+ letter words, center letter required — Spelling Bee style',
    description:
      "Enter the hive's seven letters and we'll find every word that uses the center — pangrams first.",
  },
  {
    id: 'grid',
    label: 'Grid',
    blurb: 'Boggle style — chain adjacent letters, each cell once',
    description:
      "Enter the grid letters and we'll find every word traceable through adjacent cells.",
  },
  {
    id: 'boxed',
    label: 'Boxed',
    blurb: "Twelve letters on four sides, no two in a row from the same side — Letter Boxed style",
    description:
      "Enter the twelve letters, three per side. We'll find every legal word and the two-word solutions that use all twelve.",
  },
  {
    id: 'weave',
    label: 'Weave',
    blurb: 'Themed words tile the whole board — Strands style',
    description:
      'Play the themed tiling puzzle, or use Solve to list every traceable word on a Strands-style board.',
  },
];

const MODE_ICONS: Record<Mode, typeof Grid3x3> = {
  pattern: Grid3x3,
  descramble: Shuffle,
  bee: Hexagon,
  grid: LayoutGrid,
  boxed: Square,
  weave: Puzzle,
};

function normalizeLetters(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z]/g, '').split('');
}

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
        }}
        maxLength={1}
        inputMode={osk ? 'none' : undefined}
        aria-label={`Letter at position ${index + 1}`}
        placeholder="·"
        className={`${dims} text-center font-bold uppercase rounded-xl border-2 transition-all duration-150 outline-none
          ${state === 'known'
            ? tone?.filled ?? 'bg-emerald-500/15 border-emerald-400 text-emerald-200 shadow-[0_0_20px_-6px] shadow-emerald-500/40'
            : state === 'center'
              ? 'bg-amber-400/15 border-amber-400 text-amber-200 shadow-[0_0_20px_-6px] shadow-amber-400/50 placeholder-amber-200/30'
              : tone?.empty ?? 'bg-white/5 border-white/10 text-white placeholder-white/25 hover:border-white/20'}
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
    empty: 'bg-sky-400/5 border-sky-400/30 text-sky-100 placeholder-sky-200/25 hover:border-sky-400/60',
    filled: 'bg-sky-400/20 border-sky-400 text-sky-100 shadow-[0_0_20px_-6px] shadow-sky-400/40',
  },
  {
    empty: 'bg-violet-400/5 border-violet-400/30 text-violet-100 placeholder-violet-200/25 hover:border-violet-400/60',
    filled: 'bg-violet-400/20 border-violet-400 text-violet-100 shadow-[0_0_20px_-6px] shadow-violet-400/40',
  },
  {
    empty: 'bg-rose-400/5 border-rose-400/30 text-rose-100 placeholder-rose-200/25 hover:border-rose-400/60',
    filled: 'bg-rose-400/20 border-rose-400 text-rose-100 shadow-[0_0_20px_-6px] shadow-rose-400/40',
  },
  {
    empty: 'bg-amber-400/5 border-amber-400/30 text-amber-100 placeholder-amber-200/25 hover:border-amber-400/60',
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
        }}
        inputMode={osk ? 'none' : undefined}
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

function App() {
  const [mode, setMode] = useState<Mode>(initial.mode);
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
  const [gridLetters, setGridLetters] = useState<string[]>(initial.grid.letters);
  const [gridPreset, setGridPreset] = useState<GridPreset>(initial.grid.preset);
  const [gridPlay, setGridPlay] = useState(initial.gridPlay);
  const [weaveLetters, setWeaveLetters] = useState<string[]>(initial.weave.letters);
  const [weaveSize, setWeaveSize] = useState<WeaveSize>(initial.weave.size);
  const [weavePlay, setWeavePlay] = useState(initial.weavePlay);

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
      const r = await fetch(dailyDataUrl('daily-weave'), { cache: 'no-store' });
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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [learnMode, setLearnMode] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(initial.theme);
  const [palette, setPalette] = useState<Palette>(initial.palette);
  const [navKeys, setNavKeys] = useState<NavKeys>(initial.navKeys);
  const [session, setSession] = useState<Session | null>(null);

  useTheme(theme, palette);

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
  const settingsPulled = useRef(false);
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
      | { theme?: ThemeMode; palette?: Palette; navKeys?: NavKeys }
      | null;
    if (s?.theme && THEME_MODES.includes(s.theme)) setTheme(s.theme);
    if (s?.palette && PALETTES.includes(s.palette)) setPalette(s.palette);
    if (s?.navKeys === 'numpad' || s?.navKeys === 'wasd') setNavKeys(s.navKeys);
    settingsPulled.current = true;
  }, [session]);

  useEffect(() => {
    if (!session) {
      settingsPulled.current = false;
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
    if (!supabase || !session || !settingsPulled.current) return;
    pushPending.current = true;
    const id = window.setTimeout(async () => {
      const settings = { theme, palette, navKeys };
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
  }, [session, theme, palette, navKeys]);

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
  const [patternPlay, setPatternPlay] = useState(initial.patternPlay);
  const [beePlay, setBeePlay] = useState(initial.beePlay);
  const [boxedPlay, setBoxedPlay] = useState(initial.boxedPlay);
  const [descramblePlay, setDescramblePlay] = useState(initial.descramblePlay);
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

  const patternPlayActive = mode === 'pattern' && patternPlay && !learnMode;
  const beePlayActive = mode === 'bee' && beePlay && !learnMode;
  const boxedPlayActive = mode === 'boxed' && boxedPlay && !learnMode;
  const descramblePlayActive = mode === 'descramble' && descramblePlay && !learnMode;
  const gridPlayActive = mode === 'grid' && gridPlay && !learnMode;
  const weavePlayActive = mode === 'weave' && weavePlay && !learnMode;
  const playActive =
    patternPlayActive || beePlayActive || boxedPlayActive || descramblePlayActive || gridPlayActive || weavePlayActive;

  // the guess game validates against the full dictionary and picks practice
  // words from the common one; hive, box, scramble, grid play — and the
  // Learn demos — use standard
  useEffect(() => {
    if (!playActive && !learnMode) return;
    if (!commonWordsArr) getDictionary('common').then(setCommonWordsArr);
    if (patternPlayActive && !fullWordsArr) getDictionary('full').then(setFullWordsArr);
    if (
      (learnMode || beePlayActive || boxedPlayActive || descramblePlayActive || gridPlayActive || weavePlayActive) &&
      !standardWordsArr
    ) {
      getDictionary('standard').then(setStandardWordsArr);
    }
  }, [playActive, learnMode, patternPlayActive, beePlayActive, boxedPlayActive, descramblePlayActive, gridPlayActive, weavePlayActive, commonWordsArr, fullWordsArr, standardWordsArr]);

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

  const dictionaryId = dictionaries[mode];
  const setDictionaryId = (id: DictionaryId) =>
    setDictionaries((prev) => ({ ...prev, [mode]: id }));

  const sort = sorts[mode];
  const setSort = (s: Partial<SortPref>) =>
    setSorts((prev) => ({ ...prev, [mode]: { ...prev[mode], ...s } }));

  // persist tool, per-tool dictionary, and last inputs
  useEffect(() => {
    saveState({
      mode,
      dictionaries,
      sort: sorts,
      keyboard: kbOpen,
      theme,
      palette,
      navKeys,
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
      weave: { letters: weaveLetters, size: weaveSize },
      weavePlay,
    });
  }, [mode, dictionaries, sorts, kbOpen, theme, palette, navKeys, patternPlay, beePlay, boxedPlay, descramblePlay, gridPlay, length, known, containsStr, excludedStr, rackStr, useAll, minLength, beeCenter, beeOuters, boxedLetters, solutionWords, gridLetters, gridPreset, weaveLetters, weaveSize, weavePlay]);

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
    getDictionary(dictionaryId).then((w) => {
      if (alive) setWords(w);
    });
    return () => {
      alive = false;
    };
  }, [dictionaryId]);

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
      const r = await fetch(dailyDataUrl('daily-hive'), { cache: 'no-store' });
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

  async function fillDailyBox() {
    setTodayStatus('loading');
    try {
      const r = await fetch(dailyDataUrl('daily-box'), { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
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
      const r = await fetch(dailyDataUrl('daily-grid'), { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
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
      const r = await fetch(dailyDataUrl('daily-scramble'), { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
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

      {/* top nav bar */}
      <nav
        aria-label="Game modes"
        className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur border-b border-white/10"
      >
        <div className="max-w-3xl mx-auto px-2 sm:px-5 flex items-center justify-between gap-2">
          <span className="hidden md:inline-flex items-center gap-2 text-lg font-bold tracking-tight">
            <Sparkles className="w-4 h-4 text-accent" />
            Anagrimoire
          </span>
          <div className="flex-1 md:flex-none grid grid-cols-6 md:flex gap-0.5 sm:gap-1 py-1.5">
            {MODES.map((m) => {
              const Icon = MODE_ICONS[m.id];
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  title={m.blurb}
                  className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1.5 px-1 md:px-3 py-1.5 rounded-lg whitespace-nowrap text-[10px] md:text-sm font-medium md:font-semibold transition-colors
                    ${mode === m.id
                      ? 'bg-emerald-400/15 text-emerald-300'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                  <Icon className="w-5 h-5 md:w-4 md:h-4" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <main
        id="main"
        tabIndex={-1}
        className={`relative max-w-3xl mx-auto px-5 py-10 sm:py-16 outline-none ${kbOpen ? 'pb-64 sm:pb-64' : ''}`}
      >
        {/* header */}
        <header className="text-center mb-8">
          {/* pb + relaxed leading so the g's descender isn't clipped by the
              gradient's text box or crowded into the line below */}
          <h1 className="pb-3 leading-[1.2] text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent">
            Anagrimoire
          </h1>
          <p className="text-slate-400 max-w-md mx-auto text-sm sm:text-base">
            {MODES.find((m) => m.id === mode)?.description}
          </p>
        </header>

        {/* solve / play / learn toggle */}
        <section className="mb-7 text-center">
          <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
              {(
                [
                  { view: 'solve', label: 'Solve', Icon: Search },
                  { view: 'play', label: 'Play', Icon: Gamepad2 },
                  { view: 'learn', label: 'Learn', Icon: BookOpen },
                ] as const
              ).map(({ view, label, Icon }) => {
                const flags: Record<Mode, [boolean, (v: boolean) => void]> = {
                  pattern: [patternPlay, setPatternPlay],
                  descramble: [descramblePlay, setDescramblePlay],
                  bee: [beePlay, setBeePlay],
                  boxed: [boxedPlay, setBoxedPlay],
                  grid: [gridPlay, setGridPlay],
                  weave: [weavePlay, setWeavePlay],
                };
                const [flag, setFlag] = flags[mode];
                const active = view === 'learn' ? learnMode : !learnMode && flag === (view === 'play');
                return (
                  <button
                    key={label}
                    onClick={() => {
                      if (view === 'learn') {
                        setLearnMode(true);
                      } else {
                        setLearnMode(false);
                        setFlag(view === 'play');
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-4 sm:px-5 h-10 rounded-lg text-sm font-semibold transition-all duration-150
                      ${active
                        ? 'bg-emerald-400 text-ink shadow-lg shadow-emerald-500/30'
                        : 'text-slate-300 hover:bg-white/10'}`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                );
              })}
          </div>
        </section>

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
        {weavePlayActive && (
        <div className="mb-8">
          <WeaveGame ref={weaveRef} standardWords={standardWordsArr} navKeys={navKeys} />
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

        {/* dictionary selector */}
        {!playActive && (
        <section className="mb-7 text-center">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            Dictionary
          </label>
          <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
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
                {d.id === 'common' && <BookOpen className="w-3.5 h-3.5" />}
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
        {/* length selector */}
        <section className="mb-7 text-center">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            Word length
          </label>
          <div className="flex flex-wrap gap-2 justify-center">
            {Array.from({ length: MAX_LEN - MIN_LEN + 1 }, (_, i) => i + MIN_LEN).map((n) => (
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
            fullWords={fullWordsArr}
            onLetterStates={setLetterStates}
            onReveal={({ length: len, known: k, contains, excluded }) => {
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
            standardWords={standardWordsArr}
            commonWords={commonWordsArr}
            onLetterStates={setLetterStates}
            onReveal={(letters) => {
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
            standardWords={standardWordsArr}
            commonWords={commonWordsArr}
            onLetterStates={setLetterStates}
            onReveal={(center, outers) => {
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
          <div className="relative w-56 h-56 mx-auto">
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
            standardWords={standardWordsArr}
            onLetterStates={setLetterStates}
            onReveal={(cells) => {
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
            standardWords={standardWordsArr}
            commonWords={commonWordsArr}
            onLetterStates={setLetterStates}
            onReveal={(sides) => {
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
              <div ref={boxedBoardRef} className="relative w-72 h-72 mx-auto">
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

        {!playActive && (
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

        <footer className="mt-14 text-center text-xs text-slate-500">
          {!playActive && !learnMode && (
            <p>
              Searching {words.length.toLocaleString()} English words (
              {DICTIONARIES.find((d) => d.id === dictionaryId)?.label.toLowerCase()} dictionary).
            </p>
          )}
          <div className="mt-3 flex items-center justify-center gap-5">
            <a
              href="https://github.com/rptetzloff/anagrimoire"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
            <button
              onClick={() => setStatsOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Stats
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </button>
            <button
              onClick={() => setKeysOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Keyboard className="w-3.5 h-3.5" />
              Keys
            </button>
            {supabase && (
              <button
                onClick={() => setAccountOpen(true)}
                className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
              >
                <UserRound className="w-3.5 h-3.5" />
                {session ? 'Account' : 'Sign in'}
              </button>
            )}
            <button
              onClick={() => setAboutOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
              About &amp; FAQ
            </button>
            <button
              onClick={() => setLegalOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Scale className="w-3.5 h-3.5" />
              Legal
            </button>
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

      {statsOpen && <StatsModal signedIn={!!session} onClose={() => setStatsOpen(false)} />}

      {accountOpen && <AccountModal session={session} onClose={() => setAccountOpen(false)} />}

      {keysOpen && <KeyboardHelp navKeys={navKeys} onClose={() => setKeysOpen(false)} />}

      {settingsOpen && (
        <SettingsModal
          theme={theme}
          palette={palette}
          navKeys={navKeys}
          signedIn={!!session}
          onTheme={setTheme}
          onPalette={setPalette}
          onNavKeys={setNavKeys}
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
            className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-slate-900 border border-white/10 p-6 sm:p-8 text-left shadow-2xl"
          >
            <button
              onClick={() => setAboutOpen(false)}
              aria-label="Close"
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-xl font-bold mb-5">About Anagrimoire</h2>

            <div className="space-y-5 text-sm text-slate-300">
              <p>
                Anagrimoire is a free companion for word games: solvers for six kinds of
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
                    <p className="text-slate-300 font-medium">Do I need an account?</p>
                    <p>
                      No. Everything works without one — signing in adds cross-device
                      syncing of your play statistics, and the site-wide daily numbers
                      (&quot;across all registered players&quot;) accumulate only from
                      signed-in accounts.
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
            className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-slate-900 border border-white/10 p-6 sm:p-8 text-left shadow-2xl"
          >
            <button
              onClick={() => setLegalOpen(false)}
              aria-label="Close"
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-xl font-bold mb-5">Legal &amp; licenses</h2>

            <div className="space-y-5 text-sm text-slate-300">
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

              {GA_ID && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Privacy
                  </h3>
                  <p className="text-slate-400">
                    Solving happens entirely in your browser — the letters you enter never
                    leave your device. This site uses Google Analytics for anonymous visit
                    statistics, and optional accounts sync only your play results.
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Word lists
                </h3>
                <ul className="space-y-1.5 text-slate-400 list-disc list-inside">
                  <li>
                    Common &amp; Standard dictionaries:{' '}
                    <a
                      href="https://github.com/jacksonrayhamilton/wordlist-english"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      wordlist-english
                    </a>{' '}
                    (MIT), built from{' '}
                    <a
                      href="http://wordlist.aspell.net/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      SCOWL
                    </a>{' '}
                    © Kevin Atkinson.
                  </li>
                  <li>
                    Full dictionary:{' '}
                    <a
                      href="https://github.com/words/an-array-of-english-words"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      an-array-of-english-words
                    </a>{' '}
                    (MIT), derived from the{' '}
                    <a
                      href="https://github.com/lorenbrichter/Words"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                    >
                      Letterpress word list
                    </a>{' '}
                    (CC0, public domain).
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
  );
}

export default App;
