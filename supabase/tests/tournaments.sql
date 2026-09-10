-- Tournaments, their rounds, and the rule that a first finish counts.
--
-- A round is a span of dates and a list of games, with one fixed board per
-- game for the whole span. What has to hold is what a page cannot hold for
-- itself: rounds sit inside their tournament and never overlap, a round under
-- way cannot be changed under the people playing it, the board is only served
-- while its round is on and only for its games, and once a round result is
-- finished it stays the first one.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('e7777777-7777-7777-7777-777777777777', 'tournament-editor@example.com'),
  ('e8888888-8888-8888-8888-888888888888', 'tournament-player@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('e7777777-7777-7777-7777-777777777777', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

-- Dates relative to the puzzle day, so this runs the same whenever it runs.
create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

set session "test.uid" = 'e7777777-7777-7777-7777-777777777777';

-- ---------------------------------------------------------------------------
-- A tournament
-- ---------------------------------------------------------------------------
select pg_temp.check('a tournament needs a real difficulty',
  (public.save_tournament(null, 'October', 'medium', pg_temp.d(-3), pg_temp.d(40))->>'reason')
    = 'a difficulty is easy, hard or extreme');
select pg_temp.check('and to end on or after it starts',
  (public.save_tournament(null, 'October', 'hard', pg_temp.d(10), pg_temp.d(2))->>'ok') = 'false');

select public.save_tournament(null, 'Ownership Cup', 'hard', pg_temp.d(-3), pg_temp.d(40));
create temp table t as select id from public.tournaments where name = 'Ownership Cup';

-- ---------------------------------------------------------------------------
-- Rounds
-- ---------------------------------------------------------------------------
-- No length is assumed: a round may be a day or most of the tournament.
select pg_temp.check('a round inside its tournament is taken',
  (public.save_round(null, (select id from t), pg_temp.d(-3), pg_temp.d(3), array['hive', 'box'])->>'ok') = 'true');
select pg_temp.check('and so is a one-day round',
  (public.save_round(null, (select id from t), pg_temp.d(4), pg_temp.d(4), array['words'])->>'ok') = 'true');
select pg_temp.check('a round outside its tournament is refused',
  (public.save_round(null, (select id from t), pg_temp.d(38), pg_temp.d(45), array['hive'])->>'reason')
    = 'a round has to fall inside its tournament');
select pg_temp.check('and one that overlaps another round',
  (public.save_round(null, (select id from t), pg_temp.d(3), pg_temp.d(6), array['hive'])->>'reason')
    = 'another round already covers some of those days');
select pg_temp.check('and one with no games',
  (public.save_round(null, (select id from t), pg_temp.d(10), pg_temp.d(12), array[]::text[])->>'reason')
    = 'a round needs at least one game');
select pg_temp.check('and one naming a game this site does not have',
  (public.save_round(null, (select id from t), pg_temp.d(10), pg_temp.d(12), array['chess'])->>'reason')
    = 'that is not a game this site has');

-- A day belongs to one round across every tournament, not just within one.
select public.save_tournament(null, 'Other', 'easy', pg_temp.d(-10), pg_temp.d(50));
select pg_temp.check('another tournament cannot claim a day a round already has',
  (public.save_round(null, (select id from public.tournaments where name = 'Other'),
     pg_temp.d(0), pg_temp.d(1), array['grid'])->>'ok') = 'false');

select public.save_round(null, (select id from t), pg_temp.d(10), pg_temp.d(16), array['weave']);
select pg_temp.check('a future round can be changed freely',
  (public.save_round((select id from public.tournament_rounds where starts_on = pg_temp.d(10)),
     (select id from t), pg_temp.d(11), pg_temp.d(16), array['weave', 'squares'])->>'ok') = 'true');

-- ---------------------------------------------------------------------------
-- A round under way
-- ---------------------------------------------------------------------------
create temp table live as
  select id from public.tournament_rounds where starts_on = pg_temp.d(-3);

select pg_temp.check('a round under way cannot change its games',
  (public.save_round((select id from live), (select id from t), pg_temp.d(-3), pg_temp.d(3),
     array['hive'])->>'reason') = 'a round under way can only change its end date');
select pg_temp.check('nor its first day',
  (public.save_round((select id from live), (select id from t), pg_temp.d(-2), pg_temp.d(3),
     array['box', 'hive'])->>'ok') = 'false');
-- The games were stored sorted, so the same two in the other order are the same.
select pg_temp.check('but it can end later',
  (public.save_round((select id from live), (select id from t), pg_temp.d(-3), pg_temp.d(3),
     array['box', 'hive'])->>'ok') = 'true');
select pg_temp.check('and cannot be deleted',
  (public.delete_round((select id from live))->>'reason') = 'it has started');
select pg_temp.check('nor its tournament',
  (public.delete_tournament((select id from t))->>'reason') = 'it has started');
select pg_temp.check('nor its difficulty changed',
  (public.save_tournament((select id from t), 'Ownership Cup', 'easy', pg_temp.d(-3), pg_temp.d(40))->>'reason')
    = 'the difficulty cannot change once a round has started');
select pg_temp.check('nor its dates moved out from under a round',
  (public.save_tournament((select id from t), 'Ownership Cup', 'hard', pg_temp.d(0), pg_temp.d(40))->>'reason')
    = 'a round would fall outside those dates');

-- ---------------------------------------------------------------------------
-- What players are served
-- ---------------------------------------------------------------------------
insert into public.daily_puzzles (puzzle_date, env, game, payload)
values (pg_temp.d(-3), 'round', 'hive', jsonb_build_object('date', pg_temp.d(-3), 'byDifficulty', '{}'::jsonb))
on conflict (puzzle_date, env, game) do update set payload = excluded.payload;

select pg_temp.check('the round board lives beside the dailies under its own env',
  exists (select 1 from public.daily_puzzles where env = 'round' and game = 'hive'));

select pg_temp.check('what is on says which round, and where it sits',
  (select r->>'tournament' = 'Ownership Cup' and (r->>'number')::int = 1
          and (r->>'of')::int = 3 and r->>'difficulty' = 'hard'
   from (select public.current_round() r) x));
select pg_temp.check('a game in the round is served its round board',
  public.round_puzzle('hive')->>'date' = pg_temp.d(-3)::text);
select pg_temp.check('a game not in the round is served nothing',
  public.round_puzzle('grid') is null);

select pg_temp.check('the host is told which rounds to generate, with their difficulty',
  (select count(*) from jsonb_array_elements(public.rounds_to_publish(pg_temp.d(0), pg_temp.d(13))) r
   where r->>'difficulty' = 'hard') = 2);

select pg_temp.check('the admin page sees each tournament with its rounds',
  (select jsonb_array_length(x->'rounds') from jsonb_array_elements(public.tournaments_sheet()->'tournaments') x
   where x->>'name' = 'Ownership Cup') = 3);

-- ---------------------------------------------------------------------------
-- First finish counts
-- ---------------------------------------------------------------------------
insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
values ('e8888888-8888-8888-8888-888888888888', 'hive', '', 'hard', pg_temp.d(-3), 'round',
        '{"found": ["first"]}', true, '{"points": 12}');

update public.daily_progress
   set result = '{"points": 99}', state = '{"found": ["rehearsed"]}'
 where user_id = 'e8888888-8888-8888-8888-888888888888' and env = 'round';
select pg_temp.check('a finished round result stays the first one',
  (select result->>'points' = '12' and state->'found'->>0 = 'first'
   from public.daily_progress
   where user_id = 'e8888888-8888-8888-8888-888888888888' and env = 'round'));

update public.daily_progress set completed = false
 where user_id = 'e8888888-8888-8888-8888-888888888888' and env = 'round';
select pg_temp.check('and cannot be un-finished to be played again',
  (select completed from public.daily_progress
   where user_id = 'e8888888-8888-8888-8888-888888888888' and env = 'round'));

-- The dailies are untouched: the lock is a tournament rule, not a new one for
-- every board on the site.
insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
values ('e8888888-8888-8888-8888-888888888888', 'hive', '', 'hard', pg_temp.d(-3), 'prod',
        '{}', true, '{"points": 5}');
update public.daily_progress set result = '{"points": 6}'
 where user_id = 'e8888888-8888-8888-8888-888888888888' and env = 'prod';
select pg_temp.check('while a daily result can still be updated as before',
  (select result->>'points' from public.daily_progress
   where user_id = 'e8888888-8888-8888-8888-888888888888' and env = 'prod') = '6');

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
set session "test.uid" = 'e8888888-8888-8888-8888-888888888888';
select pg_temp.check('a player cannot set up a tournament',
  (public.save_tournament(null, 'Mine', 'easy', pg_temp.d(60), pg_temp.d(70))->>'reason') = 'not allowed');
select pg_temp.check('nor a round',
  (public.save_round(null, (select id from t), pg_temp.d(20), pg_temp.d(22), array['hive'])->>'reason') = 'not allowed');
select pg_temp.check('nor read the admin sheet',
  (public.tournaments_sheet()->>'reason') = 'not allowed');

-- Anybody who can open the site can see what is on and play it.
select pg_temp.check('anyone may ask what is on and be dealt it',
  has_function_privilege('anon', 'public.current_round()', 'execute')
  and has_function_privilege('anon', 'public.round_puzzle(text)', 'execute'));
-- Which rounds are coming is the publish host's to know: a player who could
-- ask would know next week's games, and with the board keyed by a date that
-- is most of the way to next week's board.
select pg_temp.check('while only the host may ask which rounds are coming',
  not has_function_privilege('authenticated', 'public.rounds_to_publish(date, date)', 'execute')
  and not has_function_privilege('anon', 'public.rounds_to_publish(date, date)', 'execute')
  and has_function_privilege('service_role', 'public.rounds_to_publish(date, date)', 'execute'));

\echo '--- tournament checks passed ---'
