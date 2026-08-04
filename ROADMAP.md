# Roadmap

Ideas we've agreed are worth doing, roughly in the order that makes sense to
build them. Nothing here is committed to a date — it's a parking lot so we
don't have to re-derive the reasoning each time.

## Near term

### ~~Share buttons~~ — done
Guess posts the tile grid, Weave one mark per word in find order (gold
spangram, bulb per hint), the rest a score-and-rank line. Emoji follow the
sharer's palette. Verified that no shared text contains a letter or word from
any answer — including Weave's clue, which was dropped because working out
the theme is half the puzzle.

Results carry a deep link (`?daily=hive`, `?play=weave`, `?solve=boxed`,
`?learn=grid`) that opens the exact board, and a 1200×630 preview card so a
pasted link renders as something rather than a naked URL. Each deployment
stamps its own origin from `VITE_SITE_ORIGIN`.

### ~~Personal history~~ — done
A card per game under Stats → History: Guess as a distribution plus a table
per word length, the rest as sparklines, all with streaks counted off puzzle
dates rather than kept in a counter. Reads `daily_progress`, which is the only
place a day-by-day series exists — the event log has timestamps but no puzzle
identity, and hive wrote a row per word.

### Realtime instead of polling
A visible board re-reads `daily_progress` every ten seconds so two windows
stay in step. That mostly serves side-by-side testing; the real case is a
phone in the morning and a laptop at lunch, which the pull on open already
covers, and the interval is already a middle ground rather than a live feed.
To stop polling altogether:

- **Realtime.** `alter publication supabase_realtime add table
  public.daily_progress`, then one shared channel filtered to `user_id`. Use
  it as a doorbell — an event triggers the same authenticated read and merge
  rather than trusting the payload, so there's one set of rules, not two. RLS
  still applies, so a subscription can only ever carry your own rows. Your own
  writes echo back, which is harmless: the row's `updated_at` matches the base
  we recorded, so it reads as ours and changes nothing. Keep polling as a slow
  fallback for when the socket drops.

Deliberately parked until the merge rules had been proven in use — adding a
second delivery path while they were still being validated would have made it
impossible to tell a bad rule from a bad transport.

### ~~Hide games and features~~ — done
Settings → Show, a pill per game and per tab. Rides the existing settings
sync, so it follows an account across devices.

- A display filter and nothing else: statistics, streaks and dailies all keep
  accruing for a hidden game, and unhiding brings back exactly what was there
- The last game and the last tab can't be hidden — the control disables rather
  than explaining an empty site afterwards, and the loader refuses a stored
  list that hides everything
- Hiding the game or tab you're standing on moves you to one that exists
- The Solve/Play/Learn switch disappears entirely at one tab, which is how the
  site becomes a game site rather than a tool with games attached
- A shared link outranks hiding for that visit, without changing the setting:
  landing someone on the wrong page because of a preference they set months
  ago is worse than showing them one game they'd switched off

### Onboarding
On a genuine first visit, a dismissible card: "New here? See how Weave works,"
routing into the Learn tab for the current mode. The Learn demos already do
the teaching — onboarding only needs to point at them. No forced multi-step
tour.

**Note:** first *visit* ≠ first *login*. A returning player signing in on a
new device shouldn't be re-onboarded, so the "seen it" flag belongs in the
synced settings, not just localStorage.

## Needs a decision first

### Display names → leaderboards
The query is the same security-definer aggregate shape as `daily_stats`. The
blockers are identity and trust:

- **Display names.** `profiles.display_name` exists but nothing sets it. Once
  names are public there's a moderation surface. Suggested: opt-in, and not
  appearing on the leaderboard is the default.
- **Score integrity.** Every score is client-reported and trivially forgeable
  (a Weave time of 0.1s from the console). Server-side validation would mean
  putting the dictionary and board logic in Postgres — not worth it.
  Suggested: frame leaderboards as friendly rather than competitive, and cap
  impossible values (sub-5-second Weave, a Boggle score above the board's own
  maximum) so casual nonsense doesn't ruin the board.

### Friends / competition
The biggest architectural jump. Everything so far is "you can only read your
own rows"; friends means mutual relationships, invitations, and RLS that lets
a friend read *some* of your results, plus blocking and removal. Build after
display names exist and after leaderboards prove the aggregate pattern.

## New game modes

### Word Tetris
Falling letters you steer into words. A real-time game loop, unlike anything
else here, fully generatable, and distinctive. The most interesting fit.

### Wordoku
A 9×9 sudoku whose nine symbols are letters, with one row or the main
diagonal spelling a nine-letter word of nine distinct letters (EDUCATION,
FLOWCHART, DIALOGUES). No clues to write: build a valid grid, pick a word
from the dictionary we already load, map digits to its letters. Slots into
the daily pipeline with deterministic seeding; difficulty comes free from how
many cells are revealed.

**Caveat:** it's a logic puzzle wearing letters — the dictionary does almost
no work.

### Word squares
An N×N grid where every row *and* column is a real word. Much closer to the
site's identity than Wordoku, and probably buildable on the same subset-sum +
backtracking packer behind Weave.

### Crossword
Blocked on something that isn't code: **clues**. Grid construction is
generatable; good clues need human authoring or a licensed corpus. The
generatable variant is a *fill-in* crossword (word bank, no clues), which is
a genuinely different and easier puzzle. Decide which one we actually want
before starting.

### Sudoku (traditional) — not planned
Not a word game, shares zero infrastructure, and dilutes what the site is.
Superseded by Wordoku above.

## Older ideas, still open

- Color-blind accommodations — **done** (four palettes, WCAG AA verified)
- Stats pages — **done** (lifetime stats, plus global daily numbers)
- Theme expansion for Weave via corpora or community submissions
