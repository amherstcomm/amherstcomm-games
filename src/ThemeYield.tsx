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
import { useCalculators } from '@/useCalculators';

export default function ThemeYield({ words }: { words: string }) {
  const list = useMemo(
    () => words.split(/[^A-Za-z]+/).filter((w) => w.length >= 3),
    [words]
  );
  // Both of the searches that cost anything, off the main thread and asked
  // again whenever the list stops changing. The box search is milliseconds for
  // a themed list and most of a minute for a pasted document; the ladder walks
  // forty thousand rungs once per word. Neither can run on the thread somebody
  // is typing on, and neither may show its last answer while the list has
  // moved on — so both say when they are working.
  const { boxes, ladders } = useCalculators(list);

  // The dictionary is for one question only: whether an ordinary pair beats the
  // chain on the best board, which is what the daily would promise. The boards
  // themselves need none — the chain is the answer.
  const [dictionary, setDictionary] = useState<string[] | null>(null);
  useEffect(() => {
    if (list.length < 2 || dictionary) return;
    let alive = true;
    void getDifficultyPool('easy').then((pool) => {
      if (alive) setDictionary(pool);
    });
    return () => {
      alive = false;
    };
  }, [list.length, dictionary]);

  const bridges = useMemo(() => bridgesFrom(list), [list]);

  const best = boxes.boards[0];
  // The one board worth measuring: whether an ordinary pair beats its chain,
  // which is what the daily would promise. Above the early return, because a
  // hook below one is a hook that runs on some renders and not others — React
  // #310, a blank page, and the reason this file has a browser test at all.
  const shortest = useMemo(() => {
    if (!best || !dictionary) return null;
    const measured = boxesFrom(best.from, { dictionary })[0];
    return measured?.ordinary ?? null;
  }, [best, dictionary]);

  if (list.length < 2) return null;

  return (
    <div className="rounded-lg border border-white/15 p-3 text-xs space-y-2">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        What this list can make
        {(boxes.searching || ladders.searching) && (
          <span className="normal-case tracking-normal text-slate-400">
            {' '}— working these out; they update when you stop typing
          </span>
        )}
      </p>

      <div>
        <p
          className={
            boxes.searching || boxes.boards.length === 0
              ? 'text-slate-500'
              : 'text-emerald-300'
          }
        >
          {boxes.searching ? '·' : boxes.boards.length > 0 ? '✓' : '·'} Boxed —{' '}
          {boxes.searching
            ? 'working…'
            : `${boxes.boards.length} ${boxes.boards.length === 1 ? 'board' : 'boards'} whose letters these words chain through`}
          {boxes.truncated && ' (stopped counting — that is a lot of words)'}
        </p>
        {!boxes.searching && best && (
          <p className="text-slate-400 pl-3">
            best: {best.sides.join(' | ')} — {best.solution.join(' → ')}
            {/* Only the best board is measured against the dictionary: knowing
                whether an ordinary pair beats the chain costs three
                milliseconds a board, which is a second across a long list, to
                say something every board says for itself once it is set. */}
            {shortest && ` (par ${shortest.length}: ${shortest.join(' → ')})`} — finds{' '}
            {best.holds.length}: {best.holds.slice(0, 8).join(', ')}
            {best.holds.length > 8 && '…'}
          </p>
        )}
        {/* Said plainly, because the reason is not obvious from a long list:
            the words have to chain into each other and cover twelve distinct
            letters between them, which two words rarely do and three often do. */}
        {!boxes.searching && boxes.boards.length === 0 && (
          <p className="text-slate-500 pl-3">
            Needs two to four of these words that chain — each starting with the
            last letter of the one before — and cover twelve distinct letters
            between them.
          </p>
        )}
      </div>

      <div>
        {/* Both ends have to be the theme's own, and both have to be words the
            board will accept as rungs — so a list can have plenty of words and
            still set no ladder, which is worth seeing before October. */}
        <p
          className={
            ladders.searching || ladders.pairs.length === 0
              ? 'text-slate-500'
              : 'text-emerald-300'
          }
        >
          {ladders.searching ? '·' : ladders.pairs.length > 0 ? '✓' : '·'} Ladder —{' '}
          {ladders.searching
            ? 'working…'
            : `${ladders.pairs.length} ${ladders.pairs.length === 1 ? 'pair' : 'pairs'}`}
          {!ladders.searching && ladders.pairs.length > 0 &&
            ` (${['easy', 'hard', 'extreme']
              .map((tier) => `${tier} ${ladders.pairs.filter((l) => l.tier === tier).length}`)
              .join(' · ')})`}
        </p>
        {!ladders.searching && ladders.pairs.length > 0 && (
          <p className="text-slate-400 pl-3">
            {ladders.pairs
              .slice(0, 3)
              .map((l) => `${l.a} → ${l.b} in ${l.par}`)
              .join('  |  ')}
          </p>
        )}
        {!ladders.searching && ladders.pairs.length === 0 && (
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
