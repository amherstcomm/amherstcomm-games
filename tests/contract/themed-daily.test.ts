// A themed month, proved against the real generator.
//
// The unit tests own the arithmetic — which words survive the intersection,
// what a Weave theme needs. This runs the actual generator twice for one pinned
// date, themed and not, and asserts the difference. That is the only way to
// know the theme reaches the puzzles rather than merely being fetched: the two
// games it touches are wired at different points in a nine-hundred-line script,
// and a wiring that reads correctly can still be wired to nothing.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const DATE = '2026-10-08';

/** A theme shaped like one somebody would write for an event month — ordinary
 *  words, and `esop`, which no dictionary carries and which the whole point of
 *  this is to allow. */
const THEME = {
  name: 'Employee ownership',
  clue: 'What we all are',
  words: [
    'esop',
    'shares', 'dividend', 'owner', 'equity', 'buyout', 'vesting', 'stake', 'payout',
    'profit', 'capital', 'shared', 'invest', 'earned', 'worker', 'stock', 'value',
    'trustee', 'voting', 'growth', 'reward',
    // Seven distinct letters and no `s`, so it can seed a hive — the only word
    // here that can, which is itself the finding the admin page reports.
    'employer',
  ],
};

let plain: string;
let themed: string;

async function generate(
  dir: string,
  theme?: object,
  date = DATE,
  weave?: object[],
  passages?: object[]
) {
  await run('node', ['scripts/fetch-puzzles.mjs'], {
    env: {
      ...process.env,
      SKIP_SOLVER_DATA: '1',
      PUZZLES_DATE: date,
      PUZZLES_DATA_DIR: dir,
      PUZZLES_SEED_SALT: 'themed-test-salt',
      ...(theme ? { PUZZLES_THEME: JSON.stringify(theme) } : {}),
      ...(weave ? { PUZZLES_WEAVE_THEMES: JSON.stringify(weave) } : {}),
      ...(passages ? { PUZZLES_PASSAGES: JSON.stringify(passages) } : {}),
    },
    maxBuffer: 10 * 1024 * 1024,
  });
}

const read = async (dir: string, file: string) =>
  JSON.parse(await readFile(join(dir, file), 'utf8'));

const words = (payload: { byDifficulty: Record<string, { words: Record<string, string> }> }, tier: string) =>
  Object.fromEntries(
    Object.entries(payload.byDifficulty[tier].words).map(([len, b64]) => [
      len,
      Buffer.from(b64, 'base64').toString(),
    ])
  );

beforeAll(async () => {
  plain = await mkdtemp(join(tmpdir(), 'anagrimoire-plain-'));
  themed = await mkdtemp(join(tmpdir(), 'anagrimoire-themed-'));
  await Promise.all([
    generate(plain),
    generate(themed, THEME),
  ]);
});

afterAll(async () => {
  await rm(plain, { recursive: true, force: true });
  await rm(themed, { recursive: true, force: true });
});

describe('the daily word', () => {
  it('comes from the theme where the theme has a word of that length', async () => {
    const got = words(await read(themed, 'daily-words.json'), 'easy');
    const fromTheme = Object.values(got).filter((w) => THEME.words.includes(w));
    expect(fromTheme.length, `themed nothing: ${JSON.stringify(got)}`).toBeGreaterThan(0);
  });

  // Per length rather than per day. A list with no three-letter words should
  // still theme the boards it can, and leave the rest exactly as they were.
  it('and falls back to the ordinary word where it does not', async () => {
    const before = words(await read(plain, 'daily-words.json'), 'easy');
    const after = words(await read(themed, 'daily-words.json'), 'easy');
    const untouched = Object.keys(before).filter((len) => before[len] === after[len]);
    expect(untouched.length, 'every length changed, so nothing fell back').toBeGreaterThan(0);
    for (const len of untouched) {
      expect(THEME.words).not.toContain(after[len]);
    }
  });

  // The reversal, and the reason the payload grew a field. A themed answer no
  // longer has to be in the dictionary — the words an event most wants are
  // exactly the ones a dictionary does not carry — so the day ships its own
  // words and the board accepts them. Without that the answer would be
  // untypeable, which is worse than not theming at all.
  it('and the day carries the words the board must accept', async () => {
    const payload = await read(themed, 'daily-words.json');
    expect(typeof payload.themed).toBe('string');
    const carried = Buffer.from(payload.themed, 'base64').toString().split(' ');
    expect(carried).toContain('esop');
    // Every answer it chose is in there, which is the property that makes the
    // day playable rather than merely themed.
    for (const word of Object.values(words(payload, 'easy'))) {
      if (THEME.words.includes(word)) expect(carried).toContain(word);
    }
  });

  it('and an ordinary day carries none', async () => {
    expect((await read(plain, 'daily-words.json')).themed).toBeUndefined();
  });

  it('and every themed answer is the right length for its board', async () => {
    const got = words(await read(themed, 'daily-words.json'), 'easy');
    for (const [len, word] of Object.entries(got)) {
      expect(word.length, `${word} is not ${len} letters`).toBe(Number(len));
    }
  });

  it('leaves the untouched day alone entirely', async () => {
    const before = words(await read(plain, 'daily-words.json'), 'easy');
    expect(Object.values(before).some((w) => THEME.words.includes(w))).toBe(false);
  });
});

