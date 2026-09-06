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
import { boxesFrom, laddersFrom, type Box, type LadderPair } from '@/themeCalculators';

export type CalcRequest =
  | { kind: 'boxes'; at: number; words: string[]; must?: string[] }
  | { kind: 'ladders'; at: number; words: string[] };

export type CalcReply =
  | { kind: 'boxes'; at: number; boards: Box[]; truncated: boolean }
  | { kind: 'ladders'; at: number; pairs: LadderPair[] };

/** Far past what a theme makes and short of what a pasted document does: a list
 *  of a thousand words makes six thousand boards in under a second, and one of
 *  fifteen hundred makes sixty-eight thousand in forty-three. */
const BUDGET = 20_000;

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
  if (!rungs) rungs = new Set(await getDictionary('common'));
  const reply: CalcReply = {
    kind: 'ladders',
    at: request.at,
    pairs: laddersFrom(request.words, rungs),
  };
  self.postMessage(reply);
};
