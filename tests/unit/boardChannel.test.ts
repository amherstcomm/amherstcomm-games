// Which board a game is showing: the day's, or a tournament round's.
//
// The channel answers four questions for a game -- where to fetch, which
// difficulty, which env to record under, which key to keep its board in -- and
// the daily's answers must be exactly the ones the games always had. That is
// the half worth most: a round channel that quietly changed a daily's storage
// key would cost every player the board they were halfway through.
import { describe, expect, it } from 'vitest';
import {
  channelDifficulty,
  channelEnv,
  channelStoreKey,
  DAILY_CHANNEL,
  type BoardChannel,
} from '@/boardChannel';
import { DAILY_ENV } from '@/dailyData';
import { difficulty } from '@/difficulty';

const ROUND: BoardChannel = {
  kind: 'round',
  difficulty: 'extreme',
  startsOn: '2026-10-05',
  roundId: 'r1',
};

describe('the daily channel', () => {
  it('keeps every key a game already stores its board under', () => {
    for (const key of ['anagrimoire:hive:v1', 'anagrimoire:bridge:v1', 'anagrimoire:v1']) {
      expect(channelStoreKey(key, DAILY_CHANNEL)).toBe(key);
    }
  });

  it('records under the env the site always has', () => {
    expect(channelEnv(DAILY_CHANNEL)).toBe(DAILY_ENV);
  });

  it("plays at the player's own difficulty", () => {
    expect(channelDifficulty(DAILY_CHANNEL)).toBe(difficulty());
  });
});

describe('a round channel', () => {
  // Its own key, beside the daily's, so opening the tournament never costs
  // anybody the daily they were halfway through.
  it('keeps its board somewhere else', () => {
    expect(channelStoreKey('anagrimoire:hive:v1', ROUND)).toBe('anagrimoire:hive:round:v1');
    expect(channelStoreKey('anagrimoire:hive:v1', ROUND)).not.toBe('anagrimoire:hive:v1');
  });

  it('and a key with no version still gets one of its own', () => {
    expect(channelStoreKey('somekey', ROUND)).toBe('somekey:round');
  });

  // 'round' is what the server's first-finish lock and result_is_plausible
  // key a round result by; anything else would record it as a daily.
  it("records under 'round'", () => {
    expect(channelEnv(ROUND)).toBe('round');
  });

  // One board, one set of standings: the tournament's difficulty whatever the
  // player has chosen for their dailies.
  it("plays at the tournament's difficulty, not the player's", () => {
    expect(channelDifficulty(ROUND)).toBe('extreme');
  });
});
