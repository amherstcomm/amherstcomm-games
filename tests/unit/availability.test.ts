// What this deployment is currently offering.
//
// The rule worth pinning is that no row means available. That is what makes an
// empty answer the ordinary one and a fresh deployment complete — and it is the
// opposite of the per-user hiding in storage.ts, which falls back to showing
// everything if somebody hid the lot. A preference can be overruled by the
// interface; a deployment's decision cannot.
import { beforeEach, describe, expect, it } from 'vitest';
import { __setAvailabilityForTest, isOffered, offered } from '@/availability';

beforeEach(() => __setAvailabilityForTest([]));

describe('with nothing switched off', () => {
  it('everything is offered', () => {
    expect(isOffered('game:hive')).toBe(true);
    expect(offered([], 'game', ['hive', 'guess'])).toEqual(['hive', 'guess']);
  });
});

describe('offered', () => {
  it('leaves out what is switched off', () => {
    expect(offered(['game:hive'], 'game', ['hive', 'guess'])).toEqual(['guess']);
  });

  it('and only in the kind it was switched off in', () => {
    // `difficulty:hive` is nonsense, but the point is the prefix does the work
    expect(offered(['difficulty:hive'], 'game', ['hive'])).toEqual(['hive']);
  });

  // No fallback, deliberately. Drawing them anyway would be the interface
  // overruling the person who switched them off; the caller says what an empty
  // list looks like, and a sentence is a better answer than a menu of things
  // that do not work.
  it('and gives back nothing when nothing is offered', () => {
    expect(offered(['game:hive', 'game:guess'], 'game', ['hive', 'guess'])).toEqual([]);
  });
});

describe('the store', () => {
  it('follows what it was told', () => {
    __setAvailabilityForTest(['game:hive', 'difficulty:extreme']);
    expect(isOffered('game:hive')).toBe(false);
    expect(isOffered('difficulty:extreme')).toBe(false);
    expect(isOffered('game:guess')).toBe(true);
  });

  // The feed is written by a server that may be newer than this client.
  it('and ignores anything that is not a feature', () => {
    __setAvailabilityForTest(['sandwich:ham', 'game:hive', '', 'game:UPPER'] as string[]);
    expect(isOffered('game:hive')).toBe(false);
    expect(offered(['sandwich:ham'], 'game', ['hive'])).toEqual(['hive']);
  });
});
