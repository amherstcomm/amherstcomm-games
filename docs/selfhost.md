# Self-hosting on an internal VM

Written for the Amherst deployment: Docker on an internal VM, reachable by
staff over the VPN, with Supabase self-hosted beside the app rather than
supabase.com behind it.

It is staged deliberately. **Stage 1 gets the games in front of people in
minutes** with no database at all, and each stage after it turns on one more
thing. You do not have to finish the list to start.

The order matters more than it looks. Two of the steps fail *silently* if
skipped — the site comes up, the games play, and something is quietly wrong in
a way no error surfaces. Those are called out where they bite.

---

## Stage 1 — the games, no backend

The app is built to run with no Supabase at all: `src/supabase.ts` constructs
no client unless both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are
present, and every auth surface hides when there is no client.

```sh
cp .env.example .env
# set VITE_SITE_ORIGIN to the internal hostname; leave VITE_SUPABASE_* empty
docker compose up -d --build
```

That is a complete, playable site: every game, practice boards, local stats in
the browser. What it does **not** have is accounts, cross-device sync,
leaderboards, or a shared daily puzzle — all of those need Stage 2.

Good enough to pick the game lineup, show people, and settle the look.

---

## Stage 2 — Supabase

### Which services

Measured against what this app actually calls:

| Service | Needed | Why |
|---|---|---|
| `db` | **yes** | everything |
| `rest` (PostgREST) | **yes** | every `.from()` and all 17 `.rpc()` calls |
| `auth` (GoTrue) | **yes** | see below |
| `realtime` | **yes** | the doorbell on `daily_progress` |
| gateway (Envoy or Kong) | **yes** | `supabase-js` expects one URL fronting the rest |
| `studio`, `meta` | optional | admin UI |
| `supavisor` (pooler) | probably not | only if something connects by connection string — check whether Studio/meta route through it in your release |
| `storage-api`, `imgproxy` | **no** | zero Storage use; imgproxy follows storage out |
| `functions` (edge-runtime) | **no** | zero Edge Functions — every server-side operation is a Postgres `security definer` function |

**GoTrue is not optional here.** Not because of the `auth.users` foreign keys —
those come from the db init scripts and Postgres enforces them whether or not
the auth container is running — but because the client calls `supabase.auth.*`
in 15 places across 10 modules. It is not only the sign-in screen:
`getSession()` is load-bearing in `realtimeSync`, `dailySync`, `leaderboard`,
`friends`, `history` and `stats`, and three modules subscribe to
`onAuthStateChange` to re-key themselves when the session moves. Something has
to write rows into `auth.users` and mint sessions, and that is GoTrue.

The corollary for SSO: Zitadel has to arrive **as** a GoTrue session — a
provider GoTrue federates to — rather than as a token handed in beside it. If
that turns out not to be possible, the fallback is not "mint JWTs instead", it
is touching those 15 call sites. Worth establishing before committing to a
plan.

### Don't carve up the compose file

Deleting services from `docker-compose.yml` means every future update's
three-way merge conflicts on the file you hand-edited. Use `profiles:` on the
services you don't want, or name the services you do want at start time, and
leave the file pristine.

Check your release before assuming a layout: current self-hosted configs use
**Envoy** as the default gateway with Kong as an optional override, so the
gateway config you'd trim may not be `volumes/api/kong.yml`. Logflare and
Vector are no longer in the base compose either — they're an opt-in override —
so on a recent clone there is nothing to remove.

If you are on an older tag and do remove services: `studio` has a `depends_on`
for `analytics`, so deleting analytics without stripping that dependency leaves
studio never reaching healthy; and removing analytics also means removing
vector, which depends on it.

Leave `volumes/db/*.sql` alone even for services you drop. An unused
`_analytics` schema costs nothing; a partially initialised database costs a
rebuild.

### Settings that matter

