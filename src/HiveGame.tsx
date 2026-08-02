import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CalendarDays, CornerDownLeft, Delete, RefreshCw, Search, Shuffle, Timer } from 'lucide-react';
import { formatElapsed, useUpTimer } from '@/useUpTimer';
import type { LetterState } from '@/GuessGame';
import { dailyDataUrl } from '@/dailyData';

export type HiveGameHandle = { pressKey: (k: string) => void };

const HIVE_KEY = 'anagrimoire:hive:v1';
const DAILY_HIVE_URL = dailyDataUrl('daily-hive');

// outer hive cells, clockwise from the top, as [left%, top%] of the container
const POSITIONS: [number, number][] = [
  [50, 14],
  [81, 32],
  [81, 68],
  [50, 86],
  [19, 68],
  [19, 32],
];

// NYT rank ladder as fractions of the maximum score
const RANKS: [string, number][] = [
  ['Beginner', 0],
  ['Good Start', 0.02],
  ['Moving Up', 0.05],
  ['Good', 0.08],
  ['Solid', 0.15],
  ['Nice', 0.25],
  ['Great', 0.4],
  ['Amazing', 0.5],
  ['Genius', 0.7],
  ['Queen Bee', 1],
];

type HiveRecord = { center: string; outers: string[]; found: string[]; elapsedMs?: number };
type HiveStore = {
  dailyMode: boolean;
  dailyDate: string;
  daily: HiveRecord | null;
  practice: HiveRecord | null;
};

const DEFAULT_STORE: HiveStore = { dailyMode: true, dailyDate: '', daily: null, practice: null };

function sanitizeRecord(r: unknown): HiveRecord | null {
  const rec = r as HiveRecord | null;
  if (
    !rec ||
    typeof rec.center !== 'string' ||
    !/^[a-z]$/.test(rec.center) ||
    !Array.isArray(rec.outers) ||
    rec.outers.length !== 6 ||
    !rec.outers.every((c) => typeof c === 'string' && /^[a-z]$/.test(c)) ||
    !Array.isArray(rec.found)
  ) {
    return null;
  }
  return {
    center: rec.center,
    outers: rec.outers,
    found: rec.found.filter((w) => typeof w === 'string'),
    elapsedMs: typeof rec.elapsedMs === 'number' && rec.elapsedMs >= 0 ? rec.elapsedMs : 0,
  };
}

