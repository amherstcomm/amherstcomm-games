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
-- game_results: append-only log of completed games. Aggregates (lifetime
-- stats, leaderboards, "X% solved today") all derive from this.
-- ---------------------------------------------------------------------------
create table if not exists public.game_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null check (game in ('guess', 'hive', 'scramble', 'grid', 'box', 'weave')),
  daily boolean not null,
  puzzle_date date, -- Eastern-time date of the daily puzzle; null for practice
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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
  game text not null check (game in ('guess', 'hive', 'scramble', 'grid', 'box', 'weave')),
  variant text not null default '',
  puzzle_date date not null,
  env text not null default 'prod',
  state jsonb not null default '{}'::jsonb,
  completed boolean not null default false,
  result jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, game, variant, puzzle_date, env)
);

create index if not exists daily_progress_lookup_idx
  on public.daily_progress (game, puzzle_date, env)
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
on conflict (user_id, game, variant, puzzle_date, env) do nothing;

-- ---------------------------------------------------------------------------
-- daily_stats: cross-player aggregates for one day's daily puzzle. Security
-- definer so it can read past RLS, but it exposes ONLY aggregates — never
-- rows. Callable by everyone: signed-out visitors can see the numbers,
-- while only signed-in players contribute to them. p_env separates the two
-- sites' independently generated daily sets ('prod' / 'dev'), which share
-- dates but not puzzles.
-- ---------------------------------------------------------------------------
drop function if exists public.daily_stats(text, date);

create or replace function public.daily_stats(p_game text, p_date date, p_env text default 'prod')
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
    where game = 'guess' and completed and puzzle_date = p_date and env = p_env;

  elsif p_game = 'hive' then
    select jsonb_build_object(
      'players', count(*),
      'avgScore', round(avg((dp.result->>'score')::numeric)),
      'genius', count(*) filter (where (dp.result->>'genius')::boolean),
      'queenBee', count(*) filter (where (dp.result->>'queenBee')::boolean)
    ) into out_json
    from public.daily_progress dp
    where game = 'hive' and completed and puzzle_date = p_date and env = p_env;

  elsif p_game in ('scramble', 'grid') then
    select jsonb_build_object(
      'players', count(distinct user_id),
      'avgScore', round(avg((dp.result->>'score')::numeric)),
      'topScore', max((dp.result->>'score')::numeric)
    ) into out_json
    from public.daily_progress dp
    where game = p_game and completed and puzzle_date = p_date and env = p_env;

  elsif p_game = 'box' then
    select jsonb_build_object(
      'players', count(distinct user_id),
      'avgWords', round(avg((dp.result->>'words')::numeric), 1),
      'fewestWords', min((dp.result->>'words')::int)
    ) into out_json
    from public.daily_progress dp
    where game = 'box' and completed and puzzle_date = p_date and env = p_env;

  elsif p_game = 'weave' then
    select jsonb_build_object(
      'players', count(*),
      'solvedPct', round(100.0 * count(*) filter (where (dp.result->>'solved')::boolean) / greatest(count(*), 1)),
      'avgTimeMs', round(avg((dp.result->>'timeMs')::numeric) filter (where (dp.result->>'solved')::boolean)),
      'avgHints', round(avg((dp.result->>'hints')::numeric), 1)
    ) into out_json
    from public.daily_progress dp
    where game = 'weave' and completed and puzzle_date = p_date and env = p_env;

  else
    return null;
  end if;

  return coalesce(out_json, '{}'::jsonb);
end;
$$;

grant execute on function public.daily_stats(text, date, text) to anon, authenticated;

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