- **`JWT_SECRET`** — the one to record somewhere you'll find it. `ANON_KEY` and
  `SERVICE_ROLE_KEY` are themselves JWTs signed with it, and the token-exchange
  work needs it too.
- **`PGRST_DB_SCHEMAS`** must cover where the 17 RPCs live. They are all in
  `public`, so stock config covers it — worth an eye if you change it.
- **Realtime needs `wal_level=logical`** and the `supabase_realtime`
  publication. Both are in the stock config, so the rule is: don't prune the db
  command args. The app's own schema adds `daily_progress` to that publication
  itself, guarded by an existence check, so that part is not a manual step.

### Apply the schema

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/words.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/schema.sql
```

Then point the app at it and rebuild — every `VITE_*` value is compiled into
the bundle, so editing `.env` alone changes nothing:

```sh
# VITE_SUPABASE_URL must be an address employees' browsers can resolve over
# the VPN. localhost:8000 works on the VM and for nobody else — and it is
# compiled in, so getting it wrong costs a rebuild.
docker compose up -d --build
```

---

## Stage 3 — seed the words table

**Skip this and leaderboards come back empty, with no error anywhere.**

`supabase/words.sql` is DDL only — it creates `public.words` and
`public.blocked_words` and contains no rows. The rows are built here and loaded
separately.

This is not cosmetic. `result_is_plausible()` consults `public.words` in six
places to confirm that claimed words are real, gated on `use_dict`, which is
`puzzle_date >= 2026-08-10` — so, now, always. With an empty table those
lookups find nothing, results are judged implausible, and the affected boards
return **empty rather than wrong**. It reads exactly like nobody played.

```sh
WORDS_VERSION=words-v6 node scripts/build-words.mjs   # writes bands + scripts/words.csv
```

Then load it in one transaction, so a half-truncated table can never be a
state the site sees:

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
begin;
truncate public.words;
\copy public.words (word, len, sorted, level, pos, lemma, flag, domains) from 'scripts/words.csv' with (format csv, header true, null '')
commit;
SQL
```

`.github/workflows/rebuild-words.yml` is the reference for the full version,
including the `blocked_words` reload. SCOWL is vendored in `scripts/scowl` and
`wordnet-db` is already a devDependency, so this runs with nothing extra
installed.

---

## Stage 4 — publish your own daily puzzles

**Skip this and the site serves the upstream project's puzzles, convincingly.**

`src/dailyData.ts` tries the RPC first and falls back to
`raw.githubusercontent.com/rptetzloff/anagrimoire/puzzle-data`. That fallback is
reachable from the VM, so an empty `daily_puzzles` table does not produce an
error — it produces working daily puzzles that are somebody else's. A smoke
test passes and the campaign ships the wrong content.

Re-pointing or removing that fallback is part of the rebrand. Until then,
publishing your own rows is what makes the RPC answer first.

```sh
export SUPABASE_URL=...                 # the gateway, as the VM sees it
export SUPABASE_SERVICE_ROLE_KEY=...    # server-side only, never in the app .env
export PUZZLES_SEED_SALT=...            # any long random string, then keep it
export SKIP_SOLVER_DATA=1               # skip the NYT scrape
node scripts/publish-window.mjs
```

`publish-window.mjs` walks a window of dates, calling `fetch-puzzles.mjs` then
`publish-puzzles.mjs` for each into a scratch directory. `PUZZLES_DATE` sets the
window's start; it defaults to today.

`SKIP_SOLVER_DATA=1` skips fetching Letter Boxed, Spelling Bee and Strands from
nytimes.com. Those exist to autofill the solvers, which this deployment is
dropping — and it removes a dependency on an external site being up.

**`PUZZLES_SEED_SALT` is worth keeping deliberately.** The generator is public
and the date is its only other input, so without a salt every future board is
computable by anyone with a clone. Keep the same value or previously published
dates stop reproducing.

---

## Stage 5 — sign-in through Zitadel

### `keycloak` does not reach Zitadel