// The Weave board used to be themed from a word list — a clue and spangrams on
// the list itself — and those tests lived here. That route went when lists were
// allowed to overlap: merging two lists would have had to invent a rule for
// whose clue and whose spangram won, and weave_themes already says it properly.
// A list themes the daily word; a theme themes the board. What follows is the
// theme half.

// ---------------------------------------------------------------------------
// Weave themes written as themes
//
// A word list is a bag of words and a Weave theme is a set that tiles a board.
// The board tiles exactly — the words have to sum to the cells the spangram
// leaves — so a theme written properly is the better answer, and one written as
// a theme should beat one derived from a list.
// ---------------------------------------------------------------------------

/** Ray's own shape: 13-letter spangram, 35 letters of words, 48 cells. */
const WEAVE = [
  {
    clue: 'Profit sharing',
    spangram: 'profitsharing',
    words: ['metrics', 'payout', 'reward', 'target', 'bonus', 'split'],
  },
];

describe('a Weave theme of its own', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'anagrimoire-weave-'));
    await generate(dir, undefined, DATE, WEAVE);
  });
  afterAll(async () => rm(dir, { recursive: true, force: true }));

  it('builds the board it tiles', async () => {
    const board = await read(dir, 'daily-weave.json');
    expect(board.byDifficulty.easy.clue).toBe('Profit sharing');
  });

  it('out of its own words', async () => {
    const board = await read(dir, 'daily-weave.json');
    const solved: { spangram: { w: string }; words: { w: string }[] } = JSON.parse(
      Buffer.from(board.byDifficulty.easy.answers, 'base64').toString()
    );
    expect(solved.spangram.w).toBe('profitsharing');
    for (const { w } of solved.words) expect(WEAVE[0].words).toContain(w.toLowerCase());
  });

  // 48 letters cannot fill 63 or 80 cells, and the honest outcome is a curated
  // board rather than no board. The admin page says so before anybody waits for
  // a night to find out.
  it('and leaves the bigger boards to the curated themes', async () => {
    const board = await read(dir, 'daily-weave.json');
    expect(board.byDifficulty.hard.clue).not.toBe('Profit sharing');
    expect(board.byDifficulty.extreme.clue).not.toBe('Profit sharing');
  });
});

