// The box search, off the main thread.
//
// Enumerating the chains a word list can make is milliseconds for a themed list
// — forty words make none, three hundred make a couple of hundred boards in
// sixteen milliseconds — and most of a minute for a pasted document of fifteen
// hundred. The page cannot know which it has been given until it has looked, so
// it looks somewhere that cannot freeze anything.
//
// That also retires the cap this used to carry. A cap on the *results* was
// worse than useless: it stopped the search before the sort, so a filter typed
// on the page searched a page of boards rather than the list, and a board that
// existed could not be found. What is left is a stop far past anything a theme
// produces, and it says when it hits it.
import { boxesFrom, type Box } from '@/themeCalculators';

export type BoxRequest = {
  /** the words to search, and which of them an answer must contain */
  words: string[];
  must?: string[];
  /** echoed back, so a page can ignore the answer to a question it has stopped
   *  asking */
  at: number;
};

export type BoxReply = {
  at: number;
  boards: Box[];
  /** true when the search stopped early, which a themed list never does */
  truncated: boolean;
};

/** Far past what a theme makes and short of what a document does: a list of a
 *  thousand words makes six thousand boards in under a second, and one of
 *  fifteen hundred makes sixty-eight thousand in forty-three. */
const BUDGET = 20_000;

self.onmessage = (event: MessageEvent<BoxRequest>) => {
  const { words, must, at } = event.data;
  const boards = boxesFrom(words, {
    budget: BUDGET,
    must: must && must.length > 0 ? (word) => must.some((term) => word.includes(term)) : undefined,
  });
  const reply: BoxReply = { at, boards, truncated: boards.length >= BUDGET };
  self.postMessage(reply);
};