Worth stating first, because it is the obvious thing to try and it fails in a
way that looks like a misconfiguration. GoTrue's Keycloak provider does **not**
do OIDC discovery — it appends fixed Keycloak paths to whatever URL you give
it:

```
AuthURL   = <GOTRUE_EXTERNAL_KEYCLOAK_URL> + /protocol/openid-connect/auth
TokenURL  = <GOTRUE_EXTERNAL_KEYCLOAK_URL> + /protocol/openid-connect/token
userinfo  = <host>                         + /protocol/openid-connect/userinfo
```

Read out of `supabase/auth`'s `internal/api/provider/keycloak.go`. Zitadel
serves `/oauth/v2/authorize`, `/oauth/v2/token` and `/oidc/v1/userinfo`, so
those requests 404.

Two ways past it:

- **SAML** — GoTrue's native SSO, which Zitadel also speaks. The supported
  route, and its attribute mapping is the natural carrier for group claims.
- **A proxy shim** — GoTrue only ever appends those three paths, so a vhost on
  the proxy you already run can rewrite them onto Zitadel's. Nothing in the app
  changes. Cheap, and it breaks silently if GoTrue ever moves those paths.

### Configuring the app

The client supports all three routes; pick one in `.env` and rebuild.

```sh
# SAML by email domain — the usual Zitadel route
VITE_SSO_SAML_DOMAIN=amherstcomm.net
# or by the provider's UUID, when no domain is mapped
VITE_SSO_SAML_PROVIDER_ID=<uuid>
# or the OAuth route, which needs the proxy shim above for Zitadel
VITE_SSO_PROVIDER=keycloak

VITE_SSO_LABEL=Amherst Communications
docker compose up -d --build
```

If more than one is set the order is provider id, then domain, then OAuth
provider — fixed, and pinned in `tests/unit/sso.test.ts` so a double
configuration picks a route rather than silently reopening the email form.

Setting any of them takes the other routes away: the GitHub and Google buttons
and the magic-link form all come down. Leaving the email form up would leave a
second door open to anyone with an address GoTrue would mail.

**Closing that door properly is a server-side job too.** The app hiding the
form only stops people using this page; GoTrue will still honour a magic-link
request made directly against the API. Disable its email provider as well.

### What Zitadel needs

- Redirect URI: `<supabase-url>/auth/v1/callback` — GoTrue's callback, not the
  app's.
- `https://games.amherstcomm.net` allowed as a return, since the app passes
  `window.location.origin`. `GOTRUE_SITE_URL` and the additional-redirect list
  have to allow it too, or the hop back after a successful sign-in is refused.

### What this does not do yet

Sign-in still isn't *required*. The app renders fine with no session, so an
employee can play without signing in — they just get browser-local progress and
no leaderboard. Requiring it is a gate that does not exist yet, and it is
separate work from getting Zitadel accepted.

---

## Stage 6 — privileges from Zitadel roles

Zitadel names three: `games.view` plays, `games.edit` sets games up and sees
winners, `games.admin` does everything. Holding one implies everything below
it, so nobody needs more than one grant.

### The roles in the token are not trustworthy

GoTrue writes SAML attributes into `raw_user_meta_data` —
`userProvidedData.Metadata = providerClaims`, in `samlacs.go` — and
`user_metadata` is writable by the user it describes:

```js
await supabase.auth.updateUser({ data: { roles: ['games.admin'] } })
```

So a policy reading `auth.jwt() -> 'user_metadata' -> 'roles'` hands admin to
anyone who opens a browser console. The source also does not clearly refresh
that metadata on repeat sign-ins, so a role revoked in Zitadel may not
propagate — it is stale as well as forgeable.

**Authorization therefore reads `public.role_grants`, never the token.** That
matches what the schema already did: `owners` is a table, `is_owner()` reads
it, and there are no `auth.jwt()` reads anywhere.

### Granting

