// A themed month, in the daily puzzles.
//
// For an event — Employee Ownership Month — the dailies can be drawn from a
// word list somebody wrote rather than from the language. Two of the ten games
// can take a plain list: the guess word, which is a word, and Weave, whose
// whole premise is a themed set. The rest need pangrams, letter grids or
// curated pairs, and a bag of words cannot supply those.
//
// Everything here degrades rather than fails. A generator that cannot reach the
// database, or a day nothing covers, produces exactly the puzzles it produced
// before any of this existed — because a themed month is a nice thing to have
// and a daily puzzle is not optional.

/** Ask the database which theme covers a date. Null for "generate as usual".
 *
 *  `PUZZLES_THEME` short-circuits it with inline JSON. That exists for the
 *  contract test, which runs the real generator and has no database — but it is
 *  also the way to try a theme before committing to the dates. */
export async function themeFor(date, env = process.env, fetchImpl = fetch) {
  const inline = (env.PUZZLES_THEME || '').trim();
  if (inline) {
    try {
      return normaliseTheme(JSON.parse(inline));
    } catch {
      throw new Error('PUZZLES_THEME is set but is not valid JSON');
    }
  }
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetchImpl(`${url}/rest/v1/rpc/daily_theme`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_date: date }),
    });
    if (!res.ok) return null;
    return normaliseTheme(await res.json());
  } catch {
    // The database being unreachable is a reason to publish an unthemed day,
    // not a reason to publish nothing.
    return null;
  }
}

/** What the generator can rely on, whatever came back. */
export function normaliseTheme(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const words = Array.isArray(raw.words)
    ? raw.words
        .filter((w) => typeof w === 'string')
        .map((w) => w.trim().toLowerCase())
        .filter((w) => /^[a-z]+$/.test(w))
    : [];
  if (words.length === 0) return null;
  // An array, and tolerant of the single `spangram` the first version sent —
  // this reads a database that may be older than the generator.
  const offered = Array.isArray(raw.spangrams)
    ? raw.spangrams
    : typeof raw.spangram === 'string'
      ? [raw.spangram]
      : [];
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    clue: (typeof raw.clue === 'string' && raw.clue.trim()) || raw.name || '',
    // The shape is the board's business, so one that will not thread is treated
    // as absent rather than passed on to fail later.
    spangrams: offered
      .filter((w) => typeof w === 'string')
      .map((w) => w.trim().toLowerCase())
      .filter((w) => /^[a-z]{6,16}$/.test(w)),
    words,
  };
}

/** The theme's own words of one length, ready to be a daily answer.
 *
 *  Reversal, and the one that matters. This used to intersect with the day's
 *  ordinary pool, so a themed word the bundled dictionary had never heard of
 *  was dropped — ESOP could be the answer inside a session but not a daily.
 *  That was the wrong way round: the words an event most wants are exactly the
 *  ones a dictionary does not carry, which is what makes them the company's.
 *
 *  The board is what changed, not this. A themed day now ships its own words
 *  alongside the answer and the board accepts them, so being in the dictionary
 *  stopped being the test. What is still applied is the blocklist — a curated
 *  list is somebody's paste, and never handing anybody a slur as an answer is
 *  not a rule to relax because the words came from inside the building.
 *
 *  Empty means this length has nothing themed to offer, and the caller falls
 *  back to the ordinary pool for it: per length, so a list with no seven-letter
 *  words still themes the other twelve boards.
 */
export function themedPool(themeWords, length, blocked) {
  if (!themeWords || themeWords.length === 0) return [];
  return themeWords
    .filter((w) => w.length === length && !(blocked && blocked.has(w)))
    // Sorted because the daily draws by index: an unsorted pool would make the
    // same seed pick different words for no reason anybody could see.
    .sort();
}

/** The theme as Weave wants it — one candidate per spangram.
 *
 *  A list of them rather than one, and it is the answer to a real problem: a
 *  list that runs for a month builds a board every day of it, and a single
 *  spangram threads the same word through all thirty-one. The board rearranges,
 *  the long answer does not, and by the third day nobody is looking for it.
 *
 *  Handed to Weave's own generator as its themes, which shuffles them against
 *  the day's seed and takes the first that tiles. So the day picks, the pick is
 *  deterministic, and a spangram that will not fit this shape is passed over
 *  rather than costing the board.
 *
 *  Empty when none of them can work — no spangrams at all, or too few letters
 *  to tile around any of them — and the caller falls back to the curated
 *  themes, because a day without a Weave board is worse than a day without a
 *  themed one.
 */
export function weaveThemes(theme, cells = 48) {
  if (!theme || !theme.spangrams || theme.spangrams.length === 0) return [];
  const out = [];
  for (const spangram of theme.spangrams) {
    const words = [...new Set(theme.words)].filter(
      (w) => w.length >= 4 && w.length <= 10 && w !== spangram
    );
    const letters = words.reduce((n, w) => n + w.length, 0);
    // The board is the spangram plus whatever tiles the rest. Without enough
    // letters to reach that there is nothing to attempt.
    if (letters < cells - spangram.length) continue;
    out.push({ clue: theme.clue, spangram, words });
  }
  return out;
}
