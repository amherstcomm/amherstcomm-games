import { DIFFICULTIES, type Difficulty } from '@/difficulty';
import type { Palette, TextScale, ThemeMode } from '@/theme';
import { store as siteStore } from '@/siteStorage';

export type Mode = 'pattern' | 'descramble' | 'bee' | 'boxed' | 'grid' | 'weave' | 'squares';

/** 'home' is the front page, 'last' is wherever you left off, and a Mode is
 *  that game's daily — for people who came for one game and mean to keep
 *  coming for it. */
export type StartPage = 'home' | 'last' | Mode;

const KEY = 'anagrimoire:v1';

export const ALL_MODES: Mode[] = ['pattern', 'descramble', 'bee', 'boxed', 'grid', 'weave', 'squares'];
export const ALL_START_PAGES: StartPage[] = ['home', 'last', ...ALL_MODES];
/** The solver's lists were Common/Standard/Full before they became the
 *  difficulties' accept tiers. Stored choices carry over rather than reset —
 *  the same three rungs in the same order, under the names play uses. */
const LEGACY_DICTS: Record<string, Difficulty> = {
  common: 'easy',
  standard: 'hard',
  full: 'extreme',
};

export function asDifficulty(v: unknown): Difficulty | null {
  if (typeof v !== 'string') return null;
  if (DIFFICULTIES.includes(v as Difficulty)) return v as Difficulty;
  return LEGACY_DICTS[v] ?? null;
}

// The three tabs a game can be shown in. Someone who only wants to play the
// dailies shouldn't have to walk past a solver to get to them.
export type View = 'solve' | 'play' | 'learn';
export const ALL_VIEWS: View[] = ['solve', 'play', 'learn'];

// Hiding is a display filter and nothing more: statistics, streaks and dailies
// all keep accruing for a hidden game, and unhiding brings back exactly what
// was there. Nothing is deleted, so nothing can be lost by experimenting.
//
// Both lists enforce one survivor. Hiding your way into a blank page is the
// one outcome a settings screen must not allow, and it's easier to refuse the
// last one than to explain an empty site.
export function visibleModes(hidden: Mode[]): Mode[] {
  const left = ALL_MODES.filter((m) => !hidden.includes(m));
  return left.length ? left : ALL_MODES;
}

export function visibleViews(hidden: View[]): View[] {
  const left = ALL_VIEWS.filter((v) => !hidden.includes(v));
  return left.length ? left : ALL_VIEWS;
}

// Pattern offers thirteen word lengths, and plenty of people only ever want
// one of them. Narrowing the range is the same idea as hiding a game: it
// changes what's offered, not what exists — the other lengths keep their
// daily boards and their statistics, and widening the range brings them back.
export const MIN_WORD_LEN = 3;
// Twelve rather than fifteen. Each daily length is its own stream, and the
// long ones are threadbare — 82 common words at fifteen letters is under three
// months before every fifteen-letter daily has been used. Solving and practice
// stop there too: a length the daily can't offer isn't worth a button
// elsewhere either, and the pool thins out for the same reason.
export const MAX_WORD_LEN = 12;

export type LengthRange = { min: number; max: number };

export function lengthChoices({ min, max }: LengthRange): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => i + min);
}

function sanitizeRange(value: unknown): LengthRange {
  const v = value as Partial<LengthRange> | undefined;
  const clamp = (n: unknown, fallback: number) =>
    typeof n === 'number' && Number.isInteger(n) && n >= MIN_WORD_LEN && n <= MAX_WORD_LEN
      ? n
      : fallback;
  const min = clamp(v?.min, MIN_WORD_LEN);
  const max = clamp(v?.max, MAX_WORD_LEN);
  // an inverted range would offer nothing at all
  return min <= max ? { min, max } : { min: MIN_WORD_LEN, max: MAX_WORD_LEN };
}

// which keys step the Weave board cursor around, besides the arrow keys:
// the number pad's ring (7 8 9 / 4 6 / 1 2 3) or the letters around WASD
// (q w e / a d / z s x)
export type NavKeys = 'numpad' | 'wasd';

