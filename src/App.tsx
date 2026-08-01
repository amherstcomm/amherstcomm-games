import { useMemo, useState, useEffect, useRef } from 'react';
import { Search, Sparkles, Eraser, ArrowDown, X, BookOpen } from 'lucide-react';
import { DICTIONARIES, getDictionary, type DictionaryId } from '@/dictionaries';

const MIN_LEN = 3;
const MAX_LEN = 15;

type SolverInput = {
  length: number;
  known: string[]; // known letters by position, '' for unknown
  contains: string[]; // letters that must appear (multiset)
  excluded: string[]; // letters that must not appear
};

function solve(list: string[], input: SolverInput): string[] {
  const { length, known, contains, excluded } = input;

  const excludedSet = new Set(excluded.filter(Boolean));
  const containsCounts = new Map<string, number>();
  for (const c of contains) {
    if (c) containsCounts.set(c, (containsCounts.get(c) ?? 0) + 1);
  }

  return list.filter((w) => {
    if (w.length !== length) return false;

    // excluded letters
    for (let i = 0; i < w.length; i++) {
      if (excludedSet.has(w[i])) return false;
    }

    // known positions
    for (let i = 0; i < known.length; i++) {
      const k = known[i];
      if (k && w[i] !== k) return false;
    }

    // must-contain multiset
    for (const [ch, need] of containsCounts) {
      let count = 0;
      for (let i = 0; i < w.length; i++) if (w[i] === ch) count++;
      if (count < need) return false;
    }

    return true;
  });
}

function normalizeLetters(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z]/g, '').split('');
}

function Tile({
  value,
  onChange,
  state,
  index,
  size,
}: {
  value: string;
  onChange: (v: string) => void;
  state: 'known' | 'empty';
  index: number;
  size: 'sm' | 'md';
}) {
  const ref = useRef<HTMLInputElement>(null);
  const dims =
    size === 'sm'
      ? 'w-9 h-11 sm:w-10 sm:h-12 text-xl sm:text-2xl'
      : 'w-12 h-14 sm:w-14 sm:h-16 text-2xl sm:text-3xl';

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => {
        const raw = e.target.value.toLowerCase().replace(/[^a-z]/g, '');
        onChange(raw.slice(-1));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Backspace' && !value && ref.current) {
          // move focus handled by parent via data attribute; keep simple
        }
      }}
      maxLength={1}
      aria-label={`Letter at position ${index + 1}`}
      placeholder="·"
      className={`${dims} text-center font-bold uppercase rounded-xl border-2 transition-all duration-150 outline-none
        ${state === 'known'
          ? 'bg-emerald-500/15 border-emerald-400 text-emerald-200 shadow-[0_0_20px_-6px] shadow-emerald-500/40'
          : 'bg-white/5 border-white/10 text-white placeholder-white/25 hover:border-white/20'}
        focus:border-amber-400 focus:bg-amber-400/10 focus:shadow-[0_0_24px_-6px] focus:shadow-amber-400/50`}
    />
  );
}

function App() {
  const [dictionaryId, setDictionaryId] = useState<DictionaryId>('common');
  const [length, setLength] = useState(5);
  const [known, setKnown] = useState<string[]>(Array(5).fill(''));
  const [containsStr, setContainsStr] = useState('');
  const [excludedStr, setExcludedStr] = useState('');
  const [showAll, setShowAll] = useState(false);

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

  const results = useMemo(() => {
    return solve(words, { length, known, contains, excluded });
  }, [words, length, known, contains, excluded]);

  const visible = showAll ? results : results.slice(0, 200);

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

  function resetAll() {
    setKnown(Array(length).fill(''));
    setContainsStr('');
    setExcludedStr('');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 -right-40 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px]" />

      <div className="relative max-w-3xl mx-auto px-5 py-10 sm:py-16">
        {/* header */}
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 mb-5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Word Game Solver
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent">
            Find the word
          </h1>
          <p className="mt-3 text-slate-400 max-w-md mx-auto text-sm sm:text-base">
            Lock in the letters you know, list the ones you've seen, and exclude the rest.
            We'll surface every dictionary word that fits.
          </p>
        </header>

        {/* dictionary selector */}
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
                    ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/30'
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
                    ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/30 scale-105'
                    : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

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
              Must contain <span className="text-amber-400/70 normal-case">(position unknown)</span>
            </label>
            <input
              value={containsStr}
              onChange={(e) => setContainsStr(e.target.value)}
              placeholder="e.g. d"
              className="w-full h-12 px-4 rounded-xl bg-white/5 border-2 border-white/10 text-lg font-semibold uppercase tracking-wider text-amber-200 placeholder-slate-600 placeholder-normal-case focus:border-amber-400 focus:bg-amber-400/5 outline-none transition-all"
            />
          </section>
          <section>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
              Excluded letters
            </label>
            <input
              value={excludedStr}
              onChange={(e) => setExcludedStr(e.target.value)}
              placeholder="letters not in the word"
              className="w-full h-12 px-4 rounded-xl bg-white/5 border-2 border-white/10 text-lg font-semibold uppercase tracking-wider text-rose-300 placeholder-slate-600 placeholder-normal-case focus:border-rose-400 focus:bg-rose-400/5 outline-none transition-all"
            />
          </section>
        </div>

        {/* results header */}
        <div className="flex items-center justify-between mb-4">
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
          <button
            onClick={resetAll}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <Eraser className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        {/* results */}
        {results.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
            <p className="text-slate-400">No words fit those clues. Try loosening a constraint.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {visible.map((w) => (
                <div
                  key={w}
                  className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-center text-lg tracking-wide hover:bg-white/[0.08] hover:border-white/20 transition-colors cursor-default"
                >
                  {highlight(w)}
                </div>
              ))}
            </div>
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

        <footer className="mt-14 text-center text-xs text-slate-600">
          Searching {words.length.toLocaleString()} English words (
          {DICTIONARIES.find((d) => d.id === dictionaryId)?.label.toLowerCase()} dictionary).
        </footer>
      </div>
    </div>
  );
}

export default App;
