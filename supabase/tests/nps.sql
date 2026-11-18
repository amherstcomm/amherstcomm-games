-- eNPS: 0 to 10, promoters less detractors, and the reasons by group.
\set ON_ERROR_STOP on

insert into auth.users (id, email)
select ('58000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'nps-' || n || '@example.com'
from generate_series(1, 12) n
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('58000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);
create or replace function pg_temp.id(k text) returns uuid language sql as $$
  select (v->>'id')::uuid from t where t.k = $1 $$;
create or replace function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('test.uid', '58000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'), false) $$;

select pg_temp.as_user(1);
insert into t select 'sess', public.create_session('Pulse', 'strict', 'open');
insert into t select 'q', public.save_item(pg_temp.id('sess'), null, 'nps',
  'How likely are you to recommend working here to a friend?',
  '{"lowLabel":"Not at all likely","highLabel":"Extremely likely","askWhy":true}'::jsonb);
select pg_temp.check('an eNPS question saves, and keeps no correct answer',
  (select v->>'ok' from t where k = 'q') = 'true'
  and not exists (select 1 from public.item_answers where item_id = pg_temp.id('q')));
select public.advance_session(pg_temp.id('sess'), 'start');

select pg_temp.as_user(2);
select public.begin_playing(pg_temp.id('sess'));
select public.current_item(pg_temp.id('sess'), null);
select pg_temp.check('an answer has to be a score from 0 to 10',
  (public.answer_item(pg_temp.id('q'), '{"score":11}'::jsonb)->>'reason') = 'pick a number from 0 to 10'
  and (public.answer_item(pg_temp.id('q'), '"9"'::jsonb)->>'ok') = 'false');
insert into t select 'a', public.answer_item(pg_temp.id('q'), '{"score":10,"why":"  Good people  "}'::jsonb);
select pg_temp.check('and is stored as a score and a trimmed reason',
  (select v->>'ok' from t where k = 'a') = 'true'
  and (select value from public.responses where item_id = pg_temp.id('q')
       and user_id = '58000000-0000-0000-0000-000000000002') = '{"score":10,"why":"Good people"}'::jsonb);

-- nine more: 9, 9, 8, 7, 6, 3, 0, 10, 5  ->  4 promoters, 2 passives, 4 detractors of 10
do $$
declare
  scores int[] := array[9, 9, 8, 7, 6, 3, 0, 10, 5];
  i int;
begin
  for i in 1..9 loop
    perform set_config('test.uid', '58000000-0000-0000-0000-0000000000' || lpad((i + 2)::text, 2, '0'), false);
    perform public.begin_playing((select id from public.sessions where title = 'Pulse' limit 1));
    perform public.current_item((select id from public.sessions where title = 'Pulse' limit 1), null);
    perform public.answer_item((select id from public.items where kind = 'nps' and prompt like 'How likely%' limit 1),
      jsonb_build_object('score', scores[i], 'why', case when scores[i] = 3 then 'Too much on call' end));
  end loop;
end $$;

select pg_temp.as_user(1);
insert into t select 'chart', public.item_chart_raw(pg_temp.id('q'));
select pg_temp.check('the chart counts each score, 0 to 10',
  (select v->'counts' from t where k = 'chart') = '[1,0,0,1,0,1,1,1,1,2,2]'::jsonb);
select pg_temp.check('and the three groups',
  (select (v->>'promoters')::int = 4 and (v->>'passives')::int = 2 and (v->>'detractors')::int = 4
   from t where k = 'chart'));
select pg_temp.check('and the score: promoters less detractors, as a share',
  (select (v->>'score')::int from t where k = 'chart') = 0);
select pg_temp.check('the reasons come with the group, and no name',
  (select v->'comments' from t where k = 'chart') @> '[{"pick":"Promoter","text":"Good people"},{"pick":"Detractor","text":"Too much on call"}]'::jsonb
  and (select v::text from t where k = 'chart') not like '%58000000%');

-- ---------------------------------------------------------------------------
-- Not asked why, and in front of a room
-- ---------------------------------------------------------------------------
insert into t select 'room', public.create_session('Town hall pulse');
insert into t select 'rq', public.save_item(pg_temp.id('room'), null, 'nps', 'Recommend us?', '{"askWhy":false}'::jsonb);
select public.advance_session(pg_temp.id('room'), 'start');
select public.advance_session(pg_temp.id('room'), 'show', pg_temp.id('rq'));
select pg_temp.as_user(2);
select public.answer_item(pg_temp.id('rq'), '{"score":8,"why":"not asked for"}'::jsonb);
select pg_temp.check('a reason sent to a question that did not ask for one is dropped',
  (select value->'why' from public.responses where item_id = pg_temp.id('rq')
   and user_id = '58000000-0000-0000-0000-000000000002') = 'null'::jsonb);
select pg_temp.as_user(1);
select public.advance_session(pg_temp.id('room'), 'lock', pg_temp.id('rq'));
select public.advance_session(pg_temp.id('room'), 'reveal', pg_temp.id('rq'));
select pg_temp.check('the room''s tally is by score',
  (public.item_tally(pg_temp.id('rq'))->'counts') = '{"8":1}'::jsonb);

-- ---------------------------------------------------------------------------
-- Fully anonymous, which is where an eNPS usually lives
-- ---------------------------------------------------------------------------
insert into t select 'anon', public.create_session('Anonymous pulse', 'strict', 'open');
select public.set_session_privacy(pg_temp.id('anon'), 'full');
insert into t select 'aq', public.save_item(pg_temp.id('anon'), null, 'nps', 'Recommend us?', '{"askWhy":true}'::jsonb);
select public.advance_session(pg_temp.id('anon'), 'start');
select pg_temp.as_user(3);
insert into t select 'bad', public.answer_anonymously(pg_temp.id('aq'), '{"score":-1}'::jsonb, repeat('58', 32));
insert into t select 'good', public.answer_anonymously(pg_temp.id('aq'), '{"score":7,"why":"Fine"}'::jsonb, repeat('58', 32));
select pg_temp.check('an anonymous answer is checked the same way',
  (select v->>'ok' from t where k = 'bad') = 'false'
  and (select v->>'ok' from t where k = 'good') = 'true'
  and (select value from public.survey_answers where item_id = pg_temp.id('aq')) = '{"score":7,"why":"Fine"}'::jsonb);
