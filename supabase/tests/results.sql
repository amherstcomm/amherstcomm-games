-- What the room actually said, question by question.
--
-- The scoreboard answers "who won"; this answers "how did that one go". Most of
-- the checks here are about the shapes being honest rather than merely present:
-- an option nobody picked still has a bar, a wrong pairing does not count
-- towards the pair it was not, and an anonymous question carries no name.
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
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'sess', public.create_session('How did they go');

-- one of each kind that has a chart
insert into t select 'qc', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice', 'Which year?',
  '{"options":["2019","2021","2023"]}'::jsonb, '{"correct":["2021"]}'::jsonb);
insert into t select 'qs', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'survey', 'Coffee?',
  '{"options":["Fine","Not fine"]}'::jsonb, null);
insert into t select 'qm', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'match', 'Pair them',
  '{"left":["Cat","Dog"],"right":["Kitten","Puppy"]}'::jsonb,
  '{"pairs":{"Cat":"Kitten","Dog":"Puppy"}}'::jsonb);
insert into t select 'qn', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'number', 'Share price?',
  '{"currency":"USD"}'::jsonb, '{"value":41.5}'::jsonb);
insert into t select 'qo', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'open', 'Ask anything',
  '{}'::jsonb, null);

select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');
update public.items set state = 'open', opened_at = now()
where session_id = ((select v->>'id' from t where k='sess'))::uuid;

-- Ada right, Grace and Alan on 2019. Nobody picks 2023.
insert into public.responses (item_id, user_id, value) values
  (((select v->>'id' from t where k='qc'))::uuid, '33333333-3333-3333-3333-333333333333', '"2021"'),
  (((select v->>'id' from t where k='qc'))::uuid, '44444444-4444-4444-4444-444444444444', '"2019"'),
  (((select v->>'id' from t where k='qc'))::uuid, '55555555-5555-5555-5555-555555555555', '"2019"'),
  (((select v->>'id' from t where k='qs'))::uuid, '33333333-3333-3333-3333-333333333333', '"Fine"'),
  (((select v->>'id' from t where k='qm'))::uuid, '33333333-3333-3333-3333-333333333333', '{"Cat":"Kitten","Dog":"Puppy"}'),
  (((select v->>'id' from t where k='qm'))::uuid, '44444444-4444-4444-4444-444444444444', '{"Cat":"Kitten","Dog":"Kitten"}'),
  (((select v->>'id' from t where k='qn'))::uuid, '33333333-3333-3333-3333-333333333333', '41'),
  (((select v->>'id' from t where k='qn'))::uuid, '44444444-4444-4444-4444-444444444444', '45');
insert into public.responses (item_id, user_id, value, anonymous) values
  (((select v->>'id' from t where k='qo'))::uuid, '33333333-3333-3333-3333-333333333333', '"When is the picnic?"', false),
  (((select v->>'id' from t where k='qo'))::uuid, '44444444-4444-4444-4444-444444444444', '"Why is the coffee like that?"', true);

update public.items set state = 'revealed'
where session_id = ((select v->>'id' from t where k='sess'))::uuid;

