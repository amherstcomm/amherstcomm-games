import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { Mode } from '@/storage';

type Section = { heading: string; items: string[] };
type Guide = { title: string; intro: string; sections: Section[] };

const GUIDES: Record<Mode, Guide> = {
  pattern: {
    title: 'Guess the Word',
    intro:
      'A Wordle-style guessing game at any length from 3 to 15 letters — six tries to find the secret word.',
    sections: [
      {
        heading: 'Playing',
        items: [
          'Pick a word length, then type a guess and press Enter. Every guess must be a real word of that length.',
          'Tiles color after each guess: green means right letter in the right spot, amber means the letter is in the word but somewhere else, and dark means it isn’t in the word.',
          'Duplicate letters color precisely: a repeated letter only lights up as many times as it actually appears in the answer.',
          'The timer counts your thinking time while the board is on screen and stops when you finish.',
        ],
      },
      {
        heading: 'Daily & Practice',
        items: [
          'Daily serves the same word to everyone for each length, once per day, and tracks your win streak.',
          'Practice deals unlimited random words — press New word anytime.',
          'Answers come from the Common dictionary so they’re always fair; guesses are checked against the Full one.',
        ],
      },
      {
        heading: 'Stuck?',
        items: [
          'Reveal hands everything the board has taught you to the solver — greens, ambers, and grays prefilled — which lists every word that still fits.',
          'Tip: open with letter-rich words (lots of vowels and common consonants), then use the second guess to cover new letters.',
        ],
      },
    ],
  },
  descramble: {
    title: 'Scramble',
    intro:
      'A three-minute sprint: find every word you can spell from a seven-letter rack.',
    sections: [
      {
        heading: 'Playing',
        items: [
          'Press Start to flip the rack face-up and start the clock.',
          'Words are 3+ letters, and each rack letter can be used once per word.',
          'Type or tap the rack, then press Enter. Shuffle rearranges the rack when you’re stuck.',
          'Scoring: 3-letter words score 1 point, longer words score their length, and using the whole rack earns +7.',
          'Every rack is a shuffled real word, so a full-rack bonus word always exists.',
          'Guesses that aren’t real words collect in a "Not in dictionary" list — they don’t cost anything.',
        ],
      },
      {
        heading: 'Daily & Practice',
        items: [
          'Daily gives everyone the same rack; Practice deals unlimited racks, and Quit abandons one for a fresh rack and clock.',
          'When time’s up you’ll see your score and word count against the maximums — Reveal all in solver shows everything you missed.',
        ],
      },
      {
        heading: 'Tips',
        items: [
          'Work the suffixes: -s, -ed, -er, and -ing multiply words you’ve already found.',
          'Scan systematically — pick two or three letters and try every arrangement before moving on.',
        ],
      },
    ],
  },
  bee: {
    title: 'Hive',
    intro:
      'A Spelling Bee-style word hunt: build words from seven letters, always using the center one.',
    sections: [
      {
        heading: 'Playing',
        items: [
          'Words are 4+ letters, must include the amber center letter, and may reuse any letter as often as you like.',
          'Tap the hive or type, then press Enter. Shuffle rearranges the outer letters for a fresh perspective.',
          'Scoring: 4-letter words score 1 point, longer words score their length, and a pangram — a word using all seven letters — earns +7.',
          'Your rank climbs with your score, from Beginner through Genius (70% of the possible points) to Queen Bee (every word found).',
          'Words are checked against our Standard dictionary; rejected guesses collect in an amber list.',
        ],
      },
      {
        heading: 'Daily & Practice',
        items: [
          'Daily is our own generated hive — the same one for everyone, seeded from a pangram so one always exists. It is not the NYT’s puzzle.',
          'Practice deals unlimited fresh hives.',
          'Reveal gives up and shows every answer in the solver.',
        ],
      },
      {
        heading: 'Tips',
        items: [
          'Hunt the pangram early — it’s worth the most and its letters unlock everything else.',
          'Run prefixes and suffixes past the center letter: re-, un-, -ing, -ier.',
        ],
      },
    ],
  },
  grid: {
    title: 'Grid',
    intro:
      'A Boggle-style three-minute sprint: chain adjacent letters into words before the clock runs out.',
    sections: [
      {
        heading: 'Playing',
        items: [
          'Press Start to flip the grid face-up and start the clock.',
          'Words are 3+ letters traced through adjacent cells — diagonals count — using each cell at most once per word.',
          'Drag across the cells to trace a word and release to submit. A plain tap types that letter instead; typed words count only if a valid path exists on the grid.',
          'Scoring (classic): 3–4 letters score 1, 5 letters 2, 6 letters 3, 7 letters 5, and 8+ letters 11.',
          'Real words with no path on this grid are told apart from non-words — only the latter land in the "Not in dictionary" list.',
        ],
      },
      {
        heading: 'Daily & Practice',
        items: [
          'Daily rolls a 4×4 from the classic sixteen dice; Practice offers 3×3, 4×4, and 5×5 (Big Boggle dice).',
          'After time’s up, the Missed words list opens — hover any word (or press-hold on touch) to see its path traced on the board.',
        ],
      },
      {
        heading: 'Tips',
        items: [
          'Long words are worth disproportionately more — an 8-letter find outscores eleven 3-letter words.',
          'Found a word? Retrace it with -s, -ed, or -ing if the letters are there.',
        ],
      },
    ],
  },
  boxed: {
    title: 'Boxed',
    intro:
      'A Letter Boxed-style puzzle: chain words around the square until all twelve letters are used.',
    sections: [
      {
        heading: 'Playing',
        items: [
          'Twelve letters sit on four color-coded sides. Words are 3+ letters, letters may be reused, but consecutive letters can never come from the same side.',
          'Each new word must start with the last letter of the previous word — that’s the chain.',
          'The goal is to cover all twelve letters in as few words as possible. Every board here is solvable in two.',
          'Backspace un-commits the previous word so you can edit the chain; Restart clears it entirely.',
          'Used letters fill in with their side’s color so you can see what’s left at a glance.',
        ],
      },
      {
        heading: 'Daily & Practice',
        items: [
          'Daily is our own generated box, built from two chainable words so a two-word solution always exists; Practice deals unlimited boxes.',
          'Reveal gives up and shows the solutions in the solver.',
        ],
      },
      {
        heading: 'Tips',
        items: [
          'Plan the bridge: pick a first word whose last letter starts plenty of words.',
          'Target the rare letters early — the common ones tend to get covered on the way.',
        ],
      },
    ],
  },
  weave: {
    title: 'Weave',
    intro:
      'A Strands-style theme hunt: the themed words tile the entire board, every letter used exactly once.',
    sections: [
      {
        heading: 'Playing',
        items: [
          'Read the theme clue, then drag through adjacent letters — any direction, diagonals included — to trace a word. Release to submit.',
          'Theme words lock in blue. The spangram — a word that sums up the theme and spans the board edge to edge — locks in gold.',
          'Every letter belongs to exactly one theme word, so each find shrinks the haystack.',
          'Other real words (4+ letters) aren’t wasted: every three you find banks a hint, which outlines one unfound theme word on the board.',
          'Reveal gives up and shows the full solution. Either way, completion draws every word’s path across the board.',
        ],
      },
      {
        heading: 'Daily & Practice',
        items: [
          'Daily is a 6×8 board, the same for everyone; Practice draws from a rotating pool in 6×8 or the harder 8×10.',
          'Puzzles are our own, generated from curated themes — never the NYT’s.',
        ],
      },
      {
        heading: 'Tips',
        items: [
          'Guess the theme first — knowing what kind of words to expect is half the puzzle.',
          'The spangram usually cuts through the middle of the board; finding it splits the rest into manageable regions.',
          'Stuck? Trace any common words you see — three of them buy a hint.',
        ],
      },
    ],
  },
};

export default function HowToPlay({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const guide = GUIDES[mode];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`How to play ${guide.title}`}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-slate-900 border border-white/10 p-6 sm:p-8 text-left shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-xl font-bold mb-1">How to play — {guide.title}</h2>
        <p className="text-sm text-slate-400 mb-5">{guide.intro}</p>

        <div className="space-y-5 text-sm text-slate-300">
          {guide.sections.map((s) => (
            <div key={s.heading}>
              <h3 className="text-xs font-semibold text-amber-400/90 uppercase tracking-wider mb-2">
                {s.heading}
              </h3>
              <ul className="space-y-1.5 text-slate-300 list-disc list-outside pl-4 marker:text-slate-600">
                {s.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}

          <p className="text-xs text-slate-500 border-t border-white/10 pt-4">
            Daily puzzles refresh about 15 minutes after 3:00&nbsp;a.m. Eastern. Progress and
            stats save in your browser — sign in to sync them across devices.
          </p>
        </div>
      </div>
    </div>
  );
}
