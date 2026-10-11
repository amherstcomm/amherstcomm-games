-- Pausing a session, and resetting a player in a round.
--
-- Pause: in a session played on your own time each question's clock starts
-- when it is put in front of you. What has to hold is that a pause holds back
-- the *next* question -- not served, so its clock does not start -- while the
-- one already in front of you is still yours to finish, and that resuming
-- serves it.
--
-- Reset: an organiser gives one person another go at one thing in a round. A
-- game board goes with its hints and counts an attempt (which the player's
-- device keys its copy by, so the old copy is never pushed back); a session
-- goes with its answers and serve times, so the next visit starts at question
-- one. Only while the round is on, only for an organiser, one thing at a time.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('0d000000-0000-0000-0000-000000000001', 'reset.organiser@example.com'),
  ('0d000000-0000-0000-0000-000000000002', 'paula.pauser@example.com'),
  ('0d000000-0000-0000-0000-000000000003', 'someone.else@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('0d000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

create temp table t (k text primary key, v jsonb);
create or replace function pg_temp.id(key text) returns uuid
language sql as $$ select (v->>'id')::uuid from t where k = key $$;

-- An open session of three questions, started.
set session "test.uid" = '0d000000-0000-0000-0000-000000000001';
insert into t select 'sess', public.create_session('Round trivia', 'strict', 'open');
insert into t select 'q1', public.save_item(pg_temp.id('sess'), null, 'choice', 'One',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
insert into t select 'q2', public.save_item(pg_temp.id('sess'), null, 'choice', 'Two',
  '{"options":["a","b"]}'::jsonb, '{"correct":["b"]}'::jsonb);
insert into t select 'q3', public.save_item(pg_temp.id('sess'), null, 'choice', 'Three',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
select public.advance_session(pg_temp.id('sess'), 'start');
insert into t select 'live', public.create_session('Run from the front');

-- ---------------------------------------------------------------------------
-- Pausing
-- ---------------------------------------------------------------------------
set session "test.uid" = '0d000000-0000-0000-0000-000000000002';
insert into t select 'first', public.current_item(pg_temp.id('sess'));
select pg_temp.check('the first question is served as usual',
  (select v->>'state' from t where k = 'first') = 'open'
  and (select (v->>'id')::uuid from t where k = 'first') = pg_temp.id('q1')
  and (select v->>'paused' from t where k = 'first') = 'false');

insert into t select 'pause', public.pause_session(pg_temp.id('sess'), true);
select pg_temp.check('a player can pause after this question',
  (select v->>'paused' from t where k = 'pause') = 'true');

-- The question already in front of them is theirs to finish.
insert into t select 'still', public.current_item(pg_temp.id('sess'));
select pg_temp.check('the question they are on stays theirs to finish',
  (select (v->>'id')::uuid from t where k = 'still') = pg_temp.id('q1')
  and (select v->>'state' from t where k = 'still') = 'open'
  and (select v->>'paused' from t where k = 'still') = 'true');

insert into t select 'ans1', public.answer_item(pg_temp.id('q1'), '"a"'::jsonb);
select pg_temp.check('and answering it is accepted',
  (select v->>'ok' from t where k = 'ans1') = 'true');

-- The next one is held back: not served, so its clock has not started.
insert into t select 'held', public.current_item(pg_temp.id('sess'));
select pg_temp.check('the next question is held back while paused',
  (select v->>'state' from t where k = 'held') = 'paused'
  and (select v->>'done' from t where k = 'held') = '1'
  and (select v->>'total' from t where k = 'held') = '3');
select pg_temp.check('and its clock has not started',
  not exists (select 1 from public.item_served
              where item_id = pg_temp.id('q2') and user_id = '0d000000-0000-0000-0000-000000000002'));

-- Coming back later is a reload, and a reload must not step past the pause.
insert into t select 'reload', public.current_item(pg_temp.id('sess'));
select pg_temp.check('asking again, as a reload would, is still paused',
  (select v->>'state' from t where k = 'reload') = 'paused');

select public.pause_session(pg_temp.id('sess'), false);
insert into t select 'resumed', public.current_item(pg_temp.id('sess'));
select pg_temp.check('resuming serves the next question and starts its clock',
  (select (v->>'id')::uuid from t where k = 'resumed') = pg_temp.id('q2')
  and exists (select 1 from public.item_served
              where item_id = pg_temp.id('q2') and user_id = '0d000000-0000-0000-0000-000000000002'));

select pg_temp.check('a session run from the front cannot be paused',
  (public.pause_session(pg_temp.id('live'), true)->>'reason')
    = 'only a session played on your own time can be paused');
set session "test.uid" = '';
select pg_temp.check('nor can anybody not signed in pause anything',
  (public.pause_session(pg_temp.id('sess'), true)->>'reason') = 'not signed in');

-- ---------------------------------------------------------------------------
-- A round to reset things in
-- ---------------------------------------------------------------------------
set session "test.uid" = '0d000000-0000-0000-0000-000000000001';
select public.save_tournament(null, 'Reset Cup', 'hard', pg_temp.d(-5), pg_temp.d(10));
insert into t select 'round', public.save_round(null,
  (select id from public.tournaments where name = 'Reset Cup'), pg_temp.d(-1), pg_temp.d(3),
  array['weave', 'hive'], jsonb_build_array(jsonb_build_object('id', pg_temp.id('sess'))));
select pg_temp.check('a round covering today, with the session in it',
  (select v->>'ok' from t where k = 'round') = 'true');
insert into t select 'later', public.save_round(null,
  (select id from public.tournaments where name = 'Reset Cup'), pg_temp.d(5), pg_temp.d(6),
  array['grid']);

-- Paula has finished the round's Weave with two hints, and started its Hive.
insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
values ('0d000000-0000-0000-0000-000000000002', 'weave', '', 'hard', pg_temp.d(-1), 'round',
        '{"found": ["x"]}'::jsonb, true, '{"solved": true, "timeMs": 90000, "hints": 2}'::jsonb),
       ('0d000000-0000-0000-0000-000000000002', 'hive', '', 'hard', pg_temp.d(-1), 'round',
        '{"found": ["y"]}'::jsonb, false, null);
insert into public.round_hints (user_id, game, puzzle_date, taken, targets)
values ('0d000000-0000-0000-0000-000000000002', 'weave', pg_temp.d(-1), 2, array['x', 'z']);

-- ---------------------------------------------------------------------------
-- What the organiser sees before deciding
-- ---------------------------------------------------------------------------
insert into t select 'sheet', public.round_player(pg_temp.id('round'), '0d000000-0000-0000-0000-000000000002');
select pg_temp.check('the organiser sees each game and where they got to',
  (select x->>'status' from t, jsonb_array_elements(v->'games') x
   where k = 'sheet' and x->>'game' = 'weave') = 'finished'
  and (select (x->>'hints')::int from t, jsonb_array_elements(v->'games') x
       where k = 'sheet' and x->>'game' = 'weave') = 2
  and (select x->>'status' from t, jsonb_array_elements(v->'games') x
       where k = 'sheet' and x->>'game' = 'hive') = 'started');
select pg_temp.check('and each session with how far through they are',
  (select (x->>'answered')::int from t, jsonb_array_elements(v->'sessions') x
   where k = 'sheet' and (x->>'session_id')::uuid = pg_temp.id('sess')) = 1
  and (select (x->>'total')::int from t, jsonb_array_elements(v->'sessions') x
       where k = 'sheet' and (x->>'session_id')::uuid = pg_temp.id('sess')) = 3);

-- ---------------------------------------------------------------------------
-- Resetting a game
-- ---------------------------------------------------------------------------
insert into t select 'r1', public.reset_round_player(pg_temp.id('round'),
  '0d000000-0000-0000-0000-000000000002', 'weave');
select pg_temp.check('resetting a game clears the board and its hints',
  (select v->>'ok' from t where k = 'r1') = 'true'
  and not exists (select 1 from public.daily_progress
                  where user_id = '0d000000-0000-0000-0000-000000000002' and game = 'weave' and env = 'round')
  and not exists (select 1 from public.round_hints
                  where user_id = '0d000000-0000-0000-0000-000000000002' and game = 'weave'));
select pg_temp.check('and nothing else of theirs',
  exists (select 1 from public.daily_progress
          where user_id = '0d000000-0000-0000-0000-000000000002' and game = 'hive' and env = 'round')
  and exists (select 1 from public.responses
              where user_id = '0d000000-0000-0000-0000-000000000002' and item_id = pg_temp.id('q1')));
select pg_temp.check('it counts as their first reset',
  (select v->>'attempt' from t where k = 'r1') = '1');

insert into t select 'r2', public.reset_round_player(pg_temp.id('round'),
  '0d000000-0000-0000-0000-000000000002', 'weave');
select pg_temp.check('and a second reset counts again',
  (select v->>'attempt' from t where k = 'r2') = '2');

-- The player's device reads this to key its copy of the board, so a reset
-- player starts on a fresh key and their old copy is never pushed back.
set session "test.uid" = '0d000000-0000-0000-0000-000000000002';
select pg_temp.check('the player is told which attempt they are on',
  (select (x->'attempts'->>'weave')::int
   from jsonb_array_elements(public.current_rounds()) x
   where (x->>'round_id')::uuid = pg_temp.id('round')) = 2);
set session "test.uid" = '0d000000-0000-0000-0000-000000000003';
select pg_temp.check('and somebody never reset is on no attempt at all',
  (select x->'attempts'
   from jsonb_array_elements(public.current_rounds()) x
   where (x->>'round_id')::uuid = pg_temp.id('round')) = '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- Resetting a session
-- ---------------------------------------------------------------------------
set session "test.uid" = '0d000000-0000-0000-0000-000000000002';
select public.pause_session(pg_temp.id('sess'), true);
set session "test.uid" = '0d000000-0000-0000-0000-000000000001';
insert into t select 'rs', public.reset_round_player(pg_temp.id('round'),
  '0d000000-0000-0000-0000-000000000002', null, pg_temp.id('sess'));
select pg_temp.check('resetting a session clears their answers and serve times',
  (select v->>'ok' from t where k = 'rs') = 'true'
  and not exists (select 1 from public.responses r join public.items i on i.id = r.item_id
                  where i.session_id = pg_temp.id('sess')
                    and r.user_id = '0d000000-0000-0000-0000-000000000002')
  and not exists (select 1 from public.item_served s join public.items i on i.id = s.item_id
                  where i.session_id = pg_temp.id('sess')
                    and s.user_id = '0d000000-0000-0000-0000-000000000002'));
select pg_temp.check('and leaves them unpaused, for a fresh start',
  not exists (select 1 from public.session_pauses
              where session_id = pg_temp.id('sess') and user_id = '0d000000-0000-0000-0000-000000000002'));
set session "test.uid" = '0d000000-0000-0000-0000-000000000002';
insert into t select 'again', public.current_item(pg_temp.id('sess'));
select pg_temp.check('so their next visit starts at question one',
  (select (v->>'id')::uuid from t where k = 'again') = pg_temp.id('q1'));

-- ---------------------------------------------------------------------------
-- Refusals
-- ---------------------------------------------------------------------------
select pg_temp.check('a player cannot reset anybody, themselves included',
  (public.reset_round_player(pg_temp.id('round'), '0d000000-0000-0000-0000-000000000002', 'hive')->>'reason')
    = 'not allowed'
  and (public.round_player(pg_temp.id('round'), '0d000000-0000-0000-0000-000000000002')->>'reason')
    = 'not allowed');
set session "test.uid" = '0d000000-0000-0000-0000-000000000001';
select pg_temp.check('a game the round does not have is refused',
  (public.reset_round_player(pg_temp.id('round'), '0d000000-0000-0000-0000-000000000002', 'grid')->>'reason')
    = 'that game is not in this round');
select pg_temp.check('so is a session that does not count in it',
  (public.reset_round_player(pg_temp.id('round'), '0d000000-0000-0000-0000-000000000002', null,
                             pg_temp.id('live'))->>'reason')
    = 'that session does not count in this round');
select pg_temp.check('one thing at a time',
  (public.reset_round_player(pg_temp.id('round'), '0d000000-0000-0000-0000-000000000002')->>'reason')
    = 'reset one game or one session at a time'
  and (public.reset_round_player(pg_temp.id('round'), '0d000000-0000-0000-0000-000000000002', 'hive',
                                 pg_temp.id('sess'))->>'reason')
    = 'reset one game or one session at a time');
select pg_temp.check('and only while the round is on',
  (public.reset_round_player(pg_temp.id('later'), '0d000000-0000-0000-0000-000000000002', 'grid')->>'reason')
    like 'that round is not on%');

-- Leave nothing behind.
delete from public.daily_progress where user_id = '0d000000-0000-0000-0000-000000000002';
delete from public.tournaments where name = 'Reset Cup';
delete from public.sessions where id in (pg_temp.id('sess'), pg_temp.id('live'));

\echo '--- pause and reset checks passed ---'