/** Which flagged words to hide from solver results and reveal lists. Display
 *  only — what scores never changes, and slurs are never shown regardless of
 *  this. 'none' hides nothing; 'strong' hides the strong tier; 'all' hides
 *  mild too. */
export type WordFilterLevel = 'none' | 'strong' | 'all';
const WORD_FILTERS: WordFilterLevel[] = ['none', 'strong', 'all'];

export type SortKey = 'alpha' | 'length';
export type SortDir = 'asc' | 'desc';
export type SortPref = { key: SortKey; dir: SortDir };

export type PersistedState = {
  mode: Mode;
  dictionaries: Record<Mode, Difficulty>;
  sort: Record<Mode, SortPref>;
  keyboard: boolean;
  theme: ThemeMode;
  palette: Palette;
  textScale: TextScale;
  navKeys: NavKeys;
  hiddenModes: Mode[];
  hiddenViews: View[];
  lengthRange: LengthRange;
  practiceAllowed: boolean;
  helpAllowed: boolean;
  solverDictionary: Difficulty | 'per-game';
  wordFilter: WordFilterLevel;
  /** what the front door opens onto: the home page, the game you last had
   *  open, or one particular game for people who only ever want the one */
  startPage: StartPage;
  /** true once the "new here?" card has been seen, dismissed, or followed */
  onboarded: boolean;
  patternPlay: boolean;
  beePlay: boolean;
  boxedPlay: boolean;
  descramblePlay: boolean;
  gridPlay: boolean;
  pattern: { length: number; known: string[]; contains: string; excluded: string };
  descramble: { rack: string; useAll: boolean; minLength: number };
  bee: { center: string; outers: string[] };
  boxed: { letters: string[]; solutionWords: number };
  grid: { letters: string[]; preset: GridPreset };
  weave: { letters: string[]; size: WeaveSize };
  weavePlay: boolean;
  /** the squares solver's own grid, kept at the largest size so switching
   *  down and back doesn't lose what was typed */
  squares: { letters: string[]; size: SquareSolverSize };
  squaresPlay: boolean;
};

export type GridPreset = '3x3' | '4x4' | '5x5';
export const GRID_PRESET_DIMS: Record<GridPreset, { rows: number; cols: number }> = {
  '3x3': { rows: 3, cols: 3 },
  '4x4': { rows: 4, cols: 4 },
  '5x5': { rows: 5, cols: 5 },
};

export type SquareSolverSize = 4 | 5;

export type WeaveSize = '6x8' | '8x10';
export const WEAVE_DIMS: Record<WeaveSize, { rows: number; cols: number }> = {
  '6x8': { rows: 8, cols: 6 }, // Strands-shaped board: 6 wide, 8 tall
  '8x10': { rows: 10, cols: 8 },
};

export const DEFAULT_STATE: PersistedState = {
  mode: 'pattern',
  dictionaries: { pattern: 'easy', descramble: 'easy', bee: 'easy', boxed: 'easy', grid: 'easy', weave: 'hard', squares: 'hard' },
  sort: {
    pattern: { key: 'alpha', dir: 'asc' },
    descramble: { key: 'length', dir: 'desc' },
    bee: { key: 'length', dir: 'desc' },
    boxed: { key: 'length', dir: 'desc' },
    grid: { key: 'length', dir: 'desc' },
    weave: { key: 'length', dir: 'desc' },
    squares: { key: 'length', dir: 'desc' },
  },
  keyboard: false,
  theme: 'system',
  palette: 'default',
  textScale: 'normal',
  navKeys: 'numpad',
  hiddenModes: [],
  hiddenViews: [],
  lengthRange: { min: MIN_WORD_LEN, max: MAX_WORD_LEN },
  practiceAllowed: true,
  helpAllowed: true,
  solverDictionary: 'per-game',
  wordFilter: 'none',
  startPage: 'home',
  onboarded: false,
  patternPlay: false,
  beePlay: false,
  boxedPlay: false,
  descramblePlay: false,
  gridPlay: false,
  pattern: { length: 5, known: Array(5).fill(''), contains: '', excluded: '' },
  descramble: { rack: '', useAll: false, minLength: 3 },
  bee: { center: '', outers: Array(6).fill('') },
  boxed: { letters: Array(12).fill(''), solutionWords: 2 },
  grid: { letters: Array(16).fill(''), preset: '4x4' },
  weave: { letters: Array(48).fill(''), size: '6x8' },
  weavePlay: true,
  squares: { letters: Array(25).fill(''), size: 4 },
  squaresPlay: true,
};

