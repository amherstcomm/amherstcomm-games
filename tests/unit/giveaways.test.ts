// The browser's copy of the drawing arithmetic. It is how anybody checks a
// drawing without trusting the server, so it has to agree with schema.sql to
// the character -- these inputs and answers are the same ones
// supabase/tests/giveaways.sql pins giveaway_pick to.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkDraw,
  curveFor,
  hexBytes,
  oddsSettings,
  pickWinners,
  sha256Hex,
  snapshotText,
  weightFor,
  type Draw,
} from '@/giveaways';

const ENTRANTS = [
  { person: '00000000-0000-0000-0000-00000000000c', name: 'Cy', weight: 250000 },
  { person: '00000000-0000-0000-0000-00000000000a', name: 'Ada', weight: 1000000 },
  { person: '00000000-0000-0000-0000-00000000000b', name: 'Bea', weight: 500000 },
];
// drand quicknet, round 1000, as published.
const RANDOMNESS = 'fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd';
const SIGNATURE =
  'b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39';
const CHAIN = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';

describe('the drawing', () => {
  it('picks what the server picks from the same inputs, whatever order they arrive in', async () => {
    const picks = await pickWinners(ENTRANTS, 'ab'.repeat(32), RANDOMNESS, 2);
    expect(picks.map((p) => p.name)).toEqual(['Ada', 'Bea']);
    expect(picks[0].target).toBe(959526);
    expect(picks[0].total).toBe(1750000);
    // the second pick is from what is left
    expect(picks[1].total).toBe(750000);
  });

  it('never draws more people than there are', async () => {
    expect(await pickWinners(ENTRANTS, 'ab'.repeat(32), RANDOMNESS, 10)).toHaveLength(3);
  });

  it("drand's randomness is the hash of its signature", async () => {
    expect(await sha256Hex(hexBytes(SIGNATURE))).toBe(RANDOMNESS);
  });

  it('fingerprints the text giveaway_snapshot_text builds', () => {
    expect(
      snapshotText('g-1', { seq: 1, wanted: 2, chain: CHAIN, round: 1000, entrants: ENTRANTS })
    ).toBe(
      [
        'amherstcomm-giveaway-v1',
        'giveaway g-1',
        'draw 1',
        'winners 2',
        `chain ${CHAIN}`,
        'round 1000',
        '00000000-0000-0000-0000-00000000000a 1000000',
        '00000000-0000-0000-0000-00000000000b 500000',
        '00000000-0000-0000-0000-00000000000c 250000',
      ].join('\n')
    );
    // and the schema builds it the same way: same header, one line per entrant
    const schema = readFileSync(join(__dirname, '../../supabase/schema.sql'), 'utf8');
    expect(schema).toContain("'amherstcomm-giveaway-v1',");
    expect(schema).toContain("(e->>'person') || ' ' || (e->>'weight')");
  });

  it('weighs a recent attendance more than an old one, as the server does', () => {
    expect(weightFor([], '2026-10-16', 1, 365)).toBe(1_000_000);
    // the server's figure for an attendance 30 days back, from giveaways.sql
    expect(weightFor([{ on: '2026-09-16' }], '2026-10-16', 1, 365)).toBe(514239);
    expect(weightFor([{ on: '2023-10-16' }], '2026-10-16', 1, 365)).toBeGreaterThan(880_000);
  });
});

describe('checking a drawing', () => {
  async function drawn(): Promise<Draw> {
    const base = { seq: 1, wanted: 2, chain: CHAIN, round: 1000, entrants: ENTRANTS };
    const snapshot_hash = await sha256Hex(snapshotText('g-1', base));
    const winners = await pickWinners(ENTRANTS, snapshot_hash, RANDOMNESS, 2);
    return {
      ...base,
      id: 'd-1',
      reason: 'first drawing',
      total: 1750000,
      snapshot_hash,
      round_at: '2023-08-23T15:59:00Z',
      committed_at: '2023-08-23T15:58:30Z',
      committed_by: 'Ray',
      randomness: RANDOMNESS,
      signature: SIGNATURE,
      winners,
      revealed_at: '2023-08-23T15:59:01Z',
      revealed_by: 'Ray',
    };
  }
  const drand = (body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

  it('agrees with an honest drawing', async () => {
    const check = await checkDraw('g-1', await drawn(), drand({ round: 1000, randomness: RANDOMNESS, signature: SIGNATURE }));
    expect(check).toMatchObject({ fingerprint: true, randomness: true, winners: true });
  });

  it('catches entrants changed after the fingerprint', async () => {
    const draw = await drawn();
    draw.entrants = [{ ...ENTRANTS[0], weight: 9_000_000 }, ...ENTRANTS.slice(1)];
    expect((await checkDraw('g-1', draw, drand({ round: 1000, randomness: RANDOMNESS, signature: SIGNATURE }))).fingerprint).toBe(false);
  });

  it('catches a randomness that did not come from drand', async () => {
    const draw = await drawn();
    draw.randomness = '0'.repeat(64);
    const check = await checkDraw('g-1', draw, drand({ round: 1000, randomness: RANDOMNESS, signature: SIGNATURE }));
    expect(check.randomness).toBe(false);
  });

  it('catches winners the randomness does not pick', async () => {
    const draw = await drawn();
    draw.winners = [...draw.winners!].reverse();
    const check = await checkDraw('g-1', draw, drand({ round: 1000, randomness: RANDOMNESS, signature: SIGNATURE }));
    expect(check.winners).toBe(false);
  });

  it('will not trust a relay whose randomness is not its signature hashed', async () => {
    const check = await checkDraw('g-1', await drawn(), drand({ round: 1000, randomness: '1'.repeat(64), signature: SIGNATURE }));
    expect(check.beacon).toBeNull();
    expect(check.randomness).toBeNull();
  });
});

describe('the odds, asked as chances', () => {
  it('shows the defaults as half right after and two thirds a year after', () => {
    expect(oddsSettings(1, 365)).toEqual({ after: 50, year: 67 });
  });

  it('turns the two chances back into the curve the server stores', () => {
    const got = curveFor(50, 75);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.strength).toBe(1);
    // and the curve gives back the chances asked for
    expect(oddsSettings(got.strength, got.halfLifeDays)).toEqual({ after: 50, year: 75 });
  });

  it('100% right after means attendance does not count', () => {
    expect(curveFor(100, 0)).toEqual({ ok: true, strength: 0, halfLifeDays: 365 });
  });

  it('refuses a chance that does not come back, or comes back too slowly to store', () => {
    expect(curveFor(50, 40).ok).toBe(false);
    expect(curveFor(50, 100).ok).toBe(false);
    const slow = curveFor(50, 51);
    expect(slow.ok).toBe(false);
    if (!slow.ok) expect(slow.reason).toMatch(/Try \d+% or more/);
  });
});
