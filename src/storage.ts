import type { DictionaryId } from '@/dictionaries';

export type Mode = 'pattern' | 'descramble' | 'bee' | 'boxed';

const KEY = 'anagrimoire:v1';

const ALL_MODES: Mode[] = ['pattern', 'descramble', 'bee', 'boxed'];
const ALL_DICTS: DictionaryId[] = ['common', 'standard', 'full'];

export type SortKey = 'alpha' | 'length';
export type SortDir = 'asc' | 'desc';
export type SortPref = { key: SortKey; dir: SortDir };

export type PersistedState = {
  mode: Mode;
  dictionaries: Record<Mode, DictionaryId>;
  sort: Record<Mode, SortPref>;
  keyboard: boolean;
  patternPlay: boolean;
  beePlay: boolean;
  pattern: { length: number; known: string[]; contains: string; excluded: string };
  descramble: { rack: string; useAll: boolean; minLength: number };
  bee: { center: string; outers: string[] };
  boxed: { letters: string[]; solutionWords: number };
};

export const DEFAULT_STATE: PersistedState = {
  mode: 'pattern',
  dictionaries: { pattern: 'common', descramble: 'common', bee: 'common', boxed: 'common' },
  sort: {
    pattern: { key: 'alpha', dir: 'asc' },
    descramble: { key: 'length', dir: 'desc' },
    bee: { key: 'length', dir: 'desc' },
    boxed: { key: 'length', dir: 'desc' },
  },
  keyboard: false,
  patternPlay: false,
  beePlay: false,
  pattern: { length: 5, known: Array(5).fill(''), contains: '', excluded: '' },
  descramble: { rack: '', useAll: false, minLength: 3 },
  bee: { center: '', outers: Array(6).fill('') },
  boxed: { letters: Array(12).fill(''), solutionWords: 2 },
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

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = JSON.parse(raw);

    const dictionaries = { ...DEFAULT_STATE.dictionaries };
    for (const m of ALL_MODES) {
      const d = p?.dictionaries?.[m];
      if (ALL_DICTS.includes(d)) dictionaries[m] = d;
    }

    const sort: Record<Mode, SortPref> = {
      pattern: { ...DEFAULT_STATE.sort.pattern },
      descramble: { ...DEFAULT_STATE.sort.descramble },
      bee: { ...DEFAULT_STATE.sort.bee },
      boxed: { ...DEFAULT_STATE.sort.boxed },
    };
    for (const m of ALL_MODES) {
      const s = p?.sort?.[m];
      if (s?.key === 'alpha' || s?.key === 'length') sort[m].key = s.key;
      if (s?.dir === 'asc' || s?.dir === 'desc') sort[m].dir = s.dir;
    }
    // pattern results are all one length; only alphabetical makes sense
    sort.pattern.key = 'alpha';

    const length = clampInt(p?.pattern?.length, 3, 15, DEFAULT_STATE.pattern.length);
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

    return {
      mode: ALL_MODES.includes(p?.mode) ? p.mode : DEFAULT_STATE.mode,
      dictionaries,
      sort,
      keyboard: p?.keyboard === true,
      patternPlay: p?.patternPlay === true,
      beePlay: p?.beePlay === true,
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
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode, quota) — persistence is best-effort
  }
}
