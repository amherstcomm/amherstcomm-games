-- Anagrimoire database schema. Run this once in the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run). Safe to re-run:
-- everything is guarded with "if not exists" or "or replace".

-- ---------------------------------------------------------------------------
-- profiles: one row per user, created automatically on signup
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

-- appearance settings (theme, palette) so they follow the account
alter table public.profiles add column if not exists settings jsonb;

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  using ((select auth.uid()) = id);

-- lets the client upsert its own profile, so settings still save if the
-- signup trigger never created the row
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill anyone the trigger missed (accounts created before it existed, or
-- while it was failing), so per-user settings have a row to live in
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Display names. Setting one is how you join the leaderboards; leaving it
-- null is the default and keeps you off them entirely. Names are the only
-- thing about an account any other player can ever see.
--
-- Unique on the lowercased name, so "Sam" and "sam" can't both be taken and
-- nobody can shadow somebody else by changing case.
-- ---------------------------------------------------------------------------
create unique index if not exists profiles_display_name_key
  on public.profiles (lower(display_name))
  where display_name is not null;

-- Names that can't be taken. Deliberately a table rather than a regex: it can
-- be added to without a deploy, and a pattern list pretending to be moderation
-- would be worse than a short honest one. Matched as a substring, case- and
-- separator-insensitive, so spacing tricks don't get around it.
--
-- Ships empty on purpose. A blocklist in a public repository is a map of what
-- to work around, so the entries belong in the database and nowhere else.
--
-- To populate it, from the SQL editor:
--
--   -- slurs: short, hand-written, blocked anywhere in a name
--   insert into public.blocked_names (pattern, match)
--   values ('...', 'substring') on conflict (pattern) do nothing;
--
--   -- general profanity: bulk, blocked only as the whole name. Paste a public
--   -- word list here; it gets normalised on the way in, and anything that
--   -- normalises to nothing is dropped.
--   insert into public.blocked_names (pattern, match)
--   select distinct public.normalise_name(w), 'exact'
--   from unnest(array['word1', 'word2', 'word3']) w
--   where public.normalise_name(w) <> ''
--   on conflict (pattern) do nothing;
--
-- Check the licence of any list you import. Loading it into your own database
-- isn't redistribution, but the repo staying clean of it is deliberate.
--
create table if not exists public.blocked_names (
  pattern text primary key,
  added_at timestamptz not null default now()
);

-- Two kinds of entry, because one size genuinely doesn't fit.
--
--   'substring' rejects a name containing it anywhere. Right for slurs, which
--               must not appear at all — and wrong for anything else, because
--               "assassin", "Cummings" and Penistone are all real, and a big
--               list matched this way rejects far more innocent names than
--               abusive ones.
--   'exact'     rejects only the whole name. Safe for bulk-importing a general
--               profanity list: it stops the name being that word without
--               ruining every name that happens to contain it.
alter table public.blocked_names
  add column if not exists match text not null default 'substring';
alter table public.blocked_names drop constraint if exists blocked_names_match_check;
alter table public.blocked_names
  add constraint blocked_names_match_check check (match in ('substring', 'exact'));

-- Names are compared in a normalised form: lowercased, stripped to letters and
-- digits, then the usual digit-for-letter swaps undone, so "s p a m", "s-p-a-m"
-- and "5pam" all match the one entry "spam". Store patterns in this same form.
create or replace function public.normalise_name(p_name text)
returns text language sql immutable as $$
  select translate(
    lower(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9]', '', 'g')),
    '013457', 'oieast'
  );
$$;

alter table public.blocked_names enable row level security;
-- no policies: nothing but the definer functions below can read it

-- ---------------------------------------------------------------------------
-- The other half of a substring blocklist: the strings that legitimately
-- contain one.
--
-- `cunt` is blocked anywhere in a name, correctly — every affixed variant of it
-- is abuse. Scunthorpe is a town of eighty thousand people. The safety check in
-- name-blocklist.mjs decides a substring pattern is safe by asking whether any
-- *dictionary* word contains it, and no dictionary word contains that one; a
-- place name does, and so do surnames no dictionary has heard of.
--
-- A fragment here is removed from the name before the patterns are matched, not
-- exempted after. That distinction is the whole design: "scunthorpe" clears to
-- nothing and passes, while "scunthorpecunt" clears to "cunt" and is still
-- refused. An exemption on the finished name would have let the second one
-- through.
--
-- Keep fragments long and specific. A short one weakens every pattern it
-- contains, and this list is the only thing here that can make the blocklist
-- *less* strict.
create table if not exists public.allowed_names (
  fragment text primary key,
  note text,
  added_at timestamptz not null default now()
);
alter table public.allowed_names enable row level security;
-- no policies, same as blocked_names: only the definer functions read it

insert into public.allowed_names (fragment, note)
values ('scunthorpe', 'town in Lincolnshire; the canonical false positive')
on conflict (fragment) do nothing;

-- One matcher, called by both the claim path and the dry run. They had the
-- same `like` twice, which is two places to forget the exception list.
create or replace function public.name_is_blocked(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  squashed text := public.normalise_name(p_name);
  frag text;
begin
  for frag in select a.fragment from public.allowed_names a loop
    squashed := replace(squashed, frag, '');
  end loop;
  return exists (
    select 1 from public.blocked_names b
    where (b.match = 'substring' and squashed like '%' || b.pattern || '%')
       or (b.match = 'exact' and squashed = b.pattern)
  );
end;
$$;

-- Claim or change a display name. A function rather than a column update so
-- the rules live in one place the client can't skip — length, character set,
-- the blocklist, and uniqueness are all checked here.
create or replace function public.set_display_name(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text;
begin
  if (select auth.uid()) is null then
    return 'not signed in';
  end if;

  cleaned := trim(coalesce(p_name, ''));

  -- clearing it is always allowed, and takes you off the boards
  if cleaned = '' then
    update public.profiles set display_name = null where id = (select auth.uid());
    return 'ok';
  end if;

  if char_length(cleaned) < 2 or char_length(cleaned) > 24 then
    return 'length';
  end if;

  -- letters, digits, and single inner spaces, hyphens or underscores
  if cleaned !~ '^[A-Za-z0-9]([A-Za-z0-9 _-]*[A-Za-z0-9])?$' then
    return 'characters';
  end if;

  if public.name_is_blocked(cleaned) then
    return 'blocked';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(display_name) = lower(cleaned) and id <> (select auth.uid())
  ) then
    return 'taken';
  end if;

  update public.profiles set display_name = cleaned where id = (select auth.uid());
  if not found then
    insert into public.profiles (id, display_name) values ((select auth.uid()), cleaned);
  end if;
  return 'ok';
exception
  when unique_violation then
    return 'taken';
end;
$$;

-- revoke first: the PUBLIC default would otherwise leave this callable by
-- signed-out visitors. It only ever returns 'not signed in' to them, but a
-- write function reachable by anon is not a thing to leave lying around.
revoke execute on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;

-- Try a name against the list without claiming it. No grant, so it's yours
-- alone through the SQL editor — for checking a new entry doesn't take
-- ordinary names down with it:
--
--   select n, public.would_block(n) from unnest(array['Sam','Scunthorpe']) n;
create or replace function public.would_block(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.name_is_blocked(p_name);
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC, and PostgREST exposes
-- anything in this schema that a web role can execute. Left alone, this one
-- would let anybody map the blocklist a guess at a time — which is the exact
-- thing keeping the list out of the repo was for.
revoke execute on function public.would_block(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The games, named once
-- ---------------------------------------------------------------------------
-- The same ten names were written out four times — daily_progress,
-- game_results, and two alter-table constraints — with nothing checking those
-- four agreed with each other, let alone with the client. They agree today
-- because somebody was careful five times running. This is the layer where no
-- compiler will ever help, so it needs a row per game instead.
--
-- A game has four names and they are all load-bearing:
--
--   mode      what the browser's storage is keyed on. Historical: 'pattern'.
--   slug      what the address bar says, because a link is read before it is
--             clicked: 'guess'.
--   feed      what the published files and daily_puzzles call it: 'words'.
--   progress  what daily_progress and game_results call it: 'guess'.
--   name      what a person is shown: 'Guess the Word', and 'Guess' where a
--             row has to fit. Presentation, mostly — but the report digest is
--             server-side output read by a human, and it printed 'words'.
--
-- `feed` and `progress` differ on exactly one game, which is a real
-- inconsistency rather than a typo: the published board is 'words' and the row
-- saying you played it is 'guess'. Both are consistent within themselves and
-- neither was written down anywhere. Unifying them means rewriting rows in two
-- tables and is a separate decision; naming them both costs nothing and stops
-- the next reader guessing.
--
-- Mirrors src/games.ts, which is the client's copy of the same table. Nothing
-- enforces that the two agree — they are on opposite sides of a network — so
-- `games_match_client` below is the check, run by CI rather than by hope.
create table if not exists public.games (
  mode text primary key,
  slug text not null unique,
  feed text not null unique,
  progress text not null unique,
  -- What to call it in front of someone. The client has these too and does the
  -- rendering; they are here because the digest email names games and had only
  -- the feed name to hand, so a report about Guess read "words".
  name_full text not null,
  name_short text not null,
  -- display order, so a client that wants the canonical order can ask
  ordinal int not null unique
);

-- Idempotent: re-running the schema updates the row rather than failing, and a
-- game removed from this list is *not* deleted — dropping a game with rows in
-- daily_progress would take somebody's history with it, and that should be a
-- deliberate act rather than a side effect of editing an insert.
insert into public.games (mode, slug, feed, progress, name_full, name_short, ordinal) values
  ('pattern',    'guess',      'words',      'guess',      'Guess the Word', 'Guess',       1),
  ('descramble', 'scramble',   'scramble',   'scramble',   'Scramble',       'Scramble',    2),
  ('bee',        'hive',       'hive',       'hive',       'Hive',           'Hive',        3),
  ('boxed',      'boxed',      'box',        'box',        'Boxed',          'Boxed',       4),
  ('grid',       'grid',       'grid',       'grid',       'Grid',           'Grid',        5),
  ('weave',      'weave',      'weave',      'weave',      'Weave',          'Weave',       6),
  ('squares',    'squares',    'squares',    'squares',    'Word Squares',   'Squares',     7),
  ('cryptogram', 'cryptogram', 'cryptogram', 'cryptogram', 'Cryptogram',     'Cryptogram',  8),
  ('ladder',     'ladder',     'ladder',     'ladder',     'Word Ladder',    'Ladder',      9),
  ('bridge',     'bridge',     'bridge',     'bridge',     'Bridge',         'Bridge',     10)
on conflict (mode) do update
  set slug = excluded.slug,
      feed = excluded.feed,
      progress = excluded.progress,
      name_full = excluded.name_full,
      name_short = excluded.name_short,
      ordinal = excluded.ordinal;

alter table public.games enable row level security;

-- Reference data, and readable: the client already ships its own copy, so this
-- is not a secret — but nothing needs it at runtime either, and a table the
-- browser can read is a table whose shape becomes a promise. Kept closed until
-- something actually asks.
revoke all on public.games from public, anon, authenticated;

-- The four hand-copied lists become one reference.
--
-- A foreign key rather than a shared CHECK or a domain, because a domain would
-- still be a list of literals — better than four, and still something to edit
-- in a place separate from where games are defined. This way adding a game is
-- adding a row, and a typo in a game name fails on insert instead of years
-- later when somebody notices a leaderboard is missing.
--
-- These run after the seed above, so the existing rows already satisfy them.
-- If one does not, the constraint fails loudly here rather than admitting a
-- name nothing else recognises.
alter table public.daily_progress drop constraint if exists daily_progress_game_check;
alter table public.daily_progress drop constraint if exists daily_progress_game_fkey;
alter table public.daily_progress
  add constraint daily_progress_game_fkey
  foreign key (game) references public.games (progress);

alter table public.game_results drop constraint if exists game_results_game_check;
alter table public.game_results drop constraint if exists game_results_game_fkey;
alter table public.game_results
  add constraint game_results_game_fkey
  foreign key (game) references public.games (progress);

-- daily_puzzles is deliberately left unconstrained. Its `game` column holds the
-- practice pools too — 'weave-pool', 'ladder-pool' — which are not games and
-- have no row here. Constraining it would mean either inventing rows for things
-- that are not games or splitting the column, and neither is worth it for a
-- table only the service role writes.

-- What CI asks, so the client's copy and this one cannot drift apart unnoticed.
-- Returns the rows that disagree; an empty result is the passing case.
create or replace function public.games_match_client(p_games jsonb)
returns table (mode text, field text, here text, client text)
language sql
stable
as $fn$
  with client as (
    select
      x->>'mode' as mode,
      x->>'slug' as slug,
      x->>'feed' as feed,
      x->>'progress' as progress,
      x->>'name_full' as name_full,
      x->>'name_short' as name_short
    from jsonb_array_elements(p_games) x
  )
  select coalesce(g.mode, c.mode), 'slug', g.slug, c.slug
    from public.games g full join client c on c.mode = g.mode
    where g.slug is distinct from c.slug
  union all
  select coalesce(g.mode, c.mode), 'feed', g.feed, c.feed
    from public.games g full join client c on c.mode = g.mode
    where g.feed is distinct from c.feed
  union all
  select coalesce(g.mode, c.mode), 'progress', g.progress, c.progress
    from public.games g full join client c on c.mode = g.mode
    where g.progress is distinct from c.progress
  union all
  select coalesce(g.mode, c.mode), 'name_full', g.name_full, c.name_full
    from public.games g full join client c on c.mode = g.mode
    where g.name_full is distinct from c.name_full
  union all
  select coalesce(g.mode, c.mode), 'name_short', g.name_short, c.name_short
    from public.games g full join client c on c.mode = g.mode
    where g.name_short is distinct from c.name_short
$fn$;

revoke all on function public.games_match_client(jsonb) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- game_results: append-only log of completed games. Aggregates (lifetime
-- stats, leaderboards, "X% solved today") all derive from this.
-- ---------------------------------------------------------------------------
create table if not exists public.game_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- constrained by a foreign key to public.games, added below: one row per
  -- game rather than this list written out four times
  game text not null,
  daily boolean not null,
  puzzle_date date, -- Eastern-time date of the daily puzzle; null for practice
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Which difficulty this result was played at. Defaulted to 'easy' because
-- every result that predates difficulty was drawn from the common tier, which
-- is what easy now means — so the default is a statement of fact, not a guess.
alter table public.game_results
  add column if not exists difficulty text not null default 'easy';
alter table public.game_results drop constraint if exists game_results_difficulty_check;
alter table public.game_results
  add constraint game_results_difficulty_check
  check (difficulty in ('easy', 'hard', 'extreme'));

create index if not exists game_results_user_idx
  on public.game_results (user_id, game, created_at desc);
create index if not exists game_results_daily_idx
  on public.game_results (game, puzzle_date)
  where daily;

alter table public.game_results enable row level security;

drop policy if exists "insert own results" on public.game_results;
create policy "insert own results"
  on public.game_results for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "read own results" on public.game_results;
create policy "read own results"
  on public.game_results for select
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- daily_progress: one row per player per daily puzzle. A daily is one board
-- with one outcome, so it wants state, not events — an append-only log lets
-- the same puzzle be played twice on two devices and counted twice, and for
-- hive (which logs a row per word found) no uniqueness rule could fix that
-- without storing the word.
--
-- The primary key does the work: a second device upserts the same row.
-- `state` carries the board so a half-finished puzzle can follow you between
-- devices; `result` carries the summary that statistics are computed from.
-- `variant` separates boards that share a game and a date — today's 5-letter
-- and 6-letter Guess are different puzzles.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- constrained by a foreign key to public.games, added below: one row per
  -- game rather than this list written out four times
  game text not null,
  variant text not null default '',
  puzzle_date date not null,
  env text not null default 'prod',
  state jsonb not null default '{}'::jsonb,
  completed boolean not null default false,
  result jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, game, variant, puzzle_date, env)
);

-- Difficulty separates boards the same way `variant` does: the easy and hard
-- Guess for a given day are different puzzles with different answers, and a
-- player may do both. So it belongs in the key, not beside it.
--
-- Existing rows default to 'easy', which is true rather than convenient —
-- every daily generated before this was drawn from the common tier.
alter table public.daily_progress
  add column if not exists difficulty text not null default 'easy';
alter table public.daily_progress drop constraint if exists daily_progress_difficulty_check;
alter table public.daily_progress
  add constraint daily_progress_difficulty_check
  check (difficulty in ('easy', 'hard', 'extreme'));

-- Widen the key. Safe to re-run, and safe on existing data: every row has the
-- same difficulty, so no two rows can collide as the column joins the key.
alter table public.daily_progress drop constraint if exists daily_progress_pkey;
alter table public.daily_progress
  add constraint daily_progress_pkey
  primary key (user_id, game, variant, difficulty, puzzle_date, env);

create index if not exists daily_progress_lookup_idx
  on public.daily_progress (game, puzzle_date, env)
  where completed;
-- The boards read one difficulty at a time.
create index if not exists daily_progress_board_idx
  on public.daily_progress (game, difficulty, puzzle_date, env)
  where completed;

alter table public.daily_progress enable row level security;

drop policy if exists "read own progress" on public.daily_progress;
create policy "read own progress"
  on public.daily_progress for select
  using ((select auth.uid()) = user_id);

drop policy if exists "insert own progress" on public.daily_progress;
create policy "insert own progress"
  on public.daily_progress for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "update own progress" on public.daily_progress;
create policy "update own progress"
  on public.daily_progress for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Realtime. The client subscribes to its own rows and treats each event as a
-- doorbell — the payload is never merged, it just triggers the same
-- authenticated read the poll performs, so there is one set of merge rules.
-- RLS applies to realtime delivery, so a subscription can only ever be sent
-- this user's rows; the client-side user_id filter is an efficiency on top.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_progress'
  ) then
    alter publication supabase_realtime add table public.daily_progress;
  end if;
