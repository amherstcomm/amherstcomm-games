import { forwardRef, Fragment, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { CalendarDays, Eye, RefreshCw, Timer } from 'lucide-react';
import { dailyDataUrl, SQUARES_POOL_URL } from '@/dailyData';
import ShareButton from '@/ShareButton';
import { buildShare, TILE_EMOJI } from '@/share';
import { usePalette } from '@/theme';
import { dailyIntent } from '@/routes';
import { offerDailySwitch, reportDaily } from '@/dailyBus';
import { usePrefs } from '@/prefs';
import { formatElapsed, useUpTimer } from '@/useUpTimer';
import { recordSquaresFinish } from '@/stats';
import { useDailySync } from '@/useDailySync';

export type SquaresGameHandle = { pressKey: (k: string) => void };

// No MobileKeyInput here, unlike the other play modes. That overlay exists to
// raise the phone's keyboard by tapping a game's single entry box, and this
// game has none — you tap the cell you mean. A separate tap target would be a
// second thing to aim at for the same job. Phones type through the site's own
// keyboard, which reaches this board via the handle above.

export type SquareSize = 4 | 5;

const SQUARES_KEY = 'anagrimoire:squares:v1';
const DAILY_SQUARES_URL = dailyDataUrl('daily-squares');
// the pool is shared by both sites, so it takes no dev- prefix
const POOL_URL = SQUARES_POOL_URL;

/** A board as it ships: `cells` holds the letters shown at the start and null
 *  everywhere the player types. `entries` is what they've typed. */
type SquareRecord = {
  size: SquareSize;
  cells: (string | null)[];
  entries: string[];
  answer: string; // base64 {rows}
  /** written once the board comes out right, so anything that isn't holding a
   *  dictionary — the home page, stats — can still tell it was finished */
  solved?: boolean;
  revealed?: boolean;
  elapsedMs?: number;
};

type SquaresStore = {
  dailyMode: boolean;
  dailyDate: string;
  size: SquareSize;
  daily: Partial<Record<SquareSize, SquareRecord>>;
  practice: SquareRecord | null;
};

const DEFAULT_STORE: SquaresStore = {
  dailyMode: true,
  dailyDate: '',
  size: 4,
  daily: {},
  practice: null,
};

function sanitizeRecord(r: unknown): SquareRecord | null {
  const rec = r as SquareRecord | null;
  if (!rec || (rec.size !== 4 && rec.size !== 5)) return null;
  const n = rec.size * rec.size;
  if (!Array.isArray(rec.cells) || rec.cells.length !== n) return null;
  return {
    size: rec.size,
    cells: rec.cells.map((c) => (typeof c === 'string' && /^[a-z]$/.test(c) ? c : null)),
    entries: Array.isArray(rec.entries)
      ? Array.from({ length: n }, (_, i) =>
          typeof rec.entries[i] === 'string' && /^[a-z]$/.test(rec.entries[i]) ? rec.entries[i] : ''
        )
      : Array(n).fill(''),
    answer: typeof rec.answer === 'string' ? rec.answer : '',
    solved: rec.solved === true,
    revealed: rec.revealed === true,
    elapsedMs: typeof rec.elapsedMs === 'number' && rec.elapsedMs >= 0 ? rec.elapsedMs : 0,
  };
}

// An incoming /daily/ or /play/ link decides which board is waiting; without one
// we keep whatever the player last had open.
function loadStore(): SquaresStore {
  const store = readStore();
  const forced = dailyIntent('squares');
  return forced === null ? store : { ...store, dailyMode: forced };
}

function readStore(): SquaresStore {
  try {
    const raw = localStorage.getItem(SQUARES_KEY);
    if (!raw) return DEFAULT_STORE;
    const p = JSON.parse(raw);
    const daily: Partial<Record<SquareSize, SquareRecord>> = {};
    for (const n of [4, 5] as SquareSize[]) {
      const rec = sanitizeRecord(p?.daily?.[n]);
      if (rec) daily[n] = rec;
    }
    return {
      dailyMode: p?.dailyMode !== false,
      dailyDate: typeof p?.dailyDate === 'string' ? p.dailyDate : '',
      size: p?.size === 5 ? 5 : 4,
      daily,
      practice: sanitizeRecord(p?.practice),
    };
  } catch {
    return DEFAULT_STORE;
  }
}

/** the letter in a cell, whether it was given or typed */
function letterAt(rec: SquareRecord, i: number): string {
  return rec.cells[i] ?? rec.entries[i] ?? '';
}

function rowsOf(rec: SquareRecord): string[] {
  const n = rec.size;
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => letterAt(rec, r * n + c)).join('')
  );
}

