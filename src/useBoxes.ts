// Asking the box search for a list of words, without holding the page still.
//
// One worker, kept for the life of the component, and one question in flight at
// a time: the answers carry the question's number and a late one for a question
// nobody is asking any more is dropped. Typing produces a question per pause
// rather than per keystroke, which is what the delay is for.
import { useEffect, useRef, useState } from 'react';
import type { Box } from '@/themeCalculators';
import type { BoxReply, BoxRequest } from '@/boxSearch.worker';

export type Boxes = {
  boards: Box[];
  /** true while an answer is outstanding, so a page can say it is looking
   *  rather than show the last answer as though it were current */
  searching: boolean;
  /** the search stopped early, which a themed list never does and a pasted
   *  document can */
  truncated: boolean;
};

export function useBoxes(words: string[], must?: string[], delay = 400): Boxes {
  const [state, setState] = useState<Boxes>({ boards: [], searching: false, truncated: false });
  const worker = useRef<Worker | null>(null);
  const asked = useRef(0);

  useEffect(() => {
    // Vite compiles this into its own bundle; the URL form is what makes that
    // happen, so it cannot be shortened into a variable.
    const w = new Worker(new URL('./boxSearch.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (event: MessageEvent<BoxReply>) => {
      // An answer to a question that has been superseded: the words changed
      // while it was working, and its boards are for a list nobody is looking
      // at.
      if (event.data.at !== asked.current) return;
      setState({ boards: event.data.boards, searching: false, truncated: event.data.truncated });
    };
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  const key = `${words.join(' ')}|${(must ?? []).join(' ')}`;
  useEffect(() => {
    if (words.length < 2) {
      asked.current += 1;
      setState({ boards: [], searching: false, truncated: false });
      return;
    }
    setState((was) => ({ ...was, searching: true }));
    const id = window.setTimeout(() => {
      asked.current += 1;
      const request: BoxRequest = { words, must, at: asked.current };
      worker.current?.postMessage(request);
    }, delay);
    return () => window.clearTimeout(id);
    // `key` stands for the words and the filter: the arrays are rebuilt on
    // every render and comparing them by identity would ask the same question
    // for ever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay]);

  return state;
}
