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

-- ---------------------------------------------------------------------------
-- Trivia in a round
-- ---------------------------------------------------------------------------
-- A session attached to round one, worth double. Built by hand rather than
-- through the session functions: what is under test is the ranking becoming
-- placement points, not how a session gets run.
insert into public.sessions (id, title, host, state, mode)
values ('f5555555-5555-5555-5555-555555555555', 'Round One Trivia',
        'f1111111-1111-1111-1111-111111111111', 'closed', 'live')
on conflict (id) do nothing;

insert into public.items (id, session_id, position, kind, prompt, state, opened_at) values
  ('f6666666-6666-6666-6666-666666666666', 'f5555555-5555-5555-5555-555555555555',
   1, 'choice', 'Who owns this company?', 'revealed', now() - interval '5 minutes'),
  ('f7777777-7777-7777-7777-777777777777', 'f5555555-5555-5555-5555-555555555555',
   2, 'choice', 'What year did the ESOP start?', 'revealed', now() - interval '4 minutes')
on conflict (id) do nothing;

insert into public.item_answers (item_id, answer) values
  ('f6666666-6666-6666-6666-666666666666', '{"correct": ["us"]}'::jsonb),
  ('f7777777-7777-7777-7777-777777777777', '{"correct": ["1998"]}'::jsonb)
on conflict (item_id) do update set answer = excluded.answer;

-- Bea both, quickly. Cy one. Ada neither.
insert into public.responses (item_id, user_id, value, submitted_at) values
  ('f6666666-6666-6666-6666-666666666666', 'f3333333-3333-3333-3333-333333333333',
   '"us"'::jsonb, now() - interval '4 minutes 50 seconds'),
  ('f7777777-7777-7777-7777-777777777777', 'f3333333-3333-3333-3333-333333333333',
   '"1998"'::jsonb, now() - interval '3 minutes 50 seconds'),
  ('f6666666-6666-6666-6666-666666666666', 'f4444444-4444-4444-4444-444444444444',
   '"us"'::jsonb, now() - interval '4 minutes 40 seconds'),
  ('f7777777-7777-7777-7777-777777777777', 'f4444444-4444-4444-4444-444444444444',
   '"2011"'::jsonb, now() - interval '3 minutes 40 seconds'),
  ('f6666666-6666-6666-6666-666666666666', 'f2222222-2222-2222-2222-222222222222',
   '"them"'::jsonb, now() - interval '4 minutes 30 seconds')
on conflict do nothing;

select pg_temp.check('a session ranks its players before any tournament sees it',
  (select array(select k.name from public.session_ranking('f5555555-5555-5555-5555-555555555555') k
                order by k.place, k.name)) = array['Bea S', 'Cy S', 'Ada S']);

-- Attached through save_round, on a round that is already under way: trivia may
-- be added to a running round even though its games and dates may not.
create temp table r1 as
  select id from public.tournament_rounds
  where tournament_id = (select id from st) order by starts_on limit 1;

select pg_temp.check('trivia may be added to a round under way',
  (public.save_round((select id from r1), (select id from st), pg_temp.d(-50), pg_temp.d(-45),
                     array['squares'],
                     '[{"id": "f5555555-5555-5555-5555-555555555555", "weight": 2}]'::jsonb)
   ->>'ok') = 'true');
select pg_temp.check('while its games still may not',
  (public.save_round((select id from r1), (select id from st), pg_temp.d(-50), pg_temp.d(-45),
                     array['hive'],
                     '[{"id": "f5555555-5555-5555-5555-555555555555", "weight": 2}]'::jsonb)
   ->>'reason') = 'a round under way can only change its end date');

select pg_temp.check('a weight past the cap is refused',
  (public.save_round(null, (select id from st), pg_temp.d(40), pg_temp.d(45), array['squares'],
                     '[{"id": "f5555555-5555-5555-5555-555555555555", "weight": 50}]'::jsonb)
   ->>'reason') = 'a weight has to be more than zero and at most ten');
select pg_temp.check('and a session cannot count in two rounds',
  (public.save_round(null, (select id from st), pg_temp.d(40), pg_temp.d(45), array['squares'],
                     '[{"id": "f5555555-5555-5555-5555-555555555555"}]'::jsonb)
   ->>'reason') = 'the session "Round One Trivia" already counts in another round');

-- A round may be trivia and nothing else, or a contest and nothing else;
-- before either it needed a game. What is refused is the empty round.
select pg_temp.check('a round of trivia alone is refused only for having nothing at all',
  (public.save_round(null, (select id from st), pg_temp.d(40), pg_temp.d(45),
                     '{}'::text[], '[]'::jsonb)
   ->>'reason') = 'a round needs at least one game, one session or one contest');

create temp table got2 as select public.tournament_standings((select id from st)) j;

select pg_temp.check('the round lists its trivia beside its boards',
  (select j->'rounds'->0->'trivia'->0->>'title' from got2) = 'Round One Trivia'
  and (select (j->'rounds'->0->'trivia'->0->>'weight')::numeric from got2) = 2);
select pg_temp.check('with the session ranked inside it',
  (select array(select x->>'name' from jsonb_array_elements(j->'rounds'->0->'trivia'->0->'standings') x)
   from got2) = array['Bea S', 'Cy S', 'Ada S']);

