import { DIFFICULTIES, type Difficulty } from '@/difficulty';
import { PALETTES, TEXT_SCALES, THEME_MODES } from '@/theme';
import type { Palette, TextScale, ThemeMode } from '@/theme';
import { store as siteStore } from '@/siteStorage';
import { ALL_MODES, ALL_VIEWS } from '@/games';
import type { Mode, View } from '@/games';

// One declaration, in `@/games`; re-exported here so the modules that have
// always imported Mode from storage keep working. `View` used to be declared
// twice — once here and once in routes.ts — structurally identical and
// unrelated by declaration, which is the kind of coincidence that holds until
// it doesn't.
export { ALL_MODES, ALL_VIEWS };
export type { Mode, View };


/** 'home' is the front page, 'last' is wherever you left off, and a Mode is
 *  that game's daily — for people who came for one game and mean to keep
 *  coming for it. */
export type StartPage = 'home' | 'last' | Mode;

const KEY = 'anagrimoire:v1';

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
  // No `sort`: it ordered a solver's results, per game, and there are no
  // solvers. Stored copies are left alone rather than rewritten.
  keyboard: boolean;
  theme: ThemeMode;
  palette: Palette;
  textScale: TextScale;
  navKeys: NavKeys;
  hiddenModes: Mode[];
  hiddenViews: View[];
  lengthRange: LengthRange;
  practiceAllowed: boolean;
  highlightMatches: boolean;
  // No `helpAllowed`: the Help and Reveal buttons it hid were the door into
  // the solver, and both went with it.
  solverDictionary: Difficulty | 'per-game';
  wordFilter: WordFilterLevel;
  /** what the front door opens onto: the home page, the game you last had
   *  open, or one particular game for people who only ever want the one */
  startPage: StartPage;
  /** true once the "new here?" card has been seen, dismissed, or followed */
  onboarded: boolean;
  // The play/solve flag each game carried is gone with the solvers: there is
  // one surface per game now, so a flag that can only be true is a flag that
  // reads as a choice somebody could still make.
  // The word length Guess is playing. What used to sit beside it -- the known
  // letters, the rack, the hive's seven, the box's twelve, both grids, the
  // ciphertext, the two ladder ends, the two bridge ends -- was what somebody
  // had typed into a solver, and there are no solvers. The fields are dropped
  // here rather than kept and ignored: a shape that describes a surface the
  // site does not have is a shape the next reader has to work out is a lie.
  //
  // Nothing migrates. An older browser's stored copy simply has fields this
  // version does not read, which is what readStore already tolerates.
  pattern: { length: number };
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
  dictionaries: { pattern: 'easy', descramble: 'easy', bee: 'easy', boxed: 'easy', grid: 'easy', weave: 'hard', squares: 'hard', cryptogram: 'hard', ladder: 'easy', bridge: 'easy' },
  keyboard: false,
  theme: 'system',
  // The company palette, because almost nobody opens Settings. A brand nobody
  // sees unless they go looking for it is not a brand — and the accessibility
  // palettes stay one click away, which is where they were anyway.
  palette: 'amherst',
  textScale: 'normal',
  navKeys: 'numpad',
  hiddenModes: [],
  hiddenViews: [],
  lengthRange: { min: MIN_WORD_LEN, max: MAX_WORD_LEN },
  practiceAllowed: true,
  highlightMatches: true,
  solverDictionary: 'per-game',
  wordFilter: 'none',
  startPage: 'home',
  onboarded: false,
  pattern: { length: 5 },
};

function singleLetter(v: unknown): string {
  return typeof v === 'string' && /^[a-z]$/.test(v) ? v : '';
}


// Keeps only known names, and refuses a list that hides everything — a stored
// value from a future version, or a hand-edited one, shouldn't be able to
// produce a site with nothing on it.
function sanitizeHidden<T extends string>(value: unknown, all: T[]): T[] {
  if (!Array.isArray(value)) return [];
  const kept = all.filter((item) => value.includes(item));
  return kept.length === all.length ? [] : kept;
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
      keyboard: p?.keyboard === true,
      // These read the lists rather than repeating them. The palette list was
      // a literal here, so adding a palette in theme.ts left this one rejecting
      // it and quietly resetting to default — a setting that could be chosen,
      // saved, and then lost on the next load.
      theme: THEME_MODES.includes(p?.theme) ? p.theme : 'system',
      // 'cvd' was the original name for the red-green palette. Anything else
      // unrecognised — including 'default' and the seven decorative palettes
      // that used to exist — falls back to the company one, which is what
      // moves everybody who was already here onto the brand without a
      // migration to run or a flag to keep.
      palette: p?.palette === 'cvd' ? 'deuter' : PALETTES.includes(p?.palette) ? p.palette : DEFAULT_STATE.palette,
      textScale: TEXT_SCALES.includes(p?.textScale) ? p.textScale : 'normal',
      navKeys: p?.navKeys === 'wasd' ? 'wasd' : 'numpad',
      hiddenModes: sanitizeHidden(p?.hiddenModes, ALL_MODES),
      hiddenViews: sanitizeHidden(p?.hiddenViews, ALL_VIEWS),
      lengthRange: sanitizeRange(p?.lengthRange),
      practiceAllowed: p?.practiceAllowed !== false,
      highlightMatches: p?.highlightMatches !== false,
      solverDictionary: asDifficulty(p?.solverDictionary) ?? 'per-game',
      wordFilter: WORD_FILTERS.includes(p?.wordFilter) ? p.wordFilter : 'none',
      startPage: ALL_START_PAGES.includes(p?.startPage) ? p.startPage : 'home',
      // A stored blob means this browser has been here before, so anyone
      // arriving from a version without the flag has already used the site
      // and shouldn't be greeted with "new here?". Only a browser with no
      // stored state at all is genuinely new, and that path returns
      // DEFAULT_STATE above, where the flag is false.
      onboarded: p?.onboarded !== false,
      // Only the length now: the rest of what lived here was solver input,
      // and this version does not read it. An older browser's copy is left on
      // disk untouched rather than migrated -- it costs nothing and rewriting
      // somebody's stored state to delete fields nobody reads is a worse
      // trade than leaving them.
      pattern: { length },
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
