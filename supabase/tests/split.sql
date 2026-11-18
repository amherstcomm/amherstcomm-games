-- Split results: "of the people who said yes to question 1, how did they
-- answer question 2". The host and site admins only, small groups hidden, and
-- in a fully anonymous survey linked by a token that leads to no name.
\set ON_ERROR_STOP on

insert into auth.users (id, email)
select ('59000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'split-' || n || '@example.com'
from generate_series(1, 39) n
on conflict do nothing;
insert into public.role_grants (user_id, role) values
  ('59000000-0000-0000-0000-000000000001', 'games.edit'),
  ('59000000-0000-0000-0000-000000000030', 'games.view'),
  ('59000000-0000-0000-0000-000000000039', 'games.admin')
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
create or replace function pg_temp.uid(n int) returns uuid language sql as $$
  select ('59000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create or replace function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('test.uid', pg_temp.uid(n)::text, false) $$;
-- the group called `label` in a split
create or replace function pg_temp.grp(k text, label text) returns jsonb language sql as $$
  select g from t, jsonb_array_elements(t.v -> 'groups') g where t.k = $1 and g ->> 'label' = $2 $$;
-- how that group answered question `pos`
create or replace function pg_temp.cells(k text, label text, pos int) returns jsonb language sql as $$
  select jsonb_object_agg(c ->> 'label', (c ->> 'count')::int)
  from jsonb_array_elements(pg_temp.grp($1, $2) -> 'questions') q, jsonb_array_elements(q -> 'cells') c
  where (q ->> 'position')::int = $3 $$;

-- ---------------------------------------------------------------------------
-- An ordinary survey: linked by the person
-- ---------------------------------------------------------------------------
select pg_temp.as_user(1);
insert into t select 'sess', public.create_session('Split pulse', 'strict', 'open');
insert into t select 'q1', public.save_item(pg_temp.id('sess'), null, 'survey', 'Happy with the pay schedule?',
  '{"options":["Yes","Unsure","No"]}'::jsonb);
insert into t select 'q2', public.save_item(pg_temp.id('sess'), null, 'survey', 'Would you switch to twice a month?',
  '{"options":["Yes","No"]}'::jsonb);
insert into t select 'q3', public.save_item(pg_temp.id('sess'), null, 'nps', 'Recommend us?', '{"askWhy":false}'::jsonb);
insert into t select 'q4', public.save_item(pg_temp.id('sess'), null, 'open', 'Anything else?', '{}'::jsonb);

-- Q1: 2-11 Yes (10), 12-17 Unsure (6), 18-20 No (3)
insert into public.responses (item_id, user_id, value)
select pg_temp.id('q1'), pg_temp.uid(n),
       to_jsonb(case when n <= 11 then 'Yes' when n <= 17 then 'Unsure' else 'No' end)
from generate_series(2, 20) n;
-- Q2: of the Yes group, 2-8 Yes and 9-11 No; everybody else Yes
insert into public.responses (item_id, user_id, value)
select pg_temp.id('q2'), pg_temp.uid(n), to_jsonb(case when n between 9 and 11 then 'No' else 'Yes' end)
from generate_series(2, 20) n;
-- Q3: five of the Yes group: 10, 9, 8, 3, 0
insert into public.responses (item_id, user_id, value)
select pg_temp.id('q3'), pg_temp.uid(n), jsonb_build_object('score', s, 'why', null)
from (values (2, 10), (3, 9), (4, 8), (5, 3), (6, 0)) v(n, s);
insert into public.responses (item_id, user_id, value) values (pg_temp.id('q4'), pg_temp.uid(2), '"Fine"');

select pg_temp.as_user(2);
select pg_temp.check('somebody who answered cannot split the results',
  (public.session_split(pg_temp.id('sess'), pg_temp.id('q1'))->>'ok') = 'false'
  and (public.session_split(pg_temp.id('sess'))->>'ok') = 'false');
select pg_temp.as_user(30);
select pg_temp.check('nor can somebody who can only view the games',
  (public.session_split(pg_temp.id('sess'), pg_temp.id('q1'))->>'ok') = 'false');

select pg_temp.as_user(1);
insert into t select 'list', public.session_split(pg_temp.id('sess'));
select pg_temp.check('the host is offered the questions that can split it, and not the open one',
  (select jsonb_agg(q ->> 'position' order by (q ->> 'position')::int) from t, jsonb_array_elements(t.v -> 'questions') q
   where t.k = 'list') = '["1","2","3"]'::jsonb);
select pg_temp.check('an open question cannot split the results',
  (public.session_split(pg_temp.id('sess'), pg_temp.id('q4'))->>'ok') = 'false');

insert into t select 'split', public.session_split(pg_temp.id('sess'), pg_temp.id('q1'));
select pg_temp.check('a group per answer, with how many',
  (pg_temp.grp('split', 'Yes')->>'n')::int = 10
  and (pg_temp.grp('split', 'Unsure')->>'n')::int = 6
  and (pg_temp.grp('split', 'No')->>'n')::int = 3);
select pg_temp.check('of the ten who said yes, seven said yes to question 2 and three said no',
  pg_temp.cells('split', 'Yes', 2) = '{"Yes":7,"No":3}'::jsonb);
select pg_temp.check('and their eNPS groups, out of the five of them who answered it',
  pg_temp.cells('split', 'Yes', 3) = '{"Promoters (9-10)":2,"Passives (7-8)":1,"Detractors (0-6)":2}'::jsonb
  and (select (q ->> 'answered')::int from jsonb_array_elements(pg_temp.grp('split', 'Yes') -> 'questions') q
       where (q ->> 'position')::int = 3) = 5);
select pg_temp.check('an ordinary survey shows every group unless asked not to, the three included',
  pg_temp.grp('split', 'No')->'hidden' = 'null'::jsonb
  and pg_temp.cells('split', 'No', 2) = '{"Yes":3,"No":0}'::jsonb
  and pg_temp.grp('split', 'Unsure')->'hidden' = 'null'::jsonb);

select pg_temp.as_user(2);
select pg_temp.check('somebody who answered cannot change how small a group is shown',
  (public.set_split_groups(pg_temp.id('sess'), true, null)->>'ok') = 'false');
select pg_temp.as_user(1);
select pg_temp.check('the host can hold back small groups, from 5 unless they say',
  (public.set_split_groups(pg_temp.id('sess'), true, null)->>'floor')::int = 5);
delete from t where k = 'split';
insert into t select 'split', public.session_split(pg_temp.id('sess'), pg_temp.id('q1'));
select pg_temp.check('a group of three is not broken down',
  pg_temp.grp('split', 'No')->>'hidden' = 'small'
  and pg_temp.grp('split', 'No')->'questions' = 'null'::jsonb);
select pg_temp.check('and the next smallest is hidden too, or the three could be had by subtraction',
  pg_temp.grp('split', 'Unsure')->>'hidden' = 'subtraction'
  and pg_temp.grp('split', 'Unsure')->'questions' = 'null'::jsonb
  and pg_temp.grp('split', 'Yes')->'hidden' = 'null'::jsonb);
insert into t select 'size3', public.set_split_groups(pg_temp.id('sess'), null, 3);
select pg_temp.check('and the host sets the size: from 3, the three are shown again',
  (select v->>'ok' from t where k = 'size3') = 'true'
  and (public.session_split(pg_temp.id('sess'), pg_temp.id('q1')) -> 'groups' -> 2 ->> 'hidden') is null
  and (public.session_split(pg_temp.id('sess'), pg_temp.id('q1')) ->> 'min')::int = 3);
select pg_temp.check('the split names nobody',
  (select v::text from t where k = 'split') not like '%59000000%');

select pg_temp.as_user(39);
select pg_temp.check('a site admin can split it too',
  (public.session_split(pg_temp.id('sess'), pg_temp.id('q2'))->>'ok') = 'true');

-- ---------------------------------------------------------------------------
-- Fully anonymous: linked by an unnamed token
-- ---------------------------------------------------------------------------
select pg_temp.as_user(1);
insert into t select 'anon', public.create_session('Split anonymous', 'strict', 'open');
select public.set_session_privacy(pg_temp.id('anon'), 'full');
insert into t select 'a1', public.save_item(pg_temp.id('anon'), null, 'survey', 'Which suits you?', '{"options":["A","B"]}'::jsonb);
insert into t select 'a2', public.save_item(pg_temp.id('anon'), null, 'survey', 'Switch?', '{"options":["X","Y"]}'::jsonb);
select public.advance_session(pg_temp.id('anon'), 'start');

-- three answer first: not enough for any results yet
do $$
declare n int;
begin
  for n in 2..4 loop
    perform set_config('test.uid', pg_temp.uid(n)::text, false);
    perform public.answer_anonymously(pg_temp.id('a1'), '"A"'::jsonb, repeat(lpad(n::text, 2, '0'), 32));
  end loop;
end $$;
select pg_temp.as_user(1);
select pg_temp.check('a fully anonymous split waits for the survey''s minimum, like its results',
  (public.session_split(pg_temp.id('anon'), pg_temp.id('a1'))->>'reason') = 'waiting');

-- 2-7 pick A, 8-13 B; of A, 2-5 X and 6-7 Y
do $$
declare n int;
begin
  for n in 2..13 loop
    perform set_config('test.uid', pg_temp.uid(n)::text, false);
    perform public.answer_anonymously(pg_temp.id('a1'), to_jsonb(case when n <= 7 then 'A' else 'B' end),
                                      repeat(lpad(n::text, 2, '0'), 32));
    perform public.answer_anonymously(pg_temp.id('a2'), to_jsonb(case when n <= 5 or n >= 8 then 'X' else 'Y' end),
                                      repeat(lpad(n::text, 2, '0'), 32));
  end loop;
end $$;

select pg_temp.check('each person''s answers share one token, and the twelve are twelve',
  (select count(distinct respondent) from public.survey_answers
   where item_id in (pg_temp.id('a1'), pg_temp.id('a2'))) = 12
  and (select count(*) from public.survey_answers
       where item_id in (pg_temp.id('a1'), pg_temp.id('a2')) and respondent is null) = 0);
select pg_temp.check('which is neither the key, nor the check stored beside the name',
  not exists (select 1 from public.survey_answers a
              where a.item_id = pg_temp.id('a1')
                and (a.respondent in (select key_check from public.survey_participation)
                     or a.respondent ~ '^([0-9]{2})\1+$')));

select pg_temp.as_user(1);
insert into t select 'asplit', public.session_split(pg_temp.id('anon'), pg_temp.id('a1'));
select pg_temp.check('the anonymous survey splits: of the six who picked A, four X and two Y',
  (pg_temp.grp('asplit', 'A')->>'n')::int = 6
  and pg_temp.cells('asplit', 'A', 2) = '{"X":4,"Y":2}'::jsonb
  and pg_temp.cells('asplit', 'B', 2) = '{"X":6,"Y":0}'::jsonb);

select public.set_session_privacy(pg_temp.id('anon'), null, 7);
insert into t select 'araised', public.session_split(pg_temp.id('anon'), pg_temp.id('a1'));
select pg_temp.check('a raised minimum is the smallest group shown, in an anonymous survey',
  (select (v->>'min')::int from t where k = 'araised') = 7
  and pg_temp.grp('araised', 'A')->>'hidden' = 'small'
  and pg_temp.grp('araised', 'B')->>'hidden' = 'small');

-- an answer from before answers were linked
insert into public.survey_answers (item_id, answer_key, value) values (pg_temp.id('a1'), repeat('ee', 32), '"B"');
select pg_temp.check('answers from before linking are counted as left out, not guessed at',
  (public.session_split(pg_temp.id('anon'), pg_temp.id('a1'))->>'unlinked')::int = 1);

select pg_temp.as_user(1);
insert into t select 'lower', public.set_split_groups(pg_temp.id('anon'), null, 3);
insert into t select 'off', public.set_split_groups(pg_temp.id('anon'), false, null);
select pg_temp.check('once people have answered, an anonymous survey cannot show smaller groups',
  (select v->>'ok' from t where k = 'lower') = 'false'
  and (select v->>'ok' from t where k = 'off') = 'false'
  and public.split_floor(pg_temp.id('anon')) = 7);
insert into t select 'raise', public.set_split_groups(pg_temp.id('anon'), null, 9);
select pg_temp.check('but it can hold back more',
  (select v->>'ok' from t where k = 'raise') = 'true'
  and public.split_floor(pg_temp.id('anon')) = 9);
select pg_temp.check('and the people answering are told the size',
  (public.anon_current_item(pg_temp.id('anon'), repeat('02', 32))->>'split_floor')::int = 9);

insert into t select 'fresh', public.create_session('Split small survey', 'strict', 'open');
select public.set_session_privacy(pg_temp.id('fresh'), 'full');
insert into t select 'one', public.set_split_groups(pg_temp.id('fresh'), null, 1);
insert into t select 'none', public.set_split_groups(pg_temp.id('fresh'), false, null);
select pg_temp.check('before anybody answers, an anonymous survey can show groups of any size',
  (select (v->>'floor')::int from t where k = 'one') = 1
  and (select (v->>'floor')::int from t where k = 'none') = 0
  and (public.session_sheet(pg_temp.id('fresh')) -> 'session' ->> 'split_floor')::int = 0);
