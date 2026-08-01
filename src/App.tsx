import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { Search, Sparkles, Eraser, ArrowDown, X, BookOpen, Grid3x3, Shuffle, Hexagon, Check } from 'lucide-react';
import { DICTIONARIES, getDictionary, type DictionaryId } from '@/dictionaries';
import { solvePattern, solveDescramble, solveBee } from '@/solvers';
import { loadState, saveState, type Mode } from '@/storage';

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
    label: 'Descramble',
    blurb: 'Scrabble, Jumble — what can these letters spell?',
    description:
      "Type the letters you're holding — with ? for blank tiles — and we'll show every word they can spell.",
  },
  {
    id: 'bee',
    label: 'Spelling Bee',
    blurb: 'Seven letters, 4+ letter words, center letter required',
    description:
      "Enter the hive's seven letters and we'll find every word that uses the center — pangrams first.",
  },
];

const MODE_ICONS: Record<Mode, typeof Grid3x3> = {
  pattern: Grid3x3,
  descramble: Shuffle,
  bee: Hexagon,
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
}: {
  value: string;
  onChange: (v: string) => void;
  state: 'known' | 'empty' | 'center';
  index: number;
  size: 'sm' | 'md';
  group: string;
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
      aria-label={`Letter at position ${index + 1}`}
      placeholder="·"
      className={`${dims} text-center font-bold uppercase rounded-xl border-2 transition-all duration-150 outline-none
        ${state === 'known'
          ? 'bg-emerald-500/15 border-emerald-400 text-emerald-200 shadow-[0_0_20px_-6px] shadow-emerald-500/40'
          : state === 'center'
            ? 'bg-amber-400/15 border-amber-400 text-amber-200 shadow-[0_0_20px_-6px] shadow-amber-400/50 placeholder-amber-200/30'
            : 'bg-white/5 border-white/10 text-white placeholder-white/25 hover:border-white/20'}
        focus:border-amber-400 focus:bg-amber-400/10 focus:shadow-[0_0_24px_-6px] focus:shadow-amber-400/50`}
    />
  );
}

function WordChip({
  word,
  className,
  children,
}: {
  word: string;
  className: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
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
  const [showAll, setShowAll] = useState(false);

  const dictionaryId = dictionaries[mode];
  const setDictionaryId = (id: DictionaryId) =>
    setDictionaries((prev) => ({ ...prev, [mode]: id }));

  // persist tool, per-tool dictionary, and last inputs
  useEffect(() => {
    saveState({
      mode,
      dictionaries,
      pattern: { length, known, contains: containsStr, excluded: excludedStr },
      descramble: { rack: rackStr, useAll, minLength },
      bee: { center: beeCenter, outers: beeOuters },
    });
  }, [mode, dictionaries, length, known, containsStr, excludedStr, rackStr, useAll, minLength, beeCenter, beeOuters]);

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

  const results = useMemo(() => {
    if (mode === 'descramble') {
      return solveDescramble(words, { letters: rackLetters, wildcards, useAll, minLength });
    }
    if (mode === 'bee') {
      return solveBee(words, { center: beeCenter, outers: beeOuters });
    }
    return solvePattern(words, { length, known, contains, excluded });
  }, [mode, words, length, known, contains, excluded, rackLetters, wildcards, useAll, minLength, beeCenter, beeOuters]);

  const visible = showAll ? results : results.slice(0, 200);

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

  function resetAll() {
    setKnown(Array(length).fill(''));
    setContainsStr('');
    setExcludedStr('');
    setRackStr('');
    setBeeCenter('');
    setBeeOuters(Array(6).fill(''));
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
          <h1 className="pb-2 text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent">
            Anagrimoire
          </h1>
          <div className="mt-6 inline-flex rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
            {MODES.map((m) => {
              const Icon = MODE_ICONS[m.id];
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  title={m.blurb}
                  className={`inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold transition-all duration-150
                    ${mode === m.id
                      ? 'bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30'
                      : 'text-slate-300 hover:bg-white/10'}`}
                >
                  <Icon className="w-4 h-4" />
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-slate-400 max-w-md mx-auto text-sm sm:text-base">
            {MODES.find((m) => m.id === mode)?.description}
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
                group="known"
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
        </>
        )}

        {mode === 'descramble' && (
        <div className="mb-8">
          <section className="mb-5">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5 text-center">
              Your letters <span className="text-amber-400/70 normal-case">(use ? for a blank tile)</span>
            </label>
            <input
              value={rackStr}
              onChange={(e) => setRackStr(e.target.value.toLowerCase().replace(/[^a-z?]/g, '').slice(0, MAX_LEN))}
              placeholder="e.g. aetrsn?"
              aria-label="Letters to descramble"
              className="w-full h-14 px-4 rounded-xl bg-white/5 border-2 border-white/10 text-2xl text-center font-bold uppercase tracking-[0.3em] text-amber-200 placeholder-slate-600 placeholder-normal-case focus:border-amber-400 focus:bg-amber-400/5 outline-none transition-all"
            />
          </section>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setUseAll((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold transition-all duration-150 border
                ${useAll
                  ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/30'
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
        </div>
        )}

        {mode === 'bee' && (
        <div className="mb-8 text-center">
          <div className="flex flex-wrap justify-center items-end gap-5">
            <div>
              <label className="block text-xs font-medium text-amber-400/80 uppercase tracking-wider mb-2.5">
                Center
              </label>
              <Tile
                index={0}
                group="bee"
                value={beeCenter}
                state="center"
                size="md"
                onChange={(c) => setBeeCenter(c)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
                Outer letters
              </label>
              <div className="flex flex-wrap gap-2 justify-center">
                {beeOuters.map((v, i) => (
                  <Tile
                    key={i}
                    index={i + 1}
                    group="bee"
                    value={v}
                    state={v ? 'known' : 'empty'}
                    size="md"
                    onChange={(c) =>
                      setBeeOuters((prev) => prev.map((x, j) => (j === i ? c : x)))
                    }
                  />
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Words are 4+ letters, must use the center letter, and may repeat letters.
            Words using all seven letters are pangrams.
          </p>
        </div>
        )}

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
            <p className="text-slate-400">
              {mode === 'descramble'
                ? rackLetters.length + wildcards === 0
                  ? 'Type your letters above to see what they can spell.'
                  : 'Nothing spells from those letters. Try adding a wildcard (?) or lowering the minimum length.'
                : mode === 'bee'
                  ? beeCenter === ''
                    ? 'Enter the center letter and the six outer letters to find words.'
                    : 'No words found from those letters. Double-check the puzzle.'
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
              {pangrams.length > 0 && (
                <div className="mb-6">
                  <p className="mb-2.5 text-xs font-medium text-amber-400/80 uppercase tracking-wider">
                    Pangrams <span className="text-amber-400/50">· {pangrams.length}</span>
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
              {[...groupSource.reduce((m, w) => {
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
                        className="bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] hover:border-white/20"
                      />
                    ))}
                  </div>
                </div>
              ))}
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

        <footer className="mt-14 text-center text-xs text-slate-600">
          Searching {words.length.toLocaleString()} English words (
          {DICTIONARIES.find((d) => d.id === dictionaryId)?.label.toLowerCase()} dictionary).
        </footer>
      </div>
    </div>
  );
}

export default App;
