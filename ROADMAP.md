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

Results carry a deep link (`/daily/hive`, `/play/weave`, `/solve/boxed`,
`/learn/grid`) that opens the exact board, and a 1200×630 preview card so a
pasted link renders as something rather than a naked URL. Each deployment
stamps its own origin from `VITE_SITE_ORIGIN`. The older `?daily=hive` query
form still works and is rewritten to a path on arrival — those links are out
in shared results and in Google's OAuth console, so they don't get to break.

### ~~Personal history~~ — done
A card per game under Stats → History: Guess as a distribution plus a table
per word length, the rest as sparklines, all with streaks counted off puzzle
dates rather than kept in a counter. Reads `daily_progress`, which is the only
place a day-by-day series exists — the event log has timestamps but no puzzle
identity, and hive wrote a row per word.

### ~~Realtime instead of polling~~ — done
**Built** (August 2026): `daily_progress` joined the `supabase_realtime`
publication, and one channel per signed-in session (`src/realtimeSync.ts`)
listens to that user's rows. Exactly the doorbell described below — an event
triggers the same authenticated read and merge the poll performed, and the
payload is only ever used to say *which* board moved, never as data. The poll
survives as the fallback: ten seconds while the socket is down, a
once-a-minute sweep while it's up, because a socket can go quiet without
reporting itself down. The original analysis follows.

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

### ~~Self-serve account deletion~~ — done
Two buttons under Account, each behind its own panel: `clear_my_stats()` wipes
the play record and keeps the account, `delete_account()` removes the account
itself. Neither takes an argument — the account comes from `auth.uid()` and
only from there, because a function accepting a user id is a delete-anybody
endpoint the moment somebody edits one uuid in the network tab.

- Deleting the `auth.users` row is the whole job; all four tables cascade from
  it, so there's no list here to fall out of date when a fifth is added. It
  works because the function runs as its owner — worth re-checking after any
  project migration, though it fails loudly and rolls back if that ever stops
  being true.
- **The trap was the baseline flag, not the delete.** Clearing stats removes
  `stats_baselines`, and `importBaselineOnce` would happily put this browser's
  totals straight back — except it guards on a localStorage flag we don't
  touch, so the clear stays cleared. Deleting the account and signing up again
  *does* re-import, because that's a new user id and a new flag: correct, and
  what the "erase this browser too" tick is for.
- Local play state is the player's own copy, so deletion offers to erase it
  rather than deciding. Ticked by default, since someone deleting an account
  usually means all of it.
- **Analytics needed no deletion, and the policy now says why.** We never sent
  GA4 a user id, so Google holds a browser-scoped client id with nothing to
  tie it to an account, and their deletion API works on identifiers you
  supply. Dropping the `_ga` cookies is the honest whole of what we can do.

### Verified results — a word list in the database
**Built** (August 2026): `result_is_plausible` grew from arithmetic-only to
three layers — arithmetic always; dictionary membership at the row's
difficulty cut (55/70/80, slurs excluded) for rows dated 2026-08-10 on; and
answer verification wherever `daily_puzzles` holds the puzzle, which
superseded the hash plan below — a Guess win must end on the actual answer,
Squares must reconstruct the actual grid, Weave's finds must be actual theme
words, Hive/Box words must fit the actual board. Not security definer and
revoked from web roles, because a public function over the answers table
would be an oracle. Verified on migration day: every honest row unchanged
(leaderboard fingerprints identical), eight classes of fabrication caught.
The original analysis follows.
`result_is_plausible()` recomputes each score from the words the client says it
found. That catches a score disagreeing with its own evidence, but the database
has no dictionary, so ten invented words score exactly like ten real ones.
Every game sits in that tier — Squares, whose grid can only be checked for
shape, is no worse than the rest.

**Client-side signing can't fix it at any key length.** If the browser computes
an HMAC, the browser holds the key, and anything shipped to the browser is
public. The flaw isn't where the key is kept, it's that the key is there at
all — the same wall the display-name work hit.

So the fix is the server knowing the truth independently, as one piece of work
rather than a patch per game:

