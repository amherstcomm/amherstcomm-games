import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CalendarDays, CornerDownLeft, Delete, Flag, Play, RefreshCw, Search, Timer } from 'lucide-react';
import { solveGrid } from '@/solvers';
import type { LetterState } from '@/GuessGame';

export type GridGameHandle = { pressKey: (k: string) => void };

const GRID_KEY = 'anagrimoire:grid:v1';
const DAILY_GRID_URL =
  'https://raw.githubusercontent.com/rptetzloff/anagrimoire/puzzle-data/data/daily-grid.json';
const DURATION_MS = 3 * 60 * 1000;

// classic sixteen-dice letter distributions (q treated as a plain letter)
const GRID_DICE = [
  'aaeegn', 'abbjoo', 'achops', 'affkps',
  'aoottw', 'cimotu', 'deilrx', 'delrvy',
  'distty', 'eeghnw', 'eeinsu', 'ehrtvw',
  'eiosst', 'elrtty', 'himnuq', 'hlnnrz',
];

type GridRecord = {
  cells: string[];
  found: string[];
  endsAt: number | null; // null until the player presses Start
  finished: boolean;
};
type GridStore = {
  dailyMode: boolean;
  dailyDate: string;
  daily: GridRecord | null;
  practice: GridRecord | null;
};

const DEFAULT_STORE: GridStore = { dailyMode: true, dailyDate: '', daily: null, practice: null };

function sanitizeRecord(r: unknown): GridRecord | null {
  const rec = r as GridRecord | null;
  if (
    !rec ||
    !Array.isArray(rec.cells) ||
    rec.cells.length !== 16 ||
    !rec.cells.every((c) => typeof c === 'string' && /^[a-z]$/.test(c)) ||
    !Array.isArray(rec.found)
  ) {
    return null;
  }
  return {
    cells: rec.cells,
    found: rec.found.filter((w) => typeof w === 'string'),
    endsAt: typeof rec.endsAt === 'number' ? rec.endsAt : null,
    finished: rec.finished === true,
  };
}

function loadStore(): GridStore {
  try {
    const raw = localStorage.getItem(GRID_KEY);
    if (!raw) return DEFAULT_STORE;
    const p = JSON.parse(raw);
    return {
      dailyMode: p?.dailyMode !== false,
      dailyDate: typeof p?.dailyDate === 'string' ? p.dailyDate : '',
      daily: sanitizeRecord(p?.daily),
      practice: sanitizeRecord(p?.practice),
    };
  } catch {
    return DEFAULT_STORE;
  }
}

// classic Boggle scoring
function wordScore(word: string): number {
  if (word.length <= 4) return 1;
  if (word.length === 5) return 2;
  if (word.length === 6) return 3;
  if (word.length === 7) return 5;
  return 11;
}

const GridGame = forwardRef<
  GridGameHandle,
  {
    standardWords: string[] | null;
    onLetterStates: (states: Record<string, LetterState>) => void;
    onReveal: (cells: string[]) => void;
  }