end $$;

-- Fold the daily rows already in game_results into the new table, so nobody
-- loses the days they played before the cutover. Hive is the one that needs
-- collapsing: its many per-word rows become a single summary. Everything else
-- already wrote one row per finished board, so its payload is the summary.
insert into public.daily_progress (user_id, game, variant, puzzle_date, env, state, completed, result, updated_at)
select
  user_id,
  game,
  case when game = 'guess' then coalesce(payload->>'length', '') else '' end as variant,
  puzzle_date,
  coalesce(payload->>'env', 'prod') as env,
  '{}'::jsonb,
  true,
  case
    when game = 'hive' then jsonb_build_object(
      'words', count(*),
      'pangrams', count(*) filter (where (payload->>'pangram')::boolean),
      'score', coalesce(max((payload->>'score')::numeric), 0),
      'genius', coalesce(bool_or((payload->>'genius')::boolean), false),
      'queenBee', coalesce(bool_or((payload->>'queenBee')::boolean), false)
    )
    else (array_agg(payload order by id desc))[1] - 'env'
  end,
  max(created_at)
from public.game_results
where daily and puzzle_date is not null
group by
  user_id,
  game,
  case when game = 'guess' then coalesce(payload->>'length', '') else '' end,
  puzzle_date,
  coalesce(payload->>'env', 'prod')
on conflict (user_id, game, variant, difficulty, puzzle_date, env) do nothing;

-- ---------------------------------------------------------------------------
-- daily_stats: cross-player aggregates for one day's daily puzzle. Security
-- definer so it can read past RLS, but it exposes ONLY aggregates — never
-- rows. Callable by everyone: signed-out visitors can see the numbers,
-- while only signed-in players contribute to them. p_env separates the two
-- sites' independently generated daily sets ('prod' / 'dev'), which share
-- dates but not puzzles.
-- ---------------------------------------------------------------------------
drop function if exists public.daily_stats(text, date);

-- Adding p_difficulty changes the signature, and `create or replace function`
-- would leave the old three-argument version behind as an overload rather than
-- replacing it. PostgREST then has two candidates for the same call and
-- refuses to pick, which breaks the live site. Drop it by its exact signature
-- first. Harmless before the column exists, and harmless on a re-run.
drop function if exists public.daily_stats(text, date, text);