function colsOf(rec: SquareRecord): string[] {
  const n = rec.size;
  return Array.from({ length: n }, (_, c) =>
    Array.from({ length: n }, (_, r) => letterAt(rec, r * n + c)).join('')
  );
}

/** A line is right when it's full and in the dictionary. Anything short of
 *  full is simply unfinished — flagging it red while someone is still typing
 *  would be nagging, not helping. */
type LineState = 'empty' | 'partial' | 'good' | 'bad';

function barTone(s: LineState): string {
  return s === 'good' ? 'bg-emerald-400' : s === 'bad' ? 'bg-rose-400' : 'bg-white/15';
}

function lineState(word: string, size: number, dict: Set<string> | null): LineState {
  if (!word) return 'empty';
  if (word.length < size) return 'partial';
  if (!dict) return 'partial';
  return dict.has(word) ? 'good' : 'bad';
}

const SquaresGame = forwardRef<
  SquaresGameHandle,
  {
    standardWords: string[] | null;
    onReveal?: (rows: string[]) => void;
  }
>(function SquaresGame({ standardWords }, ref) {
  const [store, setStore] = useState<SquaresStore>(loadStore);
  const { practiceAllowed } = usePrefs();
  const palette = usePalette();
  // pinned to the daily: someone who switched practice off shouldn't be left
  // looking at a practice board they can no longer leave
  useEffect(() => {
    if (!practiceAllowed && !store.dailyMode) setStore((prev) => ({ ...prev, dailyMode: true }));
  }, [practiceAllowed, store.dailyMode]);
  // the address bar says which board is open, and can ask for the other
  useEffect(() => reportDaily('squares', store.dailyMode), [store.dailyMode]);
  useEffect(
    () => offerDailySwitch('squares', (d) => setStore((prev) => ({ ...prev, dailyMode: d }))),
    []
  );

  // Not 0: if the top-left is a given letter, typing does nothing and the
  // board looks broken until you happen to click an empty cell.
  const [cursor, setCursor] = useState(0);
  const [dailyError, setDailyError] = useState(false);
  const [pool, setPool] = useState<Record<string, SquareRecord[]> | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SQUARES_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // today's boards
  useEffect(() => {
    let alive = true;
    fetch(DAILY_SQUARES_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        if (typeof d?.date !== 'string' || !d?.boards) throw new Error('bad payload');
        setStore((prev) => {
          const daily = prev.dailyDate === d.date ? { ...prev.daily } : {};
          for (const n of [4, 5] as SquareSize[]) {
            const board = d.boards[n];
            if (!board) continue;
            const fresh = sanitizeRecord({ ...board, entries: [] });
            if (!fresh) continue;
            // keep progress only when it's the same board we already had
            const held = daily[n];
            if (!held || held.cells.join('') !== fresh.cells.join('')) daily[n] = fresh;
          }
          return { ...prev, dailyDate: d.date, daily };
        });
      })
      .catch(() => {
        if (alive) setDailyError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // the practice pool, fetched once
  useEffect(() => {
    let alive = true;
    fetch(POOL_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (alive && d?.pool) setPool(d.pool);
      })
      .catch(() => {
        // practice stays unavailable until the pool loads
      });
    return () => {
      alive = false;
    };
  }, []);

  function drawPractice(size: SquareSize, avoid?: string): SquareRecord | null {
    const options = pool?.[String(size)];
    if (!options?.length) return null;
    const fresh = options.filter((p) => p.cells.join('') !== avoid);
    const from = fresh.length ? fresh : options;
    const pick = from[Math.floor(Math.random() * from.length)];
    return sanitizeRecord({ ...pick, entries: [] });
  }

  // make sure a practice board exists once the pool is here
  useEffect(() => {
    if (store.dailyMode || store.practice?.size === store.size || !pool) return;
    const board = drawPractice(store.size);
    if (board) setStore((prev) => ({ ...prev, practice: board }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.dailyMode, store.practice, store.size, pool]);

  const record = store.dailyMode ? store.daily[store.size] ?? null : store.practice;
  // The board's own size, never store.size: that flips the instant you press
  // 5×5, while the record is still the old board until the new one arrives.
  // Rendering n² cells against the old board's bars pushed the last column off
  // the grid and up a row.
  const n = record?.size ?? store.size;
  const dict = useMemo(
    () => (standardWords ? new Set(standardWords.filter((w) => w.length === n)) : null),
    [standardWords, n]
  );

  // Seat the cursor on a cell that accepts letters whenever the board changes
  // — switching size, drawing a new practice square, or the daily arriving.
  const boardKey = record ? `${store.dailyMode}:${store.size}:${record.cells.join('')}` : '';
  useEffect(() => {
    if (!record) return;
    const first = record.cells.findIndex((c) => c === null);
    if (first >= 0) setCursor(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey]);

  const rows = record ? rowsOf(record) : [];
  const cols = record ? colsOf(record) : [];
  const rowStates = rows.map((w) => lineState(w, n, dict));
  const colStates = cols.map((w) => lineState(w, n, dict));
  const solved =
    !!record &&
    rowStates.every((s) => s === 'good') &&
    colStates.every((s) => s === 'good');
  const done = solved || !!record?.revealed;

  function update(fn: (r: SquareRecord) => SquareRecord) {
    setStore((prev) => {
      const cur = prev.dailyMode ? prev.daily[prev.size] : prev.practice;
      if (!cur) return prev;
      const next = fn(cur);
      return prev.dailyMode
        ? { ...prev, daily: { ...prev.daily, [prev.size]: next } }
        : { ...prev, practice: next };
    });
  }

  useEffect(() => {
    if (!record) return;
    // The persisted flag doubles as the guard: a board counts once, and a
    // reload of a finished board doesn't count it again.
    if (solved && !record.solved) {
      update((r) => ({ ...r, solved: true }));
      recordSquaresFinish(
        store.dailyMode,
        true,
        n,
        record.elapsedMs ?? 0,
        store.dailyMode ? store.dailyDate : null
      );
    }
  }, [solved, record, n, store.dailyMode, store.dailyDate]);

  useDailySync({
    game: 'squares',
    // the 4x4 and the 5x5 are separate puzzles on the same day, so they need
    // separate rows rather than fighting over one
    variant: String(n),
    date: store.dailyDate,
    record: (record as unknown as Record<string, unknown>) ?? null,
    setRecord: (merged) =>
      setStore((prev) => {
        const cur = prev.daily[prev.size];
        if (!cur) return prev;
        const next = sanitizeRecord({ ...cur, ...merged });
        return next ? { ...prev, daily: { ...prev.daily, [prev.size]: next } } : prev;
      }),
    summary: done
      ? { solved: !record?.revealed, size: n, timeMs: record?.elapsedMs ?? 0 }
      : null,
    active: store.dailyMode,
  });

  // the record accumulates its own time, so a board picked up tomorrow carries
  // yesterday's minutes rather than starting from zero
  useUpTimer(!!record && !done, (delta) =>
    update((r) => ({ ...r, elapsedMs: (r.elapsedMs ?? 0) + delta }))
  );

  /** the next cell the player can actually type in */
  function step(from: number, dir: 1 | -1): number {
    if (!record) return from;
    const total = n * n;
    for (let k = 1; k <= total; k++) {
      const i = (from + dir * k + total * 2) % total;
      if (record.cells[i] === null) return i;
    }
    return from;
  }

  function pressKey(k: string) {
    if (!record || done) return;
    if (k === 'backspace') {
      if (record.cells[cursor] === null && record.entries[cursor]) {
        update((r) => {
          const entries = [...r.entries];
          entries[cursor] = '';
          return { ...r, entries };
        });
      } else {
        const prev = step(cursor, -1);
        setCursor(prev);
        update((r) => {
          const entries = [...r.entries];
          entries[prev] = '';
          return { ...r, entries };
        });
      }
      return;
    }
    if (/^[a-z]$/.test(k)) {
      if (record.cells[cursor] !== null) return;
      update((r) => {
        const entries = [...r.entries];
        entries[cursor] = k;
        return { ...r, entries };
      });
      setCursor((c) => step(c, 1));
    }
  }

  useImperativeHandle(ref, () => ({ pressKey }));

  // physical keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Backspace') pressKey('backspace');
      else if (/^[a-zA-Z]$/.test(e.key)) pressKey(e.key.toLowerCase());
      else if (e.key.startsWith('Arrow')) {
        const r = Math.floor(cursor / n);
        const c = cursor % n;
        const to =
          e.key === 'ArrowLeft' ? r * n + Math.max(0, c - 1)
          : e.key === 'ArrowRight' ? r * n + Math.min(n - 1, c + 1)
          : e.key === 'ArrowUp' ? Math.max(0, r - 1) * n + c
          : Math.min(n - 1, r + 1) * n + c;
        setCursor(to);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function reveal() {
    if (!record) return;
    try {
      const answer = JSON.parse(atob(record.answer))?.rows as string[];
      if (!Array.isArray(answer)) return;
      update((r) => ({
        ...r,
        entries: answer.join('').split(''),
        revealed: true,
      }));
      if (!record.revealed && !record.solved) {
        recordSquaresFinish(
          store.dailyMode,
          false,
          n,
          record.elapsedMs ?? 0,
          store.dailyMode ? store.dailyDate : null
        );
      }
    } catch {
      // a board with no readable answer just can't be revealed
    }
  }

  function newPractice() {
    const board = drawPractice(store.size, store.practice?.cells.join(''));
    if (board) setStore((prev) => ({ ...prev, practice: board }));
  }

  // Grid's *play* board metrics, not its solver tiles — Grid uses two sizes
  // (40x48 for the solver's letter inputs, 48x56 for the board you play on)
  // and squares is a play board. One size at both 4x4 and 5x5, since Grid
  // doesn't shrink between its presets either.
  const cell =
    'w-11 h-12 sm:w-12 sm:h-14 text-xl sm:text-2xl ' +
    'flex items-center justify-center rounded-xl border-2 font-bold uppercase transition-colors';

  return (
    <div className="text-center">
      {/* daily / practice */}
      <div
        className={`mb-4 inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1 ${
          practiceAllowed ? '' : 'hidden'
        }`}
      >
        {([true, false] as const).map((id) => (
          <button
            key={String(id)}
            onClick={() => setStore((prev) => ({ ...prev, dailyMode: id }))}
            className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold transition-colors
              ${store.dailyMode === id
                ? 'bg-emerald-400 text-ink shadow-lg shadow-emerald-500/30'
                : 'text-slate-300 hover:bg-white/10'}`}
          >
            {id && <CalendarDays className="w-4 h-4" />}
            {id ? 'Daily' : 'Practice'}
          </button>
        ))}
      </div>

      {/* size */}
      <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
        <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
          {([4, 5] as SquareSize[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStore((prev) => ({ ...prev, size: s }));
                setCursor(0);
              }}
              className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors
                ${store.size === s
                  ? 'bg-amber-400 text-ink shadow-lg shadow-amber-500/30'
                  : 'text-slate-300 hover:bg-white/10'}`}
            >
              {s}×{s}
            </button>
          ))}
        </div>
      </div>

      {record && (
        <div className="mb-5 flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-400 tabular-nums">
            <Timer className="w-4 h-4" />
            {formatElapsed(record.elapsedMs ?? 0)}
          </span>
        </div>
      )}

      {!record && (
        <p className="text-sm text-slate-400 py-8">
          {dailyError && store.dailyMode
            ? "Couldn't load today's squares — try again later."
            : 'Loading…'}
        </p>
      )}

      {record && (
        <>
          {/* One grid, n+1 columns wide: the last column carries each row's
              indicator so it sits beside the line it judges. A strip of row
              states under the board reads as columns, which is exactly the
              wrong thing for it to say. */}
          <div
            className="grid gap-2 w-fit mx-auto"
            style={{ gridTemplateColumns: `repeat(${n}, auto) 0.375rem` }}
          >
            {colStates.map((s, c) => (
              <div key={`col-${c}`} aria-hidden className={`h-1.5 rounded-full ${barTone(s)}`} />
            ))}
            <div aria-hidden />

            {Array.from({ length: n }, (_, r) => (
              <Fragment key={`r-${r}`}>
                {Array.from({ length: n }, (_, c) => {
                  const i = r * n + c;
                  const given = record.cells[i] !== null;
                  const focused = i === cursor && !done;
                  const letter = letterAt(record, i);
                  return (
                    <button
                      key={i}
                      onClick={() => !given && setCursor(i)}
                      aria-label={`row ${r + 1} column ${c + 1}${
                        given ? `, ${letter}, given` : letter ? `, ${letter}` : ', empty'
                      }`}
                      // Filled vs outline, not two tints: `white` and `black`
                      // are theme tokens that invert, so bg-white/20 against
                      // bg-black/20 collapses to the same colour in light mode.
                      className={`${cell} ${
                        given
                          ? 'bg-white/35 border-white/40 text-white cursor-default'
                          : focused
                            ? 'bg-amber-400/15 border-amber-400 text-accent'
                            : 'bg-transparent border-white/25 text-accent hover:bg-white/10'
                      }`}
                    >
                      {letter}
                    </button>
                  );
                })}
                <div aria-hidden className={`w-1.5 h-full rounded-full ${barTone(rowStates[r])}`} />
              </Fragment>
            ))}
          </div>

          <p className="mt-4 text-sm text-slate-400" aria-live="polite">
            {done
              ? record.revealed
                ? 'Revealed — the answer is on the board.'
                : `Solved in ${formatElapsed(record.elapsedMs ?? 0)}.`
              : 'Every row and every column has to be a word.'}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {done && (
              <ShareButton
                build={() =>
                  buildShare({
                    game: `Squares (${n}×${n})`,
                    slug: 'squares',
                    daily: store.dailyMode,
                    date: store.dailyDate,
                    body: [
                      record.revealed
                        ? 'Revealed'
                        : `Solved in ${formatElapsed(record.elapsedMs ?? 0)}`,
                      // The grid is the puzzle's shape, not a record of play —
                      // it is the same for everyone today. Under "Revealed" a
                      // wall of filled cells would read as "I did all these",
                      // so it only goes out with a genuine solve.
                      ...(record.revealed ? [] : Array.from({ length: n }, (_, r) =>
                        Array.from({ length: n }, (_, c) =>
                          record.cells[r * n + c] !== null
                            ? TILE_EMOJI[palette].absent
                            : TILE_EMOJI[palette].correct
                        ).join('')
                      )),
                    ],
                  })
                }
              />
            )}
            {!store.dailyMode && (
              <button
                onClick={newPractice}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                New square
              </button>
            )}
            {!done && (
              <button
                onClick={reveal}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Eye className="w-4 h-4" />
                Reveal
              </button>
            )}
          </div>


        </>
      )}
    </div>
  );
});

export default SquaresGame;
