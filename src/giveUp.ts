// A button that stops spinning.
//
// Waiting.tsx does this for a panel's first load: a spinner for a while, then a
// sentence and a way to try again. A button that awaits a request inside its
// click handler never renders a Waiting, so when the request hung the button
// spun for ever -- Check on Coverage, Look on Choosing a Day -- and a hung
// connection read as a slow one, which is the confusion Waiting exists to end.
//
// So a button's request is given the same WAIT_MS, and past it the button comes
// back with a sentence instead of an answer. Unlike Waiting, a late answer is
// then ignored rather than drawn: the page has already told somebody to try
// again, and an old answer landing on top of the next attempt would be worse
// than no answer.
import { WAIT_MS } from '@/Waiting';

/** What a request that never answered rejects with. */
export class NoAnswer extends Error {
  constructor() {
    super('no answer');
    this.name = 'NoAnswer';
  }
}

/** `request`, or a NoAnswer once `ms` have passed without one. */
export function withinWait<T>(request: Promise<T>, ms = WAIT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new NoAnswer()), ms);
    request.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

const seconds = () => Math.round(WAIT_MS / 1000);

/** For a read: nothing was changed, so asking again is always safe. */
export const noAnswerToRead = (what: string) =>
  `Could not load ${what}: the server did not answer in ${seconds()} seconds. ` +
  'This is the connection rather than your permissions — nothing has been changed, and it is worth trying again.';

/** For a write: it may have landed, so the sentence says how to find out
 *  rather than inviting a second one blind. */
export const noAnswerToWrite = (what: string, howToTell: string) =>
  `The server did not answer in ${seconds()} seconds, so this cannot tell whether ${what}. ${howToTell}`;