`games.view` needs no row. Zitadel grants the application to holders of one of
the three roles, so reaching the site at all already proves it — enforced
upstream where a browser cannot reach. `has_role()` treats an
authenticated session as satisfying the floor for that reason; reading it out
of `role_grants` like the tiers above it would deny `games.play` to every
ordinary player and allow it only to admins and editors. Rows exist for the two that raise
privilege:

```sql
insert into public.role_grants (user_id, role)
values ('<auth user id>', 'games.admin');
```

By hand is right while that is a handful of people, and it is auditable. When
the set grows, sync it from Zitadel's management API with a service
credential — the point being that whatever writes the table must not be the
session the table grants privilege to.

`is_owner()` is widened rather than replaced, so `games.admin` reaches the
report queue and everything else `owners` already gated, and existing rows in
`owners` keep working.

### What each privilege unlocks is data

Hardcoding "reports are admin-only" into a gate means a schema change and a
deploy the day somebody decides editors should see them. So the mapping is
rows in `public.capabilities`, seeded with a starting map and editable through
`set_capability()`:

| capability | default | what it is |
|---|---|---|
| `games.play` | `games.view` | play, and appear on the leaderboard |
| `winners.view` | `games.edit` | see who won, across everyone |
| `games.setup` | `games.edit` | set up games, sessions and puzzle content |
| `reports.read` | `games.admin` | read the abuse report queue |
| `reports.act` | `games.admin` | dismiss, blocklist, ban |
| `users.manage` | `games.admin` | grant and revoke privileges |
| `permissions.manage` | `games.admin` | change this table |

Re-running `schema.sql` will not overwrite a decision made in the portal — the
seed is `on conflict do nothing`, so it says where a capability comes from, not
what it must stay.

Two properties worth knowing, both enforced in the database rather than in the
interface:

- **`permissions.manage` and `users.manage` cannot be set below
  `games.admin`.** One decides who may edit the rows; the other decides who
  may hand out the privileges the rows are keyed on. They are the same power
  reached from two directions — lower either and every signed-in player can
  rewrite the map or grant themselves admin. A trigger refuses both.
- **An unknown capability is denied, never allowed.** `can()` coalesces a
  missing row to false. The tempting reading — "nothing forbids it" — turns
  every unseeded capability and every typo in a gate into an open door, and a
  gate that is silently always-true is a bug nobody reports.

### If you later want roles in the JWT

The safe route is the custom access token hook
(`GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_*`), which calls a Postgres function at mint
time — so it can read `role_grants` and inject a claim the user cannot touch.
That buys freshness on refresh rather than on sign-in. Policies can read the
table directly, so it is an optimisation, not a requirement.

---

## Running a live session

Four addresses, and the difference between two of them matters:

| address | who | what |
|---|---|---|
| `/join` | anyone signed in | the way in: what is running, and a box for the code |
| `/join/<code>` | the same | the short address for a slide — resolves and goes straight in |
| `/sessions` | anyone with `games.setup` | the list, and where a new one is made |
| `/sessions/<id>` | the same | its questions — add, edit, reorder, delete |
| `/live/<id>` | everybody | what the room answers on |
| `/live/<id>/host` | the presenter | the same screen plus the controls, the count, and the answer |

**Every session gets a four-character code**, shown on the editor and on the
presenter screen. It is four characters from an alphabet with no `0`, `O`, `1`,
`I` or `L` — the characters that turn a code somebody read correctly into a code
that does not exist. It is not a secret and is not meant to be: the site is
behind SSO and the VPN, so the code saves typing rather than guarding anything.
Case, spaces and dashes are all stripped before it is looked up.

A code only resolves while its session is **live**, and a closed session
releases its code for reuse — a month of weekly trivia would otherwise burn
through four-character codes for no reason. Two joinable sessions cannot share
one; a partial unique index enforces that.

