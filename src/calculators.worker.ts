// The calculators that cost something, off the main thread.
//
// Two of them do: the box search walks every chain a list can make, and the
// ladder walks the everyday dictionary breadth-first once per word. Everything
// else on the panel — the bridge, the Weave fit, a passage's length — is
// arithmetic over the words themselves and is done before a keystroke lands.
//
// The worker owns its dictionaries rather than being handed them: the rung list
// is forty thousand words, and posting it across for every question would cost
// more than the question does.
import { getDictionary } from '@/dictionaries';
import {
  boxesFrom,
  laddersFrom,
  squaresFrom,
  type Box,
  type LadderPair,
  type ThemedSquare,
} from '@/themeCalculators';

export type CalcRequest =
  | { kind: 'boxes'; at: number; words: string[]; must?: string[] }
  | { kind: 'ladders'; at: number; words: string[] }
  | { kind: 'squares'; at: number; words: string[] };

export type CalcReply =
  | { kind: 'boxes'; at: number; boards: Box[]; truncated: boolean }
  | { kind: 'ladders'; at: number; pairs: LadderPair[] }
  // Both sizes at once: they are one question — what can this list head — and
  // the answers are different enough to be worth seeing together, since four
  // letters works almost always and five seldom.
  | { kind: 'squares'; at: number; four: ThemedSquare[]; five: ThemedSquare[] };

/** Far past what a theme makes and short of what a pasted document does: a list
 *  of a thousand words makes six thousand boards in under a second, and one of
 *  fifteen hundred makes sixty-eight thousand in forty-three. */
const BUDGET = 20_000;

let common: string[] | null = null;
let rungs: Set<string> | null = null;

self.onmessage = async (event: MessageEvent<CalcRequest>) => {
  const request = event.data;

  if (request.kind === 'boxes') {
    const { words, must, at } = request;
    const boards = boxesFrom(words, {
      budget: BUDGET,
      must:
        must && must.length > 0 ? (word) => must.some((term) => word.includes(term)) : undefined,
    });
    const reply: CalcReply = { kind: 'boxes', at, boards, truncated: boards.length >= BUDGET };
    self.postMessage(reply);
    return;
  }

  // Loaded once and kept: the same forty thousand words answer every question
  // after the first.
  if (!common) common = await getDictionary('common');
  if (!rungs) rungs = new Set(common);

  if (request.kind === 'squares') {
    const reply: CalcReply = {
      kind: 'squares',
      at: request.at,
      four: squaresFrom(request.words, 4, common),
      five: squaresFrom(request.words, 5, common),
    };
    self.postMessage(reply);
    return;
  }

  const reply: CalcReply = {
    kind: 'ladders',
    at: request.at,
    pairs: laddersFrom(request.words, rungs),
  };
  self.postMessage(reply);
};
