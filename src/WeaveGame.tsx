import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Eye, Lightbulb, RefreshCw, Timer } from 'lucide-react';
import { gridNeighbors } from '@/solvers';
import { dailyDataUrl, WEAVE_POOL_URL } from '@/dailyData';
import { formatElapsed, useUpTimer } from '@/useUpTimer';

const WEAVE_KEY = 'anagrimoire:weave:v1';
const DAILY_WEAVE_URL = dailyDataUrl('daily-weave');
const HINT_COST = 3;

type Answers = { spangram: { w: string; path: number[] }; words: { w: string; path: number[] }[] };
type WeaveRecord = {
  clue: string;
  cols: number;
  board: string[]; // rows of letters
  answersB64: string;
  found: string[]; // theme words found, may include the spangram
  hintWords: string[]; // banked non-theme dictionary words
  hintsUsed: number;
  hintTarget: string | null;
  revealed?: boolean;
  elapsedMs?: number;
};
type WeaveStore = {
  dailyMode: boolean;
  dailyDate: string;
  daily: WeaveRecord | null;
  practice: WeaveRecord | null;
  practiceSize: '6x8' | '8x10';
};

const DEFAULT_STORE: WeaveStore = {
  dailyMode: true,
  dailyDate: '',
  daily: null,
  practice: null,
  practiceSize: '6x8',
};

function sanitizeRecord(r: unknown): WeaveRecord | null {
  const rec = r as WeaveRecord | null;
  if (
    !rec ||
    typeof rec.clue !== 'string' ||
    ![6, 8].includes(rec.cols) ||
    !Array.isArray(rec.board) ||
    !rec.board.every((row) => typeof row === 'string' && row.length === rec.cols) ||
    typeof rec.answersB64 !== 'string'
  ) {
    return null;
  }
  return {
    clue: rec.clue,
    cols: rec.cols,
    board: rec.board,
    answersB64: rec.answersB64,
    found: Array.isArray(rec.found) ? rec.found.filter((w) => typeof w === 'string') : [],
    hintWords: Array.isArray(rec.hintWords) ? rec.hintWords.filter((w) => typeof w === 'string') : [],
    hintsUsed: typeof rec.hintsUsed === 'number' && rec.hintsUsed >= 0 ? rec.hintsUsed : 0,
    hintTarget: typeof rec.hintTarget === 'string' ? rec.hintTarget : null,
    revealed: rec.revealed === true,
    elapsedMs: typeof rec.elapsedMs === 'number' && rec.elapsedMs >= 0 ? rec.elapsedMs : 0,
  };
}

function loadStore(): WeaveStore {
  try {
    const raw = localStorage.getItem(WEAVE_KEY);
    if (!raw) return DEFAULT_STORE;
    const p = JSON.parse(raw);
    return {
      dailyMode: p?.dailyMode !== false,
      dailyDate: typeof p?.dailyDate === 'string' ? p.dailyDate : '',
      daily: sanitizeRecord(p?.daily),
      practice: sanitizeRecord(p?.practice),
      practiceSize: p?.practiceSize === '8x10' ? '8x10' : '6x8',
    };
  } catch {
    return DEFAULT_STORE;
  }
}

