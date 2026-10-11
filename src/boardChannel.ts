// Which board a game is showing: the day's, or a tournament round's.
//
// A round board is played through exactly the path a daily is -- fetched,
// stored, synced, restored on a second device -- so rather than teach ten games
// a third mode, a game is rendered inside a channel and asks it the four
// questions that differ: where to fetch from, which difficulty, which env to
// record under, and which key to keep its board in. Everything else is the
// daily machinery unchanged.
//
// The daily channel is the default and answers every question the way the
// games always have, so a game rendered anywhere but the Tournament page
// behaves exactly as before.
import { createContext, useContext } from 'react';
import { difficulty as preferredDifficulty, type Difficulty } from '@/difficulty';
import { DAILY_ENV } from '@/dailyData';

export type BoardChannel =
  | { kind: 'daily' }
  | {
      kind: 'round';
      /** fixed per tournament: everybody plays the same board */
      difficulty: Difficulty;
      /** the round's first day, which its boards and results are keyed by */
      startsOn: string;
      roundId: string;
      /** How many times an organiser has given this player another go at
       *  this game in this round. Part of where the board is kept -- see
       *  channelStoreKey -- and 0 for almost everybody. */
      attempt?: number;
    };

export const DAILY_CHANNEL: BoardChannel = { kind: 'daily' };

export const BoardChannelContext = createContext<BoardChannel>(DAILY_CHANNEL);

export function useBoardChannel(): BoardChannel {
  return useContext(BoardChannelContext);
}

/** The difficulty this board is played at. A round's is the tournament's, not
 *  the player's preference -- one board, one set of standings. */
export function channelDifficulty(channel: BoardChannel): Difficulty {
  return channel.kind === 'round' ? channel.difficulty : preferredDifficulty();
}

/** The env results are recorded under. 'round' is what the server's first-
 *  finish lock and result_is_plausible key a round result by. */
export function channelEnv(channel: BoardChannel): string {
  return channel.kind === 'round' ? 'round' : DAILY_ENV;
}

/** Where a game keeps its board in this browser. A round gets its own key, so
 *  opening the tournament never costs anybody the daily they were halfway
 *  through, and the daily's key is the one it always had.
 *
 *  A player an organiser has reset gets a key with the attempt in it. Syncing
 *  keeps whichever copy of a board has more done, so a device still holding
 *  the finished board would push it straight back over the reset; on a fresh
 *  key it has nothing to push, and the old copy is never read again. Attempt 0
 *  -- everybody never reset -- keeps the key it always had, so this arriving
 *  mid-round moves nobody's board in progress. */
export function channelStoreKey(base: string, channel: BoardChannel): string {
  if (channel.kind === 'daily') return base;
  const again = channel.attempt ? `:a${channel.attempt}` : '';
  // 'anagrimoire:hive:v1' -> 'anagrimoire:hive:round:v1', or ':round:a2:v1'
  const m = base.match(/^(.*):(v\d+)$/);
  return m ? `${m[1]}:round${again}:${m[2]}` : `${base}:round${again}`;
}
