// How many words each difficulty holds, counted rather than claimed.
//
// The FAQ wants to say what "easy", "hard" and "extreme" actually mean, and a
// number typed into prose is a number that goes stale the first time a word
// list moves or the blocklist grows. So it's computed here and written out for
// the page to read.
//
// Two different totals, because they answer different questions:
//
//   dictionary  every word the tier accepts, at any length. This is "how big
//               is the dictionary", and it's the honest headline number.
//   answers     what a daily can actually be: lengths 3-12 only, blocked words
//               removed, and simple plurals dropped where the stem is already
//               a word. Always much smaller, and the reason is worth saying —
//               a dictionary is what we'll take, not what we'll set.
//
// Run when a word list or the blocklist changes: npm run word-stats

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

const OUT = 'src/wordStats.json';

// SCOWL sizes, per its own description: 35 small, 50 medium, 60 medium-large
// (the default spell-checking dictionary), 70 large. So the ladder is small,
// medium, large — not "common words" through "obscure ones". Level 35 is
// ordinary vocabulary.
const TIERS = {
  easy: [10, 20, 35],
  hard: [10, 20, 35, 40, 50, 55],
  extreme: [10, 20, 35, 40, 50, 55, 60, 70],
};

const DAILY_MIN = 3;
const DAILY_MAX = 12;

const blocked = new Set(
  require('./blocked-words.json').words.map((w) => w.word)
);

function load(levels) {
  const set = new Set();
  for (const level of levels)
    for (const locale of ['english', 'american'])
      for (const raw of require(`wordlist-english/${locale}-words-${level}.json`)) {
        const w = String(raw).toLowerCase();
        if (/^[a-z]+$/.test(w)) set.add(w);
      }
  return set;
}

const stats = { _generated: 'npm run word-stats', tiers: {} };

for (const [name, levels] of Object.entries(TIERS)) {
  const set = load(levels);
  const words = [...set];

  const byLength = {};
  for (const w of words) byLength[w.length] = (byLength[w.length] ?? 0) + 1;

  // what a daily answer could be, at each length the daily runs to
  const answers = {};
  for (let n = DAILY_MIN; n <= DAILY_MAX; n++) {
    answers[n] = words.filter(
      (w) =>
        w.length === n && !blocked.has(w) && !(w.endsWith('s') && set.has(w.slice(0, -1)))
    ).length;
  }

  const shorter = words.filter((w) => w.length < DAILY_MIN).length;
  const longer = words.filter((w) => w.length > DAILY_MAX).length;

  stats.tiers[name] = {
    scowlLevels: levels,
    dictionary: words.length,
    shorterThanDaily: shorter,
    longerThanDaily: longer,
    withinDailyLengths: words.length - shorter - longer,
    longestWord: Math.max(...words.map((w) => w.length)),
    byLength,
    answers,
    answerTotal: Object.values(answers).reduce((a, b) => a + b, 0),
  };
}

writeFileSync(OUT, JSON.stringify(stats, null, 2) + '\n');

console.log(`wrote ${OUT}`);
console.log();
console.log('tier      dictionary   <3     3-12      >12   answers 3-12');
for (const [name, t] of Object.entries(stats.tiers)) {
  console.log(
    '  ' + name.padEnd(8),
    String(t.dictionary.toLocaleString()).padStart(9),
    String(t.shorterThanDaily).padStart(4),
    String(t.withinDailyLengths.toLocaleString()).padStart(8),
    String(t.longerThanDaily.toLocaleString()).padStart(8),
    String(t.answerTotal.toLocaleString()).padStart(12)
  );
}
