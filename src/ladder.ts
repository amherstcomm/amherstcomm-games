// The two rules a ladder runs on, in one place because three surfaces need
// them: the board that refuses a rung, the Reveal that gives up, and the
// solver that answers for any pair.
//
// Both are also what the server checks, which is the point of the game being
// verifiable without an answer: there is nothing here a route could contradict.

/** one letter apart, same length — the only legal move */
export function isStep(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differ = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differ++;
  return differ === 1;
}

/** The shortest ladder, or null when the words are not connected at all.
 *
 *  The same breadth-first search the generator measured par with, so what it
 *  finds here is the number the board has been claiming — which is why Reveal
 *  can never contradict the par printed above it. */
export function shortestLadder(from: string, to: string, words: Set<string>): string[] | null {
  if (from === to) return [from];
  if (from.length !== to.length) return null;
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const w = queue[i];
    if (w === to) {
      const path: string[] = [];
      for (let at: string | null = to; at; at = prev.get(at)!) path.push(at);
      return path.reverse();
    }
    for (let p = 0; p < w.length; p++) {
      for (let c = 97; c < 123; c++) {
        const next = w.slice(0, p) + String.fromCharCode(c) + w.slice(p + 1);
        if (next !== w && words.has(next) && !prev.has(next)) {
          prev.set(next, w);
          queue.push(next);
        }
      }
    }
  }
  return null;
}
