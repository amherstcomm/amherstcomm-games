// Counting words for a cloud.
//
// Its own file rather than sitting beside the components, for the reason
// guessFormat.ts is: it is the only part of a chart with a decision in it, and
// a decision worth arguing with is worth testing on its own.
//
// Counted here rather than in the database because it is a presentation choice
// — which words are noise, how many to show — and changing your mind about that
// should not need a migration.

/** Words that carry nothing on their own.
 *
 *  Not a general stop-word list. These are answers to one short question, so
 *  the list only needs the words that would otherwise be the biggest thing on
 *  the wall — a cloud whose largest word is "the" has told the room nothing. */
const NOISE = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'do', 'for', 'from', 'get',
  'had', 'has', 'have', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'just', 'me', 'my', 'no',
  'not', 'of', 'on', 'or', 'our', 'so', 'than', 'that', 'the', 'their', 'them', 'then',
  'there', 'they', 'this', 'to', 'up', 'us', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
]);

export type CloudWord = { word: string; count: number };

/** Word, and how often the room said it. */
export function cloudWords(texts: { value: unknown }[], limit = 40): CloudWord[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    const raw_text = typeof t.value === 'string' ? t.value : JSON.stringify(t.value ?? '');
    // A phone types a curly apostrophe and a keyboard types a straight one, so
    // without this "don't" and "don’t" are two different words and the room
    // gets split down the middle of its own answer.
    const said = raw_text.replace(/’/g, "'");
    // Apostrophes stay inside a word so "don't" is one word; everything else
    // splits. Lower-cased, because "Coffee" and "coffee" are the same answer.
    for (const raw of said.toLowerCase().split(/[^a-z0-9']+/)) {
      const w = raw.replace(/^'+|'+$/g, '');
      if (w.length < 2 || NOISE.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    // Commonest first, and alphabetically within a count so the same answers
    // always draw the same cloud. A picture that reshuffles on every refresh
    // reads as though the data changed.
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}