// The boards a theme can be built *from*, rather than merely scored in. Both
// are wired at their own point in a nine-hundred-line script, and a wiring that
// reads correctly can still be wired to nothing — which is what this is for.
describe('the boards built from the theme', () => {
  it('shuffles a theme word into the scramble rack', async () => {
    const rack = (await read(themed, 'daily-scramble.json')).byDifficulty.easy.letters as string[];
    const spelled = [...rack].sort().join('');
    const matches = THEME.words.filter((w) => [...w].sort().join('') === spelled);
    expect(matches.length, `rack ${rack.join('')} is not a theme word`).toBeGreaterThan(0);
  });

  it('and leaves an ordinary day s rack to the language', async () => {
    const rack = (await read(plain, 'daily-scramble.json')).byDifficulty.easy.letters as string[];
    const spelled = [...rack].sort().join('');
    expect(THEME.words.some((w) => [...w].sort().join('') === spelled)).toBe(false);
  });

  it('seeds the hive from the theme s own pangram', async () => {
    const hive = (await read(themed, 'daily-hive.json')).byDifficulty.easy;
    const letters = [hive.center, ...hive.outers].sort().join('');
    // The seed is the word with seven distinct letters and no `s`; the hive is
    // exactly its letters, which is what makes the word findable on the board
    // it built.
    const seeds = THEME.words.filter(
      (w) => [...new Set(w)].sort().join('') === letters
    );
    expect(seeds, `hive ${letters} came from no theme word`).toContain('employer');
  });

  it('and an ordinary day s hive from the dictionary', async () => {
    const hive = (await read(plain, 'daily-hive.json')).byDifficulty.easy;
    const letters = [hive.center, ...hive.outers].sort().join('');
    expect(THEME.words.some((w) => [...new Set(w)].sort().join('') === letters)).toBe(false);
  });

  // Every board that scores has to be able to accept a word the dictionary has
  // never heard of, or the bonus is for words nobody can enter.
  it('carries the day s words into every board that scores them', async () => {
    for (const file of ['daily-scramble.json', 'daily-hive.json', 'daily-grid.json']) {
      const payload = await read(themed, file);
      expect(typeof payload.themed, `${file} carries no theme`).toBe('string');
      expect(Buffer.from(payload.themed, 'base64').toString().split(' ')).toContain('esop');
      expect((await read(plain, file)).themed, `${file} themed an ordinary day`).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Cryptogram passages of a deployment's own
//
// Two bands, and they are why this is asserted per difficulty rather than per
// day: easy and hard play 50 to 100 letters, extreme plays 35 to 49. A month of
// long passages should theme two tiers and leave the third exactly as it was.
// ---------------------------------------------------------------------------

/** 52 letters, so easy and hard can take it; nothing here fits the short band. */
const LONG_ONLY = [
  {
    text: 'We own this place together, and every share of it was earned here.',
    author: 'The charter',
  },
];

/** And the short one, for the tier that plays one. */
const BOTH_BANDS = [
  ...LONG_ONLY,
  { text: 'One share each, and the year we all earned it here.', author: null },
];

const plaintext = (payload: { byDifficulty: Record<string, { answer: string }> }, tier: string) =>
  JSON.parse(Buffer.from(payload.byDifficulty[tier].answer, 'base64').toString()) as {
    text: string;
    author: string | null;
  };

describe('a cryptogram passage of your own', () => {
  let both: string;
  let longOnly: string;

  beforeAll(async () => {
    both = await mkdtemp(join(tmpdir(), 'anagrimoire-passages-'));
    longOnly = await mkdtemp(join(tmpdir(), 'anagrimoire-passage-long-'));
    await Promise.all([
      generate(both, undefined, DATE, undefined, BOTH_BANDS),
      generate(longOnly, undefined, DATE, undefined, LONG_ONLY),
    ]);
  });
  afterAll(async () =>
    Promise.all([
      rm(both, { recursive: true, force: true }),
      rm(longOnly, { recursive: true, force: true }),
    ])
  );

  it('is what the day enciphers', async () => {
    const payload = await read(both, 'daily-cryptogram.json');
    for (const tier of ['easy', 'hard', 'extreme']) {
      expect(BOTH_BANDS.map((p) => p.text), tier).toContain(plaintext(payload, tier).text);
    }
  });

  it('and its author rides along to be shown under the solved board', async () => {
    expect(plaintext(await read(both, 'daily-cryptogram.json'), 'easy').author).toBe(
      'The charter'
    );
  });

  // Per tier, which is the whole reason the bands are modelled: 52 letters is
  // no board at extreme, and that difficulty should be the day it would have
  // had anyway rather than a day with a puzzle it cannot make.
  it('while a tier whose band nothing fits keeps its curated quotation', async () => {
    const payload = await read(longOnly, 'daily-cryptogram.json');
    expect(plaintext(payload, 'easy').text).toBe(LONG_ONLY[0].text);
    expect(plaintext(payload, 'extreme').text).not.toBe(LONG_ONLY[0].text);
    // And it is the same board that difficulty would have had with no custom
    // passages at all — not merely a different one.
    expect(plaintext(payload, 'extreme').text).toBe(
      plaintext(await read(plain, 'daily-cryptogram.json'), 'extreme').text
    );
  });

  it('and an ordinary day is untouched throughout', async () => {
    const payload = await read(plain, 'daily-cryptogram.json');
    for (const tier of ['easy', 'hard', 'extreme']) {
      expect(BOTH_BANDS.map((p) => p.text), tier).not.toContain(plaintext(payload, tier).text);
    }
  });
});