insert into t select 'res', public.session_results(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('the results are allowed to the presenter',
  (select v->>'ok' from t where k='res') = 'true');
select pg_temp.check('and cover every question that has been shown',
  jsonb_array_length((select v->'items' from t where k='res')) = 5);

create or replace function pg_temp.chart(pos int) returns jsonb
language sql as $$
  select e->'chart' from jsonb_array_elements((select v->'items' from t where k='res')) e
  where (e->>'position')::int = pos
$$;

-- ---------------------------------------------------------------------------
-- Choice
-- ---------------------------------------------------------------------------
select pg_temp.check('a choice is bars, one per option',
  pg_temp.chart(1)->>'type' = 'bars'
  and jsonb_array_length(pg_temp.chart(1)->'bars') = 3);
select pg_temp.check('in the order they were written, not by size',
  pg_temp.chart(1)->'bars'->0->>'label' = '2019'
  and pg_temp.chart(1)->'bars'->2->>'label' = '2023');
select pg_temp.check('with the counts',
  (pg_temp.chart(1)->'bars'->0->>'count')::int = 2
  and (pg_temp.chart(1)->'bars'->1->>'count')::int = 1);
-- A bar chart missing its zeroes quietly rewrites the question.
select pg_temp.check('and an option nobody picked still has a bar',
  (pg_temp.chart(1)->'bars'->2->>'count')::int = 0);
select pg_temp.check('the right one is marked as such',
  (pg_temp.chart(1)->'bars'->1->>'correct')::boolean
  and not (pg_temp.chart(1)->'bars'->0->>'correct')::boolean);
select pg_temp.check('and the total is who answered, not who was there',
  (pg_temp.chart(1)->>'total')::int = 3);

-- ---------------------------------------------------------------------------
-- Survey: the same chart with nothing to be right about
-- ---------------------------------------------------------------------------
select pg_temp.check('a survey has no correct bar',
  pg_temp.chart(2)->'bars'->0->'correct' = 'null'::jsonb
  and pg_temp.chart(2)->'bars'->1->'correct' = 'null'::jsonb);
select pg_temp.check('and still counts what was said',
  (pg_temp.chart(2)->'bars'->0->>'count')::int = 1);

-- ---------------------------------------------------------------------------
-- Matching: one bar per pair, counting who got that pair
-- ---------------------------------------------------------------------------
select pg_temp.check('a match is one bar per pair, labelled with the pairing',
  jsonb_array_length(pg_temp.chart(3)->'bars') = 2
  and pg_temp.chart(3)->'bars'->0->>'label' = 'Cat → Kitten');
select pg_temp.check('both got the cat',
  (pg_temp.chart(3)->'bars'->0->>'count')::int = 2);
-- Grace paired the dog with Kitten, which is not a vote for Dog → Puppy.
select pg_temp.check('and a wrong pairing does not count towards the right one',
  (pg_temp.chart(3)->'bars'->1->>'count')::int = 1);

-- ---------------------------------------------------------------------------
-- Guessing: values on a line, not bars
-- ---------------------------------------------------------------------------
select pg_temp.check('a guess is not bars',
  pg_temp.chart(4)->>'type' = 'numbers');
select pg_temp.check('it carries every guess, in order',
  pg_temp.chart(4)->'values' = '[41, 45]'::jsonb);
select pg_temp.check('and the value they were guessing at',
  (pg_temp.chart(4)->>'answer')::numeric = 41.5);
select pg_temp.check('and how it is written, so the axis reads like the question',
  pg_temp.chart(4)->>'currency' = 'USD');

-- ---------------------------------------------------------------------------
-- Open: text, and the anonymity promise kept
-- ---------------------------------------------------------------------------
select pg_temp.check('an open question is text',
  pg_temp.chart(5)->>'type' = 'texts'
  and jsonb_array_length(pg_temp.chart(5)->'texts') = 2);
select pg_temp.check('a named one carries the name',
  pg_temp.chart(5)->'texts'->0->>'who' = 'Ada');
select pg_temp.check('and an anonymous one carries none',
  pg_temp.chart(5)->'texts'->1->'who' = 'null'::jsonb);
select pg_temp.check('while still carrying what was asked',
  pg_temp.chart(5)->'texts'->1->>'value' = 'Why is the coffee like that?');

-- ---------------------------------------------------------------------------
-- Who may look
-- ---------------------------------------------------------------------------
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a player cannot read the results',
  (public.session_results(((select v->>'id' from t where k='sess'))::uuid)->>'ok') = 'false');
select pg_temp.check('nor call item_chart at all',
  not has_function_privilege('authenticated', 'public.item_chart(uuid)', 'execute'));
select pg_temp.check('and anon may not read them either',
  not has_function_privilege('anon', 'public.session_results(uuid)', 'execute'));

\echo '--- results checks passed ---'
