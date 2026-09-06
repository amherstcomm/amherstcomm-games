// Reading a pasted JSON blob of themes or word lists.
//
// These get written somewhere else — a spreadsheet, a model, a colleague's
// notes — and typing them again into a form is the part that stops it
// happening. So paste the thing.
//
// Tolerant about shape and strict about reporting. Two different jobs: it
// accepts `theme` or `clue`, words as an array or as a blob of text, and
// ignores the derived fields a generator tends to include (`word_count`,
// `total_letters`, `spangram_length`) because they are arithmetic, not data.
// What it will not do is drop something quietly — every entry it cannot use
// comes back with a reason and its position, because an import that says
// "imported 9" when eleven were pasted is an import that has lost two.

export type ParsedTheme = {
  clue: string;
  spangram: string;
  words: string[];
  from?: string;
  until?: string;
};

export type ParsedList = {
  name: string;
  words: string[];
  clue?: string;
  spangrams?: string[];
  from?: string;
  until?: string;
};

export type ParsedPassage = {
  text: string;
  author?: string;
  from?: string;
  until?: string;
};

export type Parsed<T> = {
  items: T[];
  /** one per entry that could not be used, in the words of somebody looking at
   *  the paste rather than at the parser */
  problems: string[];
};

/** JSON, or a reason it is not. */
function load(text: string): { value: unknown } | { error: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { error: 'Nothing pasted.' };
  try {
    return { value: JSON.parse(trimmed) };
  } catch (e) {
    // The browser's message names the character, which is the useful half.
    return { error: `That is not valid JSON — ${(e as Error).message}` };
  }
}

/** One entry or many. A paste of a single theme is a thing somebody will do. */
function entries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  // `{ themes: [...] }` and `{ lists: [...] }` are what a wrapper looks like.
  if (value && typeof value === 'object') {
    for (const key of ['themes', 'lists', 'passages', 'quotes', 'items', 'data']) {
      const inner = (value as Record<string, unknown>)[key];
      if (Array.isArray(inner)) return inner;
    }
    return [value];
  }
  return [];
}

/** Words as an array, or as anything a person might paste instead. */
function wordsOf(raw: unknown): string[] {
  const from = Array.isArray(raw)
    ? raw.filter((w): w is string => typeof w === 'string')
    : typeof raw === 'string'
      ? [raw]
      : [];
  return [
    ...new Set(
      from
        .flatMap((w) => w.split(/[^A-Za-z]+/))
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w !== '')
    ),
  ];
}

const text = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

/** A date, or nothing. Anything that is not `YYYY-MM-DD` is ignored rather than
 *  guessed at: a date read wrong is a theme that appears in the wrong week. */
const date = (raw: unknown): string | undefined => {
  const v = text(raw);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
};

export function parseWeaveThemes(input: string): Parsed<ParsedTheme> {
  const loaded = load(input);
  if ('error' in loaded) return { items: [], problems: [loaded.error] };

  const items: ParsedTheme[] = [];
  const problems: string[] = [];
  entries(loaded.value).forEach((raw, i) => {
    const at = `Entry ${i + 1}`;
    if (!raw || typeof raw !== 'object') {
      problems.push(`${at} is not a theme.`);
      return;
    }
    const o = raw as Record<string, unknown>;
    // `theme` is what Ray's own blobs call it; `clue` is what the form does.
    const clue = text(o.clue) || text(o.theme) || text(o.name);
    const spangram = text(o.spangram).toLowerCase();
    const words = wordsOf(o.words);
    if (!clue) {
      problems.push(`${at} has no clue.`);
      return;
    }
    if (!/^[a-z]{6,16}$/.test(spangram)) {
      problems.push(`${at} (${clue}): "${spangram || 'nothing'}" cannot be a spangram.`);
      return;
    }
    if (words.length === 0) {
      problems.push(`${at} (${clue}) has no words.`);
      return;
    }
    items.push({
      clue,
      spangram,
      words: words.filter((w) => w !== spangram),
      from: date(o.from ?? o.starts_on ?? o.start),
      until: date(o.until ?? o.ends_on ?? o.end),
    });
  });
  return { items, problems };
}

export function parseWordLists(input: string): Parsed<ParsedList> {
  const loaded = load(input);
  if ('error' in loaded) return { items: [], problems: [loaded.error] };

  const items: ParsedList[] = [];
  const problems: string[] = [];
  entries(loaded.value).forEach((raw, i) => {
    const at = `Entry ${i + 1}`;
    if (!raw || typeof raw !== 'object') {
      problems.push(`${at} is not a list.`);
      return;
    }
    const o = raw as Record<string, unknown>;
    const name = text(o.name) || text(o.title) || text(o.theme) || text(o.clue);
    const words = wordsOf(o.words);
    if (!name) {
      problems.push(`${at} has no name.`);
      return;
    }
    if (words.length === 0) {
      problems.push(`${at} (${name}) has no words.`);
      return;
    }
    const spangrams = wordsOf(o.spangrams ?? o.spangram).filter((w) =>
      /^[a-z]{6,16}$/.test(w)
    );
    items.push({
      name,
      words,
      clue: text(o.clue) || undefined,
      spangrams: spangrams.length > 0 ? spangrams : undefined,
      from: date(o.from ?? o.daily_from ?? o.start),
      until: date(o.until ?? o.daily_until ?? o.end),
    });
  });
  return { items, problems };
}

/** A month of cryptogram passages.
 *
 *  The loosest of the three, because a passage is a sentence: a bare string is
 *  an entry, so `["...", "..."]` imports, and the curated file's own shape
 *  (`{ quotes: [{ text, author }] }`) imports as well — which is what makes it
 *  possible to lift a handful out of scripts/cryptogram-passages.json rather
 *  than retyping them.
 *
 *  What it will not do is judge the length. The server refuses a passage no
 *  board can take and says how many letters it had, and a paste of thirty
 *  entries wants that reported per entry rather than pre-empted here — the two
 *  would then have to agree about the bands forever.
 */
export function parsePassages(input: string): Parsed<ParsedPassage> {
  const loaded = load(input);
  if ('error' in loaded) return { items: [], problems: [loaded.error] };

  const items: ParsedPassage[] = [];
  const problems: string[] = [];
  entries(loaded.value).forEach((raw, i) => {
    const at = `Entry ${i + 1}`;
    // A bare string is the passage itself.
    if (typeof raw === 'string') {
      const body = raw.trim();
      if (body === '') {
        problems.push(`${at} is empty.`);
        return;
      }
      items.push({ text: body });
      return;
    }
    if (!raw || typeof raw !== 'object') {
      problems.push(`${at} is not a passage.`);
      return;
    }
    const o = raw as Record<string, unknown>;
    const body = text(o.text) || text(o.passage) || text(o.quote);
    if (!body) {
      problems.push(`${at} has no text.`);
      return;
    }
    items.push({
      text: body,
      author: text(o.author) || text(o.who) || undefined,
      from: date(o.from ?? o.starts_on ?? o.start),
      until: date(o.until ?? o.ends_on ?? o.end),
    });
  });
  return { items, problems };
}
