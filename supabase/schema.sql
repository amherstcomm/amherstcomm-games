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
  squashed text;
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

  squashed := public.normalise_name(cleaned);
  if exists (
    select 1 from public.blocked_names b
    where (b.match = 'substring' and squashed like '%' || b.pattern || '%')
       or (b.match = 'exact' and squashed = b.pattern)
  ) then
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
  select exists (
    select 1 from public.blocked_names b
    where (b.match = 'substring' and public.normalise_name(p_name) like '%' || b.pattern || '%')
       or (b.match = 'exact' and public.normalise_name(p_name) = b.pattern)
  );
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC, and PostgREST exposes
-- anything in this schema that a web role can execute. Left alone, this one
-- would let anybody map the blocklist a guess at a time — which is the exact
-- thing keeping the list out of the repo was for.
revoke execute on function public.would_block(text) from public, anon, authenticated;

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
create or replace function public.result_is_plausible(p_game text, p_state jsonb, p_result jsonb)
returns boolean language plpgsql immutable as $$
declare
  words text[];
  has_state boolean := p_state is not null and p_state <> '{}'::jsonb;
begin
  if p_result is null then return false; end if;

  if p_game = 'guess' then
    if (p_result->>'guesses')::int not between 1 and 6 then return false; end if;
    -- nobody reads, thinks and types a word in under two seconds
    if coalesce((p_result->>'timeMs')::numeric, 0) < 2000 then return false; end if;
    if has_state and p_state ? 'guesses' then
      return jsonb_array_length(p_state->'guesses') = (p_result->>'guesses')::int;
    end if;
    return true;

  elsif p_game in ('hive', 'scramble', 'grid') then
    if not has_state or not (p_state ? 'found') then
      return coalesce((p_result->>'score')::numeric, -1) >= 0;
    end if;
    select array_agg(w) into words
    from jsonb_array_elements_text(p_state->'found') as w;
    if (p_result->>'words')::int is distinct from coalesce(array_length(words, 1), 0) then
      return false;
    end if;
    return (p_result->>'score')::numeric = case p_game
      when 'hive' then public.hive_score(words)
      when 'scramble' then public.scramble_score(words, 7)
      else public.grid_score(words)
    end;

  elsif p_game = 'box' then
    -- only a recorded time can be too fast; an absent or zero one means the
    -- clock never ran, which is not the same as a three-second solve
    if coalesce((p_result->>'timeMs')::numeric, 0) > 0
       and (p_result->>'timeMs')::numeric < 3000 then
      return false;
    end if;
    -- Prefer the chain stored with the result. Boxed is the one game you can
    -- restart after finishing, and the row keeps its result when you do, so
    -- the live board stops being evidence — checking against it flagged
    -- perfectly good solves.
    if p_result ? 'chain' then
      return (p_result->>'words')::int = jsonb_array_length(p_result->'chain');
    end if;
    if has_state and jsonb_array_length(coalesce(p_state->'chain', '[]'::jsonb)) > 0 then
      return (p_result->>'words')::int = jsonb_array_length(p_state->'chain');
    end if;
    return (p_result->>'words')::int >= 1;

  elsif p_game = 'weave' then
    -- a whole board traced by hand takes longer than this
    if (p_result->>'solved')::boolean and coalesce((p_result->>'timeMs')::numeric, 0) < 10000 then
      return false;
    end if;
    return true;
  end if;

  return false;
end;
$$;

-- Everything the boards throw away, for occasional inspection. No grants: only
-- the owner, through the SQL editor. A moderation queue nobody works is worse
-- than none, so this is a place to look rather than a job to do.
create or replace view public.suspect_daily_results as
  select dp.user_id, p.display_name, dp.game, dp.puzzle_date, dp.env, dp.result, dp.state
  from public.daily_progress dp
  left join public.profiles p on p.id = dp.user_id
  where dp.completed and not public.result_is_plausible(dp.game, dp.state, dp.result);

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
create or replace function public.leaderboard(p_days int default 1, p_env text default 'prod')
returns jsonb
language plpgsql
security definer
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
      where dp.game = 'guess' and dp.completed and dp.env = p_env and dp.puzzle_date >= since
        and p.display_name is not null
        and public.result_is_plausible('guess', dp.state, dp.result)
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
      where dp.game = g.game and dp.completed and dp.env = p_env and dp.puzzle_date >= since
        and p.display_name is not null
        and public.result_is_plausible(g.game, dp.state, dp.result)
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
      where dp.game = 'box' and dp.completed and dp.env = p_env and dp.puzzle_date >= since
        and p.display_name is not null
        and public.result_is_plausible('box', dp.state, dp.result)
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
      where dp.game = 'weave' and dp.completed and dp.env = p_env and dp.puzzle_date >= since
        and p.display_name is not null
        and public.result_is_plausible('weave', dp.state, dp.result)
      group by p.display_name
      having count(*) filter (where (dp.result->>'solved')::boolean) > 0
    ) a
    order by rk
    limit 10
  ) s;
  out_json := jsonb_set(out_json, '{weave}', part);

  return out_json;
end;
$$;

grant execute on function public.leaderboard(int, text) to anon, authenticated;

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
