// Counting answers for a cloud.
//
// Its own file rather than sitting beside the components, for the reason
// guessFormat.ts is: it is the only part of a chart with a decision in it, and
// a decision worth arguing with is worth testing on its own.
//
// Counted here rather than in the database because it is a presentation choice
// — what counts as the same answer, how many to show — and changing your mind
// about that should not need a migration.
//
// **A whole answer is one entry.** This split on whitespace at first, which is
// what "word cloud" says and is wrong for what people type: "employee
// ownership" came apart into two, and the cloud showed the room two ideas where
// it had given one. What the room said is the answer, not the words in it.

export type CloudWord = { word: string; count: number };

/** Two answers are the same answer when they differ only in the ways typing
 *  differs: spacing, capitals, a full stop on the end, and which apostrophe the
 *  keyboard produced. Everything else is a different thing to have said. */
function key(said: string): string {
  return said
    .replace(/’/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'([{]+|[\s"'.,!?;:)\]}]+$/g, '')
    .trim();
}

/** What the room said, and how many said it. */
export function cloudWords(texts: { value: unknown }[], limit = 40): CloudWord[] {
  const counts = new Map<string, number>();
  // The first spelling seen wins the label, so the cloud shows a real answer
  // rather than the lower-cased key.
  const shown = new Map<string, string>();

  for (const t of texts) {
    const raw = typeof t.value === 'string' ? t.value : JSON.stringify(t.value ?? '');
    const k = key(raw);
    if (k.length === 0) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (!shown.has(k)) shown.set(k, raw.replace(/\s+/g, ' ').trim());
  }

  return [...counts.entries()]
    .map(([k, count]) => ({ word: shown.get(k) ?? k, count }))
    // Commonest first, and alphabetically within a count so the same answers
    // always draw the same cloud. A picture that reshuffles on every refresh
    // reads as though the data changed.
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}
