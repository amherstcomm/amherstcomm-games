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
import { getDifficultyPool } from '@/dictionaries';
import { boxesFrom, bridgesFrom } from '@/themeCalculators';

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

  const boxes = useMemo(
    () => (list.length >= 2 ? boxesFrom(list, dictionary ?? undefined) : []),
    [list, dictionary]
  );
  const bridges = useMemo(() => bridgesFrom(list), [list]);

  if (list.length < 2) return null;

  const playable = boxes.filter((b) => b.guaranteed);
  const best = playable[0] ?? boxes[0];

  return (
    <div className="rounded-lg border border-white/15 p-3 text-xs space-y-2">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        What this list can make
      </p>

      <div>
        <p className={boxes.length > 0 ? 'text-emerald-300' : 'text-slate-500'}>
          {boxes.length > 0 ? '✓' : '·'} Boxed — {boxes.length}{' '}
          {boxes.length === 1 ? 'board' : 'boards'} from pairs of these words
          {dictionary && boxes.length > 0 && `, ${playable.length} solvable in two ordinary words`}
        </p>
        {best && (
          <p className="text-slate-400 pl-3">
            best: {best.from.join(' + ')} → {best.sides.join(' | ')} — finds{' '}
            {best.holds.length}: {best.holds.slice(0, 8).join(', ')}
            {best.holds.length > 8 && '…'}
          </p>
        )}
        {/* The guarantee is the thing a themed box can quietly lose, so its
            absence is stated rather than left as a smaller number. */}
        {dictionary && boxes.length > 0 && playable.length === 0 && (
          <p className="text-amber-300 pl-3">
            None can be finished in two words, which is what the daily promises.
            More words, or longer ones, widen the letters.
          </p>
        )}
        {!dictionary && boxes.length > 0 && (
          <p className="text-slate-500 pl-3">checking which can be solved…</p>
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