The presenter screen and the editor both show the code **and a QR of the direct
link**, drawn on the page as inline SVG rather than fetched. A QR service would
be a request off the VM for something the site can compute, on a page whose
whole point is that it works on an internal network — and a third party learning
which sessions run and when. `tests/unit/qrCode.test.ts` renders the matrix to
pixels and decodes it with jsQR, an independent implementation, because a QR
code that does not scan looks exactly like one that does and the failure happens
in a room with a projector and no way to fix it.

### Two kinds of session

Chosen when you create it, because it shapes everything else.

**With a presenter** (`live`) is what the rest of this section describes: one
clock and one screen, you open each question and the room answers it together.

**On their own time** (`open`) has nobody at the front. People join whenever,
are given the questions one at a time, and answer at their own pace. There is no
show, lock or reveal — starting it opens every question at once, and each person
is told their own answer as soon as they have given theirs, because nobody is
going to announce it. The host screen becomes a way to open it, watch how many
have played, and close it — and it shows **no question**, because everybody is
somewhere different and there is nothing one screen could show.

That is not only tidiness. `current_item` does not merely report in open mode,
it *serves*: asking what you are looking at is what puts a question in front of
you and starts your clock. So a host screen that fetched the current question
was dealing the host into their own session. It does not fetch one, and
`e2e/live.spec.ts` asserts the call is never made rather than that no question
is drawn — a screen with nothing on it looks the same either way. The host can
still play, from the player's address, which that screen links to.

**The timing still means something.** In a live session `items.opened_at` is the
start for the whole room; an open session has no such moment, so the start is
per person and recorded in `item_served` the first time a question is put in
front of somebody. Elapsed is measured from their own start, so playing at nine
in the morning and at five in the afternoon compare properly and the two modes
land on the same scoreboard measuring the same thing.

A per-question clock works the same way — from when the question reached that
person rather than from when the session opened.

### Running the room

The presenter gets **one button that says what it will do next** — "Start the
session", "Show question 2 of 6", "Close the answers", "Show the answer",
"Finish" — with the position and state on the line above it. Skip, reveal early
and finish sit underneath as secondary moves. The sequence lives in
`src/presenting.ts` and is pinned by `tests/unit/presenting.test.ts`; it decides
what to *offer*, while `advance_session` decides what is allowed, so a
disagreement produces a button that does nothing rather than a way round the
rules.

### A word game as a question

A session can carry a one-off wordle whose answer you choose — six guesses at a
3-to-8-letter word. Solving it is one point, tied on the usual speed rule. No
part marks: four of six letters is not four sixths of having got it.

**The server marks.** For every other kind the answer waits in `item_answers`
until the reveal and the client never needs it. Here the client would need it on
every guess in order to colour the tiles — so the guess goes to the server and
the colours come back. One round trip per guess, which is nothing next to how
long somebody spends deciding what to type, and it means the payload carries the
word's *length* and nothing else: there is no arrangement of what the room is
sent that contains the answer.

The word does not have to be in the dictionary. Guesses are checked against
`public.words`, but the solution is exempt, so a name or a piece of company
vocabulary works and is still accepted as a guess.

**It types like the daily board.** Letters land in the row, Backspace takes one
back, Enter sends, and `MobileKeyInput` raises the device keyboard for a thumb —
the same handling every other board on the site uses. It had a text box under
the grid for about a day: that worked, and it was a different game from the one
on the rest of the site, which is worse than a missing feature. Somebody who
plays the daily arrives with hands that already know what to do.

**It is `guess` only so far.** `GAME_PLAYABLE` in `src/authoring.ts` is the list
that moves when another game arrives, and each one needs two things: a play
function in the schema, because the server marks and so every game's rule has to
live there; and a board of its own for the room. The daily components cannot be
embedded as they stand — each one owns a store keyed by the game, so a round in
a session would write over somebody's daily progress, its streak and its stats.

### Scoring

