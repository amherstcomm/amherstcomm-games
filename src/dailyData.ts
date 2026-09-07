// Daily game data URLs. The dev site (and local development) gets its own
// generated puzzle set so testing there never spoils the production dailies.
// NYT-derived solver data (letterboxed, spellingbee, strands) is shared —
// it's the same real puzzle either way.
const IS_DEV_SITE =
  typeof location !== 'undefined' &&
  (location.hostname.startsWith('dev.') || location.hostname === 'localhost');

/** Where the file feed lives, when there is one.
 *
 *  The rows in Postgres are what this site plays; this is the fallback for the
 *  minutes the database is not answering. It pointed at the project this one
 *  was forked from, and that is the worst possible thing for a fallback to do:
 *  an empty table or a database blip did not produce an error, it produced
 *  working daily puzzles that were somebody else's -- unthemed, on the one
 *  month this deployment is themed, and convincing enough that a smoke test
 *  passes. docs/selfhost.md has warned about it since the fork.
 *
 *  So it is this repository's own branch, which its own workflow publishes
 *  nightly, and it is settable per deployment. Empty is a supported answer and
 *  means "no file fallback": the database or nothing, which is the right choice
 *  for a deployment that would rather show an error than the wrong puzzle. */
const BASE = (
  import.meta.env.VITE_PUZZLE_FEED_BASE ??
  'https://raw.githubusercontent.com/amherstcomm/amherstcomm-games/puzzle-data/data'
).replace(/\/$/, '');

/** The file feed, for the modules that read something other than a daily --
 *  the three NYT-derived solver files. Same base, same reasoning. */
export const FEED_BASE = BASE;

/** Where a game's daily lives. The feed name comes from the one table that
 *  has it, so a new game needs no line here. */
export function dailyDataUrl(mode: Mode): string {
  return `${BASE}/${IS_DEV_SITE ? 'dev-' : ''}daily-${FEED_NAME[mode]}.json`;
}

/** And its practice pool, for the games that have one. Shared by both sites —
 *  the pools are pre-generated server-side and carry no date. */
export function poolUrl(mode: Mode): string {
  return `${BASE}/${FEED_NAME[mode]}-pool.json`;
}

// which daily set this site plays — synced results are tagged with it so
// dev-site testing never pollutes production's global daily stats
export const DAILY_ENV: 'dev' | 'prod' = IS_DEV_SITE ? 'dev' : 'prod';

// ---------------------------------------------------------------------------
// The database is the primary feed now; the files are the fallback.
//
// Rows arrive via a security-definer RPC that takes no date parameter and
// serves nothing past today Eastern — which is the point of the move: the
// file feed sits in a public branch produced by a deterministic generator,
// so every future day is computable from it. The fallback keeps a Supabase
// outage from costing the dailies, which came from GitHub happily for a
// year; it only fires when the RPC errors, times out, or has nothing.

import { supabase } from '@/supabase';
import { FEED_NAME } from '@/games';
import type { Mode } from '@/games';

// A slow answer is an outage from the player's point of view. Four seconds,
// then the file feed takes over — generous for a warm RPC, short enough that
// a cold morning still feels like a page load rather than a hang.
const RPC_TIMEOUT_MS = 4000;

async function viaRpc(game: string, env: string): Promise<unknown> {
  if (!supabase) return null;
  try {
    const call = supabase
      .rpc('daily_puzzle', { p_game: game, p_env: env })
      .then(({ data, error }) => (error ? null : data));
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), RPC_TIMEOUT_MS));
    const payload = await Promise.race([call, timeout]);
    // a payload without a date is not a puzzle, whatever the table says
    return payload && typeof payload === 'object' && 'date' in payload ? payload : null;
  } catch {
    return null;
  }
}

async function viaFile(url: string): Promise<unknown> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/* eslint-disable @typescript-eslint/no-explicit-any --
   drop-in for fetch().json(), whose result is any; the games validate. */

export async function fetchDailyData(mode: Mode): Promise<any> {
  const db = await viaRpc(FEED_NAME[mode], DAILY_ENV);
  if (db) return db;
  // No base is a deployment saying "the database or nothing". Thrown rather
  // than returned empty, because every caller already handles a failed fetch
  // by saying the daily could not be loaded, and that is the honest answer.
  if (!BASE) throw new Error('no daily in the database, and no file feed configured');
  return viaFile(dailyDataUrl(mode));
}

export async function fetchPool(mode: Mode): Promise<any> {
  const db = await viaRpc(`${FEED_NAME[mode]}-pool`, 'shared');
  if (db) return db;
  if (!BASE) throw new Error('no pool in the database, and no file feed configured');
  return viaFile(poolUrl(mode));
}

/* eslint-enable @typescript-eslint/no-explicit-any */