create or replace function public.daily_stats(
  p_game text,
  p_date date,
  p_env text default 'prod',
  p_difficulty text default 'easy'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  out_json jsonb;
begin
  -- One completed row per player per board, so these are plain aggregates —
  -- no per-user collapsing step, and a player who opened the puzzle on three
  -- devices still counts once.
  if p_game = 'guess' then
    select jsonb_build_object(
      'players', count(distinct user_id),
      'boards', count(*),
      'winRate', round(100.0 * count(*) filter (where (dp.result->>'won')::boolean) / greatest(count(*), 1)),
      'avgGuesses', round(avg((dp.result->>'guesses')::numeric) filter (where (dp.result->>'won')::boolean), 1)
    ) into out_json
    from public.daily_progress dp
    where game = 'guess' and completed and puzzle_date = p_date and env = p_env and difficulty = p_difficulty;

  elsif p_game = 'hive' then
    select jsonb_build_object(
      'players', count(*),
      'avgScore', round(avg((dp.result->>'score')::numeric)),
      'genius', count(*) filter (where (dp.result->>'genius')::boolean),
      'queenBee', count(*) filter (where (dp.result->>'queenBee')::boolean)
    ) into out_json
    from public.daily_progress dp
    where game = 'hive' and completed and puzzle_date = p_date and env = p_env and difficulty = p_difficulty;

  elsif p_game in ('scramble', 'grid') then
    select jsonb_build_object(
      'players', count(distinct user_id),
      'avgScore', round(avg((dp.result->>'score')::numeric)),
      'topScore', max((dp.result->>'score')::numeric)
    ) into out_json
    from public.daily_progress dp
    where game = p_game and completed and puzzle_date = p_date and env = p_env and difficulty = p_difficulty;

  elsif p_game = 'box' then
    select jsonb_build_object(
      'players', count(distinct user_id),
      'avgWords', round(avg((dp.result->>'words')::numeric), 1),
      'fewestWords', min((dp.result->>'words')::int)
    ) into out_json
    from public.daily_progress dp
    where game = 'box' and completed and puzzle_date = p_date and env = p_env and difficulty = p_difficulty;

  elsif p_game = 'weave' then
    select jsonb_build_object(
      'players', count(*),
      'solvedPct', round(100.0 * count(*) filter (where (dp.result->>'solved')::boolean) / greatest(count(*), 1)),
      'avgTimeMs', round(avg((dp.result->>'timeMs')::numeric) filter (where (dp.result->>'solved')::boolean)),
      'avgHints', round(avg((dp.result->>'hints')::numeric), 1)
    ) into out_json
    from public.daily_progress dp
    where game = 'weave' and completed and puzzle_date = p_date and env = p_env and difficulty = p_difficulty;

  else
    return null;
  end if;

  return coalesce(out_json, '{}'::jsonb);
end;
$$;

-- signature must match the function above: grant has no IF EXISTS, so a
-- stale one fails the whole script after the drop/create has swapped it
grant execute on function public.daily_stats(text, date, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scoring, recomputed server-side.
--
-- Every score reaches us from a browser and could be anything. Signing it
-- wouldn't help — whatever key ships in the bundle belongs to the player. What
-- does help is not trusting the number: daily_progress already stores the
-- words that were found, and these functions work out what the score should
-- have been. A row whose reported score disagrees with its own word list is
-- dropped from the boards.
--
-- It doesn't make forgery impossible; it makes it require a plausible list of
-- real words, which is most of the way to having played.
-- ---------------------------------------------------------------------------
-- regexp_split_to_table rather than string_to_array: an empty delimiter there
-- returns the whole word as one element instead of splitting it
create or replace function public.distinct_letters(w text)
returns int language sql immutable as $$
  select count(distinct c)::int from regexp_split_to_table(w, '') c;
$$;

create or replace function public.hive_score(words text[])
returns numeric language sql immutable as $$
  select coalesce(sum(
    (case when char_length(w) = 4 then 1 else char_length(w) end)
    + (case when public.distinct_letters(w) = 7 then 7 else 0 end)
  ), 0)
  from unnest(coalesce(words, '{}')) w;
$$;

create or replace function public.scramble_score(words text[], rack_size int)
returns numeric language sql immutable as $$
  select coalesce(sum(
    (case when char_length(w) = 3 then 1 else char_length(w) end)
    + (case when char_length(w) = rack_size then 7 else 0 end)
  ), 0)
  from unnest(coalesce(words, '{}')) w;
$$;

create or replace function public.grid_score(words text[])
returns numeric language sql immutable as $$
  select coalesce(sum(case
    when char_length(w) <= 4 then 1
    when char_length(w) = 5 then 2
    when char_length(w) = 6 then 3
    when char_length(w) = 7 then 5
    else 11 end), 0)
  from unnest(coalesce(words, '{}')) w;
$$;

-- Where the board was stored we check the numbers against it. Where it wasn't
-- — rows folded in from the old event log carry no state — we fall back to
-- bounds, because punishing a result for predating the feature would be worse
-- than the forgery it prevents.
-- ---------------------------------------------------------------------------
-- result_is_plausible: does the evidence support the claim?
--
-- Three layers, each engaging only when its ground truth exists:
--   1. Arithmetic (always): the score must equal what the claimed words are
--      worth, counts must match, times must be humanly possible.
--   2. Dictionary (rows dated 2026-08-10 on): every claimed word must exist
--      in `words` at the row's difficulty cut (55/70/80) and not be a slur.
--      Older rows were validated under a different acceptance era and are
--      grandfathered rather than retried under laws passed since.
--   3. Answers (whenever daily_puzzles holds the row's puzzle): a Guess win
--      must end on the actual answer, Squares must reconstruct the actual
--      grid, Weave's finds must be actual theme words, Hive's words must be
--      spellable from the actual seven letters, Box's chain must fit the
--      actual sides. A missing or malformed puzzle row skips this layer —
--      a bad puzzle byte must not zero every board.
--
-- Not security definer, and not executable by web roles: with the answers
-- table behind it, a public function would be an oracle ("is X today's
-- word?"). It runs only inside the security-definer aggregates and the
-- owner's view.
create or replace function public.result_is_plausible(
  p_game text,
  p_state jsonb,
  p_result jsonb,
  p_difficulty text default 'easy',
  p_variant text default '',
  p_date date default null,
  p_env text default 'prod'
)
returns boolean language plpgsql stable as $$
declare
  cut int := case p_difficulty when 'easy' then 55 when 'hard' then 70 else 80 end;
  dict_since constant date := date '2026-08-10';
  use_dict boolean := p_date is not null and p_date >= dict_since;
  board jsonb; -- this puzzle at this difficulty, when the table has it
  claimed text[];
  answer_words text[];
  bad boolean;
  expected numeric;
  s text;
  n int;
  i int;
  has_state boolean := p_state is not null and p_state <> '{}'::jsonb;
begin
  if p_result is null then return false; end if;

  -- the puzzle itself, if we hold it (guess publishes under 'words')
  begin
    select dp.payload -> 'byDifficulty' -> p_difficulty into board
    from public.daily_puzzles dp
    where dp.game = case when p_game = 'guess' then 'words' else p_game end
      and dp.env = p_env and dp.puzzle_date = p_date;
  exception when others then board := null;
  end;

  if p_game = 'squares' then
    if coalesce((p_result->>'size')::int, 0) not in (4, 5) then return false; end if;
    -- a reveal is a legitimate result; it just isn't a solve
    if coalesce((p_result->>'solved')::boolean, false) is not true then return true; end if;
    -- nobody fills a grid this size in under five seconds
    if coalesce((p_result->>'timeMs')::numeric, 0) < 5000 then return false; end if;
    if has_state and p_state ? 'entries' then
      if jsonb_array_length(p_state->'entries')
         <> (p_result->>'size')::int * (p_result->>'size')::int then
        return false;
      end if;
      -- a claimed solve must be the actual solution: given cells from the
      -- puzzle, typed cells from the player, together spelling the answer
      if board is not null and (board->>'size')::int = (p_result->>'size')::int then
        begin
          s := ''; -- the answer, flattened
          select string_agg(r, '' order by ord) into s
          from jsonb_array_elements_text(
            convert_from(decode(board->>'answer', 'base64'), 'UTF8')::jsonb->'rows'
          ) with ordinality as t(r, ord);
          n := (p_result->>'size')::int;
          for i in 0 .. (n * n - 1) loop
            if coalesce(board->'cells'->>i, p_state->'entries'->>i, '')
               is distinct from substr(s, i + 1, 1) then
              return false;
            end if;
          end loop;
        exception when others then null; -- malformed puzzle row: skip layer 3
        end;
      end if;
    end if;
    return true;

  elsif p_game = 'guess' then
    if (p_result->>'guesses')::int not between 1 and 6 then return false; end if;
    -- nobody reads, thinks and types a word in under two seconds
    if coalesce((p_result->>'timeMs')::numeric, 0) < 2000 then return false; end if;
    if has_state and p_state ? 'guesses' then
      if jsonb_array_length(p_state->'guesses') <> (p_result->>'guesses')::int then
        return false;
      end if;
      claimed := array(select jsonb_array_elements_text(p_state->'guesses'));
      -- every guess is a word we accept at this difficulty
      if use_dict then
        select bool_or(
          g !~ '^[a-z]+$'
          or not exists (
            select 1 from public.words w
            where w.word = g and w.level <= cut and w.flag is distinct from 'slur'
          )
        ) into bad from unnest(claimed) g;
        if coalesce(bad, false) then return false; end if;
      end if;
      -- a win ends on the actual answer
      if board is not null and coalesce((p_result->>'won')::boolean, false) then
        begin
          s := lower(convert_from(decode(board->'words'->>p_variant, 'base64'), 'UTF8'));
          if s is not null and claimed[array_length(claimed, 1)] is distinct from s then
            return false;
          end if;
        exception when others then null;
        end;
      end if;
    end if;
    return true;

  elsif p_game in ('hive', 'scramble', 'grid') then
    if not has_state or not (p_state ? 'found') then
      return coalesce((p_result->>'score')::numeric, -1) >= 0;
    end if;
    claimed := array(select jsonb_array_elements_text(p_state->'found'));
    if (p_result->>'words')::int is distinct from coalesce(array_length(claimed, 1), 0) then
      return false;
    end if;
    -- assigned first because plpgsql reads an IF condition up to the first
    -- THEN, and a CASE expression carries THENs of its own
    expected := case p_game
      when 'hive' then public.hive_score(claimed)
      when 'scramble' then public.scramble_score(claimed, 7)
      else public.grid_score(claimed)
    end;
    if (p_result->>'score')::numeric <> expected then
      return false;
    end if;
    if use_dict and claimed is not null then
      select bool_or(
        f !~ '^[a-z]+$'
        or not exists (
          select 1 from public.words w
          where w.word = f and w.level <= cut and w.flag is distinct from 'slur'
        )
      ) into bad from unnest(claimed) f;
      if coalesce(bad, false) then return false; end if;
    end if;
    -- the words must also be playable on the actual board
    if board is not null and claimed is not null then
      begin
        if p_game = 'hive' then
          s := regexp_replace(
            (board->>'center') || (select string_agg(o, '') from jsonb_array_elements_text(board->'outers') o),
            '[^a-z]', '', 'g');
          select bool_or(
            char_length(f) < 4
            or f !~ ('^[' || s || ']+$')
            or position((board->>'center') in f) = 0
          ) into bad from unnest(claimed) f;
        elsif p_game = 'scramble' then
          s := regexp_replace(
            (select string_agg(l, '') from jsonb_array_elements_text(board->'letters') l),
            '[^a-z]', '', 'g');
          select bool_or(
            char_length(f) < 3 or char_length(f) > 7 or f !~ ('^[' || s || ']+$')
          ) into bad from unnest(claimed) f;
        else
          s := regexp_replace(
            (select string_agg(c, '') from jsonb_array_elements_text(board->'cells') c),
            '[^a-z]', '', 'g');
          select bool_or(
            char_length(f) < 3 or f !~ ('^[' || s || ']+$')
          ) into bad from unnest(claimed) f;
        end if;
        if coalesce(bad, false) then return false; end if;
      exception when others then null;
      end;
    end if;
    return true;

  elsif p_game = 'box' then
    if coalesce((p_result->>'timeMs')::numeric, 0) > 0
       and (p_result->>'timeMs')::numeric < 3000 then
      return false;
    end if;
    if p_result ? 'chain' then
      claimed := array(select jsonb_array_elements_text(p_result->'chain'));
    elsif has_state and jsonb_array_length(coalesce(p_state->'chain', '[]'::jsonb)) > 0 then
      claimed := array(select jsonb_array_elements_text(p_state->'chain'));
    else
      return (p_result->>'words')::int >= 1;
    end if;
    if (p_result->>'words')::int <> coalesce(array_length(claimed, 1), 0) then
      return false;
    end if;
    -- each word starts where the last one ended
    if array_length(claimed, 1) > 1 then
      for i in 2 .. array_length(claimed, 1) loop
        if left(claimed[i], 1) <> right(claimed[i - 1], 1) then return false; end if;
      end loop;
    end if;
    if use_dict then
      select bool_or(
        c !~ '^[a-z]+$'
        or not exists (
          select 1 from public.words w
          where w.word = c and w.level <= cut and w.flag is distinct from 'slur'
        )
      ) into bad from unnest(claimed) c;
      if coalesce(bad, false) then return false; end if;
    end if;
    if board is not null then
      begin
        s := regexp_replace(
          (select string_agg(sd, '') from jsonb_array_elements_text(board->'sides') sd),
          '[^a-z]', '', 'g');
        select bool_or(char_length(c) < 3 or c !~ ('^[' || s || ']+$'))
          into bad from unnest(claimed) c;
        if coalesce(bad, false) then return false; end if;
      exception when others then null;
      end;
    end if;
    return true;

  elsif p_game = 'weave' then
    -- a whole board traced by hand takes longer than this
    if (p_result->>'solved')::boolean and coalesce((p_result->>'timeMs')::numeric, 0) < 10000 then
      return false;
    end if;
    -- found words must be the puzzle's actual theme words
    if board is not null and has_state and p_state ? 'found' then
      begin
        claimed := array(select jsonb_array_elements_text(p_state->'found'));
        select array_agg(w) into answer_words
        from (
          select convert_from(decode(board->>'answers', 'base64'), 'UTF8')::jsonb
                 #>> '{spangram,w}' as w
          union all
          select jsonb_array_elements(
                   convert_from(decode(board->>'answers', 'base64'), 'UTF8')::jsonb->'words'
                 ) ->> 'w'
        ) t;
        if claimed is not null and answer_words is not null then
          select bool_or(not (f = any (answer_words))) into bad from unnest(claimed) f;
          if coalesce(bad, false) then return false; end if;
        end if;
      exception when others then null;
      end;
    end if;
    return true;

  elsif p_game = 'cryptogram' then
    -- a reveal is a legitimate result; it just isn't a solve
    if coalesce((p_result->>'solved')::boolean, false) is not true then return true; end if;
    -- nobody works out a substitution in under fifteen seconds
    if coalesce((p_result->>'timeMs')::numeric, 0) < 15000 then return false; end if;
    -- The one game here that can be checked rather than judged: apply the
    -- claimed mapping to the puzzle's own tokens and see whether the passage
    -- comes out. Exact, not persuasive — the server holds the answer and the
    -- cipher is a function, so there is nothing to estimate.
    --
    -- Compared letters-only on both sides. The board's punctuation is ours
    -- rather than the player's, and a grouped board has none at all, so
    -- position-by-position comparison would only be checking our own work.
    if board is not null and has_state and p_state ? 'mapping' then
      begin
        select string_agg(
                 -- reveals are ours, so a client that "forgot" them can't
                 -- dodge the check by leaving those tokens out of its mapping
                 coalesce(board->'reveals'->>tok, p_state->'mapping'->>tok, ' '),
                 '' order by ord)
          into s
        from jsonb_array_elements_text(board->'tokens') with ordinality as t(tok, ord)
        -- only the cipher's own marks decode; the rest is the passage's
        -- punctuation, which carries no claim
        where board->'alphabet' ? tok;

        if lower(regexp_replace(coalesce(s, ''), '[^a-zA-Z]', '', 'g')) is distinct from
           lower(regexp_replace(
             convert_from(decode(board->>'answer', 'base64'), 'UTF8')::jsonb->>'text',
             '[^a-zA-Z]', '', 'g'
           )) then
          return false;
        end if;
      exception when others then null;
      end;
    end if;
    return true;

  elsif p_game = 'ladder' then
    -- The only game here that can be marked without holding an answer. A
    -- ladder is a rule, not a solution: every rung a real word, each one
    -- letter from the last, ending where it should. So this checks the claim
    -- against itself, and a player who found a different route of the same
    -- length passes — because they solved it.
    if coalesce((p_result->>'solved')::boolean, false) is not true then return true; end if;
    -- a rung a second is not a person reading words
    if coalesce((p_result->>'timeMs')::numeric, 0) < 3000 then return false; end if;
    if not has_state or not (p_state ? 'chain') then return true; end if;

    declare
      rungs text[];
      prev text;
      first_from int;   -- 1 when the first rung is measured against the puzzle
      i int;
      differ int;
      j int;
    begin
      select array_agg(lower(w) order by ord)
        into rungs
      from jsonb_array_elements_text(p_state->'chain') with ordinality as t(w, ord);
      if rungs is null or array_length(rungs, 1) is null then return false; end if;

    -- The ends come from the puzzle when we hold it, and from the claim itself
    -- when we do not. The puzzle's copy is ground truth: a client cannot mark
    -- itself right on a ladder it was never set. The claim's copy proves less —
    -- a liar can move both ends — but it still has to agree with its own rungs,
    -- and a chain that does not start one letter from the word it says it
    -- started at is refused either way. Reading only the puzzle's copy let
    -- `cold` to `warm` pass with a chain of `ward, warm`, because with no row
    -- in daily_puzzles nothing was comparing the first rung to anything.
    declare
      claim_from text := lower(coalesce(board->>'from', p_state->>'from', ''));
      claim_to text := lower(coalesce(board->>'to', p_state->>'to', ''));
      -- state is whatever the client sent, so the cast is guarded: a `par` of
      -- "many" would otherwise raise out of a function the leaderboard calls
      -- once per row
      claim_par_text text := coalesce(board->>'par', p_state->>'par', '');
      claim_par int := 0;
    begin
      if claim_par_text ~ '^[0-9]+$' then claim_par := claim_par_text::int; end if;
      if claim_from <> '' then
        prev := claim_from;
        first_from := 1;
      else
        prev := rungs[1];
        first_from := 0;
      end if;

      if claim_to <> '' and rungs[array_length(rungs, 1)] is distinct from claim_to then
        return false;
      end if;

      -- par is the shortest route that exists, so a shorter chain is not a
      -- chain — or not this puzzle's
      if claim_par > 0 and array_length(rungs, 1) < claim_par then
        return false;
      end if;
    end;

      for i in 1 .. array_length(rungs, 1) loop
        -- a rung has to be a word at this row's cut, and never a slur
        if not exists (
          select 1 from public.words w
          where w.word = rungs[i] and w.level <= cut
            and coalesce(w.flag, '') is distinct from 'slur'
        ) then
          return false;
        end if;

        -- every rung is one letter from the one before it. The first is
        -- skipped only when there is nothing before it to compare against.
        if i > 1 or first_from = 1 then
          if length(prev) is distinct from length(rungs[i]) then return false; end if;
          differ := 0;
          for j in 1 .. length(prev) loop
            if substr(prev, j, 1) is distinct from substr(rungs[i], j, 1) then
              differ := differ + 1;
            end if;
          end loop;
          if differ is distinct from 1 then return false; end if;
        end if;
        prev := rungs[i];
      end loop;
      return true;
    end;

  elsif p_game = 'bridge' then
    -- Checked by rule, like the ladder, and for the same reason: a bridge is
    -- "X + M and M + Y are both words", so the answer is re-derivable and the
    -- server never has to hold one. A player who reached a legal bridge this
    -- pool does not know about is right, and this says so.
    declare
      prompts jsonb := coalesce(board->'prompts', p_state->'prompts');
      entries jsonb := p_state->'entries';
      solved int := coalesce((p_result->>'solved')::int, 0);
      hint_budget int := case p_difficulty when 'easy' then 3 when 'hard' then 1 else 0 end;
      good int := 0;
      k int;
      entry text;
      x text;
      y text;
    begin
      if solved <= 0 then return true; end if;
      -- five prompts is the board, so more than five solved is not a board
      if solved > 5 then return false; end if;
      -- hints only ever cost you, so under-claiming them cannot be caught and
      -- is not worth trying to. Claiming more than the tier grants is a
      -- malformed row rather than a cheat, and it is cheap to refuse.
      if coalesce((p_result->>'hints')::int, 0) > hint_budget then return false; end if;
      -- two seconds a prompt is not somebody reading two words and thinking
      if coalesce((p_result->>'timeMs')::numeric, 0) < solved * 2000 then return false; end if;

      if prompts is null or entries is null then return true; end if;
      if jsonb_typeof(prompts) <> 'array' or jsonb_typeof(entries) <> 'array' then
        return false;
      end if;

      -- Count the entries that genuinely bridge. The prompts come from the
      -- puzzle when we hold it and from the claim when we do not, the same
      -- fallback the ladder uses — a client cannot mark itself right on a
      -- board it was never set, and a claim still has to agree with itself.
      for k in 0 .. least(jsonb_array_length(prompts), jsonb_array_length(entries)) - 1 loop
        entry := lower(coalesce(entries->>k, ''));
        x := lower(coalesce(prompts->k->>'x', ''));
        y := lower(coalesce(prompts->k->>'y', ''));
        continue when entry = '' or x = '' or y = '';
        if entry !~ '^[a-z]+$' then return false; end if;
        if not use_dict then
          good := good + 1;
        elsif exists (
          select 1 from public.words w
          where w.word = x || entry and w.level <= cut and w.flag is distinct from 'slur'
        ) and exists (
          select 1 from public.words w
          where w.word = entry || y and w.level <= cut and w.flag is distinct from 'slur'
        ) then
          good := good + 1;
        end if;
      end loop;

      return good >= solved;
    end;
  end if;

  return false;
end;
$$;

-- see the header: with answers behind it, public execution would be an oracle
revoke all on function public.result_is_plausible(text, jsonb, jsonb, text, text, date, text) from public, anon, authenticated;
-- Everything the boards throw away, for occasional inspection. No grants: only
-- the owner, through the SQL editor. A moderation queue nobody works is worse
-- than none, so this is a place to look rather than a job to do.
create or replace view public.suspect_daily_results as
  select dp.user_id, p.display_name, dp.game, dp.puzzle_date, dp.env, dp.result, dp.state
  from public.daily_progress dp
  left join public.profiles p on p.id = dp.user_id
  where dp.completed and not public.result_is_plausible(dp.game, dp.state, dp.result, dp.difficulty, dp.variant, dp.puzzle_date, dp.env);

-- A view runs with its owner's rights, so this one reads straight past the
-- row-level security on the tables underneath — and Supabase grants table
-- privileges to the web roles by default. Without this revoke it would hand
-- any visitor every player's id and board.
revoke all on public.suspect_daily_results from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- leaderboard: top ten per game over a window of days, by display name.
--
-- Only accounts that set a name appear, which is the opt-in. Security definer
-- so it can read across players, and it returns names and numbers only — never
-- a row, an id, or an email.
--
-- Multi-day windows rank on how much you played as well as how well, so the
-- boards reward turning up rather than one lucky morning months ago.
-- ---------------------------------------------------------------------------
-- One board per difficulty rather than one board with three kinds of result
-- mixed in: a time on easy and a time on extreme are not the same event, and
-- ranking them together would be a category error.
drop function if exists public.leaderboard(int, text);

-- The board queries themselves, shared by the global and friends boards so
-- the ranking rules can't drift apart. `p_users` is the scope: null means
-- everyone, an array means only those accounts. Not security definer — it
-- runs with its callers' rights, and its callers are the two definer wrappers
-- below — and not executable by web roles, which would otherwise get to pass
-- any user list they liked.
create or replace function public.boards_for(
  p_days int,
  p_env text,
  p_difficulty text,
  p_users uuid[]
)
returns jsonb
language plpgsql
set search_path = ''
stable
as $$
declare
  out_json jsonb := '{}'::jsonb;
  part jsonb;
  since date := ((now() at time zone 'America/New_York')::date) - (greatest(coalesce(p_days, 1), 1) - 1);
begin
  -- guess: days won, then the cleanest win
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value, 'detail', detail) order by rk), '[]'::jsonb)
    into part
  from (
    select *, row_number() over (order by value desc, detail asc, tiebreak asc) as rk
    from (
      select p.display_name as name,
             count(*) filter (where (dp.result->>'won')::boolean) as value,
             min((dp.result->>'guesses')::int) filter (where (dp.result->>'won')::boolean) as detail,
             sum((dp.result->>'timeMs')::numeric) as tiebreak
      from public.daily_progress dp
      join public.profiles p on p.id = dp.user_id
      where dp.game = 'guess' and dp.completed and dp.env = p_env and dp.difficulty = p_difficulty and dp.puzzle_date >= since
        and (p_users is null or dp.user_id = any(p_users))
        and p.display_name is not null
        and public.result_is_plausible('guess', dp.state, dp.result, dp.difficulty, dp.variant, dp.puzzle_date, dp.env)
      group by p.display_name
      having count(*) filter (where (dp.result->>'won')::boolean) > 0
    ) a
    order by rk
    limit 10
  ) s;
  out_json := jsonb_set(out_json, '{guess}', part);

  -- hive, scramble and grid all rank on points added up across the window,
  -- so they share one query shape with the game as a parameter
  select coalesce(jsonb_object_agg(game, board), '{}'::jsonb) into part
  from (
    -- the filter matters: a game nobody has played leaves the lateral empty,
    -- and without it jsonb_agg would hand back [null] rather than []
    select g.game,
           coalesce(
             jsonb_agg(jsonb_build_object('name', t.name, 'value', t.value, 'detail', t.detail)
                       order by t.rk) filter (where t.name is not null),
             '[]'::jsonb
           ) as board
    from (values ('hive'), ('scramble'), ('grid')) as g(game)
    left join lateral (
      select p.display_name as name,
             sum((dp.result->>'score')::numeric) as value,
             count(*) as detail,
             row_number() over (order by sum((dp.result->>'score')::numeric) desc, count(*) desc) as rk
      from public.daily_progress dp
      join public.profiles p on p.id = dp.user_id
      where dp.game = g.game and dp.completed and dp.env = p_env and dp.difficulty = p_difficulty and dp.puzzle_date >= since
        and (p_users is null or dp.user_id = any(p_users))
        and p.display_name is not null
        and public.result_is_plausible(g.game, dp.state, dp.result, dp.difficulty, dp.variant, dp.puzzle_date, dp.env)
      group by p.display_name
      order by value desc, detail desc
      limit 10
    ) t on true
    group by g.game
  ) boards;
  out_json := out_json || part;

  -- box: days solved, then the shortest chain
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value, 'detail', detail) order by rk), '[]'::jsonb)
    into part
  from (
    select *, row_number() over (order by value desc, detail asc) as rk
    from (
      select p.display_name as name, count(*) as value, min((dp.result->>'words')::int) as detail
      from public.daily_progress dp
      join public.profiles p on p.id = dp.user_id
      where dp.game = 'box' and dp.completed and dp.env = p_env and dp.difficulty = p_difficulty and dp.puzzle_date >= since
        and (p_users is null or dp.user_id = any(p_users))
        and p.display_name is not null
        and public.result_is_plausible('box', dp.state, dp.result, dp.difficulty, dp.variant, dp.puzzle_date, dp.env)
      group by p.display_name
    ) a
    order by rk
    limit 10
  ) s;
  out_json := jsonb_set(out_json, '{box}', part);

  -- weave: days solved, then the fastest
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value, 'detail', detail) order by rk), '[]'::jsonb)
    into part
  from (
    select *, row_number() over (order by value desc, detail asc) as rk
    from (
      select p.display_name as name,
             count(*) filter (where (dp.result->>'solved')::boolean) as value,
             min((dp.result->>'timeMs')::numeric) filter (
               where (dp.result->>'solved')::boolean and (dp.result->>'timeMs')::numeric > 0
             ) as detail
      from public.daily_progress dp
      join public.profiles p on p.id = dp.user_id
      where dp.game = 'weave' and dp.completed and dp.env = p_env and dp.difficulty = p_difficulty and dp.puzzle_date >= since
        and (p_users is null or dp.user_id = any(p_users))
        and p.display_name is not null
        and public.result_is_plausible('weave', dp.state, dp.result, dp.difficulty, dp.variant, dp.puzzle_date, dp.env)
      group by p.display_name
      having count(*) filter (where (dp.result->>'solved')::boolean) > 0
    ) a
    order by rk
    limit 10
  ) s;
  out_json := jsonb_set(out_json, '{weave}', part);

  -- cryptogram: days solved, then the fastest — weave's shape exactly, since
  -- a passage is one puzzle with one outcome and a clock
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value, 'detail', detail) order by rk), '[]'::jsonb)
    into part
  from (
    select *, row_number() over (order by value desc, detail asc) as rk
    from (
      select p.display_name as name,
             count(*) filter (where (dp.result->>'solved')::boolean) as value,
             min((dp.result->>'timeMs')::numeric) filter (
               where (dp.result->>'solved')::boolean and (dp.result->>'timeMs')::numeric > 0
             ) as detail
      from public.daily_progress dp
      join public.profiles p on p.id = dp.user_id
      where dp.game = 'cryptogram' and dp.completed and dp.env = p_env and dp.difficulty = p_difficulty and dp.puzzle_date >= since
        and (p_users is null or dp.user_id = any(p_users))
        and p.display_name is not null
        and public.result_is_plausible('cryptogram', dp.state, dp.result, dp.difficulty, dp.variant, dp.puzzle_date, dp.env)
      group by p.display_name
      having count(*) filter (where (dp.result->>'solved')::boolean) > 0
    ) a
    order by rk
    limit 10
  ) s;
  out_json := jsonb_set(out_json, '{cryptogram}', part);

  -- ladder: days solved, then how many of those came in at par. The tie-break
  -- is the game's own measure rather than the clock — a ladder walked in the
  -- fewest steps is the better game, and racing one rewards typing speed over
  -- finding the route. `steps` is the chain the player kept, so this counts
  -- what result_is_plausible has already checked rung by rung.
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value, 'detail', detail) order by rk), '[]'::jsonb)
    into part
  from (
    select *, row_number() over (order by value desc, detail desc) as rk
    from (
      select p.display_name as name,
             count(*) filter (where (dp.result->>'solved')::boolean) as value,
             count(*) filter (
               where (dp.result->>'solved')::boolean
                 and jsonb_array_length(coalesce(dp.state->'chain', '[]'::jsonb))
                     <= coalesce((dp.state->>'par')::int, 2147483647)
             ) as detail
      from public.daily_progress dp
      join public.profiles p on p.id = dp.user_id
      where dp.game = 'ladder' and dp.completed and dp.env = p_env and dp.difficulty = p_difficulty and dp.puzzle_date >= since
        and (p_users is null or dp.user_id = any(p_users))
        and p.display_name is not null
        and public.result_is_plausible('ladder', dp.state, dp.result, dp.difficulty, dp.variant, dp.puzzle_date, dp.env)
      group by p.display_name
      having count(*) filter (where (dp.result->>'solved')::boolean) > 0
    ) a
    order by rk
    limit 10
  ) s;
  out_json := jsonb_set(out_json, '{ladder}', part);

  -- bridge: boards finished, then prompts found. A board is five prompts and a
  -- day where four came out is worth more than a day where none did, so the
  -- second number counts the whole run rather than only the clean sweeps —
  -- otherwise a near-miss and a no-show rank identically.
  --
  -- Hints are the difficulty setting rather than a ranking, and they are
  -- self-reported besides: under-claiming cannot be caught, so ranking on them
  -- would reward the claim rather than the play. They belong beside a result,
  -- not in the order of one.
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value, 'detail', detail) order by rk), '[]'::jsonb)
    into part
  from (
    select *, row_number() over (order by value desc, detail desc) as rk
    from (
      select p.display_name as name,
             count(*) filter (where coalesce((dp.result->>'solved')::int, 0) >= 5) as value,
             sum(least(coalesce((dp.result->>'solved')::int, 0), 5)) as detail
      from public.daily_progress dp
      join public.profiles p on p.id = dp.user_id
      where dp.game = 'bridge' and dp.completed and dp.env = p_env and dp.difficulty = p_difficulty and dp.puzzle_date >= since
        and (p_users is null or dp.user_id = any(p_users))
        and p.display_name is not null
        and public.result_is_plausible('bridge', dp.state, dp.result, dp.difficulty, dp.variant, dp.puzzle_date, dp.env)
      group by p.display_name
      having sum(coalesce((dp.result->>'solved')::int, 0)) > 0
    ) a
    order by rk
    limit 10
  ) s;
  out_json := jsonb_set(out_json, '{bridge}', part);

  -- squares: one board per size. A 4×4 and a 5×5 aren't the same puzzle, and a
  -- combined ranking would quietly reward whoever played more of the easier
  -- one. Days solved, then the fastest — weave's shape, keyed on variant.
  select coalesce(jsonb_object_agg('squares' || b.variant, b.board), '{}'::jsonb) into part
  from (
    select v.variant as variant,
           coalesce(
             jsonb_agg(jsonb_build_object('name', t.name, 'value', t.value, 'detail', t.detail)
                       order by t.rk) filter (where t.name is not null),
             '[]'::jsonb
           ) as board
    from (values ('4'), ('5')) as v(variant)
    left join lateral (
      select p.display_name as name,
             count(*) filter (where (dp.result->>'solved')::boolean) as value,
             min((dp.result->>'timeMs')::numeric) filter (
               where (dp.result->>'solved')::boolean and (dp.result->>'timeMs')::numeric > 0
             ) as detail,
             row_number() over (
               order by count(*) filter (where (dp.result->>'solved')::boolean) desc,
                        min((dp.result->>'timeMs')::numeric) filter (
                          where (dp.result->>'solved')::boolean
                            and (dp.result->>'timeMs')::numeric > 0
                        ) asc
             ) as rk
      from public.daily_progress dp
      join public.profiles p on p.id = dp.user_id
      where dp.game = 'squares' and dp.variant = v.variant and dp.completed
        and dp.env = p_env and dp.difficulty = p_difficulty and dp.puzzle_date >= since
        and (p_users is null or dp.user_id = any(p_users))
        and p.display_name is not null
        and public.result_is_plausible('squares', dp.state, dp.result, dp.difficulty, dp.variant, dp.puzzle_date, dp.env)
      group by p.display_name
      having count(*) filter (where (dp.result->>'solved')::boolean) > 0
      limit 10
    ) t on true
    group by v.variant
  ) b;
  out_json := out_json || part;

  return out_json;
