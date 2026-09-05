// What this deployment is currently offering.
//
// The rule worth pinning is that no row means available. That is what makes an
// empty answer the ordinary one and a fresh deployment complete — and it is the
// opposite of the per-user hiding in storage.ts, which falls back to showing
// everything if somebody hid the lot. A preference can be overruled by the
// interface; a deployment's decision cannot.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// The kinds the server allows and the kinds this file keeps have to be the same
// list. They were not: `site:` was added to the constraint in schema.sql and not
// to the filter here, so the switch saved, the feed carried it, and the client
// dropped it on the way in — a control that worked and did nothing.
//
// Asserted against the schema rather than restated, because a copy is what went
// wrong.
describe('the kinds of thing that can be switched', () => {
  it('are the ones the database allows', () => {
    const schema = readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8');
    const constraint = schema.match(
      /check \(feature ~ '\^\(([a-z|]+)\):/
    );
    expect(constraint, 'the feature constraint moved or changed shape').not.toBeNull();
    const allowed = constraint![1].split('|').sort();

    // Each one, through the real filter: a kind the server allows must survive
    // the trip in.
    for (const kind of allowed) {
      __setAvailabilityForTest([`${kind}:thing`]);
      expect(isOffered(`${kind}:thing` as never), `${kind}: was dropped`).toBe(false);
    }
    // And one it does not allow must not.
    __setAvailabilityForTest(['sandwich:ham']);
    expect(isOffered('sandwich:ham' as never)).toBe(true);
    expect(allowed).toEqual(['difficulty', 'game', 'site', 'view']);
  });
});