**One point a question, ties broken by how long the correct answers took.**
That is the rule the room was promised, and it is deliberately not a
speed-weighted score of the Kahoot kind: a prize has to be explainable to the
person who did not win it. "You both got five, she was quicker" is a sentence
you can say out loud; "you got 4,180 and she got 4,240" is a curve nobody in the
room agreed to.

- A single-choice answer counts if it is one of the correct options: all or
  nothing, because there is one pick.
- **A multiple-answer question gives part marks.** Four right options means a
  quarter of a point for each one found — and **a wrong pick cancels a right one
  out**, floored at zero:

      score = max(0, (right ones picked − wrong ones picked) ÷ right ones)

  Without the subtraction the winning move is to tick every box, and the person
  who worked out which two were right and stopped would score less than the
  person who did not read the question. Six options of which four are right:
  all four and nothing else is 1; one right one alone is 0.25; three right plus
  a wrong one is 0.5; ticking all six is also 0.5. The question says so on
  screen before anyone answers, because it changes how they answer.
- "First correct" on the presenter's screen still means **fully** right. That is
  a different question from "who scored something", and it is the one worth
  announcing.
- Only **revealed** questions score. The board is gated on `winners.view` so the
  presenter can put it on the projector mid-round, and if it counted the
  question currently open, doing that would show the room who is right before
  the reveal.
- Surveys and open questions score nothing. They have no correct answer, and
  inventing one is not scoring.
- Elapsed time is `submitted_at − opened_at`, both set by the server — see the
  note on `answer_item` about why neither comes from the caller.

The presenter's screen shows **who got there first** after each reveal (the
tiebreak made visible, while the room can still check it against what they just
watched) and the standings underneath. Everyone else sees **their own score
only**: a scoreboard is a thing a room looks at together on one screen, and
putting everyone's position on everyone's phone is a different social event from
the one being run.

Names appear on the board. The anonymity promise is about what an open question
shows the room, never about who won the quiz — a prize needs a name.

### The presenter's screen is a room's screen

`/live/<id>/host` runs wide — the page's `<main>` is `max-w-3xl` for reading and
`max-w-6xl` for the two views pointed at a room, this one and the scoreboard.
The join code is set at a size that reads from the back, the QR at 192px so it
can be scanned rather than walked up to, and the game switcher is not drawn:
a row of ten word games above a trivia question is chrome, and on a projector it
is also a way out of the session in front of everybody. The footer still has
Home.

The participant's half stays narrow. It is a phone in a hand.

### Deleting a session

**Any session can be deleted, including one that has run.** An earlier version
refused — "it is a record of what the room said, close it instead" — which is a
good argument for not doing it by accident and a bad one for not being able to.

What is left of that is the confirmation. A draft goes on the first click.
Anything that has run comes back asking, and the refusal carries what would be
lost, so the question is *"Delete "Week one" for good? It has 6 questions, 42
answers, from 12 people."* rather than "are you sure?" about an unknown
quantity.

The responses go with it. That is the point rather than a side effect: half a
deleted session leaves answers to questions that no longer exist, on a
scoreboard that can no longer explain them. There is no undo.

### The scoreboard

`/scores/<id>` is the board on its own address, so the presenter's laptop can
run the room while a second screen shows the standings. Linked from the editor
and from the presenter screen, gated on `winners.view` like the standings are,
and it refreshes itself every ten seconds so a board left up finishes with the
round.

It carries **the marks behind the total**, one column per revealed question. A
prize gets handed to somebody in a room and the first question is "how" — "she
had four and you had three and a half" only settles it if the half can be
pointed at. It is also how a result gets checked afterwards. A `·` means they
did not answer that one; a `0` means they did.

### Writing a guessing question down

The unit goes where the locale puts it, via `Intl.NumberFormat` — `$41.50`, not
`41.5 dollars`, and `41,50 €` for somebody whose browser says so. Choose **money**
(with an ISO code), **a percentage**, or **something else** when authoring; the
last takes any words, and the ones `Intl` recognises (`kilogram`, `mile`,
`year`, …) get proper formatting rather than being tacked on the end. The
authoring screen previews the result with the same function that will draw it,
because guessing at the placement is the mistake this replaced.

