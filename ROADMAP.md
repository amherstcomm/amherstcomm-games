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
- Pattern's thirteen word lengths narrow to a range in the same place. Set it
  to 5–5 and the length row disappears too; the other lengths keep their
  dailies and statistics, as with any hidden game
- Practice can go on its own, pinning every game to the daily
- Help and Reveal can go while the solver stays, for someone who wants the
  solver available but not one keypress from the board they're playing
- One dictionary for every solver, instead of a pick per game; the per-solver
  picker disappears when it's set, since there'd be nothing left to choose

### ~~Onboarding~~ — done
One dismissible card above the view switch, naming the game actually on
screen. The Learn demos do the teaching; the card only points at them.

- "Show me" opens Learn and retires the card; the X retires it without
- Only where there's a Learn tab to point at, and never on Learn itself
- The flag rides the synced settings, and the pull only ever promotes it to
  true — an account that has seen the card has seen it on every device
- A stored blob means the browser has been here before, so anyone upgrading
  from a version without the flag is treated as already onboarded rather than
  greeted with "new here?"

### Self-serve account deletion — next
The privacy policy promises deletion and currently routes it through email,
which is a standing obligation on one person. Everything needed is already in
place; this is a button and an RPC.

- **One function, no argument.** `delete_account()` derives the account from
  `auth.uid()`. A version taking a user id is a delete-anybody endpoint the
  moment somebody reads the network tab.
- **One delete does it all.** `profiles`, `game_results`, `daily_progress` and
  `stats_baselines` all reference `auth.users` on delete cascade, so removing
  that row is the whole job — one place to get right rather than five.
- **Typed confirmation**, and say plainly that it can't be undone and that
  signing in again starts a fresh account. Worth splitting "clear my stats"
  from "delete my account": most people reaching for deletion want the first.
- **Analytics needs no deletion, and the policy should say why.** We never
  send GA4 a user id — `gtag('config', GA_ID)` and nothing more — so Google
  holds a browser-scoped client id and no way to tie it to an account.
  Google's deletion API works on identifiers you supply, and we record none,
  so there is no handle to delete by. Clear the `_ga` cookies on the way out
  (the Settings toggle already has that code) and let Google's retention do
  the rest. Don't imply we can reach into their data, because we can't.
- Local play state stays until the browser's site data is cleared. Say so
  rather than quietly wiping boards someone might still want.

### Admin portal — much later
Everything owner-facing is SQL-editor-only today: clearing a display name,
adding blocklist entries, reading `suspect_daily_results`. That's fine, and
the Supabase dashboard is already a competent admin portal built by people who
think about privilege escalation for a living.

**The trigger isn't volume, it's delegation** — the moment somebody who isn't
the owner needs to moderate, or moderation has to happen from a phone where
the SQL editor is miserable. Until then a second portal is new attack surface
guarding data the dashboard already reaches.

If SQL starts to chafe before that, the cheap middle is owner-only helper
functions so routine jobs are one-liners — clear a name, list names set this
week, block a pattern and clear anyone already using it. Same safety model,
most of the convenience.

**Note for whenever this happens:** admin reach is exactly where grant
defaults bite. Postgres gives `EXECUTE` on new functions to `PUBLIC`, and
Supabase grants table privileges to the web roles, so anything new needs an
explicit revoke. Two of those were missed on the leaderboard work and caught
afterwards — including a view that read straight past row-level security.

## Needs a decision first

### ~~Display names → leaderboards~~ — done
Setting a display name is the opt-in and the whole of it; without one you
don't appear. Boards are per game over today, 7 days or 30, and multi-day
windows rank on how often you played as well as how well.

Both original blockers landed differently than expected:

- **Names** are unique on the lowercased value, set through a definer function
  so length, character set, blocklist and uniqueness are checked where the
  client can't skip them. The blocklist has substring entries for slurs and
  exact entries for bulk lists — one matcher can't do both without turning
  away Scunthorpe.
- **Score integrity** didn't need the dictionary in Postgres after all.
  `daily_progress` already stores the words found, so the database recomputes
  hive, scramble and grid scores from the word list and drops any row whose
  claim disagrees with its own evidence. Forgery now needs a plausible list of
  real words rather than a number.
- The trap worth remembering: a result is a record of something that already
  happened, and state is the board as it is now. Boxed can be restarted after
  solving, so the two legitimately diverge — verifying one against the other
  flagged real solves until the result started carrying its own evidence.

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