// same set of cells, in any order — a theme word only counts on its own tiles
function sameCells(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function decodeAnswers(b64: string): Answers | null {
  try {
    const a = JSON.parse(atob(b64));
    if (!a?.spangram?.w || !Array.isArray(a?.words)) return null;
    return a as Answers;
  } catch {
    return null;
  }
}

type PuzzlePayload = { clue: string; cols: number; board: string[]; answers: string };

function toRecord(p: PuzzlePayload): WeaveRecord | null {
  return sanitizeRecord({
    clue: p.clue,
    cols: p.cols,
    board: p.board,
    answersB64: p.answers,
    found: [],
    hintWords: [],
    hintsUsed: 0,
    hintTarget: null,
    revealed: false,
    elapsedMs: 0,
  });
}

export default function WeaveGame({ standardWords }: { standardWords: string[] | null }) {
  const [store, setStore] = useState<WeaveStore>(loadStore);
  const [pool, setPool] = useState<Record<string, PuzzlePayload[]> | null>(null);
  const [dailyError, setDailyError] = useState(false);
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(WEAVE_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // fetch today's puzzle once
  useEffect(() => {
    let alive = true;
    fetch(DAILY_WEAVE_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        const rec = toRecord(d);
        if (!rec || typeof d.date !== 'string') throw new Error('bad payload');
        // reset on date change or a different board (content-aware)
        setStore((prev) => {
          const same =
            prev.dailyDate === d.date &&
            prev.daily &&
            prev.daily.board.join('') === rec.board.join('');
          return same ? prev : { ...prev, dailyDate: d.date, daily: rec };
        });
      })
      .catch(() => {
        if (alive) setDailyError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // fetch the practice pool once
  useEffect(() => {
    let alive = true;
    fetch(WEAVE_POOL_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (alive && d?.pool) setPool(d.pool);
      })
      .catch(() => {
        // practice unavailable until the pool loads
      });
    return () => {
      alive = false;
    };
  }, []);

  function pickPractice(size: '6x8' | '8x10', avoidBoard?: string) {
    if (!pool?.[size]?.length) return null;
    const options = pool[size].filter((p) => p.board.join('') !== avoidBoard);
    const pick = (options.length ? options : pool[size])[
      Math.floor(Math.random() * (options.length ? options.length : pool[size].length))
    ];
    return toRecord(pick);
  }

  // ensure a practice puzzle exists once the pool is loaded
  useEffect(() => {
    if (store.dailyMode || store.practice || !pool) return;
    const rec = pickPractice(store.practiceSize);
    if (rec) setStore((prev) => (prev.practice ? prev : { ...prev, practice: rec }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.dailyMode, store.practice, pool, store.practiceSize]);

  const record = store.dailyMode ? store.daily : store.practice;
  const answers = useMemo(() => (record ? decodeAnswers(record.answersB64) : null), [record]);
  const cells = useMemo(() => (record ? record.board.join('').split('') : []), [record]);
  const cols = record?.cols ?? 6;
  const rows = cols ? cells.length / cols : 0;

  const standardSet = useMemo(
    () => (standardWords ? new Set(standardWords) : null),
    [standardWords]
  );

  // cell -> lock kind for found words
  const locked = useMemo(() => {
    const m = new Map<number, 'theme' | 'span'>();
    if (!answers || !record) return m;
    for (const { w, path } of answers.words) {
      if (record.revealed || record.found.includes(w)) for (const i of path) m.set(i, 'theme');
    }
    if (record.revealed || record.found.includes(answers.spangram.w)) {
      for (const i of answers.spangram.path) m.set(i, 'span');
    }
    return m;
  }, [answers, record]);

  const hintCells = useMemo(() => {
    if (!answers || !record?.hintTarget) return new Set<number>();
    const target =
      answers.words.find((x) => x.w === record.hintTarget) ??
      (answers.spangram.w === record.hintTarget ? answers.spangram : null);
    return new Set(target?.path ?? []);
  }, [answers, record]);

  const solvedAll =
    !!answers && !!record && record.found.length >= answers.words.length + 1;
  const complete = solvedAll || !!record?.revealed;

  // after completion, draw every word's path as a line overlay
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const [solutionLines, setSolutionLines] = useState<{ pts: { x: number; y: number }[]; span: boolean }[]>([]);
  useLayoutEffect(() => {
    if (!complete || !answers || !boardWrapRef.current) {
      setSolutionLines([]);
      return;
    }
    const wrap = boardWrapRef.current.getBoundingClientRect();
    const measure = (path: number[]) =>
      path.map((i) => {
        const r = boardWrapRef.current!
          .querySelector(`[data-wcell="${i}"]`)!
          .getBoundingClientRect();
        return { x: r.left + r.width / 2 - wrap.left, y: r.top + r.height / 2 - wrap.top };
      });
    setSolutionLines([
      ...answers.words.map((w) => ({ pts: measure(w.path), span: false })),
      { pts: measure(answers.spangram.path), span: true },
    ]);
  }, [complete, answers]);

  useUpTimer(!!record && !complete, (delta) =>
    updateRecord((r) => ({ ...r, elapsedMs: (r.elapsedMs ?? 0) + delta }))
  );

  // drag-to-trace
  const [dragPath, setDragPath] = useState<number[]>([]);
  const dragPathRef = useRef<number[]>([]);
  const setPath = (p: number[]) => {
    dragPathRef.current = p;
    setDragPath(p);
  };

  function showFlash(text: string, good = false) {
    setFlash({ text, good });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1600);
  }

  function updateRecord(fn: (r: WeaveRecord) => WeaveRecord) {
    setStore((prev) => {
      const rec = prev.dailyMode ? prev.daily : prev.practice;
      if (!rec) return prev;
      const next = fn(rec);
      return prev.dailyMode ? { ...prev, daily: next } : { ...prev, practice: next };
    });
  }

  function cellAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest('[data-wcell]');
    return el ? Number(el.getAttribute('data-wcell')) : null;
  }

  function onBoardPointerDown(e: React.PointerEvent) {
    if (!record || complete) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || locked.has(i)) return;
    e.preventDefault();
    setPath([i]);
  }

  function onBoardPointerMove(e: React.PointerEvent) {
    const prev = dragPathRef.current;
    if (!prev.length || !record) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || locked.has(i)) return;
    const last = prev[prev.length - 1];
    if (i === last) return;
    if (prev.length >= 2 && i === prev[prev.length - 2]) {
      setPath(prev.slice(0, -1));
      return;
    }
    if (prev.includes(i)) return;
    if (!gridNeighbors(rows, cols)[last].includes(i)) return;
    setPath([...prev, i]);
  }

  function endDrag() {
    const path = dragPathRef.current;
    if (!path.length || !record || !answers) {
      setPath([]);
      return;
    }
    setPath([]);
    if (path.length < 3) return;
    const word = path.map((i) => cells[i]).join('');
    if (record.found.includes(word)) {
      showFlash('Already found');
      return;
    }
    // a theme word must be traced on its own cells — the same word spelled
    // elsewhere on the board is just a regular word
    const isSpan = word === answers.spangram.w && sameCells(path, answers.spangram.path);
    const isTheme = answers.words.some((x) => x.w === word && sameCells(path, x.path));
    if (isSpan || isTheme) {
      updateRecord((r) => ({
        ...r,
        found: [...r.found, word],
        hintTarget: r.hintTarget === word ? null : r.hintTarget,
      }));
      showFlash(isSpan ? 'Spangram! 🎉' : 'Theme word!', true);
      return;
    }
    if (word.length >= 4 && standardSet?.has(word)) {
      if (record.hintWords.includes(word)) {
        showFlash('Already found');
        return;
      }
      updateRecord((r) => ({ ...r, hintWords: [...r.hintWords, word] }));
      const bank = record.hintWords.length + 1 - record.hintsUsed * HINT_COST;
      showFlash(`Nice word — hint progress ${Math.min(bank, HINT_COST)}/${HINT_COST}`, true);
      return;
    }
    showFlash('Not a theme word');
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

  const hintBank = record ? record.hintWords.length - record.hintsUsed * HINT_COST : 0;
  const canHint =
    !!record && !!answers && !complete && !record.hintTarget && hintBank >= HINT_COST;

  function useHint() {
    if (!canHint || !answers || !record) return;
    const target =
      answers.words.find((x) => !record.found.includes(x.w))?.w ??
      (!record.found.includes(answers.spangram.w) ? answers.spangram.w : null);
    if (!target) return;
    updateRecord((r) => ({ ...r, hintsUsed: r.hintsUsed + 1, hintTarget: target }));
  }

  function reveal() {
    if (!record || complete) return;
    updateRecord((r) => ({ ...r, revealed: true, hintTarget: null }));
  }

  function newPractice() {
    const rec = pickPractice(store.practiceSize, record?.board.join(''));
    if (rec) setStore((prev) => ({ ...prev, practice: rec }));
  }

  function setPracticeSize(size: '6x8' | '8x10') {
    setStore((prev) => ({ ...prev, practiceSize: size }));
    const rec = pickPractice(size, record?.board.join(''));
    if (rec) setStore((prev) => ({ ...prev, practiceSize: size, practice: rec }));
  }

  const loading = store.dailyMode ? !record && !dailyError : !record;
  const cellSize =
    cols === 8 ? 'w-8 h-9 sm:w-9 sm:h-10 text-base sm:text-lg' : 'w-9 h-10 sm:w-11 sm:h-12 text-lg sm:text-xl';

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
            onClick={() => setStore((prev) => ({ ...prev, dailyMode: id }))}
            className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold transition-colors
              ${store.dailyMode === id ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400 hover:text-white'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* practice size */}
      {!store.dailyMode && (
        <div className="mb-4">
          <span className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
            {(['6x8', '8x10'] as const).map((size) => (
              <button
                key={size}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPracticeSize(size)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors
                  ${store.practiceSize === size ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {size === '6x8' ? '6×8' : '8×10 hard'}
              </button>
            ))}
          </span>
        </div>
      )}

      {loading && <p className="text-sm text-slate-400 py-8">Loading…</p>}
      {store.dailyMode && dailyError && !record && (
        <p className="text-sm text-rose-400 py-8">
          Couldn&apos;t fetch today&apos;s puzzle — try Practice instead.
        </p>
      )}

      {record && answers && (
        <>
          {/* clue */}
          <div className="mb-4 mx-auto max-w-sm rounded-xl bg-amber-400/10 border border-amber-400/25 px-4 py-3">
            <p className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider">
              Today&apos;s theme
            </p>
            <p className="text-lg font-semibold text-amber-200">{record.clue}</p>
          </div>

          {/* progress */}
          <div className="mb-4 flex items-center justify-center gap-4 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Timer className="w-3.5 h-3.5 text-slate-500" />
              {formatElapsed(record.elapsedMs ?? 0)}
            </span>
            <span>
              {record.found.length} / {answers.words.length + 1} found
            </span>
            {record.hintsUsed > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-slate-500" />
                {record.hintsUsed} hint{record.hintsUsed === 1 ? '' : 's'}
              </span>
            )}
            {store.dailyMode && store.dailyDate && (
              <span className="text-slate-500">{store.dailyDate}</span>
            )}
          </div>

          {/* the board */}
          <div ref={boardWrapRef} className="relative w-fit mx-auto">
          <div
            onPointerDown={onBoardPointerDown}
            onPointerMove={onBoardPointerMove}
            className={`grid gap-1.5 touch-none select-none ${cols === 8 ? 'grid-cols-8' : 'grid-cols-6'}`}
          >
            {cells.map((c, i) => {
              const lock = locked.get(i);
              return (
                <button
                  key={i}
                  data-wcell={i}
                  disabled={complete}
                  className={`${cellSize} rounded-lg border-2 font-bold uppercase transition-colors
                    ${lock === 'span'
                      ? 'bg-amber-400/50 border-amber-300 text-white'
                      : lock === 'theme'
                        ? 'bg-sky-400/40 border-sky-300 text-white'
                        : dragPath.includes(i)
                          ? 'bg-emerald-400/30 border-emerald-300 text-white'
                          : 'bg-white/5 border-white/15 text-white hover:bg-white/10'}
                    ${hintCells.has(i) && !lock ? 'ring-2 ring-emerald-300/80' : ''}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
          {solutionLines.length > 0 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {solutionLines.map((line, i) => (
                <polyline
                  key={i}
                  points={line.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={line.span ? 'rgb(251 191 36 / 0.85)' : 'rgb(125 211 252 / 0.7)'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
          )}
          </div>

          {/* controls */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={useHint}
              disabled={!canHint}
              title={`Find ${HINT_COST} non-theme words to earn a hint`}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
            >
              <Lightbulb className="w-4 h-4" />
              Hint {Math.min(Math.max(hintBank, 0), HINT_COST)}/{HINT_COST}
            </button>
            {!complete && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={reveal}
                title="Give up and show the full solution"
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Eye className="w-4 h-4" />
                Reveal
              </button>
            )}
            {!store.dailyMode && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={newPractice}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                New puzzle
              </button>
            )}
          </div>

          <div className="h-6 mt-3">
            {flash && (
              <p className={`text-sm font-medium ${flash.good ? 'text-emerald-300' : 'text-amber-300'}`}>
                {flash.text}
              </p>
            )}
            {!flash && complete && (
              <p className={`text-sm font-semibold ${solvedAll ? 'text-emerald-300' : 'text-slate-400'}`}>
                {solvedAll
                  ? `Solved in ${formatElapsed(record.elapsedMs ?? 0)} · ${
                      record.hintsUsed === 0
                        ? 'no hints'
                        : `${record.hintsUsed} hint${record.hintsUsed === 1 ? '' : 's'}`
                    } 🎉`
                  : 'Revealed 🔍'}
              </p>
            )}
          </div>

          {/* found theme words */}
          {record.found.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 max-w-md mx-auto">
              {record.found.map((w) => (
                <span
                  key={w}
                  className={`px-2.5 py-1 rounded-lg border text-sm tracking-wide
                    ${w === answers.spangram.w
                      ? 'bg-amber-400/20 border-amber-400/40 text-amber-200 font-semibold'
                      : 'bg-sky-400/15 border-sky-400/30 text-sky-200'}`}
                >
                  {w}
                </span>
              ))}
            </div>
          )}

          <p className="mt-5 text-xs text-slate-500">
            Drag to trace the themed words — every letter is used exactly once, and the
            spangram spans the board. Other dictionary words (4+ letters) build toward
            hints.
            {store.dailyMode && ' A fresh daily puzzle arrives about 15 minutes after 3:00 a.m. Eastern.'}
          </p>
        </>
      )}
    </div>
  );
}
