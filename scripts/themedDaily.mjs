// A themed month, in the daily puzzles.
//
// For an event — Employee Ownership Month — the dailies can be drawn from a
// word list somebody wrote rather than from the language.
//
// Four of the ten games can be *built* out of one. The guess word is a word.
// Weave has its own themes, in the shape a board needs. A scramble rack is one
// word shuffled, so a theme word of the rack's length is a themed rack. A hive
// is seeded from a pangram, so a theme word of seven distinct letters is a
// themed hive. (It said "two" here until the last two were measured; the reason
// they were left out was that a bag of words cannot supply a pangram, which is
// true of the bag and not of the words in it.)
//
// A fifth, the grid, is dealt from dice and cannot be built out of anything —
// but it scores the theme's words where the board can trace them, like the
// other three do. The rest need letter grids or curated pairs.
//
// Everything here degrades rather than fails. A generator that cannot reach the
// database, or a day nothing covers, produces exactly the puzzles it produced
// before any of this existed — because a themed month is a nice thing to have
// and a daily puzzle is not optional.

/** Said once per run when the database cannot be asked at all.
 *
 *  Silence here is what let a themed month fail quietly: with a service key and
 *  no SUPABASE_URL every one of these functions returned "nothing covers this
 *  day", which is indistinguishable from a day nobody themed — so the run
 *  published ordinary puzzles and said nothing about it. A deployment that
 *  means to theme a month has both; one that has neither is not themed and
 *  needs no warning. Having one and not the other is the mistake. */
let saidAboutCredentials = false;
export function credentialsFor(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return { url, key };
  if ((url || key) && !saidAboutCredentials) {
    saidAboutCredentials = true;
    console.warn(
      `::warning::${url ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_URL'} is not set, so ` +
        'no word lists, Weave themes, passages, word rules or pins were read — ' +
        'these are the puzzles this day would have had with nothing set up.'
    );
  }
  return null;
}

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
  const credentials = credentialsFor(env);
  if (!credentials) return null;
  const { url, key } = credentials;
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

/** The Weave themes covering a date: a pool, not one.
 *
 *  Separate from themeFor because they are separate things. A word list is a
 *  bag of words — right for the daily word, where any word of the right length
 *  will do. A Weave theme is a set that tiles a board, and pretending one shape
 *  served both made a worse version of each.
 *
 *  Every theme covering the day is a candidate; Weave's own generator shuffles
 *  them against that day's seed and takes the first that tiles. One theme on one
 *  date is a theme for that date; six across October is a month that does not
 *  repeat itself.
 *
 *  `PUZZLES_WEAVE_THEMES` short-circuits it with inline JSON, for the contract
 *  test and for trying a theme before committing to dates. */
export async function weaveThemesFor(date, env = process.env, fetchImpl = fetch) {
  const inline = (env.PUZZLES_WEAVE_THEMES || '').trim();
  if (inline) {
    try {
      return cleanWeaveThemes(JSON.parse(inline));
    } catch {
      throw new Error('PUZZLES_WEAVE_THEMES is set but is not valid JSON');
    }
  }
  const credentials = credentialsFor(env);
  if (!credentials) return [];
  const { url, key } = credentials;
  try {
    const res = await fetchImpl(`${url}/rest/v1/rpc/daily_weave_themes`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_date: date }),
    });
    if (!res.ok) return [];
    return cleanWeaveThemes(await res.json());
  } catch {
    // Unreachable is a reason to publish a curated board, not no board.
    return [];
  }
}

/** What the generator can rely on: a clue, a spangram it can thread, and words
 *  it can place. Anything else is dropped rather than passed on to fail
 *  somewhere less legible. */
export function cleanWeaveThemes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const spangram = typeof t.spangram === 'string' ? t.spangram.trim().toLowerCase() : '';
    if (!/^[a-z]{6,16}$/.test(spangram)) continue;
    const words = (Array.isArray(t.words) ? t.words : [])
      .filter((w) => typeof w === 'string')
      .map((w) => w.trim().toLowerCase())
      .filter((w) => /^[a-z]{4,10}$/.test(w) && w !== spangram);
    if (words.length === 0) continue;
    out.push({ clue: typeof t.clue === 'string' && t.clue.trim() ? t.clue.trim() : spangram, spangram, words });
  }
  return out;
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
  // Words and a name. Clue and spangrams went with the word-list route into
  // Weave, which weave_themes replaced — a list themes the daily word, a theme
  // themes the board.
  return { name: typeof raw.name === 'string' ? raw.name : '', words };
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

