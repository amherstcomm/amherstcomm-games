-- Weave's leaderboard, down to its third level.
--
-- Days solved, then the fastest, then the fewest hints. The third exists
-- because the first two tie: a round is one board, so everyone who solved it
-- has one solve, and two people within a second of each other is ordinary.
-- Played at extreme here so the rows cannot mix with another file's.
\set ON_ERROR_STOP on

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.today() returns date
language sql as $$ select (now() at time zone 'America/New_York')::date $$;

insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-000000000001', 'wendy.weaver@amherstcomm.net'),
  ('e1000000-0000-0000-0000-000000000002', 'walt.weaver@amherstcomm.net'),
  ('e1000000-0000-0000-0000-000000000003', 'winnie.weaver@amherstcomm.net')
on conflict do nothing;

create or replace function pg_temp.solved(who uuid, day date, ms int, hints int) returns void
language sql as $$
  insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
  values (who, 'weave', '', 'extreme', day, 'prod', '{}'::jsonb, true,
          jsonb_build_object('solved', true, 'timeMs', ms, 'hints', hints))
  on conflict (user_id, game, variant, difficulty, puzzle_date, env)
  do update set completed = true, result = excluded.result
$$;

-- This file's own three, in the order the board puts them. Filtered rather
-- than assumed alone: every test file shares one database, and another one's
-- weave rows sit on this board too.
create or replace function pg_temp.board() returns text[]
language sql as $$
  select coalesce(array(
    select x->>'name'
    from jsonb_array_elements(
      public.boards_between(pg_temp.today() - 7, pg_temp.today(), 'prod', 'extreme', null, 50)->'weave') x
    where x->>'name' like '% Weaver'), '{}')
$$;

-- Same day, same time to the millisecond: only the hints separate them.
select pg_temp.solved('e1000000-0000-0000-0000-000000000001', pg_temp.today(), 120000, 3);
select pg_temp.solved('e1000000-0000-0000-0000-000000000002', pg_temp.today(), 120000, 0);
select pg_temp.check('level on solves and on the clock, fewer hints goes first',
  pg_temp.board() = array['Walt Weaver', 'Wendy Weaver']);

select pg_temp.check('and the board says how many, because it ranked on them',
  (select (x->>'hints')::int from jsonb_array_elements(
     public.boards_between(pg_temp.today() - 7, pg_temp.today(), 'prod', 'extreme', null, 50)->'weave') x
   where x->>'name' = 'Wendy Weaver') = 3);

-- The clock still outranks the hints, and solves still outrank both.
select pg_temp.solved('e1000000-0000-0000-0000-000000000003', pg_temp.today(), 60000, 9);
select pg_temp.check('a faster solve beats fewer hints',
  pg_temp.board() = array['Winnie Weaver', 'Walt Weaver', 'Wendy Weaver']);
select pg_temp.solved('e1000000-0000-0000-0000-000000000001', pg_temp.today() - 1, 300000, 4);
select pg_temp.check('and more days solved beats everything',
  pg_temp.board() = array['Wendy Weaver', 'Winnie Weaver', 'Walt Weaver']);

-- A row written before hints were recorded has none, and counts as none rather
-- than falling off the board.
insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
values ('e1000000-0000-0000-0000-000000000002', 'weave', '', 'extreme', pg_temp.today() - 1, 'prod',
        '{}'::jsonb, true, '{"solved": true, "timeMs": 300000}'::jsonb)
on conflict do nothing;
select pg_temp.check('a result from before hints were recorded reads as none',
  (select (x->>'hints')::int from jsonb_array_elements(
     public.boards_between(pg_temp.today() - 7, pg_temp.today(), 'prod', 'extreme', null, 50)->'weave') x
   where x->>'name' = 'Walt Weaver') = 0);

\echo '--- weave board checks passed ---'