>(function GridGame({ standardWords, onLetterStates, onReveal }, ref) {
  const [store, setStore] = useState<GridStore>(loadStore);
  const [current, setCurrent] = useState('');
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  const [dailyError, setDailyError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(GRID_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // fetch today's grid once
  useEffect(() => {
    let alive = true;
    fetch(DAILY_GRID_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        const rec = sanitizeRecord({ cells: d.cells, found: [], endsAt: null, finished: false });
        if (!rec || typeof d.date !== 'string') throw new Error('bad payload');
        setStore((prev) =>
          prev.dailyDate === d.date && prev.daily
            ? prev
            : { ...prev, dailyDate: d.date, daily: rec }
        );
      })
      .catch(() => {
        if (alive) setDailyError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  function rollPracticeGrid(): GridRecord {
    const cells = GRID_DICE.map((d) => d[Math.floor(Math.random() * 6)]).sort(
      () => Math.random() - 0.5
    );
    return { cells, found: [], endsAt: null, finished: false };
  }

  // ensure a practice grid exists
  useEffect(() => {
    if (store.dailyMode || store.practice) return;
    setStore((prev) => (prev.practice ? prev : { ...prev, practice: rollPracticeGrid() }));
  }, [store.dailyMode, store.practice]);

  const record = store.dailyMode ? store.daily : store.practice;
  const running = !!record?.endsAt && !record.finished;
  const remaining = record?.endsAt ? Math.max(0, record.endsAt - now) : DURATION_MS;

  // tick while running
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  // time's up
  useEffect(() => {
    if (running && remaining === 0) {
      setCurrent('');
      updateRecord((r) => ({ ...r, finished: true }));
    }
  }, [running, remaining]);

  // every path-reachable dictionary word; also serves as submit validation
  const answers = useMemo(() => {
    if (!standardWords || !record) return null;
    return solveGrid(standardWords, { cells: record.cells });
  }, [standardWords, record]);
  const answersSet = useMemo(() => (answers ? new Set(answers) : null), [answers]);
  const maxScore = useMemo(
    () => (answers ? answers.reduce((n, w) => n + wordScore(w), 0) : 0),
    [answers]
  );
  const score = useMemo(
    () => (record ? record.found.reduce((n, w) => n + wordScore(w), 0) : 0),
    [record]
  );

  // dim letters not on the grid once the game has started (not before — that
  // would leak the letters)
  useEffect(() => {
    if (!record || !record.endsAt) {
      onLetterStates({});
      return;
    }
    const present = new Set(record.cells);
    const states: Record<string, LetterState> = {};
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
      if (!present.has(c)) states[c] = 'absent';
    }
    onLetterStates(states);
  }, [record, onLetterStates]);

  function showFlash(text: string, good = false) {
    setFlash({ text, good });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1400);
  }

  function updateRecord(fn: (r: GridRecord) => GridRecord) {
    setStore((prev) => {
      const rec = prev.dailyMode ? prev.daily : prev.practice;
      if (!rec) return prev;
      const next = fn(rec);
      return prev.dailyMode ? { ...prev, daily: next } : { ...prev, practice: next };
    });
  }

  function start() {
    setNow(Date.now());
    updateRecord((r) => ({ ...r, endsAt: Date.now() + DURATION_MS }));
  }

  function submit() {
    if (!record || !running) return;
    if (!answersSet) {
      showFlash('Dictionary still loading…');
      return;
    }
    const word = current;
    setCurrent('');
    if (word.length < 3) {
      showFlash('Too short');
      return;
    }
    if (record.found.includes(word)) {
      showFlash('Already found');
      return;
    }
    // answers are path-checked and dictionary-checked in one
    if (!answersSet.has(word)) {
      showFlash('No path for that word');
      return;
    }
    updateRecord((r) => ({ ...r, found: [word, ...r.found] }));
    showFlash(`+${wordScore(word)}`, true);
  }

  function pressKey(k: string) {
    if (!record || record.finished) return;
    if (k === 'enter') {
      submit();
      return;
    }
    if (k === 'backspace') {
      setCurrent((c) => c.slice(0, -1));
      return;
    }
    if (!running) return;
    if (/^[a-z]$/.test(k) && record.cells.includes(k)) {
      setCurrent((c) => (c.length < 16 ? c + k : c));
    }
  }

  useImperativeHandle(ref, () => ({ pressKey }));

  // physical keyboard
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
  });

  function newPracticeGrid() {
    setCurrent('');
    setStore((prev) => ({ ...prev, practice: rollPracticeGrid() }));
  }

  const loading = store.dailyMode ? !record && !dailyError : !record;
  const mmss = `${Math.floor(remaining / 60000)}:${String(
    Math.floor((remaining % 60000) / 1000)
  ).padStart(2, '0')}`;

  return (
    <div className="text-center">
      {/* daily / practice toggle */}
      <div className="mb-5 inline-flex rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
        {(
          [
            { id: true, label: 'Daily', Icon: CalendarDays },
            { id: false, label: 'Practice', Icon: RefreshCw },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setCurrent('');
              setStore((prev) => ({ ...prev, dailyMode: id }));
            }}
            className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold transition-colors
              ${store.dailyMode === id ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400 hover:text-white'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-400 py-8">Loading…</p>}
      {store.dailyMode && dailyError && !record && (
        <p className="text-sm text-rose-400 py-8">
          Couldn&apos;t fetch today&apos;s grid — try Practice instead.
        </p>
      )}

      {record && (
        <>
          {/* timer + score */}
          <div className="mb-4 flex items-center justify-center gap-5 text-sm">
            <span
              className={`inline-flex items-center gap-1.5 font-bold text-xl tabular-nums
                ${running && remaining < 30000 ? 'text-rose-400' : 'text-white'}`}
            >
              <Timer className="w-4 h-4 text-slate-400" />
              {mmss}
            </span>
            <span className="text-slate-400">
              {score}
              {record.finished && ` / ${maxScore}`} pts
            </span>
            <span className="text-slate-400">
              {record.found.length}
              {record.finished && answers && ` / ${answers.length}`} words
            </span>
            {store.dailyMode && store.dailyDate && (
              <span className="text-xs text-slate-500">{store.dailyDate}</span>
            )}
          </div>

          {/* entry */}
          {running ? (
            <div className="mb-4 mx-auto max-w-sm h-12 px-4 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden">
              <span className="text-2xl font-bold tracking-[0.2em] uppercase text-white whitespace-nowrap">
                {current}
                <span className="text-amber-400 animate-pulse">|</span>
              </span>
            </div>
          ) : (
            <div className="mb-4 h-12 flex items-center justify-center">
              {record.finished ? (
                <span className="text-sm font-semibold text-emerald-300">
                  Time! You found {record.found.length} of {answers?.length ?? '?'} words.
                </span>
              ) : (
                <span className="text-sm text-slate-400">
                  Three minutes on the clock — chain adjacent letters into words.
                </span>
              )}
            </div>
          )}

          {/* the grid — face-down until the clock starts */}
          <div className="grid grid-cols-4 gap-2 w-fit mx-auto">
            {record.cells.map((c, i) => (
              <button
                key={i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pressKey(c)}
                disabled={!running}
                className={`w-11 h-12 sm:w-12 sm:h-14 rounded-xl border-2 text-xl sm:text-2xl font-bold uppercase transition-colors
                  ${!record.endsAt
                    ? 'bg-white/5 border-white/15 text-slate-500'
                    : 'bg-amber-400/10 border-amber-400/40 text-amber-200 hover:bg-amber-400/20'}`}
              >
                {record.endsAt ? c : '?'}
              </button>
            ))}
          </div>

          {/* controls */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            {!record.endsAt && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={start}
                className="inline-flex items-center gap-1.5 px-5 h-10 rounded-lg text-sm font-semibold bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-300 transition-colors"
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            )}
            {running && (
              <>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pressKey('backspace')}
                  aria-label="Delete letter"
                  className="inline-flex items-center justify-center w-11 h-10 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Delete className="w-4 h-4" />
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={submit}
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-amber-400/15 border border-amber-400/30 text-amber-200 hover:bg-amber-400/25 transition-colors"
                >
                  <CornerDownLeft className="w-4 h-4" />
                  Enter
                </button>
                {!store.dailyMode && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={newPracticeGrid}
                    title="Give up — new grid, fresh clock"
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <Flag className="w-4 h-4" />
                    Quit
                  </button>
                )}
              </>
            )}
            {record.finished && (
              <>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onReveal(record.cells)}
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-amber-400/15 border border-amber-400/30 text-amber-200 hover:bg-amber-400/25 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  Reveal all in solver
                </button>
                {!store.dailyMode && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={newPracticeGrid}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    New grid
                  </button>
                )}
              </>
            )}
          </div>

          <div className="h-6 mt-3">
            {flash && (
              <p className={`text-sm font-medium ${flash.good ? 'text-emerald-300' : 'text-amber-300'}`}>
                {flash.text}
              </p>
            )}
          </div>

          {/* found words */}
          {record.found.length > 0 && (
            <div className="mt-3 max-w-md mx-auto">
              <div className="flex flex-wrap justify-center gap-1.5">
                {[...record.found].sort().map((w) => (
                  <span
                    key={w}
                    className={`px-2.5 py-1 rounded-lg border text-sm tracking-wide
                      ${w.length >= 7
                        ? 'bg-amber-400/10 border-amber-400/30 text-amber-200 font-semibold'
                        : 'bg-white/[0.04] border-white/10 text-slate-300'}`}
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="mt-5 text-xs text-slate-500">
            Words are 3+ letters traced through adjacent cells (diagonals count), using each
            cell once. Scoring: 3–4 letters 1&nbsp;pt, 5 letters 2, 6 letters 3, 7 letters 5,
            8+ letters 11. Scored against our Standard dictionary.
            {store.dailyMode && ' A fresh daily grid arrives about 15 minutes after 3:00 a.m. Eastern.'}
          </p>
        </>
      )}
    </div>
  );
});

export default GridGame;
