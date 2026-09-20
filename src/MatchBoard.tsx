// Matching, answered by pointing at two things.
//
// It was a dropdown per row, which is a form rather than a game: it reads as
// admin, it hides the pairing inside a closed list, and on a projector nobody
// can see what anybody is doing. This is the same answer made by touching the
// thing on the left and then the thing it goes with, with a line drawn between
// them.
//
// Click rather than drag, deliberately. A drag needs a second implementation
// for touch, and a third for anyone who is not using a pointer at all --
// keyboard, switch, screen reader. Click-then-click is one path for all of
// them: these are buttons, so Tab and Enter work with nothing added, and the
// lines are decoration over an answer that is already readable without them.
//
// The lines are measured rather than guessed. Positions come from the elements
// themselves through a ResizeObserver, because the columns wrap and reflow --
// a line drawn from a remembered position is a line pointing at where a word
// used to be.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type Line = { from: { x: number; y: number }; to: { x: number; y: number }; state: 'set' | 'right' | 'wrong' };

export default function MatchBoard({
  left,
  right,
  pairs,
  onChange,
  locked = false,
  answer = null,
}: {
  left: string[];
  right: string[];
  /** what is matched with what, left-hand item to right-hand item */
  pairs: Record<string, string>;
  onChange: (pairs: Record<string, string>) => void;
  locked?: boolean;
  /** after the reveal: what the pairs should have been */
  answer?: Record<string, string> | null;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [said, setSaid] = useState('');
  const board = useRef<HTMLDivElement>(null);
  const cells = useRef<Map<string, HTMLElement>>(new Map());

  const hold = useCallback((key: string, el: HTMLElement | null) => {
    if (el) cells.current.set(key, el);
    else cells.current.delete(key);
  }, []);

  /** Where each pair's two ends are, in the board's own coordinates. */
  const measure = useCallback(() => {
    const box = board.current?.getBoundingClientRect();
    if (!box) return;
    const at = (key: string, side: 'left' | 'right') => {
      const el = cells.current.get(key);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: (side === 'left' ? r.right : r.left) - box.left,
        y: r.top + r.height / 2 - box.top,
      };
    };
    const drawn: Line[] = [];
    for (const [l, r] of Object.entries(pairs)) {
      const from = at(`L${l}`, 'left');
      const to = at(`R${r}`, 'right');
      if (!from || !to) continue;
      const state = answer ? (answer[l] === r ? 'right' : 'wrong') : 'set';
      drawn.push({ from, to, state });
    }
    setLines(drawn);
  }, [pairs, answer]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    if (!board.current || typeof ResizeObserver !== 'function') return;
    const watch = new ResizeObserver(() => measure());
    watch.observe(board.current);
    for (const el of cells.current.values()) watch.observe(el);
    return () => watch.disconnect();
  }, [measure]);

  function pick(side: 'left' | 'right', value: string) {
    if (locked) return;
    if (side === 'left') {
      // Touching a matched item again takes the match off, which is how
      // somebody undoes one without a second control to explain.
      if (pairs[value]) {
        const next = { ...pairs };
        delete next[value];
        onChange(next);
        setPicked(null);
        setSaid(`${value} unmatched`);
        return;
      }
      setPicked(picked === value ? null : value);
      setSaid(picked === value ? '' : `${value} picked — now choose what it matches`);
      return;
    }
    if (!picked) {
      setSaid('Pick something on the left first');
      return;
    }
    onChange({ ...pairs, [picked]: value });
    setSaid(`${picked} matched with ${value}`);
    setPicked(null);
  }

  /** What the right-hand item is matched with, if anything. */
  const matchedBy = (r: string) =>
    Object.entries(pairs)
      .filter(([, v]) => v === r)
      .map(([l]) => l);

  const cell =
    'w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors disabled:opacity-70';

  return (
    <div>
      <div ref={board} className="relative grid grid-cols-2 gap-8">
        {/* Under the buttons, and ignoring the pointer: the lines say what is
            matched, they are not how it is matched. */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
          role="presentation"
          data-match-lines
        >
          {lines.map((line, i) => (
            <line
              key={i}
              x1={line.from.x}
              y1={line.from.y}
              x2={line.to.x}
              y2={line.to.y}
              strokeWidth={2}
              className={
                line.state === 'right'
                  ? 'stroke-emerald-400'
                  : line.state === 'wrong'
                    ? 'stroke-rose-400'
                    : 'stroke-accent'
              }
            />
          ))}
        </svg>

        <ul className="space-y-2" aria-label="Match these">
          {left.map((l) => {
            const to = pairs[l];
            const should = answer?.[l];
            const got = should != null && to === should;
            return (
              <li key={l}>
                <button
                  type="button"
                  ref={(el) => hold(`L${l}`, el)}
                  disabled={locked}
                  aria-pressed={picked === l}
                  onClick={() => pick('left', l)}
                  className={`${cell} ${
                    answer
                      ? got
                        ? 'border-emerald-400 text-emerald-100'
                        : 'border-rose-400 text-rose-100'
                      : picked === l
                        ? 'border-accent bg-accent/15 text-white'
                        : to
                          ? 'border-accent/50 bg-white/5 text-slate-200'
                          : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {l}
                  {/* The pairing in words as well as in a line: a line is not
                      readable by a screen reader, and is invisible to anyone
                      who cannot see the colour it is drawn in. */}
                  {to && <span className="block text-xs text-slate-400">→ {to}</span>}
                  {answer && !got && (
                    <span className="block text-xs text-slate-400">should be {should}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <ul className="space-y-2" aria-label="With one of these">
          {right.map((r) => {
            const by = matchedBy(r);
            return (
              <li key={r}>
                <button
                  type="button"
                  ref={(el) => hold(`R${r}`, el)}
                  disabled={locked || (!picked && by.length === 0)}
                  onClick={() => pick('right', r)}
                  className={`${cell} ${
                    picked
                      ? 'border-accent/60 bg-white/5 text-slate-200 hover:bg-white/10'
                      : by.length > 0
                        ? 'border-accent/40 bg-white/5 text-slate-200'
                        : 'border-white/15 bg-white/5 text-slate-300'
                  }`}
                >
                  {r}
                  {by.length > 0 && (
                    <span className="block text-xs text-slate-400">← {by.join(', ')}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {!locked && (
        <p className="mt-3 text-xs text-slate-400">
          {picked
            ? `Now choose what "${picked}" matches.`
            : 'Choose something on the left, then what it matches. Choose a matched one again to undo it.'}
        </p>
      )}
      {/* Spoken, not drawn: the lines are for the room, this is for whoever is
          not reading them. */}
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