- **Our own word list, in Postgres.** The dictionaries are already normalised
  in the build; publishing them to a `words` table lets `result_is_plausible`
  check membership instead of re-adding a claimed score. Worth pricing first —
  the full list is large, and the check runs per row.
- **Answer hashes for Squares**, whose evidence is a grid rather than words.
  The pipeline writes `sha256(rows joined)` per date and size; the check hashes
  the submitted grid and compares.
- Written by the daily workflow under a service-role key held only as a CI
  secret, never in the bundle. Grants revoked from every web role: a readable
  answers table is just the answers, and a hash over a small answer space is
  guessable.

**Not urgent.** The realistic threat is one curious person with the network tab
open, and the exposure is bounded — `daily_progress` holds one row per puzzle,
so nobody can claim more solves than there are days, unlike an unbounded score.
Doing it for Squares alone would leave one trustworthy board among seven.

### Puzzles in Postgres, and difficulty instead of dictionary size
**Built** (August 2026), in three stages: the daily workflow publishes a
rolling fortnight of rows to `daily_puzzles` (RLS on, zero policies; the only
read is `daily_puzzle()`, a security-definer RPC with no date parameter and a
3:15 a.m. Eastern gate); the client reads the RPC first with the file feed as
fallback, pinned by e2e tests; and `PUZZLES_SEED_SALT` mixes into every seed,
so the public repo no longer predicts future boards. Remaining, stage four:
retire the puzzle-data branch and the legacy feed keys once the rows have
carried a quiet week. The original analysis follows.

Three things that turned out to be one thing.

**Why move the puzzle data off GitHub.** Delivery isn't the problem —
`raw.githubusercontent.com` is Fastly-fronted and answers in under 100ms.
Generation is: if Actions is down at 07:15 and 08:15 UTC there's no puzzle that
morning. Worse, the generator is a pure function of the Eastern date seeded by
`xmur3` in a public repo, so *every future day is computable today, forever* —
anyone can clone and run it with tomorrow's date. Pre-publishing a rolling
window would fix the outage problem but makes the leak explicit rather than
merely available. In a table the two goals stop fighting: rows for the next
fortnight sit there while a security-definer RPC, taking no date parameter,
serves only `date <= today ET`.

Cost, stated plainly: today a Supabase outage costs accounts and sync but the
dailies still play, because they come from somewhere else. Afterwards it costs
both. Pair it with a client-side last-good copy so an outage mid-session
doesn't blank a board already in progress.

Cheapest route is two steps. First keep Actions as the generator and have it
write to Supabase — nothing puzzle-related is public any more, and no Deno
port. Later move the schedule to `pg_cron`/Edge Functions, which removes the
credential question entirely: no service-role key in CI, because the generator
is already inside the database it writes to. That second step is what needs the
word list server-side, which is the entry above.

**Difficulty instead of dictionary size.** The current setting is backwards as
difficulty. Answers always come from `common`; the tier only widens what's
*accepted*, so choosing "full" makes Guess **easier** — more guesses are legal
and the answer is no harder. Renaming to easy/hard/extreme and generating per
difficulty makes the label mean what it says. Generation sits a notch below
validation at every level, which is the rule Squares already uses
(`genWords`=common, `valWords`=standard), generalised:

| difficulty | answers from | guesses validated against |
|---|---|---|
| easy | SCOWL 10–35 (39,137) | 10–55 |
| hard | SCOWL 10–55 (67,309) | 10–70 |
| extreme | SCOWL 10–70 (111,630) | full ∪ hard (275,458) |

`extreme` has to be the **union**, not `an-array-of-english-words` alone: 521
words in `standard` are missing from it — mostly accented forms (café, cliché,
attaché) plus `ok` — so without the union, moving *up* a difficulty starts
rejecting words that were legal below. The ladder must nest strictly.

Generating extreme answers from the raw 275k would give unguessable
obscurities; 10–70 is hard for the right reason.

**Difficulty is the obscurity lever, which removes a job.** The worry that
Squares publishes odd words doesn't need a second review pass: how obscure a
word is tracks which SCOWL size it enters at, and difficulty already selects
that. Extreme is *supposed* to reach words easy doesn't have.