/** The theme's own words that could be a scramble rack.
 *
 *  A rack is one word shuffled, so the themed version is simply a theme word of
 *  the rack's length. It does not have to be in the dictionary — the board
 *  ships the day's words and accepts them, same as the daily answer does, which
 *  is what lets a rack spell out ESOPPLAN and still be solvable.
 *
 *  Sorted, because the draw is by index and an unsorted pool would make the same
 *  seed pick different racks for no reason anybody could see.
 */
export function themedRackBases(themeWords, size, blocked) {
  if (!themeWords || themeWords.length === 0) return [];
  return themeWords.filter((w) => w.length === size && !(blocked && blocked.has(w))).sort();
}

/** The theme's own words that could seed a hive.
 *
 *  A hive is seeded from a pangram: seven distinct letters, so the board is
 *  always completable by the word it was built from. The extra rule is the same
 *  one the ordinary pool uses — no `s`, or plurals flood the answer list.
 *
 *  Whether the resulting board is worth playing is a different question and is
 *  not asked here: the caller counts what the dictionary yields for each centre
 *  and falls back to an ordinary base if a themed one leaves too thin a board.
 *  A themed hive nobody can fill is worse than an unthemed one.
 */
export function themedHiveBases(themeWords, blocked) {
  if (!themeWords || themeWords.length === 0) return [];
  return themeWords
    .filter(
      (w) =>
        w.length >= 7 &&
        new Set(w).size === 7 &&
        !w.includes('s') &&
        !(blocked && blocked.has(w))
    )
    .sort();
}

/** The custom cryptogram passages covering a date: a pool, not one.
 *
 *  Same shape as the Weave themes above and for the same reason — the generator
 *  picks per difficulty from the ones that fit that tier's band, so handing it
 *  the pool is what makes a month of custom passages a month of different ones.
 *
 *  `PUZZLES_PASSAGES` short-circuits it with inline JSON, for the contract test
 *  and for trying a passage before committing to dates. */
export async function passagesFor(date, env = process.env, fetchImpl = fetch) {
  const inline = (env.PUZZLES_PASSAGES || '').trim();
  if (inline) {
    try {
      return cleanPassages(JSON.parse(inline));
    } catch {
      throw new Error('PUZZLES_PASSAGES is set but is not valid JSON');
    }
  }
  const credentials = credentialsFor(env);
  if (!credentials) return [];
  const { url, key } = credentials;
  try {
    const res = await fetchImpl(`${url}/rest/v1/rpc/daily_cryptogram_passages`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_date: date }),
    });
    if (!res.ok) return [];
    return cleanPassages(await res.json());
  } catch {
    // Unreachable is a reason to publish a curated passage, not no puzzle.
    return [];
  }
}

/** What the cipher can rely on. The letter count is recomputed here rather than
 *  trusted from the database: it decides which board a passage may go on, and a
 *  number that arrived over the wire is a number that can be wrong. */
export function cleanPassages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const text = typeof p.text === 'string' ? p.text.trim() : '';
    if (!text) continue;
    const letters = (text.toLowerCase().match(/[a-z]/g) ?? []).length;
    if (letters === 0) continue;
    out.push({
      text,
      author: typeof p.author === 'string' && p.author.trim() ? p.author.trim() : null,
      letters,
      source: 'custom',
    });
  }
  return out;
}

/** The custom passages a tier could play, longest first.
 *
 *  The bands are the generator's own (scripts/cryptogram.mjs): 50 to 100
 *  letters for the standard band, 35 to 49 for the short one. A tier with
 *  nothing that fits falls straight back to the curated pool — per tier, so a
 *  month of long passages still themes easy and hard and leaves extreme alone.
 */
