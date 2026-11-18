-- Keep score: a session that keeps none, a question with its own say, and the
-- one gate every standing goes through.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('56000000-0000-0000-0000-000000000001', 'points-host@example.com'),
  ('56000000-0000-0000-0000-000000000002', 'points-ada@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('56000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;
insert into public.profiles (id, display_name)
values ('56000000-0000-0000-0000-000000000002', 'Points Ada')
on conflict (id) do update set display_name = excluded.display_name;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);
create or replace function pg_temp.id(k text) returns uuid language sql as $$
  select (v->>'id')::uuid from t where t.k = $1 $$;

set session "test.uid" = '56000000-0000-0000-0000-000000000001';
insert into t select 'sess', public.create_session('Benefits survey', 'strict', 'open');
select pg_temp.check('a session keeps score unless told otherwise',
  (select points from public.sessions where id = pg_temp.id('sess')) = 'on');
insert into t select 'off', public.set_session_points(pg_temp.id('sess'), 'off');
select pg_temp.check('and can be told before anybody answers',
  (select v->>'ok' from t where k = 'off') = 'true'
  and (select points from public.sessions where id = pg_temp.id('sess')) = 'off');

-- one that follows the survey, and one that keeps score on its own say
insert into t select 'q1', public.save_item(pg_temp.id('sess'), null, 'choice', 'Which plan?',
  '{"options":["PPO","HDHP"],"seconds":30}'::jsonb, '{"correct":["PPO"]}'::jsonb);
insert into t select 'q2', public.save_item(pg_temp.id('sess'), null, 'choice', 'Bonus round',
  '{"options":["A","B"],"seconds":30}'::jsonb, '{"correct":["A"]}'::jsonb, 1, false, false, 'on');
insert into t select 'q3', public.save_item(pg_temp.id('sess'), null, 'survey', 'Tea?',
  '{"options":["Yes","No"]}'::jsonb, null, 1, false, false, 'on');
select pg_temp.check('a question following a survey that keeps no score has no clock',
  not ((select payload from public.items where id = pg_temp.id('q1')) ? 'seconds'));
select pg_temp.check('one that keeps score on its own say keeps its clock',
  (select payload->>'seconds' from public.items where id = pg_temp.id('q2')) = '30');
select pg_temp.check('a kind with no right answer has no say',
  (select scoring from public.items where id = pg_temp.id('q3')) = 'inherit');
select pg_temp.check('which questions score, all things considered',
  not public.item_scores(pg_temp.id('q1'))
  and public.item_scores(pg_temp.id('q2'))
  and not public.item_scores(pg_temp.id('q3')));
select pg_temp.check('the correct answer is still kept, for the reveal',
  exists (select 1 from public.item_answers where item_id = pg_temp.id('q1')));

select public.advance_session(pg_temp.id('sess'), 'start');
set session "test.uid" = '56000000-0000-0000-0000-000000000002';
select public.begin_playing(pg_temp.id('sess'));
select public.current_item(pg_temp.id('sess'), null);
insert into t select 'a1', public.answer_item(pg_temp.id('q1'), '"PPO"'::jsonb);
select pg_temp.check('answering one that keeps no score still shows the answer',
  (select v->'answer'->'correct' from t where k = 'a1') = '["PPO"]'::jsonb);
select public.current_item(pg_temp.id('sess'), null);
select public.answer_item(pg_temp.id('q2'), '"A"'::jsonb);
insert into t select 'mine', public.my_standing(pg_temp.id('sess'));
select pg_temp.check('only the question that keeps score is counted',
  (select (v->>'scored')::int from t where k = 'mine') = 1
  and (select (v->>'points')::numeric from t where k = 'mine') = 1);

set session "test.uid" = '56000000-0000-0000-0000-000000000001';
insert into t select 'scores', public.session_scores(pg_temp.id('sess'));
select pg_temp.check('the standings list only the question that keeps score',
  jsonb_array_length((select v->'questions' from t where k = 'scores')) = 1
  and (select v->'questions'->0->>'id' from t where k = 'scores') = (select v->>'id' from t where k = 'q2'));
select pg_temp.check('the results say a winner is possible here, because one question scores',
  (public.session_results(pg_temp.id('sess'))->>'keeps_score') = 'true');
select pg_temp.check('it can no longer change once people have answered',
  (public.set_session_points(pg_temp.id('sess'), 'on')->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- Nothing scores, nobody wins
-- ---------------------------------------------------------------------------
insert into t select 'room', public.create_session('Survey in the room');
select public.set_session_points(pg_temp.id('room'), 'off');
insert into t select 'rq', public.save_item(pg_temp.id('room'), null, 'choice', 'Which plan?',
  '{"options":["PPO","HDHP"]}'::jsonb, '{"correct":["PPO"]}'::jsonb);
select public.advance_session(pg_temp.id('room'), 'start');
select public.advance_session(pg_temp.id('room'), 'show', pg_temp.id('rq'));
set session "test.uid" = '56000000-0000-0000-0000-000000000002';
select public.answer_item(pg_temp.id('rq'), '"PPO"'::jsonb);
set session "test.uid" = '56000000-0000-0000-0000-000000000001';
select public.advance_session(pg_temp.id('room'), 'lock', pg_temp.id('rq'));
select public.advance_session(pg_temp.id('room'), 'reveal', pg_temp.id('rq'));
select pg_temp.check('a question that keeps no score names no winner',
  (public.item_winner(pg_temp.id('rq'))->>'unscored') = 'true'
  and (public.item_winner(pg_temp.id('rq'))->'name') = 'null'::jsonb);
select pg_temp.check('and the results say nobody can have won',
  (public.session_results(pg_temp.id('room'))->>'keeps_score') = 'false');
select pg_temp.check('though the room is still shown how it went',
  (public.item_tally(pg_temp.id('rq'))->>'ok') = 'true');

-- ---------------------------------------------------------------------------
-- Fully anonymous means no score
-- ---------------------------------------------------------------------------
insert into t select 'anon', public.create_session('Pay schedule');
select public.set_session_privacy(pg_temp.id('anon'), 'full');
select pg_temp.check('a fully anonymous survey keeps no score',
  (select points from public.sessions where id = pg_temp.id('anon')) = 'off');
select pg_temp.check('and cannot be made to',
  (public.set_session_points(pg_temp.id('anon'), 'on')->>'reason') = 'fully anonymous surveys can''t keep score');
insert into t select 'aq', public.save_item(pg_temp.id('anon'), null, 'choice', 'Which?',
  '{"options":["A","B"]}'::jsonb, '{"correct":["A"]}'::jsonb, 1, false, false, 'on');
select pg_temp.check('not even a question that asks to',
  not public.item_scores(pg_temp.id('aq')));

-- A poll in a round that keeps score may still have a countdown, as it always
-- could; in a survey that keeps none it may not.
set session "test.uid" = '56000000-0000-0000-0000-000000000001';
insert into t select 'trivia', public.create_session('Friday trivia');
insert into t select 'poll', public.save_item(pg_temp.id('trivia'), null, 'survey', 'Pizza?',
  '{"options":["Yes","No"],"seconds":20}'::jsonb);
select pg_temp.check('a poll in a round that keeps score keeps its clock',
  (select payload->>'seconds' from public.items where id = pg_temp.id('poll')) = '20');
select public.set_session_points(pg_temp.id('trivia'), 'off');
select pg_temp.check('and loses it when the round stops keeping score',
  not ((select payload from public.items where id = pg_temp.id('poll')) ? 'seconds'));
