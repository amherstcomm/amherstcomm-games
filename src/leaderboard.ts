// Leaderboards, read through a security-definer function so it can see across
// players while `profiles` itself stays own-rows-only. What comes back is
// names and numbers — never a row, an id, or an email.
//
// Setting a display name is the opt-in. No name, no appearance, and that's the
// default for every account.

import { DAILY_ENV } from '@/dailyData';
import { supabase } from '@/supabase';

export type BoardGame = 'guess' | 'hive' | 'scramble' | 'grid' | 'box' | 'weave';

export type BoardRow = { name: string; value: number; detail: number | null };
export type Boards = Record<BoardGame, BoardRow[]>;

/** how many days back the board looks, today included */
export const WINDOWS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
] as const;

export function emptyBoards(): Boards {
  return { guess: [], hive: [], scramble: [], grid: [], box: [], weave: [] };
}

export async function fetchBoards(days: number): Promise<Boards | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('leaderboard', {
      p_days: days,
      p_env: DAILY_ENV,
    });
    if (error) throw error;
    const out = emptyBoards();
    for (const game of Object.keys(out) as BoardGame[]) {
      const rows = (data as Record<string, unknown>)?.[game];
      if (Array.isArray(rows)) {
        out[game] = rows
          .filter((r) => r && typeof r.name === 'string')
          .map((r) => ({
            name: String(r.name),
            value: Number(r.value) || 0,
            detail: r.detail === null || r.detail === undefined ? null : Number(r.detail),
          }));
      }
    }
    return out;
  } catch {
    return null;
  }
}

// What the two numbers mean, per game. The function ranks on `value` and
// breaks ties on `detail`, so this is only ever labelling.
export const BOARD_LABELS: Record<
  BoardGame,
  { label: string; value: (n: number) => string; detail: (n: number) => string }
> = {
  guess: {
    label: 'Guess the Word',
    value: (n) => `${n} won`,
    detail: (n) => `best ${n}/6`,
  },
  hive: { label: 'Hive', value: (n) => `${n} pts`, detail: (n) => `${n} day${n === 1 ? '' : 's'}` },
  scramble: {
    label: 'Scramble',
    value: (n) => `${n} pts`,
    detail: (n) => `${n} day${n === 1 ? '' : 's'}`,
  },
  grid: { label: 'Grid', value: (n) => `${n} pts`, detail: (n) => `${n} day${n === 1 ? '' : 's'}` },
  box: {
    label: 'Boxed',
    value: (n) => `${n} solved`,
    detail: (n) => `best ${n} word${n === 1 ? '' : 's'}`,
  },
  weave: { label: 'Weave', value: (n) => `${n} solved`, detail: () => '' },
};

// ---------------------------------------------------------------------------
// Display names
// ---------------------------------------------------------------------------

export type NameResult = 'ok' | 'length' | 'characters' | 'blocked' | 'taken' | 'error';

export const NAME_MESSAGES: Record<Exclude<NameResult, 'ok'>, string> = {
  length: 'Between 2 and 24 characters.',
  characters: 'Letters and numbers, with spaces, hyphens or underscores inside.',
  blocked: "That one's not available.",
  taken: 'Someone already has that name.',
  error: "Couldn't save that just now.",
};

export async function setDisplayName(name: string): Promise<NameResult> {
  if (!supabase) return 'error';
  try {
    const { data, error } = await supabase.rpc('set_display_name', { p_name: name });
    if (error) return 'error';
    const known: NameResult[] = ['ok', 'length', 'characters', 'blocked', 'taken'];
    const r = String(data) as NameResult;
    return known.includes(r) ? r : 'error';
  } catch {
    return 'error';
  }
}

export async function fetchDisplayName(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', sess.session.user.id)
      .maybeSingle();
    if (error) return null;
    return data?.display_name ?? null;
  } catch {
    return null;
  }
}