export function passagesForBand(passages, band) {
  const [low, high] = band === 'short' ? [35, 49] : [50, 100];
  return (passages ?? [])
    .filter((p) => p.letters >= low && p.letters <= high)
    // Deterministic: the pick below is by index, and insertion order out of the
    // database is not something to lean on.
    .sort((a, b) => a.text.localeCompare(b.text));
}

/** What each game will take as a word on a date: `{default, boxed, ...}`.
 *
 *  Three answers — `both`, `themed`, `dictionary` — decided per day rather than
 *  per word list, because several lists can cover one day and a list is the
 *  wrong place to keep an answer about the day.
 *
 *  `PUZZLES_POLICY` short-circuits it with inline JSON, for the contract test
 *  and for trying a month before committing to it. */
export async function policyFor(date, env = process.env, fetchImpl = fetch) {
  const inline = (env.PUZZLES_POLICY || '').trim();
  if (inline) {
    try {
      return cleanPolicy(JSON.parse(inline));
    } catch {
      throw new Error('PUZZLES_POLICY is set but is not valid JSON');
    }
  }
  const credentials = credentialsFor(env);
  if (!credentials) return {};
  const { url, key } = credentials;
  try {
    const res = await fetchImpl(`${url}/rest/v1/rpc/daily_word_policy`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_date: date }),
    });
    if (!res.ok) return {};
    return cleanPolicy(await res.json());
  } catch {
    // Unreachable is a reason to publish the day the site would have had, not
    // to publish nothing — and that day is `both`, which is the empty answer.
    return {};
  }
}

export const POLICIES = ['both', 'themed', 'dictionary'];

/** What the generator can rely on: known games, known answers, nothing else. */
export function cleanPolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [game, policy] of Object.entries(raw)) {
    if (typeof policy !== 'string' || !POLICIES.includes(policy)) continue;
    // The ladder is refused when it is written, and again here: par is the
    // shortest route through the words a player may use, so narrowing them
    // changes the answer rather than the difficulty.
    if (game === 'ladder') continue;
    out[game] = policy;
  }
  return out;
}

/** The answer for one game, falling back to the day's default and then to the
 *  way a themed day has always worked. */
export function policyOf(policy, game) {
  return policy?.[game] ?? policy?.default ?? 'both';
}

/** What a person pinned to this date: `{"boxed": {"easy": {...}}}`.
 *
 *  A pin is a seed rather than a board — the word, the pangram, the two words
 *  the box is made of — so the generator builds from it exactly as it builds
 *  its own choice, and a pin that has stopped working falls back rather than
 *  publishing something the game cannot read.
 *
 *  `PUZZLES_PINS` short-circuits it with inline JSON, for the contract test. */
export async function pinsFor(date, env = process.env, fetchImpl = fetch) {
  const inline = (env.PUZZLES_PINS || '').trim();
  if (inline) {
    try {
      return cleanPins(JSON.parse(inline));
    } catch {
      throw new Error('PUZZLES_PINS is set but is not valid JSON');
    }
  }
  const credentials = credentialsFor(env);
  if (!credentials) return {};
  const { url, key } = credentials;
  try {
    const res = await fetchImpl(`${url}/rest/v1/rpc/daily_pins`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_date: date }),
    });
    if (!res.ok) return {};
    return cleanPins(await res.json());
  } catch {
    // Unreachable is a reason to deal the day's own draw, not to publish
    // nothing.
    return {};
  }
}

/** Objects keyed by game and then by difficulty, and nothing else. */
export function cleanPins(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [game, boards] of Object.entries(raw)) {
    if (!boards || typeof boards !== 'object' || Array.isArray(boards)) continue;
    const kept = {};
    for (const [at, choice] of Object.entries(boards)) {
      if (choice && typeof choice === 'object' && !Array.isArray(choice)) kept[at] = choice;
    }
    if (Object.keys(kept).length > 0) out[game] = kept;
  }
  return out;
}

/** The choice pinned for one board: the difficulty's own, or the one pinned for
 *  every difficulty of that game. Null when nobody pinned anything. */
export function pinOf(pins, game, difficulty) {
  const boards = pins?.[game];
  if (!boards) return null;
  return boards[difficulty] ?? boards.all ?? null;
}
