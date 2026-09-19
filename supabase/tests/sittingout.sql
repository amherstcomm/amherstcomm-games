-- Sitting out.
--
-- A player can take themselves out of every board, standing, shared stat and
-- trivia ranking. What has to hold is that it cannot be used to hide a lead:
-- a result posted before sitting out, or played while out, never counts again
-- -- not after stepping back in, not after deleting it and writing it back.
-- Only what is played after stepping back in counts.
\set ON_ERROR_STOP on

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select (now() at time zone 'America/New_York')::date + n $$;

-- A solved 5x5 on day d, as the browser writes it.
create or replace function pg_temp.solve(who uuid, day date, ms int) returns void
language sql as $$
  insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
  values (who, 'squares', '5', 'extreme', day, 'prod', '{}'::jsonb, true,
          jsonb_build_object('size', 5, 'solved', true, 'timeMs', ms))
  on conflict (user_id, game, variant, difficulty, puzzle_date, env)
  do update set completed = true, result = excluded.result
$$;

-- Who is on the squares board over the last week.
create or replace function pg_temp.board() returns text[]
language sql as $$
  select coalesce(array(
    select x->>'name'
    from jsonb_array_elements(
      public.boards_between(pg_temp.d(-7), pg_temp.d(0), 'prod', 'extreme', null, 50)->'squares5') x
    order by x->>'name'), '{}')
$$;

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-000000000001', 'sam.sitter@amherstcomm.net'),
  ('c0000000-0000-0000-0000-000000000002', 'pat.player@amherstcomm.net')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Puzzles
-- ---------------------------------------------------------------------------
select pg_temp.solve('c0000000-0000-0000-0000-000000000001', pg_temp.d(0), 30000);
select pg_temp.solve('c0000000-0000-0000-0000-000000000002', pg_temp.d(0), 60000);
select pg_temp.check('everyone is on the board to begin with',
  pg_temp.board() @> array['Pat Player', 'Sam Sitter']);

-- Weave for the shared stats: daily_stats has no squares branch.
insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
select u, 'weave', '', 'extreme', pg_temp.d(0), 'prod', '{}'::jsonb, true,
       '{"solved": true, "timeMs": 90000, "hints": 0}'::jsonb
from unnest(array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002']::uuid[]) u
on conflict do nothing;
select pg_temp.check('and in the shared stats',
  (public.daily_stats('weave', pg_temp.d(0), 'prod', 'extreme')->>'players')::int = 2);

set session "test.uid" = 'c0000000-0000-0000-0000-000000000001';
create temp table said as select public.set_competing(false) j;
select pg_temp.check('a player can sit out',
  (select j->>'ok' from said) = 'true' and public.my_competing() = false);
select pg_temp.check('and their results leave the boards',
  not (pg_temp.board() @> array['Sam Sitter']) and pg_temp.board() @> array['Pat Player']);
select pg_temp.check('and the shared stats',
  (public.daily_stats('weave', pg_temp.d(0), 'prod', 'extreme')->>'players')::int = 1);

-- Played while out: forfeited as it lands.
select pg_temp.solve('c0000000-0000-0000-0000-000000000001', pg_temp.d(-2), 20000);

delete from said;
insert into said select public.set_competing(true);
select pg_temp.check('stepping back in is allowed',
  (select j->>'ok' from said) = 'true' and public.my_competing() = true);
select pg_temp.check('but what was posted before sitting out stays out',
  not (pg_temp.board() @> array['Sam Sitter']));

-- The backdoor: delete everything, and write the old winning result back.
select public.clear_my_stats();
select pg_temp.solve('c0000000-0000-0000-0000-000000000001', pg_temp.d(0), 30000);
select pg_temp.solve('c0000000-0000-0000-0000-000000000001', pg_temp.d(-2), 20000);
select pg_temp.check('deleting a forfeited result and writing it back does not bring it back',
  not (pg_temp.board() @> array['Sam Sitter']));

-- A board played after stepping back in is a new board, and counts.
select pg_temp.solve('c0000000-0000-0000-0000-000000000001', pg_temp.d(-1), 40000);
select pg_temp.check('a board played after stepping back in counts',
  pg_temp.board() @> array['Sam Sitter']);
select pg_temp.check('and only that one',
  (select (x->>'value')::int from jsonb_array_elements(
     public.boards_between(pg_temp.d(-7), pg_temp.d(0), 'prod', 'extreme', null, 50)->'squares5') x
   where x->>'name' = 'Sam Sitter') = 1);

-- ---------------------------------------------------------------------------
-- Trivia
-- ---------------------------------------------------------------------------
insert into public.sessions (id, title, host, state, mode) values
  ('c1000000-0000-0000-0000-000000000001', 'Sit-out Quiz',
   'c0000000-0000-0000-0000-000000000002', 'live', 'live')
on conflict do nothing;
insert into public.items (id, session_id, position, kind, prompt, state, opened_at) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   1, 'choice', 'Before', 'revealed', now() - interval '5 minutes'),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001',
   2, 'choice', 'While out', 'revealed', now() - interval '4 minutes'),
  ('c2000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001',
   3, 'choice', 'After', 'revealed', now() - interval '3 minutes')