end;
$$;

revoke execute on function public.boards_for(int, text, text, uuid[]) from public, anon, authenticated;

create or replace function public.leaderboard(
  p_days int default 1,
  p_env text default 'prod',
  p_difficulty text default 'easy'
)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select public.boards_for(p_days, p_env, p_difficulty, null);
$$;

grant execute on function public.leaderboard(int, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Friends. The first feature where someone other than you legitimately reads
-- anything of yours, so the crossing is kept as narrow as it will go: table
-- row-level security stays "own rows only" everywhere (these three tables
-- have no policies at all), and the only path across is the definer functions
-- below — which return names and numbers, never a row, an id, or any state.
--
-- Nobody is discoverable. There is no search; a friendship starts with an
-- invite code handed over as a link, so the only people who can name you are
-- people you gave the code to. Display names are required on both ends —
-- they're the existing opt-in, and a nameless friend couldn't be rendered
-- anyway.
-- ---------------------------------------------------------------------------

-- One row per pair, ordered so a pair can exist once. Direction would only
-- matter for a pending request, and there is no pending state: minting and
-- sharing a link is the requester's consent, accepting it is the other's.
create table if not exists public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  since timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_ordered check (user_a < user_b)
);
create index if not exists friendships_b_idx on public.friendships (user_b);
alter table public.friendships enable row level security;

-- A block is unilateral, survives unfriending, and works on someone who was
-- never a friend. It ends the friendship, silently kills their invites in
-- both directions, and is invisible to the blocked side.
create table if not exists public.friend_blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  constraint friend_blocks_not_self check (blocker <> blocked)
);
alter table public.friend_blocks enable row level security;