What it does not need is narrower bands. An earlier draft here proposed easy =
levels 10–20 on the theory that level 35 was "where the odd words live". That
was wrong, and worth recording so it isn't re-derived: SCOWL's sizes are 35
small, 50 medium, 60 medium-large (the default spell-checking dictionary), 70
large, 80 a valid word in current usage. Level 35 is ordinary vocabulary —
aback, civic, flank, gourd, impel, nasal, pique, upend — and `adze`, the word
that prompted the theory, is level 50 and not in `common` at all.

So the three tiers above stand as written: easy is the small dictionary
(10–35), hard the medium (10–55), extreme the large (10–70). Easy has ample
depth at every length that survives the cap — 464 words at three letters, 1,065
at twelve — so the tier ladder in `fetch-puzzles.mjs` has nothing to fix.

**Guess caps at 12 — and so does everything else.** One puzzle per length per day means each length is its own
stream, and on `common` the long ones are threadbare: 82 words at 15 (under
three months before every 15-letter daily has been used), 199 at 14, 558 at 13.
Cutting at 10 rather than 12 costs ~3,000 words across lengths 11–12 and buys
nothing, because the binding constraint at either cap is length 3, not the long
end. The requirement is a cooldown, not permanent exclusion — "don't repeat
within a year" needs ≥365 words per length, which lengths 3–13 all clear.

Solving and practice stopped at twelve as well rather than only the daily: a
length the daily can't offer isn't worth a button elsewhere, and nobody plays
a fourteen-letter Guess.

**Done, and it removed the reason to widen.** Capping at 12 was going to come
with a move from `common` to `standard`, because the long lengths were
threadbare. With 13–15 gone they aren't: every remaining stream clears a
one-year cooldown on `common` alone, the thinnest being length 3 at 464 words.
So generation stays on `common` for now, and widening becomes purely a
difficulty feature rather than something the depth numbers demand.

**One `words` table for every game.** 276,854 rows — the union of everything we
might ever accept. Squares, Hive, Boxed and Scramble all ask anagram- or
subset-shaped questions, so they differ by predicate rather than by table.

```sql
create table words (
  word   text primary key,   -- 276,854 rows
  len    smallint not null,  -- derivable, but it makes the queries read plainly
  sorted text not null,      -- letters sorted: anagram and subset lookups
  level  smallint,           -- SCOWL size; null = only in the large list
  pos    text,               -- ESDB part of speech: n, v, aj, av, abbr, ...
  lemma  text                -- the headword this inflects from; null if it is one
);
```

**Store the SCOWL level, not a difficulty**, because generation and validation
use different bands — a level-60 word is generatable only at extreme but
accepted from hard, and one column can't say both:

| difficulty | generates from | accepts |
|---|---|---|
| easy | `level <= 35` | `level <= 55` |
| hard | `level <= 55` | `level <= 70` |
| extreme | `level <= 70` | everything, `null` included |

The ladder is then provably nested rather than nested by convention, changing a
band is an edit to a query rather than a re-seed, and the 1,917 words that are
in SCOWL but missing from the large list (`ok`, `cs`, `configurable`) land in
extreme automatically — which is the bug that forced `full ∪ hard` back when
this was three fixed lists.

**`pos` and `lemma` replace a heuristic with a fact.** The generator currently
skips plurals by suffix: ends in s, and the stem is also a word. Measured
against ESDB's inflection data that drops 9,558 words from the common answer
pool, of which **73 aren't inflections at all** — `brass`, `discuss`, `assess`,
`caress`, `canvass`, `buss` — each excluded because its "stem" happens to be a
word (`bras`, `discus`, `asses`, `cares`). It also can't see `oxen`, `mice` or
`geese`, which sail through as lemmas. With `lemma` the rule becomes "don't set
an inflection whose lemma is also in the pool", which is true rather than
approximate, and `pos` gives the same handle for verb forms.