-- Boards alone gave Ada 19, Cy 17, Bea 10. The trivia at weight 2 adds 20, 18
-- and 16 for first, second and third -- so Ada and Cy finish level on 35 and
-- the tiebreak is wins, where Ada has one and Cy none.
select pg_temp.check('the trivia counts towards the table at its weight',
  (select array(select x->>'name' || ' ' || (x->>'points') from jsonb_array_elements(j->'table') x)
   from got2) = array['Ada S 35', 'Cy S 35', 'Bea S 30']);
select pg_temp.check('and a trivia win is a win',
  (select (x->>'wins')::int from got2, jsonb_array_elements(j->'table') x where x->>'name' = 'Bea S') = 2);

select pg_temp.check('the ranking a session is scored by stays out of the browser',
  not has_function_privilege('anon', 'public.session_ranking(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.session_ranking(uuid)', 'execute'));

\echo '--- trivia-in-a-round checks passed ---'

-- ---------------------------------------------------------------------------
-- What a round's games are worth
-- ---------------------------------------------------------------------------
-- A round's trivia has carried a weight since it was built and its games have
-- not, so every board paid the same however hard it was. What has to hold: a
-- weight multiplies the placement points for that board and nothing else, an
-- unlisted game is still worth one, and a weight cannot be set for a game the
-- round does not have.
set session "test.uid" = 'f1111111-1111-1111-1111-111111111111';

create temp table wt as
  select (public.save_tournament(null, 'Weighted Cup', 'hard', pg_temp.d(-30), pg_temp.d(-10))
          ->>'id')::uuid id;
create temp table wr as
  select (public.save_round(null, (select id from wt), pg_temp.d(-25), pg_temp.d(-20),
                            array['squares', 'hive'], '[]'::jsonb, null,
                            '{"squares": 3}'::jsonb)->>'id')::uuid id;

select pg_temp.check('a round remembers what its games are worth',
  (select game_weights->>'squares' from public.tournament_rounds where id = (select id from wr)) = '3');
select pg_temp.check('and the admin sheet carries them',
  (select r->'game_weights'->>'squares'
   from jsonb_array_elements(public.tournaments_sheet()->'tournaments') x,
        jsonb_array_elements(x->'rounds') r
   where (r->>'id')::uuid = (select id from wr)) = '3');

-- Ada first on squares, Bea second; Bea first on hive. At level weights that
-- is Ada 10 and Bea 9 + 10 = 19. With squares at 3 it is Ada 30, Bea 27 + 10.
select pg_temp.solve('f2222222-2222-2222-2222-222222222222', 'round', pg_temp.d(-25), 30000);
select pg_temp.solve('f3333333-3333-3333-3333-333333333333', 'round', pg_temp.d(-25), 60000);

create temp table wgot as select public.tournament_standings((select id from wt)) j;
select pg_temp.check('a weighted board pays its placing times its weight',
  (select (x->>'points')::numeric from wgot, jsonb_array_elements(j->'table') x
   where x->>'name' = 'Ada S') = 30
  and (select (x->>'points')::numeric from wgot, jsonb_array_elements(j->'table') x
   where x->>'name' = 'Bea S') = 27);
select pg_temp.check('and the standings say what each board was worth',
  (select j->'rounds'->0->'weights'->>'squares5' from wgot) = '3'
  and (select j->'rounds'->0->'weights'->>'hive' from wgot) = '1');

-- Unlisted is one, which is what every board paid before a round could say
-- otherwise: the same boards, saved with no weights at all.
select public.save_round((select id from wr), (select id from wt), pg_temp.d(-25), pg_temp.d(-20),
                         array['squares', 'hive'], '[]'::jsonb, null, '{}'::jsonb);
create temp table wlevel as select public.tournament_standings((select id from wt)) j;
select pg_temp.check('with no weights at all a board pays what it always did',
  (select (x->>'points')::numeric from wlevel, jsonb_array_elements(j->'table') x
   where x->>'name' = 'Ada S') = 10);

select pg_temp.check('a weight for a game the round does not have is refused',
  (public.save_round((select id from wr), (select id from wt), pg_temp.d(-25), pg_temp.d(-20),
                     array['squares'], '[]'::jsonb, null, '{"weave": 2}'::jsonb)->>'reason')
    = 'a game was given a weight without being in the round');
select pg_temp.check('and a weight past the cap, or under nothing, is refused too',
  (public.save_round((select id from wr), (select id from wt), pg_temp.d(-25), pg_temp.d(-20),
                     array['squares'], '[]'::jsonb, null, '{"squares": 50}'::jsonb)->>'reason')
    = 'a weight has to be more than zero and at most ten'
  and (public.save_round((select id from wr), (select id from wt), pg_temp.d(-25), pg_temp.d(-20),
                     array['squares'], '[]'::jsonb, null, '{"squares": 0}'::jsonb)->>'reason')
    = 'a weight has to be more than zero and at most ten');

-- Leave nothing behind: a round covering these days would collide with the
-- rounds every later file sets up.
delete from public.tournaments where id = (select id from wt);

\echo '--- weighted-games checks passed ---'
