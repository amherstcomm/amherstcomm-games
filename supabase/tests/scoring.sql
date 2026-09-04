-- Who won.
--
-- The rule is one point a question, ties broken by how long the correct
-- answers took. Every check here is a sentence somebody might have to say out
-- loud to the person who did not win, so the cases that matter are the awkward
-- ones: partial multi-select, an unanswered question, a tie, and whether the
-- board can be shown mid-round without giving away the question on screen.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'editor@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'ada@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'grace@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'alan@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('33333333-3333-3333-3333-333333333333', 'Ada'),
  ('44444444-4444-4444-4444-444444444444', 'Grace'),
  ('55555555-5555-5555-5555-555555555555', 'Alan')
on conflict (id) do update set display_name = excluded.display_name;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got then 'PASS' else 'FAIL' end, label;
  if not got then raise exception 'failed: %', label; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Marking one answer
-- ---------------------------------------------------------------------------
select pg_temp.check('a single pick among the correct ones is right',
  public.answer_is_correct('{"correct":["2021"]}'::jsonb, '"2021"'::jsonb));
select pg_temp.check('and a different one is not',
  not public.answer_is_correct('{"correct":["2021"]}'::jsonb, '"2019"'::jsonb));
select pg_temp.check('a multi-select matching the set exactly is right',
  public.answer_is_correct('{"correct":["a","b"]}'::jsonb, '["b","a"]'::jsonb));
select pg_temp.check('order does not matter',
  public.answer_is_correct('{"correct":["a","b"]}'::jsonb, '["a","b"]'::jsonb));
select pg_temp.check('half of a multi-select is not most of a point, it is wrong',
  not public.answer_is_correct('{"correct":["a","b"]}'::jsonb, '["a"]'::jsonb));
select pg_temp.check('and neither is picking everything',
  not public.answer_is_correct('{"correct":["a","b"]}'::jsonb, '["a","b","c"]'::jsonb));
select pg_temp.check('a duplicate pick does not make a set unequal',
  public.answer_is_correct('{"correct":["a","b"]}'::jsonb, '["a","b","a"]'::jsonb));
select pg_temp.check('no stored answer means nothing is correct',
  not public.answer_is_correct(null, '"a"'::jsonb));
select pg_temp.check('a malformed answer marks nothing right rather than erroring',
  not public.answer_is_correct('{"correct":"a"}'::jsonb, '"a"'::jsonb));
select pg_temp.check('and no response is not a right one',
  not public.answer_is_correct('{"correct":["a"]}'::jsonb, null));

select pg_temp.check('seconds are measured from opening to submitting',
  public.answer_seconds('2026-10-01 12:00:00+00', '2026-10-01 12:00:03.5+00') = 3.5);
select pg_temp.check('a submission before the opening is no time at all, not a negative one',
  public.answer_seconds('2026-10-01 12:00:03+00', '2026-10-01 12:00:00+00') is null);
select pg_temp.check('and a question never opened has no elapsed time',
  public.answer_seconds(null, '2026-10-01 12:00:00+00') is null);

-- ---------------------------------------------------------------------------
-- A round, played out
-- ---------------------------------------------------------------------------
create temp table t (k text primary key, v jsonb);
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'sess', public.create_session('Who won');
insert into t select 'q1', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice', 'One',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
insert into t select 'q2', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice', 'Two',
  '{"options":["a","b"]}'::jsonb, '{"correct":["b"]}'::jsonb);
insert into t select 'q3', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'survey', 'Coffee?',
  '{"options":["yes","no"]}'::jsonb, null);

select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');

-- Question one: Ada and Grace right, Ada faster. Alan wrong.
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show');
update public.items set opened_at = '2026-10-01 12:00:00+00'
where id = ((select v->>'id' from t where k='q1'))::uuid;
insert into public.responses (item_id, user_id, value, submitted_at) values
  (((select v->>'id' from t where k='q1'))::uuid, '33333333-3333-3333-3333-333333333333', '"a"', '2026-10-01 12:00:02+00'),
  (((select v->>'id' from t where k='q1'))::uuid, '44444444-4444-4444-4444-444444444444', '"a"', '2026-10-01 12:00:05+00'),
  (((select v->>'id' from t where k='q1'))::uuid, '55555555-5555-5555-5555-555555555555', '"b"', '2026-10-01 12:00:01+00');

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select pg_temp.check('there is no winner before the reveal',
  (public.item_winner(((select v->>'id' from t where k='q1'))::uuid)->>'ok') = 'false');
select pg_temp.check('and the board counts nothing yet',
  (public.session_leaderboard(((select v->>'id' from t where k='sess'))::uuid)->>'scored')::int = 0);

select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'reveal');

insert into t select 'w1', public.item_winner(((select v->>'id' from t where k='q1'))::uuid);
select pg_temp.check('the fastest correct answer wins the question',
  (select v->>'name' from t where k='w1') = 'Ada');
select pg_temp.check('and the time is the one the room watched',
  (select (v->>'seconds')::numeric from t where k='w1') = 2);
select pg_temp.check('a faster wrong answer does not win it',
  (select v->>'name' from t where k='w1') <> 'Alan');
select pg_temp.check('two of the three were right',
  (select (v->>'correct')::int from t where k='w1') = 2);