function loadStore(): HiveStore {
  try {
    const raw = localStorage.getItem(HIVE_KEY);
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

function wordScore(word: string, isPangram: boolean): number {
  return (word.length === 4 ? 1 : word.length) + (isPangram ? 7 : 0);
}

const HiveGame = forwardRef<
  HiveGameHandle,
  {
    standardWords: string[] | null;
    commonWords: string[] | null;
    onLetterStates: (states: Record<string, LetterState>) => void;
    onReveal: (center: string, outers: string[]) => void;
  }
>(function HiveGame({ standardWords, commonWords, onLetterStates, onReveal }, ref) {
  const [store, setStore] = useState<HiveStore>(loadStore);
  const [current, setCurrent] = useState('');
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  const [dailyError, setDailyError] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(HIVE_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // fetch today's generated hive once
  useEffect(() => {
    let alive = true;
    fetch(DAILY_HIVE_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        const center = String(d.center).toLowerCase();
        const outers = (d.outers as string[]).map((c) => String(c).toLowerCase());
        if (!/^[a-z]$/.test(center) || outers.length !== 6) throw new Error('bad payload');
        // reset when the date changes OR the letters differ (e.g. the daily
        // source changed mid-day); outers compare as sets since shuffling
        // reorders the stored copy
        setStore((prev) => {
          const same =
            prev.dailyDate === d.date &&
            prev.daily &&
            prev.daily.center === center &&
            [...prev.daily.outers].sort().join('') === [...outers].sort().join('');
          return same ? prev : { ...prev, dailyDate: d.date, daily: { center, outers, found: [] } };
        });
      })
      .catch(() => {
        if (alive) setDailyError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const commonSet = useMemo(() => (commonWords ? new Set(commonWords) : null), [commonWords]);

  function makePracticeHive(): HiveRecord | null {
    if (!commonWords || !commonSet) return null;
    // no 's' in the hive (plurals would flood the answer list)
    const bases = commonWords.filter(
      (w) => w.length >= 7 && new Set(w).size === 7 && !w.includes('s')
    );
    if (!bases.length) return null;
    const base = bases[Math.floor(Math.random() * bases.length)];
    const letters = [...new Set(base)];
    const center = letters[Math.floor(Math.random() * letters.length)];
    const outers = letters.filter((c) => c !== center).sort(() => Math.random() - 0.5);
    return { center, outers, found: [] };
  }

  // ensure a practice hive exists once the dictionary is ready
  useEffect(() => {
    if (store.dailyMode || store.practice || !commonWords) return;
    const hive = makePracticeHive();
    if (hive) setStore((prev) => (prev.practice ? prev : { ...prev, practice: hive }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.dailyMode, store.practice, commonWords]);

  const record = store.dailyMode ? store.daily : store.practice;
  const hiveSet = useMemo(
    () => (record ? new Set([record.center, ...record.outers]) : null),
    [record]
  );

  const answers = useMemo(() => {
    if (!standardWords || !record || !hiveSet) return null;
    const list = standardWords.filter((w) => {
      if (w.length < 4 || !w.includes(record.center)) return false;
      for (let i = 0; i < w.length; i++) if (!hiveSet.has(w[i])) return false;
      return true;
    });
    return new Set(list);
  }, [standardWords, record, hiveSet]);

  const isPangram = (w: string) => new Set(w).size === 7;

  const maxScore = useMemo(() => {
    if (!answers) return 0;
    let s = 0;
    for (const w of answers) s += wordScore(w, isPangram(w));
    return s;
  }, [answers]);

  const score = useMemo(() => {
    if (!record) return 0;
    let s = 0;
    for (const w of record.found) s += wordScore(w, isPangram(w));
    return s;
  }, [record]);

  const rank = useMemo(() => {
    if (!maxScore) return RANKS[0][0];
    const frac = score / maxScore;
    let name = RANKS[0][0];
    for (const [label, threshold] of RANKS) if (frac >= threshold) name = label;
    return name;
  }, [score, maxScore]);

  const geniusAt = Math.ceil(maxScore * 0.7);
  const queenBee = maxScore > 0 && score >= maxScore;

  // thinking time: counts while the hive is visible, until Queen Bee
  useUpTimer(!!record && !queenBee, (delta) =>
    updateRecord((r) => ({ ...r, elapsedMs: (r.elapsedMs ?? 0) + delta }))
  );

  // dim non-hive letters on the on-screen keyboard; center reads amber
  useEffect(() => {
    if (!record) {
      onLetterStates({});
      return;
    }
    const states: Record<string, LetterState> = {};
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
      if (c === record.center) states[c] = 'present';
      else if (!record.outers.includes(c)) states[c] = 'absent';
    }
    onLetterStates(states);
  }, [record, onLetterStates]);

  function showFlash(text: string, good = false) {
    setFlash({ text, good });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1600);
  }

  function updateRecord(fn: (r: HiveRecord) => HiveRecord) {
    setStore((prev) => {
      const rec = prev.dailyMode ? prev.daily : prev.practice;
      if (!rec) return prev;
      const next = fn(rec);
      return prev.dailyMode ? { ...prev, daily: next } : { ...prev, practice: next };
    });
  }

  function submit() {
    if (!record || !answers) return;
    const word = current;
    setCurrent('');
    if (word.length < 4) {
      showFlash('Too short');
      return;
    }
    if (!word.includes(record.center)) {
      showFlash('Missing the center letter');
      return;
    }
    if (record.found.includes(word)) {
      showFlash('Already found');
      return;
    }
    if (!answers.has(word)) {
      showFlash('Not in word list');
      return;
    }
    const pangram = isPangram(word);
    updateRecord((r) => ({ ...r, found: [word, ...r.found] }));
    showFlash(pangram ? `Pangram! +${wordScore(word, true)}` : `+${wordScore(word, false)}`, true);
  }

  function pressKey(k: string) {
    if (k === 'enter') {
      submit();
      return;
    }
    if (k === 'backspace') {
      setCurrent((c) => c.slice(0, -1));
      return;
    }
    if (/^[a-z]$/.test(k) && hiveSet?.has(k)) {
      setCurrent((c) => (c.length < 19 ? c + k : c));
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

  function shuffleOuters() {
    updateRecord((r) => ({ ...r, outers: [...r.outers].sort(() => Math.random() - 0.5) }));
  }

  function newPracticeHive() {
    const hive = makePracticeHive();
    if (!hive) return;
    setCurrent('');
    setStore((prev) => ({ ...prev, practice: hive }));
  }

  const loading = store.dailyMode ? !record && !dailyError : !record || !commonWords;

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
          Couldn&apos;t fetch today&apos;s letters — try Practice instead.
        </p>
      )}

      {record && (
        <>
          {/* score + rank */}
          <div className="mb-4 flex items-center justify-center gap-4 text-xs text-slate-400">
            <span className="text-amber-300 font-semibold text-sm">{rank}</span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Timer className="w-3.5 h-3.5 text-slate-500" />
              {formatElapsed(record.elapsedMs ?? 0)}
            </span>
            <span>
              {score} / {maxScore} pts
            </span>
            <span className="text-slate-500">Genius at {geniusAt}</span>
            {store.dailyMode && store.dailyDate && (
              <span className="text-slate-500">{store.dailyDate}</span>
            )}
          </div>

          {/* current entry */}
          <div className="mb-4 mx-auto max-w-sm h-12 px-4 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden">
            <span className="text-2xl font-bold tracking-[0.2em] uppercase whitespace-nowrap">
              {current.split('').map((c, i) => (
                <span key={i} className={c === record.center ? 'text-amber-300' : 'text-white'}>
                  {c}
                </span>
              ))}
              <span className="text-amber-400 animate-pulse">|</span>
            </span>
          </div>

          {/* the hive */}
          <div className="relative w-56 h-56 mx-auto">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pressKey(record.center)}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-14 rounded-xl border-2 bg-amber-400/20 border-amber-400 text-amber-200 text-2xl font-bold uppercase hover:bg-amber-400/30 transition-colors"
            >
              {record.center}
            </button>
            {POSITIONS.map(([x, y], i) => (
              <button
                key={i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pressKey(record.outers[i])}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-12 h-14 rounded-xl border-2 bg-white/5 border-white/15 text-white text-2xl font-bold uppercase hover:bg-white/10 hover:border-white/30 transition-colors"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {record.outers[i]}
              </button>
            ))}
          </div>

          {/* controls */}
          <div className="mt-4 flex items-center justify-center gap-2.5">
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
              onClick={shuffleOuters}
              aria-label="Shuffle letters"
              className="inline-flex items-center justify-center w-11 h-10 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Shuffle className="w-4 h-4" />
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
                onClick={newPracticeHive}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                New hive
              </button>
            )}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onReveal(record.center, record.outers)}
              title="Give up and see every word in the solver"
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Search className="w-4 h-4" />
              Reveal
            </button>
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
            <div className="mt-3 text-left max-w-md mx-auto">
              <p className="mb-2 text-xs font-medium text-slate-400 uppercase tracking-wider text-center">
                Found <span className="text-slate-600">· {record.found.length}</span>
                {answers && <span className="text-slate-600"> of {answers.size}</span>}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {[...record.found].sort().map((w) => (
                  <span
                    key={w}
                    className={`px-2.5 py-1 rounded-lg border text-sm tracking-wide
                      ${isPangram(w)
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
            Scored against our Standard dictionary — nothing is checked against any publisher&apos;s list.
            {store.dailyMode && ' A fresh daily hive arrives about 15 minutes after 3:00 a.m. Eastern.'}
          </p>
        </>
      )}
    </div>
  );
});

export default HiveGame;
