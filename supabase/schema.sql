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

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  using ((select auth.uid()) = id);

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
-- daily_stats: cross-player aggregates for one day's daily puzzle. Security
-- definer so it can read past RLS, but it exposes ONLY aggregates — never
-- rows. Callable by everyone: signed-out visitors can see the numbers,
-- while only signed-in players contribute to them.
-- ---------------------------------------------------------------------------
create or replace function public.daily_stats(p_game text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  result jsonb;
begin
  if p_game = 'guess' then
    select jsonb_build_object(
      'players', count(distinct user_id),
      'boards', count(*),
      'winRate', round(100.0 * count(*) filter (where (payload->>'won')::boolean) / greatest(count(*), 1)),
      'avgGuesses', round(avg((payload->>'guesses')::numeric) filter (where (payload->>'won')::boolean), 1)
    ) into result
    from public.game_results
    where game = 'guess' and daily and puzzle_date = p_date;

  elsif p_game = 'hive' then
    with per_user as (
      select user_id,
        max((payload->>'score')::numeric) as best,
        bool_or((payload->>'genius')::boolean) as genius,
        bool_or((payload->>'queenBee')::boolean) as queen
      from public.game_results
      where game = 'hive' and daily and puzzle_date = p_date
      group by user_id
    )
    select jsonb_build_object(
      'players', count(*),
      'avgScore', round(avg(best)),
      'genius', count(*) filter (where genius),
      'queenBee', count(*) filter (where queen)
    ) into result
    from per_user;

  elsif p_game in ('scramble', 'grid') then
    select jsonb_build_object(
      'players', count(distinct user_id),
      'avgScore', round(avg((payload->>'score')::numeric)),
      'topScore', max((payload->>'score')::numeric)
    ) into result
    from public.game_results
    where game = p_game and daily and puzzle_date = p_date;

  elsif p_game = 'box' then
    select jsonb_build_object(
      'players', count(distinct user_id),
      'avgWords', round(avg((payload->>'words')::numeric), 1),
      'fewestWords', min((payload->>'words')::int)
    ) into result
    from public.game_results
    where game = 'box' and daily and puzzle_date = p_date;

  elsif p_game = 'weave' then
    with per_user as (
      select user_id,
        bool_or((payload->>'solved')::boolean) as solved,
        min((payload->>'timeMs')::numeric) filter (where (payload->>'solved')::boolean) as best_time,
        max((payload->>'hints')::numeric) as hints
      from public.game_results
      where game = 'weave' and daily and puzzle_date = p_date
      group by user_id
    )
    select jsonb_build_object(
      'players', count(*),
      'solvedPct', round(100.0 * count(*) filter (where solved) / greatest(count(*), 1)),
      'avgTimeMs', round(avg(best_time)),
      'avgHints', round(avg(hints), 1)
    ) into result
    from per_user;

  else
    return null;
  end if;

  return coalesce(result, '{}'::jsonb);
end;
$$;

grant execute on function public.daily_stats(text, date) to anon, authenticated;

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