No library: `Intl` is in the browser. `src/guessFormat.ts` is the glue, and it
degrades to a plain number rather than throwing on a code it does not know.

### The optional clock

A question can carry a countdown — set "Seconds to answer" when authoring, or
leave it empty for none. It lives in `payload.seconds` rather than a column of
its own, because the rule for payload is "what the room is shown", and a
countdown is literally on their screen.

**The window is enforced in the database.** `answer_item` refuses an answer that
arrives after `opened_at + seconds`, on the server's own clock, so a browser
whose clock is slow does not get longer than the room it is in and a second tab
is no help. The presenter's screen firing `lock` when it runs out is the visible
half of that rule, not the rule — if nobody has the presenter screen open, late
answers are still refused. `current_item` returns the server's `now` alongside
the item, so the countdown is drawn against the clock that decides whether an
answer counts rather than against the viewer's laptop.

What the clock does **not** do is reveal the answer or move to the next
question. Those stay presenter actions, because the gap after a question closes
is where somebody talks about it.

A **Join** link appears in the footer of every page while something is running,
for anyone signed in. It is fetched when the page loads and again when the tab
regains focus — which is when somebody has just been told it is starting —
rather than polled, because a session going live is a once-a-week event and
every signed-in browser asking every few seconds would be the room's traffic
spent on a list that is usually empty.

**`/live/<id>/host` shows the correct answer.** It is a separate address rather
than a mode on one page precisely so it can be checked before a projector cable
goes in. The footer link to `/sessions` appears only for accounts holding
`games.setup`, and it decides a link and nothing else — every RPC behind it
checks again, in the database.

All six kinds work:

| kind | the room does | scored |
|---|---|---|
| **multiple choice** | picks one, or several | one point, part marks on a multi-select |
| **matching** | pairs each left item with a right one | a fraction per pair got right |
| **closest guess** | types a number | one point to the closest, and only the closest |
| **ranking** | orders a list with up/down buttons | a fraction per item in the right place |
| **word game** | plays a wordle with a solution you chose | one point for solving it |
| **survey** | picks one, or several | no |
| **open question** | submits a question, optionally unnamed | no |

Two notes on the ones that could go wrong quietly:

- **Ranking and matching store their options shuffled.** The author types a
  ranking in the *correct* order, because that is how the answer gets expressed
  — so stored as typed, `payload.options` would be the answer, and
  `current_item()` sends the payload to the room. `save_item` shuffles it (and
  the right-hand column of a match) before storing, and rotates if the shuffle
  happens to land on the answer. It is done in the database rather than the
  browser because "the client remembers to shuffle" is not a property anything
  enforces, and the failure is silent and total.
- **Matching and ranking use selects and up/down buttons, not dragging.**
  Dragging is the obvious gesture and the wrong one: half the room is on a
  phone, it has no keyboard story for free, and the interaction has to work
  first time with no practice, in public, against a clock.

**"Anonymous" is anonymous to the room, not to you.** The presenter's screen and
the scoreboard show no name; an account with `users.manage` can still see who
submitted what, which is what makes prizes and follow-ups possible. The
interface says that where the box is ticked rather than promising more than the
database keeps.

**A question that has been shown cannot be edited.** Delete it and add another
instead — deleting takes its answers with it, which is honest, whereas editing
would silently change what those answers were answers to. A session that has
already run cannot be deleted at all; close it.

### If the room does not follow the presenter

This was broken and is the reason the section exists. The presenter clicked
"show", their own screen moved, and nobody else's did.

**Realtime applies row-level security to delivery.** `sessions` had RLS enabled,
`revoke all … from authenticated`, and not one policy — so there was no row the
room was allowed to be sent, and `postgres_changes` delivered nothing and
reported nothing. The publication was right, the subscription succeeded, the
client was right, and the feature was dead. `supabase/tests/doorbell.sql` pins
the two halves Realtime needs, and that `items`, `item_answers` and `responses`
did not quietly gain them along the way.

