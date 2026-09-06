// Pinning a themed puzzle to a date, from the browser's side.
//
// A pin is a *seed* rather than a board — the word, the pangram, the words the
// box is made of — and the generator builds from it exactly as it builds its
// own choice. That is what keeps this page from having to know what a board
// looks like: it offers candidates it worked out with the same searches the
// generator uses, and the generator refuses a pin it can no longer build.
import { supabase } from '@/supabase';
import { boxesFrom, laddersFrom } from '@/themeCalculators';
import { canSeedHive, RACK_SIZE, type CoverageDay } from '@/coverage';
import { tiersFor } from '@/cryptogramFit';
import { fitsBoards } from '@/weaveFit';

export type Pin = {
  id: string;
  on_date: string;
  game: string;
  /** null is every difficulty */
  difficulty: string | null;
  choice: Record<string, unknown>;
};

/** One thing somebody can pin: what it is called on the page, and the seed the
 *  generator will be handed. */
export type Candidate = {
  /** what it says on the button */
  label: string;
  /** the seed, in the shape the generator reads */
  choice: Record<string, unknown>;
  /** which difficulties it could serve, when that is not all of them */
  tiers?: string[];
};

const fail = (reason: string) => ({ ok: false as const, reason });

export async function readPins(
  from: string,
  until: string
): Promise<{ ok: boolean; reason?: string; pins: Pin[] }> {
  if (!supabase) return { ok: false, reason: 'not connected', pins: [] };
  const { data, error } = await supabase.rpc('pins_sheet', { p_from: from, p_until: until });
  if (error) return { ok: false, reason: error.message, pins: [] };
  const res = (data ?? {}) as { ok?: boolean; reason?: string; pins?: Pin[] };
  return { ok: res.ok === true, reason: res.reason, pins: res.pins ?? [] };
}

export async function pinPuzzle(pin: {
  date: string;
  game: string;
  difficulty: string | null;
  choice: Record<string, unknown>;
}): Promise<{ ok: boolean; reason?: string; id?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('pin_puzzle', {
    p_date: pin.date,
    p_game: pin.game,
    p_difficulty: pin.difficulty,
    p_choice: pin.choice,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

export async function unpinPuzzle(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('unpin_puzzle', { p_pin: id });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

/** The games that have a themed shortlist to choose between, in the order the
 *  page shows them.
 *
 *  The grid and Squares are absent, and not because they were forgotten: a grid
 *  is dice and Squares draws from a wider pool than a theme has, so there are
 *  no themed candidates for either. The server refuses a pin naming them for
 *  the same reason. */
export const PINNABLE = [
  'guess',
  'scramble',
  'hive',
  'boxed',
  'ladder',
  'weave',
  'cryptogram',
] as const;
export type Pinnable = (typeof PINNABLE)[number];

export const PIN_TITLE: Record<Pinnable, string> = {
  guess: 'The daily word',
  scramble: 'Scramble rack',
  hive: 'Hive letters',
  boxed: 'Letter box',
  ladder: 'Word ladder',
  weave: 'Weave theme',
  cryptogram: 'Cryptogram passage',
};

/** What a pin means, said once so a saved pin and a candidate cannot describe
 *  themselves differently. */
export function describePin(game: string, choice: Record<string, unknown>): string {
  if (typeof choice.word === 'string') return choice.word;
  // Commas, not `+`: these are where the letters came from and never chain
  // with each other, and a plus sign between them says otherwise.
  if (Array.isArray(choice.from)) return `letters from ${(choice.from as string[]).join(', ')}`;
  if (typeof choice.base === 'string') return choice.base;
  if (typeof choice.a === 'string' && typeof choice.b === 'string') {
    return `${choice.a} → ${choice.b}`;
  }
  if (typeof choice.clue === 'string') return choice.clue;
  if (typeof choice.text === 'string') {
    const text = choice.text;
    return text.length > 48 ? `${text.slice(0, 48)}…` : text;
  }
  return JSON.stringify(choice);
}

/** Everything a day could be pinned to, per game.
 *
 *  Worked out here rather than fetched, from the day's own words — which the
 *  coverage call already carries — with the same searches the generator runs.
 *  Two implementations of one rule again, and the same answer to it: the box
 *  and ladder searches are the shared ones, asserted against the generator's by
 *  tests/unit/themeCalculators.test.ts. */
export function candidatesFor(
  day: CoverageDay,
  game: Pinnable,
  rungs?: Set<string>,
  /** words the answer must contain, from the filter box — for the box list,
   *  where they narrow the *search* rather than its results. A long list makes
   *  more boards than any search will enumerate, so filtering afterwards can
   *  hide a board that exists. */
  must?: string[]
): Candidate[] {
  const words = day.theme?.words ?? [];
  switch (game) {
    case 'guess':
      // Sorted by length so a month of six-letter words does not bury the one
      // nine-letter answer somebody was looking for.
      return [...words]
        .sort((a, b) => a.length - b.length || a.localeCompare(b))
        .map((word) => ({ label: `${word} (${word.length})`, choice: { word } }));
    case 'scramble':
      return words
        .filter((w) => w.length === RACK_SIZE)
        .sort()
        .map((word) => ({ label: word, choice: { word } }));
    case 'hive':
      return words
        .filter(canSeedHive)
        .sort()
        .map((base) => ({ label: base, choice: { base } }));
    case 'boxed':
      // Every one of them, not a capped page. The cap was a real bug: it
      // stopped the search early, *before* the sort, so a filter typed into
      // this list was searching the first sixty in enumeration order — which
      // all began with the same word — and a board that existed could not be
      // found. Enumerating the chains is fifteen milliseconds for a sixty-word
      // list, so there was nothing to save.
      //
      // No dictionary either, for the same reason it is no longer needed here:
      // the chain is the answer, and working out whether an ordinary pair beats
      // it costs three milliseconds a board — a second across a list — to say
      // something the board will say for itself.
      return boxesFrom(words, {
        must:
          must && must.length > 0
            ? (word) => must.some((term) => word.includes(term))
            : undefined,
      }).map((box) => ({
        label: `${box.sides.join('/')} — ${box.solution.join(' → ')}`,
        choice: { from: box.from },
      }));
    case 'ladder':
      return rungs
        ? laddersFrom(words, rungs).map((pair) => ({
            label: `${pair.a} → ${pair.b} in ${pair.par}`,
            choice: { a: pair.a, b: pair.b },
            tiers: [pair.tier],
          }))
        : [];
    case 'weave':
      return (day.weave ?? []).map((theme) => {
        const fits = fitsBoards(theme.spangram, theme.words);
        return {
          label: `${theme.clue} (${theme.spangram})`,
          choice: { clue: theme.clue },
          tiers: Object.entries(fits)
            .filter(([, fit]) => fit.fits)
            .map(([tier]) => tier),
        };
      });
    case 'cryptogram':
      return (day.passages ?? []).map((passage) => ({
        label: `${passage.text.slice(0, 60)}${passage.text.length > 60 ? '…' : ''} (${passage.letters})`,
        choice: { text: passage.text },
        tiers: tiersFor(passage.text),
      }));
  }
}