on conflict do nothing;
insert into public.item_answers (item_id, answer) values
  ('c2000000-0000-0000-0000-000000000001', '{"correct": ["a"]}'),
  ('c2000000-0000-0000-0000-000000000002', '{"correct": ["a"]}'),
  ('c2000000-0000-0000-0000-000000000003', '{"correct": ["a"]}')
on conflict do nothing;

create or replace function pg_temp.answer(who uuid, item uuid) returns void
language sql as $$
  insert into public.responses (item_id, user_id, value, submitted_at)
  values (item, who, '"a"'::jsonb, now()) on conflict do nothing
$$;
create or replace function pg_temp.sam_points() returns numeric
language sql as $$
  select coalesce((select k.points from public.session_ranking('c1000000-0000-0000-0000-000000000001') k
                   where k.name = 'Sam Sitter'), 0)
$$;

select pg_temp.answer('c0000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001');
select pg_temp.check('an answer counts while in',
  pg_temp.sam_points() = 1);

select public.set_competing(false);
select pg_temp.check('sitting out takes it out of the session ranking',
  pg_temp.sam_points() = 0);
select pg_temp.answer('c0000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002');

select public.set_competing(true);
select pg_temp.answer('c0000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000003');
select pg_temp.check('back in, only the question answered after counts',
  pg_temp.sam_points() = 1);
select pg_temp.check('and no question answered before or while out wins',
  not exists (select 1 from public.item_points('c2000000-0000-0000-0000-000000000001') ip
                  where ip.user_id = 'c0000000-0000-0000-0000-000000000001')
  and not exists (select 1 from public.item_points('c2000000-0000-0000-0000-000000000002') ip
                  where ip.user_id = 'c0000000-0000-0000-0000-000000000001'));

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
reset "test.uid";
select pg_temp.check('sitting out needs somebody signed in',
  (public.set_competing(false)->>'reason') = 'not signed in');
select pg_temp.check('no browser may read or write a forfeit',
  not has_table_privilege('authenticated', 'public.forfeited_boards', 'select')
  and not has_table_privilege('authenticated', 'public.forfeited_boards', 'delete')
  and not has_table_privilege('authenticated', 'public.forfeited_answers', 'select')
  and not has_table_privilege('authenticated', 'public.forfeited_answers', 'delete'));
select pg_temp.check('nor flip the switch by writing the profile directly',
  not has_column_privilege('authenticated', 'public.profiles', 'competing', 'update'));
select pg_temp.check('anon may not sit anybody out',
  not has_function_privilege('anon', 'public.set_competing(boolean)', 'execute'));

\echo '--- sitting-out checks passed ---'
