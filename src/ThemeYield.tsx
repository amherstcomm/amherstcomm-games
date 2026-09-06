// What a word list can actually make.
//
// The Weave calculator answers "does this theme fill a board" while somebody is
// typing it. This is the same question for the other two games a list could
// drive, asked at the same moment — which is the only moment the answer is any
// use. A list finished in September and found to make one puzzle in October is
// a list nobody can fix.
//
// The dictionary is fetched, not bundled here, and only once somebody has
// written enough words to be asking. Until it lands the boxes are still counted
// and their two-word guarantee is simply unknown, which is said rather than
// guessed at.
import { useEffect, useMemo, useState } from 'react';
import { getDictionary, getDifficultyPool } from '@/dictionaries';
import {
  boxesFrom,
  bridgesFrom,
  laddersFrom,
  type Box,
  type LadderPair,
} from '@/themeCalculators';

export default function ThemeYield({ words }: { words: string }) {
  const list = useMemo(
    () => words.split(/[^A-Za-z]+/).filter((w) => w.length >= 3),
    [words]
  );
  const [dictionary, setDictionary] = useState<string[] | null>(null);

  useEffect(() => {
    // Not before there is a list worth asking about: the pool is a fetch, and
    // an empty box should not cost one.
    if (list.length < 2 || dictionary) return;
    let alive = true;
    void getDifficultyPool('easy').then((pool) => {
      if (alive) setDictionary(pool);
    });
    return () => {
      alive = false;
    };
  }, [list.length, dictionary]);

  // Deferred, like the ladder below and for the same reason: the search now
  // takes sets of up to four words, and measuring how few words each board
  // needs is three milliseconds a board. A couple of dozen is all this line
  // says anything about, so it asks for that rather than the four thousand the
  // generator works through overnight.
  const [boxes, setBoxes] = useState<Box[]>([]);
  useEffect(() => {
    if (list.length < 2) {
      setBoxes([]);
      return;
    }
    const id = window.setTimeout(
      () => setBoxes(boxesFrom(list, dictionary ?? undefined, { limit: 24 })),
      400
    );
    return () => window.clearTimeout(id);
  }, [list, dictionary]);
  const bridges = useMemo(() => bridgesFrom(list), [list]);

  // The ladder search is the one measurement here that cannot ride along with a
  // keystroke: a breadth-first walk per word over forty thousand rungs is about
  // a tenth of a second for a two-dozen-word list, and doing that on every
  // letter typed makes the box stutter. So it waits for a pause, and says it is
  // working rather than showing a stale answer as though it were current.
  const [rungs, setRungs] = useState<Set<string> | null>(null);
  const [ladders, setLadders] = useState<LadderPair[] | null>(null);

  useEffect(() => {
    if (list.length < 2 || rungs) return;
    let alive = true;
    void getDictionary('common').then((words) => {
      if (alive) setRungs(new Set(words));
    });
    return () => {
      alive = false;
    };
  }, [list.length, rungs]);

  useEffect(() => {
    if (!rungs || list.length < 2) return;
    setLadders(null);
    const id = window.setTimeout(() => setLadders(laddersFrom(list, rungs)), 400);
    return () => window.clearTimeout(id);
  }, [list, rungs]);

  if (list.length < 2) return null;

  const playable = boxes.filter((b) => b.par !== null);
  const best = playable[0] ?? boxes[0];

  return (
    <div className="rounded-lg border border-white/15 p-3 text-xs space-y-2">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        What this list can make
      </p>

      <div>
        <p className={boxes.length > 0 ? 'text-emerald-300' : 'text-slate-500'}>
          {boxes.length > 0 ? '✓' : '·'} Boxed — {boxes.length}{' '}
          {boxes.length === 1 ? 'board' : 'boards'} from sets of these words
          {dictionary && boxes.length > 0 &&
            `, ${boxes.filter((b) => b.par === 2).length} solved by two chained words and ` +
              `${boxes.filter((b) => b.par === 3).length} by three`}
          {boxes.length >= 24 && ' (the first two dozen — there are more)'}
        </p>
        {best && (
          <p className="text-slate-400 pl-3">
            best: {best.from.join(' + ')} → {best.sides.join(' | ')}
            {best.solution ? ` — solved by ${best.solution.join(' → ')}` : ''} — finds{' '}
            {best.holds.length}: {best.holds.slice(0, 8).join(', ')}
            {best.holds.length > 8 && '…'}
          </p>
        )}
        {/* The guarantee is the thing a themed box can quietly lose, so its
            absence is stated rather than left as a smaller number. */}
        {dictionary && boxes.length > 0 && playable.length === 0 && (
          <p className="text-amber-300 pl-3">
            None can be finished in two words or three, so none would be set.
            More words, or longer ones, widen the letters.
          </p>
        )}
        {!dictionary && boxes.length > 0 && (
          <p className="text-slate-500 pl-3">checking which can be solved…</p>
        )}
      </div>

      <div>
        {/* Both ends have to be the theme's own, and both have to be words the
            board will accept as rungs — so a list can have plenty of words and
            still set no ladder, which is worth seeing before October. */}
        <p
          className={
            ladders === null
              ? 'text-slate-500'
              : ladders.length > 0
                ? 'text-emerald-300'
                : 'text-slate-500'
          }
        >
          {ladders === null ? '·' : ladders.length > 0 ? '✓' : '·'} Ladder —{' '}
          {ladders === null
            ? 'looking for routes…'
            : `${ladders.length} ${ladders.length === 1 ? 'pair' : 'pairs'}`}
          {ladders !== null && ladders.length > 0 &&
            ` (${['easy', 'hard', 'extreme']
              .map((tier) => `${tier} ${ladders.filter((l) => l.tier === tier).length}`)
              .join(' · ')})`}
        </p>
        {ladders !== null && ladders.length > 0 && (
          <p className="text-slate-400 pl-3">
            {ladders
              .slice(0, 3)
              .map((l) => `${l.a} → ${l.b} in ${l.par}`)
              .join('  |  ')}
          </p>
        )}
        {ladders !== null && ladders.length === 0 && (
          // Said plainly, because the reason is not obvious from the list: it
          // needs two words of the same length with a route between them, and
          // both have to be ordinary enough for the board to accept as rungs.
          <p className="text-slate-500 pl-3">
            Needs two words of the same length, both in the everyday dictionary,
            three to eight one-letter steps apart.
          </p>
        )}
      </div>

      <div>
        <p className={bridges.length > 0 ? 'text-emerald-300' : 'text-slate-500'}>
          {bridges.length > 0 ? '✓' : '·'} Bridge — {bridges.length}{' '}
          {bridges.length === 1 ? 'prompt' : 'prompts'}
        </p>
        {bridges.length > 0 ? (
          <p className="text-slate-400 pl-3">
            {bridges
              .slice(0, 3)
              .map((b) => `${b.x} · ${b.middle} · ${b.y}`)
              .join('  |  ')}
          </p>
        ) : (
          // Said plainly because it is not a fault in the list: most themes are
          // nouns, and a bridge needs two compounds sharing a stem.
          <p className="text-slate-500 pl-3">
            Needs two words that are compounds sharing a stem — nonprofit and
            profitable give non · profit · able.
          </p>
        )}
      </div>
    </div>
  );
}