-- Question two: nobody gets it. Ada and Grace are now level on one point each,
-- separated only by how long question one took them — which is the tiebreak the
-- room was promised, and the case worth pinning.
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show');
update public.items set opened_at = '2026-10-01 12:01:00+00'
where id = ((select v->>'id' from t where k='q2'))::uuid;
insert into public.responses (item_id, user_id, value, submitted_at) values
  (((select v->>'id' from t where k='q2'))::uuid, '33333333-3333-3333-3333-333333333333', '"a"', '2026-10-01 12:01:01+00'),
  (((select v->>'id' from t where k='q2'))::uuid, '44444444-4444-4444-4444-444444444444', '"a"', '2026-10-01 12:01:09+00');
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'reveal');

insert into t select 'board', public.session_leaderboard(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('the board is allowed to the presenter',
  (select v->>'ok' from t where k='board') = 'true');
select pg_temp.check('two questions counted',
  (select (v->>'scored')::int from t where k='board') = 2);
select pg_temp.check('everyone who answered is on it',
  jsonb_array_length((select v->'standings' from t where k='board')) = 3);
select pg_temp.check('Ada is first — level on points, quicker on the one she got',
  (select v->'standings'->0->>'name' from t where k='board') = 'Ada');
select pg_temp.check('Grace second',
  (select v->'standings'->1->>'name' from t where k='board') = 'Grace');
select pg_temp.check('both on one point',
  (select v->'standings'->0->>'points' from t where k='board') = '1'
  and (select v->'standings'->1->>'points' from t where k='board') = '1');
select pg_temp.check('and the tiebreak is the time on question one, 2s against 5s',
  (select (v->'standings'->0->>'seconds')::numeric from t where k='board') = 2
  and (select (v->'standings'->1->>'seconds')::numeric from t where k='board') = 5);
select pg_temp.check('a question nobody got right leaves the scores where they were',
  (select v->'standings'->0->>'points' from t where k='board') = '1');
select pg_temp.check('Alan is last on nought',
  (select v->'standings'->2->>'name' from t where k='board') = 'Alan'
  and (select v->'standings'->2->>'points' from t where k='board') = '0');
select pg_temp.check('somebody with nothing right has no time to compare',
  (select v->'standings'->2->'seconds' from t where k='board') = 'null'::jsonb);

-- Question four: Grace alone, and slowly. Points beat speed — she goes ahead of
-- Ada on two-in-fourteen against one-in-two, because the tiebreak only ever
-- decides between people who are level.
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'q4', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice', 'Four',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show',
  ((select v->>'id' from t where k='q4'))::uuid);
update public.items set opened_at = '2026-10-01 12:03:00+00'
where id = ((select v->>'id' from t where k='q4'))::uuid;
insert into public.responses (item_id, user_id, value, submitted_at) values
  (((select v->>'id' from t where k='q4'))::uuid, '44444444-4444-4444-4444-444444444444', '"a"', '2026-10-01 12:03:09+00');
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'reveal',
  ((select v->>'id' from t where k='q4'))::uuid);

insert into t select 'board3', public.session_leaderboard(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('more right answers beats a faster one',
  (select v->'standings'->0->>'name' from t where k='board3') = 'Grace'
  and (select v->'standings'->0->>'points' from t where k='board3') = '2');
select pg_temp.check('even though she took longer over every one of them',
  (select (v->'standings'->0->>'seconds')::numeric from t where k='board3')
    > (select (v->'standings'->1->>'seconds')::numeric from t where k='board3'));

-- The survey has no answer, so it must not count for anyone.
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show');
insert into public.responses (item_id, user_id, value) values
  (((select v->>'id' from t where k='q3'))::uuid, '55555555-5555-5555-5555-555555555555', '"yes"');
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'reveal');
insert into t select 'board2', public.session_leaderboard(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('an unscored question is not a question anybody won',
  (select (v->>'scored')::int from t where k='board2') = 3);
select pg_temp.check('and answering it earns nothing',
  (select (e->>'points')::int from jsonb_array_elements(
     (select v->'standings' from t where k='board2')) e
   where e->>'name' = 'Alan') = 0);

-- ---------------------------------------------------------------------------
-- Who may see what
-- ---------------------------------------------------------------------------
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a player cannot read the board',
  (public.session_leaderboard(((select v->>'id' from t where k='sess'))::uuid)->>'ok') = 'false');
select pg_temp.check('nor who won a question',
  (public.item_winner(((select v->>'id' from t where k='q1'))::uuid)->>'ok') = 'false');

insert into t select 'mine', public.my_standing(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('but does get her own score',
  (select v->>'ok' from t where k='mine') = 'true'
  and (select (v->>'points')::int from t where k='mine') = 1);
select pg_temp.check('out of the questions that have been revealed',
  (select (v->>'scored')::int from t where k='mine') = 3);
select pg_temp.check('and it carries nobody else',
  not (select v ? 'standings' from t where k='mine'));

set session "test.uid" = '55555555-5555-5555-5555-555555555555';
select pg_temp.check('somebody who got none says so rather than failing',
  (public.my_standing(((select v->>'id' from t where k='sess'))::uuid)->>'points')::int = 0);

set session "test.uid" = '';
select pg_temp.check('signed out has no standing',
  (public.my_standing(((select v->>'id' from t where k='sess'))::uuid)->>'ok') = 'false');
select pg_temp.check('anon may call none of the scoring functions',
  (select bool_or(has_function_privilege('anon', oid, 'execute'))
   from pg_proc
   where proname in ('session_leaderboard', 'my_standing', 'item_winner')
     and pronamespace = 'public'::regnamespace) is not true);

\echo '--- scoring checks passed ---'