Two things not to re-investigate. ESDB's mapping isn't a complete oracle —
122,098 inflected forms against 276,854 rows — so "absent from the lemma
column" can't be read as "not an inflection". And **proper nouns are not a
problem**: `wordlist-english` already excludes them (`paris`, `texas`,
`tuesday` are in no tier; the common files hold exactly four capitalised
entries, all `OK`). An earlier pass here reported abbreviations and proper
nouns in the pool; that was a parsing error, not a finding.

**Take membership and `level` from the npm packages, `pos` and `lemma` from
ESDB.** Membership has to match the client's bundles exactly or a generated
answer can fail to validate — the failure that shows up on one puzzle months
apart. And parse ESDB's database rather than `scowl-pre.txt`: POS lives on the
entry, entries are case-sensitive, and inflections appear on their lemma's
line. Regexing that file gave wrong answers twice in one sitting. Its
`postgresql/` directory exists for this.

**A blocked-words table, not a hardcoded list.** ESDB (the English Speller
Database, `en-wl/wordlist` — the upstream `wordlist-english` is built from)
marks words with usage notes: `offensive-1` (7 racial slurs), `offensive-2`
(4), `vulgar-1` (21 swear words) and `vulgar-3` (11 mild). Its own README warns
the marking "only covers the worst offenders", and the categories don't split
cleanly — `vulgar-3` sweeps in **craps**, **dickens** and **dicker**, which are
flagged for their roots, not themselves.

```sql
create table blocked_words (
  word     text primary key,
  origin   text not null,   -- 'esdb:offensive-1' | 'esdb:vulgar-1' | 'manual'
  scope    text not null,   -- 'generation' | 'both'
  added_at timestamptz not null default now(),
  note     text
);
```

`scope` carries the distinction that matters: refusing to *publish* a word as an
answer is not the same as refusing to *accept* one a player typed. Slurs and
`vulgar-1` are `both`. bugger/crap/crapper/dick/fart/piss/pisser are
`generation` only. craps/dickens/dicker aren't blocked at all. Filtering a
validation dictionary is where Scunthorpe bites, so `both` stays small and
deliberate.

Generation always subtracts the blocklist, at **every** difficulty — publishing
a slur as the answer isn't a matter of anyone's filter setting. Because every
generated solution is therefore filter-clean, a player with the filter on can
always finish any puzzle, which is why no variant pools are needed: the filter
only ever subtracts from what's accepted, never from what's required.

Two measurements worth not re-deriving: none of the flagged words are in
`common` (they all sit at level 40+), so the filter is a no-op until generation
moves to `standard` — and every currently published pool and daily is clean.

**Play mode doesn't read the dictionary setting at all**, which is worth
knowing before touching any of this. `dictionaries[mode]` is consumed in one
place — `App.tsx`, for the *solver*. Play uses hardcoded lists: Guess validates
guesses against `full`, every other game against `standard`. So no player
setting can make a puzzle unsolvable today, and this is also where the ladder
being backwards is most stark — Guess draws answers from 39k `common` while
accepting guesses from 275k `full`, the most permissive combination available,
for everyone, always.

The consequence is that a puzzle's own solution words must be exempted from
validation *as part of* the difficulty work, not before it: the exemption only
matters once play-validation varies. Guess already does it
(`current !== secret`); Squares and Weave will need it the moment their play
dictionary stops being a constant.

**What difficulty means, per game.** It isn't one thing. Four games vary by
word tier, one by what it accepts, and two by shape — because a tier is
meaningless for a dice grid and for hand-curated themes.

| game | easy | hard | extreme |
|---|---|---|---|
| Guess | answer from easy tier | hard tier | extreme tier |
| Hive | pangram base, easy tier | hard | extreme |
| Boxed | chain words, easy tier | hard | extreme |
| Scramble | rack from easy tier | hard | extreme |
| Grid | accepts easy tier | hard | extreme |
| Squares | 4×4, 8 given | 5×5, 10 given | 5×5, 6 given |
| Weave | 6×8 | 7×9 | 8×10 |

Grid earns its place despite the board being dice-generated: it scores against
the maximum achievable, so a wider dictionary moves the target.

