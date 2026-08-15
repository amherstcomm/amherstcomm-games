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
import { blockedEntries } from './blocked.mjs';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

const OUT = 'src/wordStats.json';

// The three dictionaries the app actually offers, defined exactly as
// src/dictionaries.ts defines them — Common and Standard from SCOWL sizes,
// Full from a different source entirely. Getting this wrong would put a number
// in the FAQ that disagrees with the one in the solver's own footer.
const SCOWL = (levels) =>
  levels.flatMap((n) => [`english-words-${n}`, `american-words-${n}`]);

const COMMON = SCOWL([10, 20, 35]);
const STANDARD = [...COMMON, ...SCOWL([40, 50, 55])];

const DICTIONARIES = {
  common: { scowl: COMMON, label: 'Common' },
  standard: { scowl: STANDARD, label: 'Standard' },

};

const DAILY_MIN = 3;
const DAILY_MAX = 12;

const blocked = new Set(
  blockedEntries().map((w) => w.word)
);


const stats = { _generated: 'npm run word-stats', dictionaries: {} };

for (const [name, def] of Object.entries(DICTIONARIES)) {
  // same normalisation the app uses: lowercase, letters only, deduped
  const set = new Set();
  const take = (list) => {
    for (const raw of list) {
      const w = String(raw).toLowerCase();
      if (/^[a-z]+$/.test(w)) set.add(w);
    }
  };
  if (def.scowl) for (const f of def.scowl) take(require(`wordlist-english/${f}.json`));
  else throw new Error('unknown tier');

  const words = [...set];
  const byLength = {};
  for (const w of words) byLength[w.length] = (byLength[w.length] ?? 0) + 1;

  const answers = {};
  for (let n = DAILY_MIN; n <= DAILY_MAX; n++)
    answers[n] = words.filter(
      (w) =>
        w.length === n && !blocked.has(w) && !(w.endsWith('s') && set.has(w.slice(0, -1)))
    ).length;

  const shorter = words.filter((w) => w.length < DAILY_MIN).length;
  const longer = words.filter((w) => w.length > DAILY_MAX).length;

  stats.dictionaries[name] = {
    label: def.label,
    dictionary: words.length,
    shorterThanDaily: shorter,
    longerThanDaily: longer,
    withinDailyLengths: words.length - shorter - longer,
    longestWord: words.reduce((n, w) => (w.length > n ? w.length : n), 0),
    byLength,
    answers,
    answerTotal: Object.values(answers).reduce((a, b) => a + b, 0),
  };
}

writeFileSync(OUT, JSON.stringify(stats, null, 2) + '\n');

console.log(`wrote ${OUT}`);
console.log();
console.log('tier      dictionary   <3     3-12      >12   answers 3-12');
for (const [name, t] of Object.entries(stats.dictionaries)) {
  console.log(
    '  ' + name.padEnd(8),
    String(t.dictionary.toLocaleString()).padStart(9),
    String(t.shorterThanDaily).padStart(4),
    String(t.withinDailyLengths.toLocaleString()).padStart(8),
    String(t.longerThanDaily.toLocaleString()).padStart(8),
    String(t.answerTotal.toLocaleString()).padStart(12)
  );
}