create table if not exists public.friend_invites (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists friend_invites_user_idx on public.friend_invites (user_id);
alter table public.friend_invites enable row level security;

-- No policies is not enough on its own: Supabase grants table privileges to
-- the web roles by default, and a future policy on any of these would open
-- exactly the hole the design avoids. Take the grants away outright.
revoke all on public.friendships, public.friend_blocks, public.friend_invites
  from public, anon, authenticated;

-- Mint an invite code, good for a week, usable by anyone it's handed to.
-- Multi-use on purpose — a link pasted into a group chat should work for the
-- group — which is also why there's no pending state to manage. At most ten
-- live codes per account, which is the rate limit.
create or replace function public.friend_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_code text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not signed in');
  end if;
  if not exists (select 1 from public.profiles where id = uid and display_name is not null) then
    return jsonb_build_object('ok', false, 'reason', 'name required');
  end if;

  -- expired codes are dead weight; clear them on the way through
  delete from public.friend_invites where expires_at < now();

  if (select count(*) from public.friend_invites where user_id = uid) >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too many');
  end if;

  new_code := left(replace(gen_random_uuid()::text, '-', ''), 12);
  insert into public.friend_invites (code, user_id, expires_at)
  values (new_code, uid, now() + interval '7 days');
  return jsonb_build_object('ok', true, 'code', new_code);
end;
$$;

revoke execute on function public.friend_invite() from public, anon;
grant execute on function public.friend_invite() to authenticated;

-- Accept a code. Every dead end that could leak something — no such code, an
-- expired one, a block in either direction — reads identically from outside:
-- 'invalid'. A block telling its target it exists would be a way of finding
-- out, which is the one thing a block must not be.
create or replace function public.friend_accept(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inviter uuid;
  inviter_name text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not signed in');
  end if;
  if not exists (select 1 from public.profiles where id = uid and display_name is not null) then
    return jsonb_build_object('ok', false, 'reason', 'name required');
  end if;

  select fi.user_id into inviter
  from public.friend_invites fi
  where fi.code = trim(coalesce(p_code, '')) and fi.expires_at >= now();

  if inviter = uid then
    -- your own link is the one failure worth naming: it leaks nothing you
    -- don't already know, and "invalid" would read as a broken feature
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  if inviter is null
     or exists (
       select 1 from public.friend_blocks b
       where (b.blocker = inviter and b.blocked = uid)
          or (b.blocker = uid and b.blocked = inviter)
     )
  then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select p.display_name into inviter_name from public.profiles p where p.id = inviter;
  if inviter_name is null then
    -- the inviter cleared their name since minting; without one they can't
    -- appear anywhere, so the invite is dead too
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if exists (
    select 1 from public.friendships f
    where f.user_a = least(uid, inviter) and f.user_b = greatest(uid, inviter)
  ) then
    return jsonb_build_object('ok', true, 'name', inviter_name);
  end if;

  if (select count(*) from public.friendships f where f.user_a = uid or f.user_b = uid) >= 100
     or (select count(*) from public.friendships f where f.user_a = inviter or f.user_b = inviter) >= 100
  then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  insert into public.friendships (user_a, user_b)
  values (least(uid, inviter), greatest(uid, inviter))
  on conflict do nothing;
  return jsonb_build_object('ok', true, 'name', inviter_name);
end;
$$;

revoke execute on function public.friend_accept(text) from public, anon;
grant execute on function public.friend_accept(text) to authenticated;

-- The caller's own circle: friends by name, plus who they've blocked. A
-- friend who has since cleared their display name is skipped rather than
-- shown blank — with no name they appear on no board either, so hiding them
-- here keeps the two views telling the same story.
create or replace function public.friends()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.display_name, 'since', f.since)
                       order by lower(p.display_name))
      from public.friendships f
      join public.profiles p
        on p.id = case when f.user_a = (select auth.uid()) then f.user_b else f.user_a end
      where ((select auth.uid()) in (f.user_a, f.user_b))
        and p.display_name is not null
    ), '[]'::jsonb),
    'blocked', coalesce((
      select jsonb_agg(p.display_name order by lower(p.display_name))
      from public.friend_blocks b
      join public.profiles p on p.id = b.blocked
      where b.blocker = (select auth.uid()) and p.display_name is not null
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.friends() from public, anon;
grant execute on function public.friends() to authenticated;

-- Remove and block take a display name rather than a user id: names are what
-- the client ever sees, and every mutation here is anchored on auth.uid() —
-- the caller can only ever edit relationships they are one side of.
create or replace function public.friend_remove(p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target uuid;
begin
  if uid is null then return false; end if;
  select id into target from public.profiles
  where lower(display_name) = lower(trim(coalesce(p_name, '')));
  if target is null then return false; end if;
  delete from public.friendships
  where user_a = least(uid, target) and user_b = greatest(uid, target);
  return found;
end;
$$;

revoke execute on function public.friend_remove(text) from public, anon;
grant execute on function public.friend_remove(text) to authenticated;

create or replace function public.friend_block(p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target uuid;
begin
  if uid is null then return false; end if;
  select id into target from public.profiles
  where lower(display_name) = lower(trim(coalesce(p_name, '')));
  if target is null or target = uid then return false; end if;
  insert into public.friend_blocks (blocker, blocked)
  values (uid, target)
  on conflict do nothing;
  delete from public.friendships
  where user_a = least(uid, target) and user_b = greatest(uid, target);
  return true;
end;
$$;

revoke execute on function public.friend_block(text) from public, anon;
grant execute on function public.friend_block(text) to authenticated;

create or replace function public.friend_unblock(p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then return false; end if;
  delete from public.friend_blocks b
  using public.profiles p
  where b.blocker = uid and b.blocked = p.id
    and lower(p.display_name) = lower(trim(coalesce(p_name, '')));
  return found;
end;
$$;

revoke execute on function public.friend_unblock(text) from public, anon;
grant execute on function public.friend_unblock(text) to authenticated;

-- The friends leaderboard: the same five boards as the global one — same
-- queries, same verification, via boards_for — scoped to the caller's circle.
-- You are always on your own board; a board you can't find yourself on reads
-- as broken.
create or replace function public.friends_board(
  p_days int default 1,
  p_env text default 'prod',
  p_difficulty text default 'easy'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  uid uuid := (select auth.uid());
  ids uuid[];
begin
  if uid is null then
    return '{}'::jsonb;
  end if;
  select array_agg(case when f.user_a = uid then f.user_b else f.user_a end)
    into ids
  from public.friendships f
  where uid in (f.user_a, f.user_b);
  return public.boards_for(p_days, p_env, p_difficulty, coalesce(ids, '{}'::uuid[]) || uid);
end;
$$;

revoke execute on function public.friends_board(int, text, text) from public, anon;
grant execute on function public.friends_board(int, text, text) to authenticated;

-- These two were a second copy of the game list, here because `create table if
-- not exists` leaves an existing table alone — so adding a game meant widening
-- the constraint explicitly, or every write for it came back 400 and the game
-- silently never synced.
--
-- Both are foreign keys to public.games now, declared beside that table. The
-- reason they were duplicated has not gone away: re-running this file still
-- has to replace the constraint on an existing table, which is why the block
-- up there drops and re-adds rather than assuming.

-- ---------------------------------------------------------------------------
-- stats_baselines: one-time import of the lifetime stats a browser
-- accumulated before the account existed. Insert-only, one row per
-- (user, device) — every browser contributes its own history exactly once,
-- and the synced view sums all baselines plus the event log.
-- ---------------------------------------------------------------------------
create table if not exists public.stats_baselines (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  baseline jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.stats_baselines enable row level security;

drop policy if exists "insert own baseline" on public.stats_baselines;
create policy "insert own baseline"
  on public.stats_baselines for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "read own baseline" on public.stats_baselines;
create policy "read own baseline"
  on public.stats_baselines for select
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Leaving. Two different things people mean by "delete my data", kept apart
-- because most of the time it's the first one.
--
-- Neither takes an argument. A function that accepted a user id would be a
-- delete-anybody endpoint the moment somebody opened the network tab and
-- changed one uuid — the account has to come from the token, and only from
-- the token.
--
-- Both raise rather than return quietly when there's no session: this is the
-- one place where a silent no-op could read as success.
-- ---------------------------------------------------------------------------

-- Wipe the play record, keep the account. Results, daily boards and the
-- pre-account baselines all go; the profile row and display name stay, so
-- the name is still yours and you simply drop off the boards along with the
-- results that put you there.
create or replace function public.clear_my_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  delete from public.game_results where user_id = uid;
  delete from public.daily_progress where user_id = uid;
  delete from public.stats_baselines where user_id = uid;
end;
$$;

revoke execute on function public.clear_my_stats() from public, anon;
grant execute on function public.clear_my_stats() to authenticated;

-- Delete the account itself. profiles, game_results, daily_progress and
-- stats_baselines all reference auth.users on delete cascade, so this one
-- row is the entire job — no list of tables here to fall out of date the
-- next time one is added.
--
-- It runs as the function's owner because auth.users belongs to the auth
-- system, not to us. Worth confirming after any project migration that this
-- still succeeds; if the owner ever loses the privilege it fails loudly and
-- the whole call rolls back, which is the right way round.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Daily puzzles as rows (applied 2026-08-09 as migration daily_puzzles_table).
--
-- Two goals that fought on GitHub stop fighting here: rows for future days
-- can sit ready (outage insurance) while the RPC takes no date parameter, so
-- nothing can ask for tomorrow. The generator workflow writes with the
-- service role; RLS is on with zero policies, so no web role reads the table
-- itself — daily_puzzle() is the only door in.
create table if not exists public.daily_puzzles (
  puzzle_date date not null,
  env text not null check (env in ('prod', 'dev', 'shared')),
  game text not null,
  payload jsonb not null,
  written_at timestamptz not null default now(),
  primary key (puzzle_date, env, game)
);

alter table public.daily_puzzles enable row level security;
revoke all on public.daily_puzzles from anon, authenticated;

-- The daily rolls at 3:15 a.m. Eastern — the workflow's schedule, the file
-- feed's behaviour, and the site's promise. With future rows present (the
-- rolling window), a plain calendar-date gate would serve the new day at
-- midnight, three hours early; backing the clock up 3h15m before taking the
-- date makes each row appear exactly when its file used to.
-- (Amended by migration daily_puzzle_gate_at_3am.)
create or replace function public.daily_puzzle(p_game text, p_env text default 'prod')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select payload
  from public.daily_puzzles
  where game = p_game
    and env = p_env
    and puzzle_date <= (now() at time zone 'America/New_York' - interval '3 hours 15 minutes')::date
  order by puzzle_date desc
  limit 1
$$;

revoke all on function public.daily_puzzle(text, text) from public;
grant execute on function public.daily_puzzle(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
-- A generator drawing from 240,000 words will eventually publish something
-- offensive, and a display name field will eventually hold something worse.
-- Both have preventive filters — the blocklist through the bands, blocked_names
-- for names — and neither is a substitute for someone being able to say "this
-- one is wrong" at the moment they see it.
--
-- Anyone may file one, signed in or not, because the site plays without an
-- account and the person who sees the bad word usually has none.
--
-- The evidence is the design point. The obvious version posts what the client
-- saw, which is attacker-controlled and therefore worth very little: a report
-- of a board that never existed would be indistinguishable from a report of a
-- real one. So almost nothing is sent. A puzzle report is (game, date,
-- difficulty) and the server reads the actual board out of daily_puzzles; a
-- player report is a display name the server resolves to a profile itself. The
-- free-text reason is the only client-supplied field that is stored, and it is
-- the only one that should be.
--
-- That makes a report verifiable before anyone reads a word of it: the server
-- confirms the reported thing exists and says what the reporter claims.

-- Who may act on one. A table rather than a role check because Supabase's
-- roles are about connection identity, not about people, and "the owner" is a
-- person — one today, possibly two later, and the admin portal when it is
-- more. Empty by default: seed it in the SQL editor with your own auth id,
-- which is the one privileged act that stays where every other one already is.
create table if not exists public.owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.owners enable row level security;
revoke all on public.owners from public, anon, authenticated;

-- The three privileges, as Zitadel names them: view plays, edit sets games up
-- and sees winners, admin does everything including acting on other people.
--
-- Deliberately *not* read out of the token. GoTrue writes SAML attributes into
-- raw_user_meta_data — `userProvidedData.Metadata = providerClaims`, in
-- samlacs.go — and user_metadata is writable by the very user it describes:
--
--   await supabase.auth.updateUser({ data: { roles: ['games.admin'] } })
--
-- A policy reading that claim would hand admin to anyone who opens a console.
-- So the role in the token is a hint the interface may use to decide what to
-- draw, and this table is the authority every decision that matters reads.
-- It is written by hand or by a service credential — never by the session it
-- grants privilege to.
--
-- games.view is not expected to appear here. Zitadel grants the application to
-- holders of one of the three roles, so reaching the site at all already
-- proves it, enforced where a browser cannot reach. Rows exist for the two
-- that raise privilege above the floor.
create table if not exists public.role_grants (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('games.view', 'games.edit', 'games.admin')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.role_grants enable row level security;
revoke all on public.role_grants from public, anon, authenticated;

-- Rank, so holding one privilege implies everything below it. An admin should
-- not need three rows to see what an editor sees, and Zitadel should not have
-- to grant three roles to one person for the obvious thing to happen.
create or replace function public.role_rank(p_role text)
returns int
language sql
immutable
as $fn$
  select case p_role
    when 'games.view' then 1
    when 'games.edit' then 2
    when 'games.admin' then 3
    else 0
  end
$fn$;

-- Does the caller hold this privilege, or one above it?
--
-- The `> 0` guard is the entire reason rank is a function rather than an
-- inline case expression. An unrecognised argument ranks 0, and without the
-- guard every real grant would out-rank it — so has_role('gaems.admin') would
-- return true for everybody, and a typo in a policy would open the thing that
-- policy was written to close.
create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select public.role_rank(p_role) > 0
     and (
       -- The floor is being here at all.
       --
       -- games.view is deliberately never granted a row: Zitadel grants the
       -- application to holders of one of the three roles, so a session is
       -- itself the proof. Reading it out of role_grants like the tiers above
       -- it made can('games.play') false for every ordinary player and true
       -- only for admins and editors — the exact inverse of what it describes.
       -- It failed closed, so it was a lockout waiting for the first gate to
       -- be written against it rather than a way in.
       (public.role_rank(p_role) = 1 and (select auth.uid()) is not null)
       or exists (
         select 1 from public.role_grants g
         where g.user_id = (select auth.uid())
           and public.role_rank(g.role) >= public.role_rank(p_role)
       )
     )
$fn$;

revoke all on function public.has_role(text) from public, anon;
grant execute on function public.has_role(text) to authenticated;

-- What the interface asks so it knows what to draw. The caller's own roles,
-- names only, and never anyone else's — who the admins are is not a thing a
-- player needs to be able to list.
create or replace function public.my_roles()
returns text[]
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(array_agg(g.role order by public.role_rank(g.role) desc), '{}')
  from public.role_grants g
  where g.user_id = (select auth.uid())
$fn$;

revoke all on function public.my_roles() from public, anon;
grant execute on function public.my_roles() to authenticated;

-- Widened rather than replaced: `owners` predates the roles and still works,
-- so the four existing call sites and the whole report queue keep their
-- meaning. games.admin is the same authority arriving by a different door.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (select 1 from public.owners o where o.user_id = (select auth.uid()))
      or public.has_role('games.admin')
$fn$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- What each privilege actually unlocks, as data rather than as code.
--
-- The alternative was a rank written into every gate — is_owner() here,
-- has_role('games.edit') there — which works right up until somebody decides
-- editors should see the report queue after all, and then it is a schema
-- change, a deploy, and a conversation about who can do that. A row is a
-- better answer to a question whose answer is going to move.
--
-- Rows are seeded, not created by the app: a capability that exists only
-- because somebody typed it into a form is a capability no gate reads.
create table if not exists public.capabilities (
  capability text primary key,
  min_role text not null check (min_role in ('games.view', 'games.edit', 'games.admin')),
  description text not null
);
alter table public.capabilities enable row level security;
revoke all on public.capabilities from public, anon, authenticated;

-- The starting map. `on conflict do nothing`, so re-running this file never
-- overwrites a decision somebody made in the portal — the seed is where a
-- capability comes from, not what it must stay.
insert into public.capabilities (capability, min_role, description) values
  ('games.play',         'games.view',  'Play the games and appear on the leaderboard'),
  ('winners.view',       'games.edit',  'See who won, across everyone'),
  ('games.setup',        'games.edit',  'Set up games, sessions and puzzle content'),
  ('reports.read',       'games.admin', 'Read the abuse report queue'),
  ('reports.act',        'games.admin', 'Act on a report — dismiss, blocklist, ban'),
  ('users.manage',       'games.admin', 'Grant and revoke privileges'),
  ('permissions.manage', 'games.admin', 'Change what each privilege unlocks')
on conflict (capability) do nothing;

-- permissions.manage cannot be handed below admin.
--
-- Not paternalism about what an admin may decide — it is the one row that
-- decides who may edit the rows. Lower it to games.view and every signed-in
-- player can rewrite the whole map, including locking admins out of it. That
-- is a one-way door reachable by a single dropdown, so it is closed here
-- rather than in the interface, where it would only be closed for people
-- using the interface.
create or replace function public.capabilities_guard()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  -- Two rows, not one. permissions.manage decides who may edit the rows;
  -- users.manage decides who may hand out the privileges the rows are keyed
  -- on. They are the same power reached from two directions, and guarding
  -- only the first was an omission rather than a judgement — lower
  -- users.manage to games.view and every signed-in player can grant
  -- themselves games.admin, which is_owner() now also satisfies.
  --
  -- Not exploitable when this was written, because nothing consumed
  -- users.manage yet. Guarded now rather than when the grant RPC lands,
  -- because that is a change about granting, and this is a floor.
  --
  -- role_rank('games.admin') rather than the literal 3: the rank is correct
  -- today and silently wrong the day the ladder gains a tier.
  if new.capability in ('permissions.manage', 'users.manage')
     and public.role_rank(new.min_role) < public.role_rank('games.admin') then
    raise exception '% cannot be set below games.admin', new.capability;
  end if;
  return new;
end;
$fn$;

drop trigger if exists capabilities_guard on public.capabilities;
create trigger capabilities_guard
  before insert or update on public.capabilities
  for each row execute function public.capabilities_guard();

-- May the caller do this?
--
-- An unknown capability is false, and deliberately so. The tempting version
-- returns true when no row constrains the action — "nothing forbids it" — and
-- that turns every typo in a gate, and every capability someone forgot to
-- seed, into an open door. Absent means no, and a gate that is silently
-- always-false is a bug someone reports; a gate that is silently always-true
-- is a bug nobody sees.
create or replace function public.can(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    (select public.has_role(c.min_role)
     from public.capabilities c
     where c.capability = p_capability),
    false
  )
$fn$;

revoke all on function public.can(text) from public, anon;
grant execute on function public.can(text) to authenticated;

-- Everything the caller may do, so the interface asks once rather than per
-- button. Names only — the map itself is admin-visible, not player-visible.
create or replace function public.my_capabilities()
returns text[]
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(array_agg(c.capability order by c.capability), '{}')
  from public.capabilities c
  where public.has_role(c.min_role)
$fn$;

revoke all on function public.my_capabilities() from public, anon;
grant execute on function public.my_capabilities() to authenticated;

-- The whole map, for the portal that edits it. Gated on reading permissions
-- rather than on being an admin, so the gate moves with the map.
create or replace function public.capability_map()
returns table (capability text, min_role text, description text)
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.capability, c.min_role, c.description
  from public.capabilities c
  where public.can('permissions.manage')
  order by c.capability
$fn$;

revoke all on function public.capability_map() from public, anon;
grant execute on function public.capability_map() to authenticated;

-- Change what a privilege unlocks. Existing rows only: the set of capabilities
-- is decided by what the code actually gates, so inventing one here would
-- produce a row no gate reads and a promise nothing keeps.
create or replace function public.set_capability(p_capability text, p_min_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not public.can('permissions.manage') then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  if public.role_rank(p_min_role) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no such role');
  end if;

  update public.capabilities set min_role = p_min_role where capability = p_capability;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no such capability');
  end if;

  return jsonb_build_object('ok', true, 'capability', p_capability, 'min_role', p_min_role);
exception when others then
  -- the guard trigger, most likely
  return jsonb_build_object('ok', false, 'reason', sqlerrm);
end;
$fn$;

revoke all on function public.set_capability(text, text) from public, anon;
grant execute on function public.set_capability(text, text) to authenticated;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('puzzle', 'player', 'site', 'other', 'privacy', 'security')),
  -- what was reported, as the server resolved it — never as the client said it
  subject text not null,
  evidence jsonb not null,
  reason text check (char_length(reason) <= 500),
  -- null for an anonymous report, which is most of them
  reporter uuid references auth.users (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'handled')),
  created_at timestamptz not null default now()
);

-- The reporter's half of the transaction.
--
-- `ticket` is what they are given and what they can look up: short enough to
-- read down a phone, random enough not to be walked. It is the only handle
-- anyone outside gets, and it answers with a status and nothing else — not the
-- board, not the name, not the reason, and never another ticket's anything.
--
-- `reporter_email` is optional and is the one piece of personal data this
-- feature stores. It exists to send a receipt and the eventual outcome, it is
-- never shown to anyone but the owner, and it is cleared when the report is.
-- Widened after the fact: reporting started as puzzles and players, which was
-- the half a generator can produce. It missed the half a person can — a broken
-- page, and everything nobody thought of. Those two carry no server-side
-- evidence, which is exactly why they need the reason field the other two
-- treat as optional.
-- Widened twice. First past puzzles and players, which was the half a
-- generator can produce and missed the half a person can. Then again for
-- privacy and security, which had been living in a mailto and a sentence in
-- the terms — a route with no ticket, no queue, and no way for anyone to tell
-- whether it had been read.
alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check
  check (kind in ('puzzle', 'player', 'site', 'other', 'privacy', 'security'));

alter table public.reports add column if not exists ticket text;
alter table public.reports add column if not exists reporter_email text
  check (reporter_email is null or char_length(reporter_email) between 3 and 254);
create unique index if not exists reports_ticket_idx on public.reports (ticket);

-- The owner's half. `action_token` is the second of the two things an action
-- link needs; the first is being signed in as an owner. Neither is sufficient,
-- which is the point: a forwarded digest, a leaked inbox, or a corporate mail
-- scanner pre-clicking every link in it — a thing that already happens here,
-- and is why magic links needed a code fallback — cannot ban anybody.
alter table public.reports add column if not exists action_token uuid not null default gen_random_uuid();
alter table public.reports add column if not exists resolution text;
alter table public.reports drop constraint if exists reports_resolution_check;
alter table public.reports add constraint reports_resolution_check
  check (resolution is null or resolution in ('dismissed', 'blocked', 'banned'));
alter table public.reports add column if not exists resolution_note text check (char_length(resolution_note) <= 500);
alter table public.reports add column if not exists resolved_at timestamptz;
alter table public.reports add column if not exists resolved_by uuid references auth.users (id) on delete set null;

-- What the digest has already told the reporter, so a rerun doesn't tell them
-- twice. Nullable rather than boolean: the timestamp is the audit trail.
alter table public.reports add column if not exists receipt_sent_at timestamptz;
alter table public.reports add column if not exists outcome_sent_at timestamptz;

create index if not exists reports_open_idx on public.reports (created_at) where status = 'new';
create index if not exists reports_subject_idx on public.reports (subject, created_at desc);

alter table public.reports enable row level security;

-- Insert-only, and not even that directly: the functions below are the whole
-- surface. No policy grants a read, because a report names a player and carries
-- free text about them — that goes to the owner's digest, not to anyone who can
-- open a network tab.
revoke all on public.reports, public.owners from public, anon, authenticated;

-- Rate limiting, deliberately not per reporter.
--
-- The roadmap said "a rate limit per source", which means an IP, which means
-- storing something identifying about people who are otherwise anonymous. For
-- a site whose privacy page is written to describe what the code actually
-- does, that is a real cost for a small benefit. So the caps are on the
-- subject and on the day instead, and nothing about the reporter is kept
-- beyond an email they chose to give.
--
-- Per subject, because the goal is a signal and the sixth report of the same
-- board carries none. Per day, because that bounds someone working across many
-- subjects to a table a digest can still be read out of.
--
-- What this does not do: stop a determined person filing one report against
-- each of a thousand names. It bounds the volume, not the intent — if that
-- happens the answer is the admin portal, not a bigger number here.
create or replace function public.report_limits()
returns jsonb
language sql
immutable
as $fn$
  select jsonb_build_object('per_subject', 5, 'per_day', 500)
$fn$;

-- The shared tail of both report paths: cap, insert, hand back a ticket.
-- Not security definer and not granted to the web roles — it is only ever
-- called by the two functions below, which are.
create or replace function public.file_report(
  p_kind text,
  p_subject text,
  p_evidence jsonb,
  p_reason text,
  p_email text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
  limits jsonb := public.report_limits();
  cleaned text := nullif(btrim(coalesce(p_reason, '')), '');
  email text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  code text;
begin
  -- Not validation so much as refusing to store a string that cannot be an
  -- address. Anything stricter is the usual losing game, and the cost of a
  -- wrong one here is an email that bounces, not a report that is lost.
  if email is not null and email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    email := null;
  end if;

  if (select count(*) from public.reports
      where subject = p_subject and created_at > now() - interval '30 days')
     >= (limits->>'per_subject')::int then
    -- Already reported enough to be seen. Answering ok rather than 'too many'
    -- on purpose: the reporter did their part, and telling them it was dropped
    -- invites them to file it again by another route. No ticket, because there
    -- is no new report for one to name.
    return jsonb_build_object('ok', true, 'recorded', false);
  end if;

  if (select count(*) from public.reports where created_at > now() - interval '1 day')
     >= (limits->>'per_day')::int then
    return jsonb_build_object('ok', true, 'recorded', false);
  end if;

  -- Ten hex from a uuid: 40 bits, which is not a secret and is not asked to
  -- be one — it names a report whose only readable property is 'open' or
  -- 'closed'. It is short enough to read off a screen and type on a phone,
  -- which matters more, because the person holding it has no account.
  code := left(replace(gen_random_uuid()::text, '-', ''), 10);

  insert into public.reports (kind, subject, evidence, reason, reporter, ticket, reporter_email)
  values (p_kind, p_subject, p_evidence, left(cleaned, 500), (select auth.uid()), code, email);

  return jsonb_build_object('ok', true, 'recorded', true, 'ticket', code);
end;
$fn$;

revoke all on function public.file_report(text, text, jsonb, text, text) from public, anon, authenticated;

-- Report a daily puzzle. The client sends where it was, not what it saw.
--
-- The board is snapshotted rather than referenced because daily_puzzles is a
-- rolling fortnight: by the time anyone reads the digest, the row that caused
-- the complaint may have aged out, and a report whose evidence has expired is
-- a report nobody can act on.
create or replace function public.report_puzzle(
  p_game text,
  p_date date,
  p_difficulty text,
  p_env text default 'prod',
  p_reason text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  found jsonb;
  board jsonb;
begin
  if p_difficulty is null or p_difficulty not in ('easy', 'hard', 'extreme') then
    return jsonb_build_object('ok', false, 'reason', 'no such puzzle');
  end if;
  if p_env is null or p_env not in ('prod', 'dev', 'shared') then
    return jsonb_build_object('ok', false, 'reason', 'no such puzzle');
  end if;

  select p.payload into found
  from public.daily_puzzles p
  where p.game = p_game and p.env = p_env and p.puzzle_date = p_date;

  -- The one check that makes the rest worth storing. A board that isn't there
  -- is not a report, it is someone typing into an insert endpoint.
  if found is null then
    return jsonb_build_object('ok', false, 'reason', 'no such puzzle');
  end if;

  board := coalesce(found->'byDifficulty'->p_difficulty, found);

  return public.file_report(
    'puzzle',
    p_game || ':' || p_env || ':' || p_date::text || ':' || p_difficulty,
    jsonb_build_object(
      'game', p_game, 'env', p_env, 'date', p_date, 'difficulty', p_difficulty,
      'board', board
    ),
    p_reason,
    p_email
  );
end;
$fn$;

revoke all on function public.report_puzzle(text, date, text, text, text, text) from public;
grant execute on function public.report_puzzle(text, date, text, text, text, text) to anon, authenticated;

-- Report a display name. The client sends the name it saw on a board; the
-- server resolves it to a profile and records the name as *it* holds it, so a
-- rename between seeing and reporting doesn't produce a report about a string
-- nobody ever had.
--
-- An unknown name reads the same as a known one. A report endpoint that says
-- "no such player" is a way of asking whether a name is taken, which
-- set_display_name is careful not to answer either.
create or replace function public.report_player(
  p_name text,
  p_reason text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  target_id uuid;
  target_name text;
begin
  select id, display_name into target_id, target_name
  from public.profiles
  where display_name is not null
    and public.normalise_name(display_name) = public.normalise_name(coalesce(p_name, ''))
  limit 1;

  if target_id is null then
    return jsonb_build_object('ok', true, 'recorded', false);
  end if;

  return public.file_report(
    'player',
    'player:' || target_id::text,
    jsonb_build_object(
      'profile', target_id,
      'name', target_name,
      -- whether the preventive filter would have caught it, which is the
      -- difference between "the blocklist has a gap" and "somebody found a
      -- spelling it doesn't cover"
      'blocked_by_filter', public.name_is_blocked(target_name)
    ),
    p_reason,
    p_email
  );
end;
$fn$;

revoke all on function public.report_player(text, text, text) from public;
grant execute on function public.report_player(text, text, text) to anon, authenticated;

-- A site problem, or anything else.
--
-- The other two paths are strong because the server can check them: a board is
-- in daily_puzzles or it isn't, a name resolves to a profile or it doesn't.
-- There is nothing to check here, and pretending otherwise would be worse than
-- admitting it — so these are stored as what they are, somebody's account of
-- something, and the reason is required rather than optional because without
-- it there is no report at all.
--
-- The subject carries a digest of the text so the per-subject cap dedupes
-- identical complaints without capping unrelated ones. A flat 'site' subject
-- would have meant the sixth distinct bug report of the month was dropped for
-- looking like the first five.
create or replace function public.report_general(
  p_kind text,
  p_reason text,
  p_where text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  cleaned text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_kind is null or p_kind not in ('site', 'other', 'privacy', 'security') then
    return jsonb_build_object('ok', false, 'reason', 'no such kind');
  end if;
  if cleaned is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing said');
  end if;

  return public.file_report(
    p_kind,
    p_kind || ':' || left(md5(lower(cleaned)), 8),
    -- Where they were, as they described it. Client-supplied and labelled as
    -- such: it is a hint for whoever reads it, never evidence of anything.
    jsonb_build_object('reported_from', left(coalesce(p_where, ''), 200)),
    cleaned,
    p_email
  );
end;
$fn$;

revoke all on function public.report_general(text, text, text, text) from public;
grant execute on function public.report_general(text, text, text, text) to anon, authenticated;

-- What a reporter can see with their ticket: whether it is still open, and how
-- it ended if it isn't. Not the board, not the name, not their own words back,
-- and nothing at all about any other report.
--
-- Deliberately not "no such ticket" either. A wrong code and a real one read
-- the same, because otherwise this is an oracle for walking the space — which
-- is only 40 bits, and 40 bits is fine for naming something and useless for
-- guarding it.
create or replace function public.report_status(p_ticket text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    (select jsonb_build_object(
       'found', true,
       'status', r.status,
       'resolution', r.resolution,
       -- The note too. It was left out at first and the email carried it
       -- anyway, which made two different promises out of one field: a
       -- reporter who gave an address was told why, and a reporter who didn't
       -- got a note written for them that they could never read. The note is
       -- written knowing the reporter sees it — one audience, one promise.
       'note', r.resolution_note,
       'filed', r.created_at,
       'closed', r.resolved_at
     )
     from public.reports r
     where r.ticket = p_ticket),
    jsonb_build_object('found', false)
  )
$fn$;

revoke all on function public.report_status(text) from public;
grant execute on function public.report_status(text) to anon, authenticated;

-- What the digest reads. Service role only — it is the one path that hands
-- back a player's name alongside free text somebody wrote about them.
--
-- Open reports come back oldest first with their age, because the digest's
-- job is partly to nag: a report nobody has touched in a week should read
-- louder than one filed this morning, and the only way to say so is to keep
-- sending it until somebody acts.
create or replace function public.open_reports()
returns table (
  id uuid,
  kind text,
  ticket text,
  subject text,
  evidence jsonb,
  reason text,
  reporter_email text,
  action_token uuid,
  created_at timestamptz,
  days_open int,
  receipt_sent_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select r.id, r.kind, r.ticket, r.subject, r.evidence, r.reason, r.reporter_email,
         r.action_token, r.created_at,
         greatest(0, (now()::date - r.created_at::date))::int as days_open,
         r.receipt_sent_at
  from public.reports r
  where r.status = 'new'
  order by r.created_at
$fn$;

revoke all on function public.open_reports() from public, anon, authenticated;

-- Reports resolved but not yet told to the reporter who asked to be told.
create or replace function public.unsent_outcomes()
returns table (
  id uuid,
  ticket text,
  reporter_email text,
  resolution text,
  resolution_note text,
  resolved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select r.id, r.ticket, r.reporter_email, r.resolution, r.resolution_note, r.resolved_at
  from public.reports r
  where r.status = 'handled'
    and r.reporter_email is not null
    and r.outcome_sent_at is null
  order by r.resolved_at
$fn$;

revoke all on function public.unsent_outcomes() from public, anon, authenticated;

-- Acting on a report: the two-key lock.
--
-- The token proves the caller is holding the digest; `is_owner()` proves they
-- are the person it was sent to. Either alone is not enough, which is the
-- whole reason this is safe to put in an email — the one thing about email
-- links that is reliably true is that other people read them.
--
-- Three actions, and each one has a real effect somewhere else:
--   dismiss   nothing but closing it, for the reports that are wrong
--   blocklist adds a word to blocked_words at 'both' scope — never generated,
--             never accepted. The word is typed by the owner rather than read
--             off the board, because the offending word on a board is not
--             always the answer, and a rule that guessed would guess wrong.
--   ban       clears the display name and blocks it exactly, so the account
--             survives and the name does not. Nobody is deleted by a click.
create or replace function public.report_act(
  p_id uuid,
  p_token uuid,
  p_action text,
  p_note text default null,
  p_target text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r public.reports;
  word text := nullif(btrim(lower(coalesce(p_target, ''))), '');
  who uuid := (select auth.uid());
begin
  if not public.is_owner() then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  if p_action is null or p_action not in ('dismiss', 'blocklist', 'ban') then
    return jsonb_build_object('ok', false, 'reason', 'no such action');
  end if;

  select * into r from public.reports where id = p_id and action_token = p_token;
  if r.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  if r.status <> 'new' then
    -- Already handled, by the other tab or the other click. Not an error:
    -- saying so is more useful than pretending the second click did something.
    return jsonb_build_object('ok', false, 'reason', 'already handled', 'resolution', r.resolution);
  end if;

  -- Blocking a word is a puzzle answer, so it only makes sense on a puzzle
  -- report. A site report has no board to have printed one.
  if p_action = 'blocklist' and r.kind <> 'puzzle' then
    return jsonb_build_object('ok', false, 'reason', 'not a puzzle report');
  end if;

  if p_action = 'blocklist' then
    if word is null or word !~ '^[a-z]{2,}$' then
      return jsonb_build_object('ok', false, 'reason', 'no word given');
    end if;
    insert into public.blocked_words (word, scope, origin)
    values (word, 'both', 'report:' || r.ticket)
    on conflict (word) do update set scope = 'both', origin = excluded.origin;
  elsif p_action = 'ban' then
    if r.kind <> 'player' then
      return jsonb_build_object('ok', false, 'reason', 'not a player report');
    end if;
    -- The name, not the person. Blocking it exactly rather than as a substring
    -- because one abusive name is not evidence that every name containing it
    -- is abusive, and that mistake is the one this whole table is careful not
    -- to make.
    insert into public.blocked_names (pattern, match)
    values (public.normalise_name(r.evidence->>'name'), 'exact')
    on conflict (pattern) do nothing;
    update public.profiles set display_name = null where id = (r.evidence->>'profile')::uuid;
  end if;

  update public.reports
  set status = 'handled',
      resolution = case p_action when 'dismiss' then 'dismissed'
                                 when 'blocklist' then 'blocked'
                                 else 'banned' end,
      resolution_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500),
      resolved_at = now(),
      resolved_by = who
  where id = r.id;

  return jsonb_build_object('ok', true, 'ticket', r.ticket);
end;
$fn$;

revoke all on function public.report_act(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.report_act(uuid, uuid, text, text, text) to authenticated;

-- What the action page shows before it acts: enough to decide, and only to an
-- owner holding the token. The same two keys as report_act, because a page
-- that displayed the report to anyone holding the link would leak exactly what
-- the token was protecting.
create or replace function public.report_for_action(p_id uuid, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r public.reports;
begin
  if not public.is_owner() then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  select * into r from public.reports where id = p_id and action_token = p_token;
  if r.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  return jsonb_build_object(
    'ok', true,
    'ticket', r.ticket,
    'kind', r.kind,
    'evidence', r.evidence,
    'reason', r.reason,
    'status', r.status,
    'resolution', r.resolution,
    'filed', r.created_at
  );
end;
$fn$;

revoke all on function public.report_for_action(uuid, uuid) from public, anon;
grant execute on function public.report_for_action(uuid, uuid) to authenticated;

-- The owner's list, for the site rather than the inbox.
--
-- open_reports() is service-role only and stays that way — it is what the
-- digest reads. This is its sibling for a signed-in owner, and the difference
-- is not cosmetic: it carries no reporter_email, because a list on a screen is
-- the surface most likely to be read over somebody's shoulder, and an address
-- is not needed to decide what to do about a report.
--
-- Not is_owner() as a guard that errors: an empty list is the right answer for
-- everyone else, and it means the caller needs no special handling for the
-- ordinary case of not being an owner.
create or replace function public.owner_reports()
returns table (
  id uuid,
  kind text,
  ticket text,
  evidence jsonb,
  reason text,
  action_token uuid,
  created_at timestamptz,
  days_open int
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select r.id, r.kind, r.ticket, r.evidence, r.reason, r.action_token, r.created_at,
         greatest(0, (now()::date - r.created_at::date))::int
  from public.reports r
  where r.status = 'new' and public.is_owner()
  order by r.created_at
$fn$;

revoke all on function public.owner_reports() from public, anon;
grant execute on function public.owner_reports() to authenticated;

-- ---------------------------------------------------------------------------
-- Live sessions
--
-- The Slido replacement: a presenter runs a session, a room answers at once,
-- and results appear as they arrive. Six kinds of item at first — multiple
-- choice, matching, a number to guess, a ranking, a survey, and an open
-- question — with more expected, which is why `kind` is a row in a table
-- rather than a CHECK constraint. Adding one is an insert and a component,
-- not a migration.
--
-- Three things shape everything below, and each is a promise that has to be
-- true in the database rather than in the interface.
--
-- 1. A participant must never be able to read the correct answer before it is
--    revealed. Prizes make this worth doing properly, and "the client does not
--    display it" is not doing it properly — anyone can open a network tab. So
--    answers are not a column on the item that RLS politely hides; they are a
--    separate table with no grant to web roles at all. There is nothing to
--    select.
--
-- 2. Fastest wins, so the clock is the server's. submitted_at defaults to
--    now() and elapsed is measured against the item's opened_at. A client that
--    sends its own time is a client that decides who won.
--
-- 3. "Anonymous" means anonymous to the room, not to the company. The
--    scoreboard and the presenter's screen show no name; an admin can still
--    see who asked, because prizes and moderation need it. That is a narrower
--    promise than the word implies on its own, so the interface says
--    "anonymous to other participants" rather than "anonymous".
-- ---------------------------------------------------------------------------

create table if not exists public.item_kinds (
  kind text primary key,
  description text not null,
  -- whether a correct answer exists for this kind at all. A survey and an open
  -- question have none, and scoring one would be inventing a right answer to a
  -- question that did not have one.
  scored boolean not null default true
);
alter table public.item_kinds enable row level security;
revoke all on public.item_kinds from public, anon, authenticated;

insert into public.item_kinds (kind, description, scored) values
  ('choice',  'One or more of these is correct', true),
  ('match',   'Pair each left-hand item with a right-hand one', true),
  ('number',  'Guess a value; closest wins', true),
  ('rank',    'Put these in order', true),
  ('survey',  'No right answer, just what the room thinks', false),
  ('open',    'Ask anything; the presenter reads them out', false)
on conflict (kind) do nothing;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  -- draft is being built, live is running, closed is over and read-only
  state text not null default 'draft' check (state in ('draft', 'live', 'closed')),
  -- Whether somebody arriving mid-session may catch up on items they were not
  -- there for. Per event, because a scored round and a survey want different
  -- answers.
  --
  -- **Nothing reads this yet.** Answering is already limited to the item on
  -- screen while it is open, so a late arrival naturally misses what has gone
  -- — which is 'strict' by accident rather than by enforcement. 'open' needs a
  -- record of when each person joined, and joining only becomes a real event
  -- once there is a session screen to open. The column is here so the choice
  -- is stored from the first session rather than retrofitted onto one.
  -- The item the room is looking at. Null before the session starts.
  current_item uuid,
  host uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  closed_at timestamptz
);
alter table public.sessions enable row level security;
revoke all on public.sessions from public, anon, authenticated;

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  position int not null,
  kind text not null references public.item_kinds (kind),
  prompt text not null check (char_length(prompt) between 1 and 500),
  -- What the room is shown: the options, the two columns to match, the units a
  -- guess is in. Never the answer.
  payload jsonb not null default '{}'::jsonb,
  state text not null default 'pending'
    check (state in ('pending', 'open', 'locked', 'revealed')),
  -- The clock the speed tiebreak measures from, set when the item opens.
  opened_at timestamptz,
  locked_at timestamptz,
  unique (session_id, position)
);
alter table public.items enable row level security;
revoke all on public.items from public, anon, authenticated;

-- Separate, and never granted. See point 1 above: an answer a participant can
-- select is an answer a participant has.
create table if not exists public.item_answers (
  item_id uuid primary key references public.items (id) on delete cascade,
  answer jsonb not null
);
alter table public.item_answers enable row level security;
revoke all on public.item_answers from public, anon, authenticated;

create table if not exists public.responses (
  item_id uuid not null references public.items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value jsonb not null,
  -- Hides the name from the room and the presenter, never from an admin.
  anonymous boolean not null default false,
  submitted_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
alter table public.responses enable row level security;
revoke all on public.responses from public, anon, authenticated;

create index if not exists items_session_idx on public.items (session_id, position);
create index if not exists responses_item_idx on public.responses (item_id);

-- Is the caller running this session? The host, or anyone who may set games up.
create or replace function public.hosts_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session
      and (s.host = (select auth.uid()) or public.can('games.setup'))
  )
$fn$;

revoke all on function public.hosts_session(uuid) from public, anon;
grant execute on function public.hosts_session(uuid) to authenticated;

-- What the room can see right now.
--
-- One item, and only if it is the one the session is on and has been opened.
-- Everything about a future item — including its prompt, which gives away more
-- than people think when the answer is one of the options — stays unreadable
-- until the presenter opens it. The answer is not in this table at all.
create or replace function public.current_item(p_session uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when not exists (select 1 from public.sessions s where s.id = p_session and s.state = 'live')
      then jsonb_build_object('state', 'not-live')
    else coalesce(
      (select jsonb_build_object(
         'id', i.id,
         'kind', i.kind,
         'prompt', i.prompt,
         'payload', i.payload,
         'state', i.state,
         'position', i.position,
         'opened_at', i.opened_at,
         -- your own answer comes back with it, so a reload does not look like
         -- you never answered
         'mine', (select r.value from public.responses r
                  where r.item_id = i.id and r.user_id = (select auth.uid())),
         -- and the correct answer, but only once it has been revealed
         'answer', case when i.state = 'revealed'
                        then (select a.answer from public.item_answers a where a.item_id = i.id)
                   end
       )
       from public.sessions s
       join public.items i on i.id = s.current_item
       where s.id = p_session and i.state <> 'pending'),
      jsonb_build_object('state', 'waiting')
    )
  end
$fn$;

revoke all on function public.current_item(uuid) from public, anon;
grant execute on function public.current_item(uuid) to authenticated;

-- Answering.
--
-- Refuses on a closed item rather than accepting and discarding, because a
-- player who was told "sent" and scored zero has been lied to.
--
-- Only the item on screen, and only while it is open. That is what makes a
-- late arrival miss what has already gone, without needing to know when they
-- arrived — see the note on sessions.late_join, which is not consulted here
-- and does not yet do anything.
create or replace function public.answer_item(
  p_item uuid,
  p_value jsonb,
  p_anonymous boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  it public.items;
  sess public.sessions;
begin
  select * into it from public.items where id = p_item;
  if it.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no such item');
  end if;

  select * into sess from public.sessions where id = it.session_id;
  if sess.state <> 'live' then
    return jsonb_build_object('ok', false, 'reason', 'this session is not running');
  end if;
  if sess.current_item is distinct from p_item then
    return jsonb_build_object('ok', false, 'reason', 'that is not the question on screen');
  end if;
  if it.state <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'answers are closed for this one');
  end if;

  -- submitted_at is never taken from the caller: the speed tiebreak is the
  -- server's clock or it is whatever the fastest editor of a JSON body says.
  insert into public.responses (item_id, user_id, value, anonymous)
  values (p_item, (select auth.uid()), p_value, coalesce(p_anonymous, false))
  on conflict (item_id, user_id) do update
    set value = excluded.value,
        anonymous = excluded.anonymous,
        submitted_at = now();

  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.answer_item(uuid, jsonb, boolean) from public, anon;
grant execute on function public.answer_item(uuid, jsonb, boolean) to authenticated;

-- What the presenter sees, which is deliberately not what the room sees.
--
-- A live count while answers are still coming in — the thing that makes a
-- Slido screen worth looking at — plus the distribution, and for an open
-- question the text itself so it can be read out. Names are withheld for an
-- anonymous response even here: the promise is to the room *and* the person
-- holding the microphone. An admin has a separate route below.
create or replace function public.presenter_view(p_item uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when not public.hosts_session((select session_id from public.items where id = p_item))
      then jsonb_build_object('ok', false, 'reason', 'not allowed')
    else jsonb_build_object(
      'ok', true,
      'answered', (select count(*) from public.responses r where r.item_id = p_item),
      -- the correct answer, which the presenter needs before the reveal in
      -- order to run the reveal
      'answer', (select a.answer from public.item_answers a where a.item_id = p_item),
      'responses', coalesce(
        (select jsonb_agg(jsonb_build_object(
           'value', r.value,
           'at', r.submitted_at,
           'who', case when r.anonymous then null else p.display_name end
         ) order by r.submitted_at)
         from public.responses r
         left join public.profiles p on p.id = r.user_id
         where r.item_id = p_item),
        '[]'::jsonb)
    )
  end
$fn$;

revoke all on function public.presenter_view(uuid) from public, anon;
grant execute on function public.presenter_view(uuid) to authenticated;

-- What the room sees once an item is revealed: shape only, never names.
--
-- Counts per distinct answer, which covers a poll's bar chart, a survey's
-- result and a choice question's "68% of you said B" without any route to who
-- said what. Withheld before the reveal, because a live tally of a scored
-- question tells a late answerer what everyone else picked.
create or replace function public.item_tally(p_item uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when not exists (select 1 from public.items i where i.id = p_item and i.state = 'revealed')
      then jsonb_build_object('ok', false, 'reason', 'not revealed yet')
    else jsonb_build_object(
      'ok', true,
      'total', (select count(*) from public.responses r where r.item_id = p_item),
      'counts', coalesce(
        (select jsonb_object_agg(v, n)
         from (select r.value::text as v, count(*) as n
               from public.responses r where r.item_id = p_item
               group by r.value::text) t),
        '{}'::jsonb)
    )
  end
$fn$;

revoke all on function public.item_tally(uuid) from public, anon;
grant execute on function public.item_tally(uuid) to authenticated;

-- The admin's route behind an anonymous response.
--
-- "Anonymous to the room, not to the company" is only honest if this exists
-- and is named. Prizes need to reach a person and a question read out on stage
-- may need following up; both require knowing who. Gated on users.manage
-- rather than on hosting the session, so running a quiz does not come with the
-- power to unmask its participants.
create or replace function public.item_responses_identified(p_item uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when not public.can('users.manage') then jsonb_build_object('ok', false, 'reason', 'not allowed')
    else jsonb_build_object(
      'ok', true,
      'responses', coalesce(
        (select jsonb_agg(jsonb_build_object(
           'value', r.value,
           'at', r.submitted_at,
           'anonymous', r.anonymous,
           'who', p.display_name,
           'user', r.user_id
         ) order by r.submitted_at)
         from public.responses r
         left join public.profiles p on p.id = r.user_id
         where r.item_id = p_item),
        '[]'::jsonb)
    )
  end
$fn$;

revoke all on function public.item_responses_identified(uuid) from public, anon;
grant execute on function public.item_responses_identified(uuid) to authenticated;

-- Moving a session along. One function rather than four, because the states
-- are a sequence and the interesting part is which transitions are refused.
--
-- open sets opened_at, which is the only clock the speed tiebreak trusts.
-- lock stops answers without showing the answer — the pause a presenter wants
-- before the drum roll. reveal is what makes the answer readable at all.
create or replace function public.advance_session(p_session uuid, p_action text, p_item uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  sess public.sessions;
  target uuid;
begin
  if not public.hosts_session(p_session) then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  select * into sess from public.sessions where id = p_session;

  if p_action = 'start' then
    update public.sessions set state = 'live', started_at = coalesce(started_at, now())
    where id = p_session;
    return jsonb_build_object('ok', true, 'state', 'live');

  elsif p_action = 'close' then
    update public.sessions set state = 'closed', closed_at = now() where id = p_session;
    -- nothing is left open to answer into after the room has gone
    update public.items set state = 'locked', locked_at = coalesce(locked_at, now())
    where session_id = p_session and state = 'open';
    return jsonb_build_object('ok', true, 'state', 'closed');

  elsif p_action = 'show' then
    -- Move to an item and open it in one step: a presenter putting a question
    -- on screen has always meant "and you may answer it".
    target := coalesce(p_item, (
      select i.id from public.items i
      where i.session_id = p_session and i.state = 'pending'
      order by i.position limit 1
    ));
    if target is null then
      return jsonb_build_object('ok', false, 'reason', 'nothing left to show');
    end if;
    -- whatever was on screen stops taking answers
    update public.items set state = 'locked', locked_at = coalesce(locked_at, now())
    where session_id = p_session and state = 'open' and id <> target;
    update public.items set state = 'open', opened_at = coalesce(opened_at, now())
    where id = target and session_id = p_session;
    update public.sessions set current_item = target where id = p_session;
    return jsonb_build_object('ok', true, 'item', target);

  elsif p_action = 'lock' then
    update public.items set state = 'locked', locked_at = now()
    where session_id = p_session and state = 'open';
    return jsonb_build_object('ok', true);

  elsif p_action = 'reveal' then
    update public.items set state = 'revealed', locked_at = coalesce(locked_at, now())
    where session_id = p_session and id = coalesce(p_item, sess.current_item)
      and state in ('open', 'locked');
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'nothing to reveal');
    end if;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'reason', 'no such action');
end;
$fn$;

revoke all on function public.advance_session(uuid, text, uuid) from public, anon;
grant execute on function public.advance_session(uuid, text, uuid) to authenticated;

-- The doorbell, in the shape realtimeSync already uses for daily progress: the
-- event says a session moved, and every client re-reads through current_item()
-- to find out what it is allowed to see. Nothing about the item travels in the
-- notification, which is why the answer cannot leak through it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;

-- Every advance touches the session row, so one channel is enough.
--
-- Found by writing the client rather than by reading this: the doorbell
-- watches `sessions`, and only `show` updated it — `lock` and `reveal` change
-- `items` alone, so a reveal would have fired nothing and the room would have
-- sat looking at a locked question until somebody reloaded. Publishing `items`
-- as well would have worked and been worse: two channels, two orderings, and a
-- table whose rows carry prompts flowing past every subscriber.
alter table public.sessions add column if not exists moved_at timestamptz not null default now();

create or replace function public.advance_session(p_session uuid, p_action text, p_item uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  sess public.sessions;
  target uuid;
begin
  if not public.hosts_session(p_session) then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  select * into sess from public.sessions where id = p_session;

  if p_action = 'start' then
    update public.sessions
      set state = 'live', started_at = coalesce(started_at, now()), moved_at = now()
    where id = p_session;
    return jsonb_build_object('ok', true, 'state', 'live');

  elsif p_action = 'close' then
    update public.sessions set state = 'closed', closed_at = now(), moved_at = now()
    where id = p_session;
    update public.items set state = 'locked', locked_at = coalesce(locked_at, now())
    where session_id = p_session and state = 'open';
    return jsonb_build_object('ok', true, 'state', 'closed');

  elsif p_action = 'show' then
    target := coalesce(p_item, (
      select i.id from public.items i
      where i.session_id = p_session and i.state = 'pending'
      order by i.position limit 1
    ));
    if target is null then
      return jsonb_build_object('ok', false, 'reason', 'nothing left to show');
    end if;
    update public.items set state = 'locked', locked_at = coalesce(locked_at, now())
    where session_id = p_session and state = 'open' and id <> target;
    update public.items set state = 'open', opened_at = coalesce(opened_at, now())
    where id = target and session_id = p_session;
    update public.sessions set current_item = target, moved_at = now() where id = p_session;
    return jsonb_build_object('ok', true, 'item', target);

  elsif p_action = 'lock' then
    update public.items set state = 'locked', locked_at = now()
    where session_id = p_session and state = 'open';
    update public.sessions set moved_at = now() where id = p_session;
    return jsonb_build_object('ok', true);

  elsif p_action = 'reveal' then
    update public.items set state = 'revealed', locked_at = coalesce(locked_at, now())
    where session_id = p_session and id = coalesce(p_item, sess.current_item)
      and state in ('open', 'locked');
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'nothing to reveal');
    end if;
    update public.sessions set moved_at = now() where id = p_session;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'reason', 'no such action');
end;
$fn$;

revoke all on function public.advance_session(uuid, text, uuid) from public, anon;
grant execute on function public.advance_session(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Authoring a session
--
-- Writing goes through functions rather than grants on the tables, for the same
-- reason reading does: the answer lives in item_answers, which no web role can
-- touch, so the only way to set one is a function that checks who is asking
-- first. A grant broad enough to let an editor write an answer would be broad
-- enough to let a participant read one.
--
-- An item that has already been shown cannot be edited. Not tidiness — a
-- question people have answered is a question whose answers mean something, and
-- quietly changing its wording or its correct option rewrites what those
-- answers were. Delete it and add another if it was wrong; that at least leaves
-- the responses attached to the thing that was actually asked.
-- ---------------------------------------------------------------------------

-- The column the sessions table has described since it was written and never
-- had. The comment there said the choice would be "stored from the first
-- session rather than retrofitted onto one", which was true of the intent and
-- false of the schema: `create table if not exists` cannot add a column to the
-- table already standing on the VM, so it has to arrive as an alter either way.
-- Still nothing reads it — answering is limited to the open item, which is
-- 'strict' by accident — but authoring can now set it, so the value is real.
alter table public.sessions add column if not exists late_join text not null
  default 'strict' check (late_join in ('strict', 'open'));

-- The join code. Short enough to read off a projector, and drawn from an
-- alphabet with no 0/O/1/I/L in it — those are the characters that turn a code
-- somebody read correctly into a code that does not exist. Four characters of a
-- 31-letter alphabet is about 920,000, which is not a secret and is not meant
-- to be: the site is behind SSO and a VPN, so the code saves typing rather than
-- guarding anything. Generated below, in "Getting into the room"; the column
-- has to be here because my_sessions() and session_sheet() select it, and on a
-- fresh database a function cannot be created against a column that does not
-- exist yet. (Measured — it cost six extra first-apply errors, which the error
-- count in supabase/tests/run.sh is there to notice.)
alter table public.sessions add column if not exists code text;

-- The sessions this person may run, newest first. Empty rather than an error
-- for everyone else, which is the shape owner_reports() already uses: a list
-- that refuses is a list every caller has to special-case.
--
-- Every session, not only your own, because hosts_session() already lets anyone
-- with games.setup open and edit any of them. Listing less than that would hide
-- sessions the person can still reach by address, which is the worst of both —
-- no privacy gained, and a screen that disagrees with what the buttons on it
-- will do. If editors should only see their own, hosts_session is the place to
-- say so and this follows it.
create or replace function public.my_sessions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    (select jsonb_agg(jsonb_build_object(
       'id', s.id, 'title', s.title, 'state', s.state, 'late_join', s.late_join,
       'code', s.code,
       'items', (select count(*) from public.items i where i.session_id = s.id),
       'created_at', s.created_at
     ) order by s.created_at desc)
     from public.sessions s
     where public.can('games.setup')),
    '[]'::jsonb)
$fn$;

revoke all on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;

create or replace function public.create_session(p_title text, p_late_join text default 'strict')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare new_id uuid;
begin
  if not public.can('games.setup') then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  if coalesce(btrim(p_title), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'a session needs a name');
  end if;
  insert into public.sessions (title, host, late_join)
  values (left(btrim(p_title), 120), (select auth.uid()),
          case when p_late_join = 'open' then 'open' else 'strict' end)
  returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$fn$;

revoke all on function public.create_session(text, text) from public, anon;
grant execute on function public.create_session(text, text) to authenticated;

-- The whole session as its author sees it: every item including the ones not
-- yet shown, and the answers. Gated on hosting, which is what makes it safe to
-- return the thing current_item() spends its length withholding. `kinds` comes
-- back with it because item_kinds is a table and the authoring screen has to
-- offer whatever is in it rather than a list compiled into the bundle.
create or replace function public.session_sheet(p_session uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when not public.hosts_session(p_session)
      then jsonb_build_object('ok', false, 'reason', 'not allowed')
    else jsonb_build_object(
      'ok', true,
      'session', (select jsonb_build_object(
                    'id', s.id, 'title', s.title, 'state', s.state,
                    'late_join', s.late_join, 'current_item', s.current_item,
                    'code', s.code)
                  from public.sessions s where s.id = p_session),
      'kinds', (select jsonb_agg(jsonb_build_object(
                  'kind', k.kind, 'description', k.description, 'scored', k.scored)
                  order by k.kind)
                from public.item_kinds k),
      'items', coalesce(
        (select jsonb_agg(jsonb_build_object(
           'id', i.id, 'position', i.position, 'kind', i.kind, 'prompt', i.prompt,
           'payload', i.payload, 'state', i.state,
           'answer', (select a.answer from public.item_answers a where a.item_id = i.id),
           'responses', (select count(*) from public.responses r where r.item_id = i.id)
         ) order by i.position)
         from public.items i where i.session_id = p_session),
        '[]'::jsonb)
    )
  end
$fn$;

revoke all on function public.session_sheet(uuid) from public, anon;
grant execute on function public.session_sheet(uuid) to authenticated;

-- Create or update one item, answer included. One function rather than two
-- because the answer has to be written in the same breath as the item that
-- owns it: a save that stored the question and then failed to store its answer
-- would leave a scored question with nothing to score against, and the room
-- would not find out until the reveal.
create or replace function public.save_item(
  p_session uuid,
  p_item uuid,
  p_kind text,
  p_prompt text,
  p_payload jsonb default '{}'::jsonb,
  p_answer jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  target uuid;
  prior_state text;
  is_scored boolean;
begin
  if not public.hosts_session(p_session) then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  select k.scored into is_scored from public.item_kinds k where k.kind = p_kind;
  if is_scored is null then
    return jsonb_build_object('ok', false, 'reason', 'no such kind of question');
  end if;
  if coalesce(btrim(p_prompt), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'a question needs to say something');
  end if;

  if p_item is not null then
    select i.state into prior_state
    from public.items i where i.id = p_item and i.session_id = p_session;
    if prior_state is null then
      return jsonb_build_object('ok', false, 'reason', 'no such question in this session');
    end if;
    -- see the note at the top of this section
    if prior_state <> 'pending' then
      return jsonb_build_object('ok', false, 'reason',
        'this one has already been shown - delete it and add another instead');
    end if;
    update public.items
      set kind = p_kind,
          prompt = left(btrim(p_prompt), 500),
          payload = coalesce(p_payload, '{}'::jsonb)
    where id = p_item;
    target := p_item;
  else
    insert into public.items (session_id, position, kind, prompt, payload)
    values (p_session,
            coalesce((select max(i.position) + 1 from public.items i
                      where i.session_id = p_session), 1),
            p_kind, left(btrim(p_prompt), 500), coalesce(p_payload, '{}'::jsonb))
    returning id into target;
  end if;

  -- An unscored kind has no answer, and storing one would be inventing a right
  -- answer to a question that did not have one. Changing a question from choice
  -- to survey therefore drops the answer rather than leaving it behind where
  -- item_tally would still find it.
  if p_answer is null or p_answer = 'null'::jsonb or not is_scored then
    delete from public.item_answers where item_id = target;
  else
    insert into public.item_answers (item_id, answer) values (target, p_answer)
    on conflict (item_id) do update set answer = excluded.answer;
  end if;

  return jsonb_build_object('ok', true, 'id', target);
end;
$fn$;

revoke all on function public.save_item(uuid, uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_item(uuid, uuid, text, text, jsonb, jsonb) to authenticated;

create or replace function public.delete_item(p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare sess uuid;
begin
  select i.session_id into sess from public.items i where i.id = p_item;
  if sess is null or not public.hosts_session(sess) then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  -- Deleting takes the responses with it, which is the honest outcome: they
  -- were answers to a question that no longer exists. Refusing once somebody
  -- has answered would be worse — a question that has just gone wrong in front
  -- of the room is exactly the one you need to remove, and it is never the one
  -- nobody has answered.
  --
  -- The session's current_item is a plain column, so a delete could leave it
  -- pointing at nothing; current_item() joins and finds no row, which reads as
  -- 'waiting'. Clearing it explicitly says so rather than relying on that.
  update public.sessions set current_item = null, moved_at = now()
  where id = sess and current_item = p_item;
  delete from public.items where id = p_item;
  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.delete_item(uuid) from public, anon;
grant execute on function public.delete_item(uuid) to authenticated;

-- Move an item up or down. Positions are unique per session, so a swap cannot
-- be two plain updates — the first collides with the row it is passing.
--
-- Nor can it be one update touching both rows: a unique *constraint* that is
-- not declared deferrable is checked per row as the update walks them, not once
-- at the end, so `set position = case when id = a then b else a end` fails on
-- the first row it rewrites. (Measured, having written it the other way first.)
-- The alternative is making the constraint deferrable, which means dropping and
-- recreating an index on a table that is already live for the sake of one
-- function — so this parks the row somewhere no real position can be instead.
-- Positions are always >= 1, and only one row is ever negative, inside this
-- one transaction.
create or replace function public.move_item(p_item uuid, p_delta int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  sess uuid;
  here int;
  other_id uuid;
  there int;
begin
  select i.session_id, i.position into sess, here from public.items i where i.id = p_item;
  if sess is null or not public.hosts_session(sess) then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  -- the neighbour in that direction, not here + 1: positions have gaps once
  -- anything has been deleted
  select i.id, i.position into other_id, there
  from public.items i
  where i.session_id = sess
    and case when p_delta < 0 then i.position < here else i.position > here end
  order by case when p_delta < 0 then -i.position else i.position end
  limit 1;
  if other_id is null then
    return jsonb_build_object('ok', false, 'reason', 'it is already at the end');
  end if;
  update public.items set position = -here where id = p_item;
  update public.items set position = here where id = other_id;
  update public.items set position = there where id = p_item;
  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.move_item(uuid, int) from public, anon;
grant execute on function public.move_item(uuid, int) to authenticated;

create or replace function public.delete_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not public.hosts_session(p_session) then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  -- A session that has run is a record of what the room answered, and the
  -- responses go with it. Draft only; close it instead.
  if exists (select 1 from public.sessions s where s.id = p_session and s.state <> 'draft') then
    return jsonb_build_object('ok', false, 'reason',
      'this one has already run - close it rather than deleting it');
  end if;
  delete from public.sessions where id = p_session;
  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.delete_session(uuid) from public, anon;
grant execute on function public.delete_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Getting into the room
--
-- Everything below this point in the file was about running a session and
-- answering in one, and all of it worked — measured end to end in
-- supabase/tests/lifecycle.sql, twenty-eight checks, answering included. What
-- did not exist was any way for a participant to arrive. The only two links to
-- /live/<id> were on the authoring screen, which needs games.setup to see, so
-- the room's route in was somebody pasting a URL with a raw UUID in it. A
-- feature nobody can reach is not a feature.
--
-- Two ways in, because they fail differently. A list is right when everyone is
-- already signed in at their own screen and nobody should have to type
-- anything; a code is right when the answer to "how do I get in" has to fit on
-- a slide or be said out loud across a room. Both resolve to the same address.
-- ---------------------------------------------------------------------------

create or replace function public.new_session_code()
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  attempt int;
  ch int;
begin
  for attempt in 1..50 loop
    candidate := '';
    for ch in 1..4 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    -- Free if no session that anyone could still join is using it. Closed
    -- sessions release their code: a month of weekly trivia would otherwise
    -- burn through four-character codes for no reason, and a code that points
    -- at something finished is not a collision anybody experiences.
    if not exists (
      select 1 from public.sessions s where s.code = candidate and s.state <> 'closed'
    ) then
      return candidate;
    end if;
  end loop;
  -- 50 collisions means the space is genuinely full rather than unlucky.
  return null;
end;
$fn$;

revoke all on function public.new_session_code() from public, anon, authenticated;

-- Existing sessions predate the column.
update public.sessions set code = public.new_session_code() where code is null;

create unique index if not exists sessions_open_code_key
  on public.sessions (code) where state <> 'closed';

create or replace function public.create_session(p_title text, p_late_join text default 'strict')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare new_id uuid;
begin
  if not public.can('games.setup') then
    return jsonb_build_object('ok', false, 'reason', 'not allowed');
  end if;
  if coalesce(btrim(p_title), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'a session needs a name');
  end if;
  insert into public.sessions (title, host, late_join, code)
  values (left(btrim(p_title), 120), (select auth.uid()),
          case when p_late_join = 'open' then 'open' else 'strict' end,
          public.new_session_code())
  returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$fn$;

revoke all on function public.create_session(text, text) from public, anon;
grant execute on function public.create_session(text, text) to authenticated;

-- What is running, for anybody signed in.
--
-- Live only. A draft is not a thing to join — it is somebody's half-built
-- questions — and a closed one is over. Title and code, never the questions:
-- this is the door, not the room.
create or replace function public.live_sessions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    (select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'code', s.code)
                      order by s.started_at desc)
     from public.sessions s
     where s.state = 'live' and (select auth.uid()) is not null),
    '[]'::jsonb)
$fn$;

revoke all on function public.live_sessions() from public, anon;
grant execute on function public.live_sessions() to authenticated;

-- A code typed off a slide. Case and spacing are whatever the person typing
-- them felt like, so neither is allowed to be the reason it fails.
create or replace function public.session_by_code(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    (select jsonb_build_object('ok', true, 'id', s.id, 'title', s.title)
     from public.sessions s
     where s.state = 'live'
       and s.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
       and (select auth.uid()) is not null),
    jsonb_build_object('ok', false, 'reason', 'no session is running with that code'))
$fn$;

revoke all on function public.session_by_code(text) from public, anon;
grant execute on function public.session_by_code(text) to authenticated;

-- The presenter's header: the name of the session and the code to read out.
--
-- Separate from session_sheet(), which returns every question and every answer,
-- because the presenter screen wants this before a session starts and on every
-- load, and pulling the whole sheet to display four characters would put the
-- answers on the wire for no reason. Separate from live_sessions() because a
-- draft is not listed there and a draft is exactly when the code goes up.
create or replace function public.session_door(p_session uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when not public.hosts_session(p_session)
      then jsonb_build_object('ok', false, 'reason', 'not allowed')
    else (select jsonb_build_object('ok', true, 'title', s.title, 'code', s.code,
                                    'state', s.state)
          from public.sessions s where s.id = p_session)
  end
$fn$;

revoke all on function public.session_door(uuid) from public, anon;
grant execute on function public.session_door(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The clock, and what the presenter needs to run the room
--
-- A per-question countdown lives in `payload.seconds`, not in a column of its
-- own. The rule for payload is "what the room is shown, never the answer", and
-- a countdown is literally on their screen — so it travels with the options
-- through current_item() without a single new field, and a kind that wants a
-- different clock later needs no migration to have one.
--
-- **The clock is enforced here, not in the browser.** A timer that only stops
-- the button from being drawn is a timer that a second tab ignores, and the
-- tiebreak is speed — so the one thing it must not be is advisory. answer_item
-- refuses a late answer whatever the client believes, and the presenter's
-- screen firing `lock` when it runs out is a convenience on top of that rather
-- than the mechanism.
-- ---------------------------------------------------------------------------

-- How long this question is open for, in seconds, or null for no clock at all.
-- Read out of payload rather than declared, so nothing here needs to know which
-- kinds have one.
create or replace function public.item_seconds(p_payload jsonb)
returns int
language sql
immutable
set search_path = ''
as $fn$
  -- The regex is not paranoia about the authoring screen, which sends a number.
  -- It is that payload is jsonb by design, so this has to be total: a cast that
  -- throws inside answer_item would turn one bad question into a session where
  -- nobody can answer anything.
  select case
    when p_payload ->> 'seconds' ~ '^[0-9]{1,5}$'
     and (p_payload ->> 'seconds')::int between 5 and 3600
    then (p_payload ->> 'seconds')::int
  end
$fn$;

create or replace function public.answer_item(
  p_item uuid,
  p_value jsonb,
  p_anonymous boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  it public.items;
  sess public.sessions;
  window_seconds int;
begin
  select * into it from public.items where id = p_item;
  if it.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no such item');
  end if;

  select * into sess from public.sessions where id = it.session_id;
  if sess.state <> 'live' then
    return jsonb_build_object('ok', false, 'reason', 'this session is not running');
  end if;
  if sess.current_item is distinct from p_item then
    return jsonb_build_object('ok', false, 'reason', 'that is not the question on screen');
  end if;
  if it.state <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'answers are closed for this one');
  end if;

  -- The clock, on the server's own time. A browser whose clock is slow does not
  -- get longer to answer than the room it is in.
  window_seconds := public.item_seconds(it.payload);
  if window_seconds is not null
     and it.opened_at is not null
     and now() > it.opened_at + (window_seconds * interval '1 second') then
    return jsonb_build_object('ok', false, 'reason', 'time is up for this one');
  end if;

  -- submitted_at is never taken from the caller: the speed tiebreak is the
  -- server's clock or it is whatever the fastest editor of a JSON body says.
  insert into public.responses (item_id, user_id, value, anonymous)
  values (p_item, (select auth.uid()), p_value, coalesce(p_anonymous, false))
  on conflict (item_id, user_id) do update
    set value = excluded.value,
        anonymous = excluded.anonymous,
        submitted_at = now();

  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.answer_item(uuid, jsonb, boolean) from public, anon;
grant execute on function public.answer_item(uuid, jsonb, boolean) to authenticated;

-- current_item gains the server's clock.
--
-- Without it a countdown is drawn against the viewer's own clock, and a laptop
-- twenty seconds out shows a room-wide question ending at a time nobody else
-- agrees with — including the server, which is the only opinion that decides
-- whether an answer counts. The client takes the difference once and draws
-- against that.
create or replace function public.current_item(p_session uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when not exists (select 1 from public.sessions s where s.id = p_session and s.state = 'live')
      then jsonb_build_object('state', 'not-live', 'now', now())
    else coalesce(
      (select jsonb_build_object(
         'id', i.id,
         'kind', i.kind,
         'prompt', i.prompt,
         'payload', i.payload,
         'state', i.state,
         'position', i.position,
         'opened_at', i.opened_at,
         'seconds', public.item_seconds(i.payload),
         'now', now(),
         'mine', (select r.value from public.responses r
                  where r.item_id = i.id and r.user_id = (select auth.uid())),
         'answer', case when i.state = 'revealed'
                        then (select a.answer from public.item_answers a where a.item_id = i.id)
                   end
       )
       from public.sessions s
       join public.items i on i.id = s.current_item
       where s.id = p_session and i.state <> 'pending'),
      jsonb_build_object('state', 'waiting', 'now', now())
    )
  end
$fn$;

revoke all on function public.current_item(uuid) from public, anon;
grant execute on function public.current_item(uuid) to authenticated;

-- The presenter's header, now carrying enough to say what the next move is.
--
-- One primary action beats five raw verbs: the previous controls were Start /
-- Next question / Lock / Reveal / Close all at once, with nothing on screen
-- saying which question you were on, how many were left, or which of the five
-- was the sensible one to press next. Working that out is the presenter's job
-- in front of a room, which is exactly when it should not be.
create or replace function public.session_door(p_session uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when not public.hosts_session(p_session)
      then jsonb_build_object('ok', false, 'reason', 'not allowed')
    else (select jsonb_build_object(
            'ok', true, 'title', s.title, 'code', s.code, 'state', s.state,
            'total', (select count(*) from public.items i where i.session_id = s.id),
            'pending', (select count(*) from public.items i
                        where i.session_id = s.id and i.state = 'pending'),
            'position', (select i.position from public.items i where i.id = s.current_item),
            'item_state', (select i.state from public.items i where i.id = s.current_item))
          from public.sessions s where s.id = p_session)
  end
$fn$;

revoke all on function public.session_door(uuid) from public, anon;
grant execute on function public.session_door(uuid) to authenticated;