Two sizes that looked obvious don't exist, both measured rather than assumed:

- **Squares 6×6 is not buildable.** 0/5 from the easy tier, 0/5 from hard, and
  0/3 against all 22,418 six-letter words in the large list. Order-6 double
  word squares are genuinely scarce, and the generator also rejects symmetric
  ones. So extreme keeps the 5×5 grid and takes letters away instead.
- **Weave 10×12 is not fillable.** A theme carries 69–105 letters (median 91)
  and 120 cells need 120. Only 21 of 60 themes even have a spangram long
  enough to span ten columns. 6×8, 7×9 and 8×10 all build 40/40.

**Squares' given count is also its distribution.** At today's 10 givens the
spread is uneven — of 25 puzzles, 10 had a line with 4 givens and one had all
5, which is an entire word handed over. Asking for 6 instead brings the worst
line down to 2.2 on average without needing an explicit per-line cap: the
count and the spread are the same dial. Note `target` is a floor the chooser
removes down to, not a ceiling — asking 6 yields 6–8, averaging 6.6.

**Cost to watch:** an extreme square takes ~20s to generate against 0.2s for
easy. Across three difficulties, two environments and the practice pools, that
is where the daily workflow could get slow.

**Difficulty is a dimension, not a setting.** Taking it through the dailies
means `daily_puzzles`, `daily_progress`, `game_results`, the leaderboard RPC and
its boards, streaks and share cards all carry it. A streak has to be
per-difficulty or dropping to easy for a day quietly protects one earned on
hard. Boards currently hold about one entry per game per day, so splitting them
three ways will look thin before it looks rich.

### A test suite worth having
**Built** (August 2026): `.github/workflows/ci.yml` runs five gates on every
push — typecheck, lint, unit (vitest, `tests/unit/`), the feed contract
(`tests/contract/`, which runs the real generator for a pinned date with the
NYT fetches skipped), and Playwright with axe (`e2e/`, WCAG A/AA on six
routes, every network stubbed). Squares uniqueness is re-checked in the
contract suite (August 2026) — a verified-results requirement, since a board
with a second legal fill would flag its honest solver as a fabricator. The
ear-test axe can't do was walked by hand with NVDA (August 2026): the games,
the account tabs, the invite flow and modal focus all narrate sensibly. It
found what automation couldn't — the leaderboard cards were static text in a
dialog, spoken on hover but unreachable by Tab, and now take focus. Worth
re-walking after any new surface; axe still covers only the mechanical half.

Difficulty took a day and produced roughly a dozen bugs. Every one was found
by playing the site or by a throwaway script, and several looked fine right up
until someone typed something. That's the argument: not coverage for its own
sake, but the specific shapes of thing that got through.

**What the throwaway harnesses already proved works.** Fixtures compiled with
esbuild and run under node caught the storage-gate rules, the board selector,
the difficulty resolution, and an ESDB parse that was wrong twice. They cost
minutes and they were right. The only reason they aren't a suite is that
nothing collects them — each was written for one bug and thrown away. Give
them a runner (vitest reads the existing tsconfig paths) and they become
regressions instead of anecdotes.

**What fixtures could never have caught**, and therefore what needs a rendered
component or a real request:

- Weave's grid class was `cols === 8 ? 'grid-cols-8' : 'grid-cols-6'`, so a
  7-wide board wrapped into six columns. The data was right; the CSS was not.
- Weave's validator accepted boards 6 or 8 wide, so hard was silently rejected
  and the game kept the previous board. Nothing threw.
- Squares' legacy `boards` map is keyed by size, and hard and extreme are both
  5x5 — so extreme overwrote hard and one difficulty vanished from the feed.
- Practice only drew a board when it hadn't got one, so changing difficulty
  left the old one on screen and the setting looked inert.
- Clearing that board on the *setting* change rebuilt it from the word band
  about to be replaced, so every level drew from the one below. The words
  changed, which is why it looked like it worked.

