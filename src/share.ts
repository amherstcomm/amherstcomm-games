// Shareable result summaries. The hard rule: a shared result must never leak
// answers — blocks and counts only, never letters or words. The emoji follow
// the sharer's palette, so what they post matches what they saw.
import type { Palette } from '@/theme';
import { SITE_NAME } from '@/brand';
import { SITE, SLUG_NAME, gameUrl, type Slug } from '@/routes';

export type TileKind = 'correct' | 'present' | 'absent';

// Emoji cannot follow a palette exactly — there is no teal square to post —
// so amherst shares the squares the app shipped with. Naming that is more
// honest than pretending the shared result matches the board.
export const TILE_EMOJI: Record<Palette, Record<TileKind, string>> = {
  deuter: { correct: '🟦', present: '🟧', absent: '⬛' },
  tritan: { correct: '🟩', present: '🟥', absent: '⬛' },
  mono: { correct: '⬜', present: '🔳', absent: '⬛' },
  // no teal square exists, so found keeps the green one; present becomes
  // orange, which the palette actually is
  amherst: { correct: '🟩', present: '🟧', absent: '⬛' },
};

export const WEAVE_EMOJI: Record<Palette, { theme: string; span: string; hint: string }> = {
  deuter: { theme: '🔵', span: '🟠', hint: '💡' },
  tritan: { theme: '🔵', span: '🔴', hint: '💡' },
  mono: { theme: '⚪', span: '⚫', hint: '💡' },
  amherst: { theme: '🔵', span: '🟠', hint: '💡' },
};

export type SharePayload = { title: string; text: string; url: string };

type ShareOpts = {
  /** the game as the reader knows it — "Hive", "Guess (5)" */
  game: string;
  slug: Slug;
  daily: boolean;
  date?: string | null;
  /** the spoiler-free result lines */
  body: string[];
};

// "Amherst Games Weave · 2026-08-03" for a daily, "· Practice" otherwise.
// The name is here rather than hardcoded because this string is the one that
// leaves the site — it lands in whatever someone pastes their result into.
export function resultTitle(game: string, daily: boolean, date?: string | null): string {
  return `${SITE_NAME} ${game} · ${daily && date ? date : 'Practice'}`;
}

export function buildShare({ game, slug, daily, date, body }: ShareOpts): SharePayload {
  const title = resultTitle(game, daily, date);
  // The invitation has to survive on its own: share targets that take plain
  // text and drop the url field would otherwise leave a dangling "Play it:".
  const name = SLUG_NAME[slug];
  const call = daily && date ? `Play today's ${name} at ${SITE}` : `Try ${name} at ${SITE}`;
  return {
    title,
    text: [title, ...body, '', call].join('\n'),
    url: gameUrl(slug, 'play', daily),
  };
}

export type ShareResult = 'shared' | 'copied' | 'failed';

// Web Share where it exists (phones), clipboard everywhere else. The url rides
// in its own field so share sheets can render it as a link; the clipboard copy
// has to spell it out. A cancelled share sheet is not a failure.
export async function shareResult({ title, text, url }: SharePayload): Promise<ShareResult> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'shared';
      // fall through to the clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
