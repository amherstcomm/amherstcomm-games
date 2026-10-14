-- A new board each day, for chosen games in a round.
--
-- Asked for: a Guess the Word round over several days with a different word
-- each day, worth one placing in the round -- ten points for first, not ten a
-- day. What has to hold: each day's board is served on its own day and only
-- then, the round's standing for that game is one ranking across its days, a
-- game a round does not have cannot be set to change daily, a round under way
-- cannot change which of its games do, and everything that finds "the round's
-- board" -- hints, the organiser's reset -- finds today's for such a game.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('0f000000-0000-0000-0000-000000000001', 'daily.organiser@example.com'),
  ('0f000000-0000-0000-0000-000000000002', 'ada.daily@example.com'),
  ('0f000000-0000-0000-0000-000000000003', 'bea.daily@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('0f000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

-- A finished 5x5 on a given day of the round, as the browser writes it.
create or replace function pg_temp.solve(who uuid, day date, ms int) returns void
language sql as $$
  insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
  values (who, 'squares', '5', 'hard', day, 'round', '{}'::jsonb, true,
          jsonb_build_object('size', 5, 'solved', true, 'timeMs', ms))
  on conflict do nothing
$$;

create temp table t (k text primary key, v jsonb);

set session "test.uid" = '0f000000-0000-0000-0000-000000000001';
select public.save_tournament(null, 'Daily Cup', 'hard', pg_temp.d(-10), pg_temp.d(10));

-- ---------------------------------------------------------------------------
-- Setting one up
-- ---------------------------------------------------------------------------
select pg_temp.check('a game the round does not have cannot be set to change daily',
  (public.save_round(null, (select id from public.tournaments where name = 'Daily Cup'),
     pg_temp.d(-1), pg_temp.d(2), array['squares'], '[]'::jsonb, null, '{}'::jsonb, '[]'::jsonb,
     array['hive'])->>'reason')
    = 'a game was set to a new board each day without being in the round');

-- Squares changes daily; Hive is one board for the round, as before.
insert into t select 'round', public.save_round(null,
  (select id from public.tournaments where name = 'Daily Cup'), pg_temp.d(-1), pg_temp.d(2),
  array['squares', 'hive'], '[]'::jsonb, null, '{}'::jsonb, '[]'::jsonb, array['squares']);
select pg_temp.check('a round can give one of its games a new board each day',
  (select v->>'ok' from t where k = 'round') = 'true'
  and (select daily_games from public.tournament_rounds where id = (select (v->>'id')::uuid from t where k = 'round'))
      = array['squares']);
select pg_temp.check('and a round under way cannot change which',
  (public.save_round((select (v->>'id')::uuid from t where k = 'round'),
     (select id from public.tournaments where name = 'Daily Cup'), pg_temp.d(-1), pg_temp.d(2),
     array['squares', 'hive'], '[]'::jsonb, null, '{}'::jsonb, '[]'::jsonb, '{}'::text[])->>'reason')
    = 'a round under way can only change its end date');

-- ---------------------------------------------------------------------------
-- What the host is told to make, and what players are served
-- ---------------------------------------------------------------------------
select pg_temp.check('the host is told which games change daily',
  (select x->'daily_games' from jsonb_array_elements(public.rounds_to_publish(pg_temp.d(0), pg_temp.d(13))) x
   where (x->>'id')::uuid = (select (v->>'id')::uuid from t where k = 'round')) = '["squares"]'::jsonb);

-- Squares: one board per day of the round. Hive: one, on the first day.
insert into public.daily_puzzles (puzzle_date, env, game, payload) values
  (pg_temp.d(-1), 'round', 'squares', jsonb_build_object('date', pg_temp.d(-1))),
  (pg_temp.d(0),  'round', 'squares', jsonb_build_object('date', pg_temp.d(0))),
  (pg_temp.d(1),  'round', 'squares', jsonb_build_object('date', pg_temp.d(1))),
  (pg_temp.d(-1), 'round', 'hive',    jsonb_build_object('date', pg_temp.d(-1)))
on conflict (puzzle_date, env, game) do update set payload = excluded.payload;

set session "test.uid" = '0f000000-0000-0000-0000-000000000002';
select pg_temp.check('a game with a new board each day is served today''s',
  public.round_puzzle('squares')->>'date' = pg_temp.d(0)::text);
select pg_temp.check('never tomorrow''s, which is already made and must stay unseen',
  public.round_puzzle('squares')->>'date' <> pg_temp.d(1)::text);
select pg_temp.check('and a one-board game is still served the round''s one board',
  public.round_puzzle('hive')->>'date' = pg_temp.d(-1)::text);

-- ---------------------------------------------------------------------------
-- One standing across the days
-- ---------------------------------------------------------------------------
-- Ada solved yesterday's and today's; Bea only today's, faster. Across the
-- round so far Ada has two and Bea one, so Ada places first and Bea second --
-- one placing each for the round, not one per day.
select pg_temp.solve('0f000000-0000-0000-0000-000000000002', pg_temp.d(-1), 60000);
select pg_temp.solve('0f000000-0000-0000-0000-000000000002', pg_temp.d(0), 60000);
select pg_temp.solve('0f000000-0000-0000-0000-000000000003', pg_temp.d(0), 20000);

set session "test.uid" = '0f000000-0000-0000-0000-000000000001';
create temp table st as
  select public.tournament_standings((select id from public.tournaments where name = 'Daily Cup')) j;
select pg_temp.check('the round ranks a daily game across every day played so far',
  (select r->'boards'->'squares5'->0->>'name' from st, jsonb_array_elements(j->'rounds') r
   where (r->>'id')::uuid = (select (v->>'id')::uuid from t where k = 'round')) = 'Ada Daily'
  and (select (r->'boards'->'squares5'->0->>'value')::int from st, jsonb_array_elements(j->'rounds') r
       where (r->>'id')::uuid = (select (v->>'id')::uuid from t where k = 'round')) = 2);
select pg_temp.check('and pays it once, as one placing: ten for first, nine for second',
  (select (x->>'points')::numeric from st, jsonb_array_elements(j->'table') x where x->>'name' = 'Ada Daily') = 10
  and (select (x->>'points')::numeric from st, jsonb_array_elements(j->'table') x where x->>'name' = 'Bea Daily') = 9);
select pg_temp.check('and says which of the round''s games change daily',
  (select r->'daily_games' from st, jsonb_array_elements(j->'rounds') r
   where (r->>'id')::uuid = (select (v->>'id')::uuid from t where k = 'round')) = '["squares"]'::jsonb);

-- ---------------------------------------------------------------------------
-- Today's board, wherever "the round's board" is asked for
-- ---------------------------------------------------------------------------
-- Hints already taken are today's, not the first day's.
insert into public.round_hints (user_id, game, puzzle_date, taken, targets) values
  ('0f000000-0000-0000-0000-000000000002', 'squares', pg_temp.d(-1), 3, array['old']),
  ('0f000000-0000-0000-0000-000000000002', 'squares', pg_temp.d(0), 1, array['new']);
set session "test.uid" = '0f000000-0000-0000-0000-000000000002';
select pg_temp.check('the hints shown are today''s board''s',
  (public.my_round_hints('squares')->>'taken')::int = 1);

-- The organiser's reset clears today's board, the one that went wrong; the
-- days before it were played and stand.
set session "test.uid" = '0f000000-0000-0000-0000-000000000001';
select pg_temp.check('the organiser sees today''s board for a daily game',
  (select x->>'status' from jsonb_array_elements(
     public.round_player((select (v->>'id')::uuid from t where k = 'round'),
                         '0f000000-0000-0000-0000-000000000002')->'games') x
   where x->>'game' = 'squares') = 'finished');
insert into t select 'reset', public.reset_round_player(
  (select (v->>'id')::uuid from t where k = 'round'), '0f000000-0000-0000-0000-000000000002', 'squares');
select pg_temp.check('a reset takes today''s board and leaves the earlier days',
  (select v->>'ok' from t where k = 'reset') = 'true'
  and not exists (select 1 from public.daily_progress
                  where user_id = '0f000000-0000-0000-0000-000000000002' and env = 'round'
                    and game = 'squares' and puzzle_date = pg_temp.d(0))
  and exists (select 1 from public.daily_progress
              where user_id = '0f000000-0000-0000-0000-000000000002' and env = 'round'
                and game = 'squares' and puzzle_date = pg_temp.d(-1))
  and exists (select 1 from public.round_hints
              where user_id = '0f000000-0000-0000-0000-000000000002' and puzzle_date = pg_temp.d(-1))
  and not exists (select 1 from public.round_hints
                  where user_id = '0f000000-0000-0000-0000-000000000002' and puzzle_date = pg_temp.d(0)));

-- Leave nothing behind.
delete from public.round_hints where user_id in ('0f000000-0000-0000-0000-000000000002', '0f000000-0000-0000-0000-000000000003');
delete from public.daily_progress where user_id in ('0f000000-0000-0000-0000-000000000002', '0f000000-0000-0000-0000-000000000003');
delete from public.daily_puzzles where env = 'round' and game in ('squares', 'hive')
   and puzzle_date between pg_temp.d(-1) and pg_temp.d(1);
delete from public.tournaments where name = 'Daily Cup';

\echo '--- daily-board checks passed ---'