**What to assert on.** Prefer stored state and returned data over rendered
text. Two of the day's false negatives came from matching DOM strings — a
filter for buttons labelled `4` and `5` when they read `4×4` and `5×5`, and a
component that had unmounted between steps. A check that can quietly pass is
worse than no check.

**A generator contract test** is the cheapest high-value piece, because the
feed is the interface between two halves that deploy separately:

- every game has all three difficulties, and they're distinct boards
- the legacy top-level keys equal the easy board, so an old client is unaffected
- no blocked word appears anywhere, in plain text or base64
- every hive board clears its floor; every square is uniquely solvable
- guess covers exactly lengths 3–12

**A handful of end-to-end paths**, and only a handful: pick a difficulty and
see the board change, in each game; play a daily and see it recorded at that
difficulty; a board that predates difficulty still plays. Playwright against
the dev server, not against production.

**Read through the API, not the CDN.** Three times in one day a fresh publish
looked stale — `raw.githubusercontent.com` caches for 300 seconds and Render
sits behind Cloudflare with `s-maxage=300`, and `cache: 'no-store'` governs
the browser's cache, not a shared one. A test that fetches published data
should use the GitHub contents API or bust the cache deliberately.

**Where it pays off twice**: the same suite is what makes the puzzle pipeline
safe to move into Postgres, since the contract tests describe the feed rather
than the file.

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

### ~~Friends / competition~~ — done
**Built** (August 2026). The jump turned out
smaller than feared, because the crossing stayed narrow: table RLS is still
"own rows only" everywhere — the three new tables (`friendships`,
`friend_blocks`, `friend_invites`) have zero policies and revoked grants — and
the only path across is definer RPCs returning names and numbers. The
decisions, as made:

- **Invite links, not search.** A definer function mints a week-long
  multi-use code; `/friend/<code>` opens the account panel and the code is
  stashed in storage so it survives the OAuth round trip. Nobody is
  discoverable who didn't hand someone a link — a name-search endpoint would
  have been the enumeration oracle the display-name work refused to build.
- **No pending state.** Minting and sharing a link is the requester's
  consent; accepting is the other's. One unordered row per pair
  (`user_a < user_b`), which deleted the whole request state machine.
- **Display names required on both ends** — the existing opt-in, reused.
- **Blocks are unilateral and silent.** They survive unfriending, kill
  accepts in both directions, and every dead end an outsider can probe —
  missing code, expired, blocked — reads identically as 'invalid'.
- **One set of board queries.** `leaderboard()` was refactored into a shared
  `boards_for(..., p_users)` core; the friends board is the same five queries
  scoped to your circle plus yourself, so a rank means the same thing on
  either scope. The Stats → Boards view grew an Everyone/Friends toggle.
- Rate limits live in the definer functions (ten live codes, hundred
  friends); the account-deletion cascade stays list-free because every new
  table references `auth.users on delete cascade`.

Verified in SQL with fabricated JWT claims: the full invite → accept → list →
scoped-board → block → unblock → remove machine, plus revoke probes as both
web roles.

The original note follows. Everything so far is "you can only read your
own rows"; friends means mutual relationships, invitations, and RLS that lets
a friend read *some* of your results, plus blocking and removal. Build after
display names exist and after leaderboards prove the aggregate pattern.

### More themes, for taste rather than need
The four palettes exist for colour vision — default, red–green, blue–yellow,
monochrome — and the theme switch is light/dark/system. Nothing yet is there
just because someone likes it: sepia, high-contrast, a warmer dark, seasonal.

The architecture already takes them. Every colour resolves through CSS
variables keyed on `data-theme` × `data-palette`, so a new palette is a block
in `index.css` plus an entry in Settings, and no component changes at all.

**The cost isn't the colours, it's the audit.** Contrast is checked across
every theme × palette combination, and that grid is what grows: four palettes
in two themes is eight passes today, and each new one adds two. A palette
that ships unaudited is worse than no palette, because the accessible ones
imply the rest were checked too. Budget the sweep, not the CSS.

Worth separating the two axes in Settings if this happens — colour-vision
palettes and decorative ones sitting in one list invites someone to pick a
seasonal theme and lose an accommodation they needed.

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

