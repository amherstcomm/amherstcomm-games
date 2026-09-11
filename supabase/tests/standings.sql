-- Tournament standings, and the leaderboards they are built from.
--
-- The standings rank a round the way the site's own boards rank each game, so
-- the ranking was lifted out of boards_for into boards_between -- a range of
-- dates instead of a window ending today. Nothing tested the leaderboards at
-- this level before, so this pins both: the everyday board still answers, and
-- a round is ranked, pointed and totalled as the tournament table says.
--
-- Squares throughout, because its plausibility check is the one a test can
-- satisfy without a dictionary: a solve of the right size, in a human time.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('f1111111-1111-1111-1111-111111111111', 'standings-editor@example.com'),
  ('f2222222-2222-2222-2222-222222222222', 'ada-standings@example.com'),
  ('f3333333-3333-3333-3333-333333333333', 'bea-standings@example.com'),
  ('f4444444-4444-4444-4444-444444444444', 'cy-standings@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('f1111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('f2222222-2222-2222-2222-222222222222', 'Ada S'),
  ('f3333333-3333-3333-3333-333333333333', 'Bea S'),
  ('f4444444-4444-4444-4444-444444444444', 'Cy S')
on conflict (id) do update set display_name = excluded.display_name;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

-- A solved 5x5 in `ms` milliseconds, as a player's browser records it.
create or replace function pg_temp.solve(who uuid, env text, day date, ms int, diff text default 'hard')
returns void language sql as $$
  insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
  values (who, 'squares', '5', diff, day, env, '{}'::jsonb, true,
          jsonb_build_object('size', 5, 'solved', true, 'timeMs', ms))
  on conflict do nothing
$$;

-- ---------------------------------------------------------------------------
-- The everyday board still answers
-- ---------------------------------------------------------------------------
select pg_temp.solve('f2222222-2222-2222-2222-222222222222', 'prod',
                     (now() at time zone 'America/New_York')::date, 42000);
select pg_temp.check('the leaderboard ranks a daily as it always did',
  (select b->0->>'name' from (select public.leaderboard(1, 'prod', 'hard')->'squares5' b) x) = 'Ada S');

-- ---------------------------------------------------------------------------
-- A tournament with two rounds played and one to come
-- ---------------------------------------------------------------------------
set session "test.uid" = 'f1111111-1111-1111-1111-111111111111';
select public.save_tournament(null, 'Standings Cup', 'hard', pg_temp.d(-60), pg_temp.d(60));
create temp table st as select id from public.tournaments where name = 'Standings Cup';
select public.save_round(null, (select id from st), pg_temp.d(-50), pg_temp.d(-45), array['squares']);
select public.save_round(null, (select id from st), pg_temp.d(-40), pg_temp.d(-35), array['squares']);
select public.save_round(null, (select id from st), pg_temp.d(30), pg_temp.d(35), array['squares']);

-- Round one: Bea fastest, then Ada, then Cy.
select pg_temp.solve('f3333333-3333-3333-3333-333333333333', 'round', pg_temp.d(-50), 30000);
select pg_temp.solve('f2222222-2222-2222-2222-222222222222', 'round', pg_temp.d(-50), 60000);
select pg_temp.solve('f4444444-4444-4444-4444-444444444444', 'round', pg_temp.d(-50), 90000);
-- Round two: Ada, then Cy. Bea did not play.
select pg_temp.solve('f2222222-2222-2222-2222-222222222222', 'round', pg_temp.d(-40), 20000);
select pg_temp.solve('f4444444-4444-4444-4444-444444444444', 'round', pg_temp.d(-40), 25000);

-- Noise the standings must ignore: the same day's daily, and a round result
-- at a difficulty the tournament is not played at.
select pg_temp.solve('f4444444-4444-4444-4444-444444444444', 'prod', pg_temp.d(-50), 1000 + 9000);
select pg_temp.solve('f3333333-3333-3333-3333-333333333333', 'round', pg_temp.d(-40), 5000, 'easy');

create temp table got as select public.tournament_standings((select id from st)) j;

select pg_temp.check('the standings answer for the tournament',
  (select j->>'ok' = 'true' and j->'tournament'->>'name' = 'Standings Cup' from got));
select pg_temp.check('a round that has not started is not listed',
  (select jsonb_array_length(j->'rounds') from got) = 2);
select pg_temp.check('and the rounds keep their place in the tournament',
  (select (j->'rounds'->0->>'number')::int = 1 and (j->'rounds'->1->>'number')::int = 2 from got));

-- Keyed as the site's boards key squares: by size, 5x5 for a hard tournament.
select pg_temp.check('a round is ranked the way the everyday board ranks the game',
  (select array(select x->>'name' from jsonb_array_elements(j->'rounds'->0->'boards'->'squares5') x)
   from got) = array['Bea S', 'Ada S', 'Cy S']);
select pg_temp.check('with the daily beside it left out',
  (select jsonb_array_length(j->'rounds'->0->'boards'->'squares5') from got) = 3);
select pg_temp.check('and a result at another difficulty left out too',
  (select array(select x->>'name' from jsonb_array_elements(j->'rounds'->1->'boards'->'squares5') x)
   from got) = array['Ada S', 'Cy S']);

-- Placement points: 1st 10, 2nd 9, 3rd 8.
--   Ada: 9 + 10 = 19, one win.  Cy: 8 + 9 = 17.  Bea: 10, one win.
select pg_temp.check('the table adds placement points across the rounds',
  (select array(select x->>'name' || ' ' || (x->>'points') from jsonb_array_elements(j->'table') x)
   from got) = array['Ada S 19', 'Cy S 17', 'Bea S 10']);
select pg_temp.check('and counts outright wins',
  (select (x->>'wins')::int from got, jsonb_array_elements(j->'table') x where x->>'name' = 'Bea S') = 1);

select pg_temp.check('a tournament that is not there says so',
  (public.tournament_standings('00000000-0000-0000-0000-000000000000')->>'reason') = 'no such tournament');

-- Anybody who can open the site can see the standings; the ranking beneath
-- them stays internal, as boards_for always was.
select pg_temp.check('players may read the standings',
  has_function_privilege('anon', 'public.tournament_standings(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.tournament_standings(uuid)', 'execute'));
select pg_temp.check('while the ranking itself is not callable from a browser',
  not has_function_privilege('anon', 'public.boards_between(date, date, text, text, uuid[], integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.boards_between(date, date, text, text, uuid[], integer)', 'execute'));

\echo '--- standings checks passed ---'
