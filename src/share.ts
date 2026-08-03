// Shareable result summaries. The hard rule: a shared result must never leak
// answers — blocks and counts only, never letters or words. The emoji follow
// the sharer's palette, so what they post matches what they saw.
import type { Palette } from '@/theme';

const SITE = 'anagrimoire.com';

export type TileKind = 'correct' | 'present' | 'absent';

export const TILE_EMOJI: Record<Palette, Record<TileKind, string>> = {
  default: { correct: '🟩', present: '🟨', absent: '⬛' },
  deuter: { correct: '🟦', present: '🟧', absent: '⬛' },
  tritan: { correct: '🟩', present: '🟥', absent: '⬛' },
  mono: { correct: '⬜', present: '🔳', absent: '⬛' },
};

export const WEAVE_EMOJI: Record<Palette, { theme: string; span: string; hint: string }> = {
  default: { theme: '🔵', span: '🟡', hint: '💡' },
  deuter: { theme: '🔵', span: '🟠', hint: '💡' },
  tritan: { theme: '🔵', span: '🔴', hint: '💡' },
  mono: { theme: '⚪', span: '⚫', hint: '💡' },
};

// "Weave · 2026-08-03" for a daily, "Weave · Practice" otherwise
export function resultTitle(game: string, daily: boolean, date?: string | null): string {
  return `Anagrimoire ${game} · ${daily && date ? date : 'Practice'}`;
}

export function buildShare(title: string, body: string[]): string {
  return [title, ...body, '', SITE].join('\n');
}

export type ShareResult = 'shared' | 'copied' | 'failed';

// Web Share where it exists (phones), clipboard everywhere else. A cancelled
// share sheet is not a failure.
export async function shareText(text: string): Promise<ShareResult> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'shared';
      // fall through to the clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