### ~~Word squares~~ — done
An N×N grid where every row *and* column is a real word, some letters given
and the rest to fill in. `scripts/squares.mjs` generates and verifies them;
the game shipped with the difficulty work — 4×4 with 8 givens on easy, 5×5
with 10 on hard and 6 on extreme — and is wired through the pipeline, stats,
sync, share, leaderboards and Learn like the rest. Verified results check a
submitted grid against the actual answer grid, the strongest check any game
here has.

It needed none of Weave's packer — plain backtracking with prefix pruning is
enough. What the probes settled, kept so it isn't re-derived:

- **Sizes stop at five.** 4×4 solves on every seed in milliseconds, 5×5 on
  about four seeds in five. 6×6 falls off a cliff (1 in 5, and the words it
  finds are obscure).
- **Uniqueness is a check, not a goal.** Word squares are so constrained that
  a 5×5 stays mathematically unique down to *three* given letters — and no
  human deduces ten words from three letters. Difficulty comes from a target
  reveal count; uniqueness is verified at that count.
- **Which cells are shown matters as much as how many.** Building up from a
  random subset until it happens to be unique showed 13 of 16 letters on
  average. Removing from the full square instead keeps uniqueness true at
  every step, so it can stop dead on the target: 6 of 16, and 10 of 25.
- **Validate against the list the game accepts typing against.** Uniqueness
  measured against a different dictionary means something different to us
  than to the player. Using `standard` rather than `common` barely moved the
  numbers, so there's no reason to be stingy.

One check that never left the generator: uniqueness is verified at build time
only, which is the same gap the test-suite entry records.

### Cryptogram
A short passage under a substitution cipher; work out the mapping and the text
falls out. Deduction rather than vocabulary, which is a different muscle from
anything else here, and the solver practically exists already — deducing a
word from its pattern and known letters is what Guess's solver does, applied
to twenty words at once instead of one.

**The text is the whole problem.** Cryptograms are traditionally famous
quotations, and famous quotations are somebody's copyright. The site's word
lists are deliberately its own; the passages would have to be too. Options,
roughly in order of how well they'd read:

- **Public-domain sources.** Gutenberg, proverbs, older verse. Real sentences,
  no licence worry, but they need choosing — a passage nobody can parse
  undeciphered is no fun deciphered either.
- **Generated sentences** from our own word lists. Free, endless, deterministic
  per date — and almost certainly flat. A cryptogram's reward is the sentence
  meaning something at the end.

Worth prototyping the generated version first: if it doesn't read well, the
curation cost of the public-domain route is the real cost of the game.

**Probed** (August 2026), and the public-domain route is cheap, which moots
the generated-sentences prototype. Bartlett's Familiar Quotations 10th ed.
(1919, Project Gutenberg #27889) parsed to 6,840 entries;
`scripts/cryptogram-harvest.mjs` filters them to **1,642 candidates** — ASCII,
50–100 letters, every word in the shipped dictionary (which drops archaic
spellings), no proper-noun usage, enough letter repetition to give the cipher
a way in, blocklist, dedupe. The two big cuts are length (6,803→2,731) and
dictionary membership (→1,900). What remains before the pool is real: a human
skim for mid-thought verse fragments, which the filters can't judge. Sourcing
rules worth keeping: quote *collections*, not books; Gutenberg only, so
translations are old enough to be public domain themselves; Wikiquote is
CC BY-SA and never a source. Case is irrelevant in-cipher, so verse
capitalisation artifacts only matter on the reveal.

**Difficulty maps cleanly**, better than most games here: how many letters
start revealed, how long the passage is, and whether the cipher preserves word
boundaries. No second dial needed.

**It reuses more than it adds.** Deterministic per Eastern date like the rest;
`daily_progress` stores the partial mapping so a half-solved puzzle follows you
between devices; verification is exact rather than statistical, since the
server can simply compare the decoded text — the one game here where
`result_is_plausible` could be certain rather than persuaded.

**The catch:** it isn't a word game so much as a logic game about letters, and
Wordoku above carries the same caveat. Two of those and the site is something
else.

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