Two things follow for anyone debugging this again:

- **The room re-reads every five seconds regardless of the doorbell.** That
  partly reverses the "a doorbell, not a poll" design — deliberately. It is the
  read the whole feature rests on, and it had a single point of failure nobody
  could see. With Realtime working the update is immediate; without it the room
  is at most five seconds behind instead of stuck.
- **The screen says when the live connection is down**: *"Live updates are not
  connected — this screen is refreshing every few seconds instead."* That line
  is the diagnostic. If the room keeps up and the line is absent, Realtime is
  working. If the line appears, the websocket is not getting through to the
  Supabase gateway — check whatever terminates TLS for `VITE_SUPABASE_URL`
  forwards `Upgrade` and `Connection` headers. The app's own nginx
  (`docker/nginx.conf`) serves static files only and is not in that path.

### Applying the schema

`supabase/schema.sql` is idempotent on a database that already has it, so
re-running is the update path. This change adds a `late_join` column to
`sessions` and seven functions, all through `alter … add column if not exists`
and `create or replace`.

On a **fresh** database, run it twice. Six statements fail the first time —
`daily_progress` and `game_results` are altered above the point where they are
created, so their foreign keys to `games(progress)` have nothing to attach to
yet. The second pass is clean. This is asserted rather than remembered:

```sh
bash supabase/tests/run.sh
```

That starts a throwaway Postgres, applies the schema twice, checks the error
counts are 6 and 0, and runs the SQL tests in `supabase/tests/`. It needs Docker
and is not in CI — it is a thing to run when you change `schema.sql`, which is
the only time it can tell you anything. It earned its place on its first run by
finding that every reorder failed: a unique constraint is checked per row, not
per statement, unless it is declared deferrable.

---

## Keeping the puzzle window fresh

`daily_puzzles` holds a rolling fortnight, so it goes stale rather than
breaking loudly. Something has to re-publish it.

**Not GitHub Actions.** The database answers only on the internal network, and
a hosted runner is not on it. A self-hosted runner would work, but its entire
job would be to be inside a network the VM is already inside — and it is a
persistent agent with repository access sitting on the box that holds the
database. Cron on the VM is less machinery for the same result.

```sh
cp ops/publish.env.example ops/publish.env    # gitignored; fill it in
bash ops/publish-puzzles.sh                   # run once by hand first

sudo cp ops/amherstcomm-games-puzzles.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now amherstcomm-games-puzzles.timer
```

Edit the paths and user in the `.service` file if the checkout is not at
`/home/rtetzloff/git/amherstcomm-games`.

`Persistent=true` on the timer matters more than the hour does: the VM being
off at 03:15 would otherwise silently skip a night. Every run overwrites rather
than appends — `publish-puzzles.mjs` sends
`Prefer: resolution=merge-duplicates` — so a catch-up run repairs rather than
duplicates.

### The other workflows

All four of the remaining ones were written for a public deployment and cannot
reach this one:

| workflow | internally |
|---|---|
| `daily-puzzle-data` | superseded by the timer above |
| `rebuild-words` | run by hand; it changes rarely and deliberately |
| `report-digest` | needs the database and an external mail provider — a judgement call for an internal tool |
| `route-lastmod` | force-pushes a sitemap for a site that serves `Disallow: /` |

Leaving Actions disabled on the fork is the honest state. Workflows that can
only fail teach people to ignore failures.

---

## What is still missing after Stage 4

- **Required login.** Stage 5 makes SSO the only *offered* route; it does not
  make signing in mandatory. The app still renders with no session, and that
  gate does not exist yet.
- **Rebrand.** `vite.config.ts` still falls back to the upstream origin, and
  `src/LegalDocs.tsx` still names Render as the host.
