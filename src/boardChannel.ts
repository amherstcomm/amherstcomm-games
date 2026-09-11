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
 *  through, and the daily's key is the one it always had. */
export function channelStoreKey(base: string, channel: BoardChannel): string {
  if (channel.kind === 'daily') return base;
  // 'anagrimoire:hive:v1' -> 'anagrimoire:hive:round:v1'
  const m = base.match(/^(.*):(v\d+)$/);
  return m ? `${m[1]}:round:${m[2]}` : `${base}:round`;
}