function singleLetter(v: unknown): string {
  return typeof v === 'string' && /^[a-z]$/.test(v) ? v : '';
}

function letterString(v: unknown, extra = ''): string {
  if (typeof v !== 'string') return '';
  return v
    .toLowerCase()
    .replace(new RegExp(`[^a-z${extra}]`, 'g'), '')
    .slice(0, 32);
}

// Keeps only known names, and refuses a list that hides everything — a stored
// value from a future version, or a hand-edited one, shouldn't be able to
// produce a site with nothing on it.
function sanitizeHidden<T extends string>(value: unknown, all: T[]): T[] {
  if (!Array.isArray(value)) return [];
  const kept = all.filter((item) => value.includes(item));
  return kept.length === all.length ? [] : kept;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

export function loadState(): PersistedState {
  try {
    const raw = siteStore.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = JSON.parse(raw);

    const dictionaries = { ...DEFAULT_STATE.dictionaries };
    for (const m of ALL_MODES) {
      const d = asDifficulty(p?.dictionaries?.[m]);
      if (d) dictionaries[m] = d;
    }

    const sort: Record<Mode, SortPref> = {
      pattern: { ...DEFAULT_STATE.sort.pattern },
      descramble: { ...DEFAULT_STATE.sort.descramble },
      bee: { ...DEFAULT_STATE.sort.bee },
      boxed: { ...DEFAULT_STATE.sort.boxed },
      grid: { ...DEFAULT_STATE.sort.grid },
      weave: { ...DEFAULT_STATE.sort.weave },
      squares: { ...DEFAULT_STATE.sort.squares },
    };
    for (const m of ALL_MODES) {
      const s = p?.sort?.[m];
      if (s?.key === 'alpha' || s?.key === 'length') sort[m].key = s.key;
      if (s?.dir === 'asc' || s?.dir === 'desc') sort[m].dir = s.dir;
    }
    // pattern results are all one length; only alphabetical makes sense
    sort.pattern.key = 'alpha';

    // Clamped rather than defaulted: someone who had 15 stored when the cap
    // came down meant "long", so 12 is a better answer than 5.
    const storedLen = p?.pattern?.length;
    const length = Number.isInteger(storedLen)
      ? Math.min(Math.max(storedLen as number, MIN_WORD_LEN), MAX_WORD_LEN)
      : DEFAULT_STATE.pattern.length;
    const known = Array(length).fill('');
    if (Array.isArray(p?.pattern?.known)) {
      for (let i = 0; i < length; i++) known[i] = singleLetter(p.pattern.known[i]);
    }

    const outers = Array(6).fill('');
    if (Array.isArray(p?.bee?.outers)) {
      for (let i = 0; i < 6; i++) outers[i] = singleLetter(p.bee.outers[i]);
    }

    const boxedLetters = Array(12).fill('');
    if (Array.isArray(p?.boxed?.letters)) {
      for (let i = 0; i < 12; i++) boxedLetters[i] = singleLetter(p.boxed.letters[i]);
    }

    const squaresSize: SquareSolverSize = p?.squares?.size === 5 ? 5 : 4;
    const squaresLetters = Array(25).fill('');
    if (Array.isArray(p?.squares?.letters)) {
      for (let i = 0; i < squaresLetters.length; i++) {
        squaresLetters[i] = singleLetter(p.squares.letters[i]);
      }
    }

    const gridPreset: GridPreset = Object.keys(GRID_PRESET_DIMS).includes(p?.grid?.preset)
      ? p.grid.preset
      : '4x4';
    const dims = GRID_PRESET_DIMS[gridPreset];
    const gridLetters = Array(dims.rows * dims.cols).fill('');
    if (Array.isArray(p?.grid?.letters)) {
      for (let i = 0; i < gridLetters.length; i++) gridLetters[i] = singleLetter(p.grid.letters[i]);
    }

    const weaveSize: WeaveSize = Object.keys(WEAVE_DIMS).includes(p?.weave?.size)
      ? p.weave.size
      : '6x8';
    const wDims = WEAVE_DIMS[weaveSize];
    const weaveLetters = Array(wDims.rows * wDims.cols).fill('');
    if (Array.isArray(p?.weave?.letters)) {
      for (let i = 0; i < weaveLetters.length; i++) weaveLetters[i] = singleLetter(p.weave.letters[i]);
    }

    return {
      mode: ALL_MODES.includes(p?.mode) ? p.mode : DEFAULT_STATE.mode,
      dictionaries,
      sort,
      keyboard: p?.keyboard === true,
      theme: ['system', 'light', 'dark'].includes(p?.theme) ? p.theme : 'system',
      // 'cvd' was the original name for the red-green palette
      palette: p?.palette === 'cvd'
        ? 'deuter'
        : ['default', 'deuter', 'tritan', 'mono'].includes(p?.palette)
          ? p.palette
          : 'default',
      textScale: ['normal', 'large', 'larger'].includes(p?.textScale) ? p.textScale : 'normal',
      navKeys: p?.navKeys === 'wasd' ? 'wasd' : 'numpad',
      hiddenModes: sanitizeHidden(p?.hiddenModes, ALL_MODES),
      hiddenViews: sanitizeHidden(p?.hiddenViews, ALL_VIEWS),
      lengthRange: sanitizeRange(p?.lengthRange),
      practiceAllowed: p?.practiceAllowed !== false,
      helpAllowed: p?.helpAllowed !== false,
      solverDictionary: asDifficulty(p?.solverDictionary) ?? 'per-game',
      wordFilter: WORD_FILTERS.includes(p?.wordFilter) ? p.wordFilter : 'none',
      startPage: ALL_START_PAGES.includes(p?.startPage) ? p.startPage : 'home',
      // A stored blob means this browser has been here before, so anyone
      // arriving from a version without the flag has already used the site
      // and shouldn't be greeted with "new here?". Only a browser with no
      // stored state at all is genuinely new, and that path returns
      // DEFAULT_STATE above, where the flag is false.
      onboarded: p?.onboarded !== false,
      patternPlay: p?.patternPlay === true,
      beePlay: p?.beePlay === true,
      boxedPlay: p?.boxedPlay === true,
      descramblePlay: p?.descramblePlay === true,
      gridPlay: p?.gridPlay === true,
      pattern: {
        length,
        known,
        contains: letterString(p?.pattern?.contains),
        excluded: letterString(p?.pattern?.excluded),
      },
      descramble: {
        rack: letterString(p?.descramble?.rack, '?').slice(0, 15),
        useAll: p?.descramble?.useAll === true,
        minLength: clampInt(p?.descramble?.minLength, 2, 7, DEFAULT_STATE.descramble.minLength),
      },
      bee: {
        center: singleLetter(p?.bee?.center),
        outers,
      },
      boxed: {
        letters: boxedLetters,
        solutionWords: clampInt(p?.boxed?.solutionWords, 1, 5, DEFAULT_STATE.boxed.solutionWords),
      },
      grid: { letters: gridLetters, preset: gridPreset },
      weave: { letters: weaveLetters, size: weaveSize },
      squares: { letters: squaresLetters, size: squaresSize },
      weavePlay: p?.weavePlay !== false,
      squaresPlay: p?.squaresPlay !== false,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(state: PersistedState): void {
  try {
    siteStore.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode, quota) — persistence is best-effort
  }
}
