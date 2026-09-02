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

The client side is a build arg, so which GoTrue route works can be settled by
rebuilding rather than by editing code:

```sh
VITE_SSO_PROVIDER=custom:zitadel        # or: keycloak
VITE_SSO_LABEL=Amherst Communications
docker compose up -d --build
```

Set it and the modal offers exactly one way in — the GitHub and Google buttons
and the magic-link form all come down. That is deliberate: leaving the email
form up leaves a second door open to anyone with an address GoTrue would mail,
which is the opposite of what a single sign-on deployment is for.

**Closing that door properly is a server-side job too.** The app hiding the
form only stops people using this page; GoTrue will still honour a magic-link
request made directly against the API. Disable its email provider as well.

### Which provider string

Both are in supabase-js's `Provider` union, so the client cannot tell them
apart and neither can be ruled out from here:

- `keycloak` — the long-standing generic-OIDC provider. Not Keycloak-specific
  despite the name; it takes an issuer URL, so it points at Zitadel.
- `custom:zitadel` — newer GoTrue's named generic-OIDC providers. Cleaner, and
  honest about what it is, if the server build has it.

Which exists is a property of the GoTrue image, so check its version rather
than assuming. The redirect URI Zitadel needs is GoTrue's callback —
`<supabase-url>/auth/v1/callback` — and the app passes `window.location.origin`
as the post-sign-in return, so that origin has to be allowed too.

### What this does not do yet

Sign-in still isn't *required*. The app renders fine with no session, so an
employee can play without signing in — they just get browser-local progress and
no leaderboard. Requiring it is a gate that does not exist yet, and it is
separate work from getting Zitadel accepted.

---

## What is still missing after Stage 4

- **Required login.** Stage 5 makes SSO the only *offered* route; it does not
  make signing in mandatory. The app still renders with no session, and that
  gate does not exist yet.
- **Rebrand.** `vite.config.ts` still falls back to the upstream origin, and
  `src/LegalDocs.tsx` still names Render as the host.
