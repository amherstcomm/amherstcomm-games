// Asking the calculators for a list of words, without holding the page still.
//
// One worker for the component, one question of each kind in flight, and
// answers carrying the number of the question they answer — a reply about a
// list somebody has already changed is dropped rather than shown. Typing
// produces a question per pause rather than one per keystroke, which is what
// the delay is for.
//
// Both hooks say when they are working. A calculator that shows the previous
// answer while the list has moved on is worse than one that says "working":
// somebody writing a list would read it as the answer for what they had just
// typed.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Box, LadderPair, ThemedSquare } from '@/themeCalculators';
import type { CalcReply, CalcRequest } from '@/calculators.worker';

/** One worker, made when the component asks and thrown away with it. */
function useWorker(onReply: (reply: CalcReply) => void) {
  const worker = useRef<Worker | null>(null);
  const handler = useRef(onReply);
  handler.current = onReply;

  useEffect(() => {
    // Vite compiles this into its own bundle; the URL form is what makes that
    // happen, so it cannot be shortened into a variable.
    const w = new Worker(new URL('./calculators.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (event: MessageEvent<CalcReply>) => handler.current(event.data);
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  return worker;
}

export type Boxes = {
  boards: Box[];
  /** true while an answer is outstanding, so the page can say it is working */
  searching: boolean;
  /** the search stopped early, which a themed list never does */
  truncated: boolean;
};

export type Ladders = {
  pairs: LadderPair[];
  searching: boolean;
};

export type Squares = {
  /** the words that can head a 4x4, and those that can head a 5x5 */
  four: ThemedSquare[];
  five: ThemedSquare[];
  searching: boolean;
};

/** The boxes a list can make, and the ladders it can set.
 *
 *  One hook for both, because they share a worker and a question number: two
 *  workers would load the dictionary twice, and two counters would let one
 *  calculator's stale answer land while the other's is still honest.
 */
export function useCalculators(words: string[], boxFilter?: string[], delay = 400) {
  const [boxes, setBoxes] = useState<Boxes>({
    boards: [],
    searching: false,
    truncated: false,
  });
  const [ladders, setLadders] = useState<Ladders>({ pairs: [], searching: false });
  const [squares, setSquares] = useState<Squares>({ four: [], five: [], searching: false });
  const asked = useRef(0);

  const worker = useWorker((reply) => {
    // An answer to a question that has been superseded: the words changed while
    // it was working, and it is about a list nobody is looking at.
    if (reply.at !== asked.current) return;
    if (reply.kind === 'boxes') {
      setBoxes({ boards: reply.boards, searching: false, truncated: reply.truncated });
    } else if (reply.kind === 'squares') {
      setSquares({ four: reply.four, five: reply.five, searching: false });
    } else {
      setLadders({ pairs: reply.pairs, searching: false });
    }
  });

  // The arrays are rebuilt on every render, so the question is keyed by what is
  // in them rather than by which array it is.
  const key = useMemo(
    () => `${words.join(' ')}|${(boxFilter ?? []).join(' ')}`,
    [words, boxFilter]
  );

  useEffect(() => {
    if (words.length < 2) {
      asked.current += 1;
      setBoxes({ boards: [], searching: false, truncated: false });
      setLadders({ pairs: [], searching: false });
      setSquares({ four: [], five: [], searching: false });
      return;
    }
    setBoxes((was) => ({ ...was, searching: true }));
    setLadders((was) => ({ ...was, searching: true }));
    setSquares((was) => ({ ...was, searching: true }));
    const id = window.setTimeout(() => {
      asked.current += 1;
      const at = asked.current;
      const boxRequest: CalcRequest = { kind: 'boxes', at, words, must: boxFilter };
      const ladderRequest: CalcRequest = { kind: 'ladders', at, words };
      const squareRequest: CalcRequest = { kind: 'squares', at, words };
      worker.current?.postMessage(boxRequest);
      worker.current?.postMessage(ladderRequest);
      worker.current?.postMessage(squareRequest);
    }, delay);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay]);

  return { boxes, ladders, squares };
}
