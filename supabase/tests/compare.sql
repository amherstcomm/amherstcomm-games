-- A comparison: options side by side, one picked, a reason if asked for.
--
-- What is worth pinning: that the server refuses a table it cannot draw, that
-- an answer is one of the options (or "none" where allowed) and nothing else,
-- that it can be changed on your own time where nothing else can, and that
-- what the room or the results see is counts by option and reasons with no
-- name -- never the answers grouped whole, which would carry the reasons.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('54000000-0000-0000-0000-000000000001', 'compare-host@example.com'),
  ('54000000-0000-0000-0000-000000000002', 'compare-ada@example.com'),
  ('54000000-0000-0000-0000-000000000003', 'compare-bo@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('54000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);

-- the pay-schedule question, as the spec writes it
insert into t values ('pay', '{
  "options": [
    {"id": "a", "name": "Bi-weekly", "subtitle": "Every other Friday"},
    {"id": "b", "name": "Semi-monthly", "subtitle": "Twice a month"}
  ],
  "rows": [
    {"id": "r1", "label": "Paychecks a year", "kind": "text", "values": {"a": "26", "b": "24"}, "differs": "auto"},
    {"id": "r2", "label": "Your pay for the year", "kind": "text", "values": {"a": "Same", "b": "same"}},
    {"id": "r3", "label": "Paydays across a year", "kind": "months",
     "values": {"a": [2,2,3,2,2,2,2,3,2,2,2,2], "b": [2,2,2,2,2,2,2,2,2,2,2,2]}}
  ],
  "allowNoPreference": true,
  "askWhy": true,
  "markDifferences": true,
  "shuffleOptions": false
}'::jsonb);

-- ---------------------------------------------------------------------------
-- The table has to be drawable
-- ---------------------------------------------------------------------------
select pg_temp.check('the pay-schedule question is a valid comparison',
  public.compare_payload_problem((select v from t where k = 'pay')) is null);
select pg_temp.check('one option is not a comparison',
  public.compare_payload_problem(jsonb_set((select v from t where k = 'pay'), '{options}',
    '[{"id":"a","name":"Only"}]')) like '%two to four options%');
select pg_temp.check('five options are too many',
  public.compare_payload_problem(jsonb_set((select v from t where k = 'pay'), '{options}',
    '[{"id":"a","name":"1"},{"id":"b","name":"2"},{"id":"c","name":"3"},{"id":"d","name":"4"},{"id":"e","name":"5"}]'))
    like '%two to four options%');
select pg_temp.check('an option may not be called none, which is the no-preference answer',
  public.compare_payload_problem(jsonb_set((select v from t where k = 'pay'), '{options,1,id}', '"none"'))
    like '%id of its own%');
select pg_temp.check('a row missing an option''s value is refused, by name',
  public.compare_payload_problem(jsonb_set((select v from t where k = 'pay'), '{rows,0,values}', '{"a":"26"}'))
    = 'Row "Paychecks a year" needs a value for each option, 300 characters at most.');
select pg_temp.check('a year of months is twelve whole numbers',
  public.compare_payload_problem(jsonb_set((select v from t where k = 'pay'), '{rows,2,values,b}', '[2,2,2]'))
    like '%twelve whole numbers%');

set session "test.uid" = '54000000-0000-0000-0000-000000000001';
insert into t select 'sess', public.create_session('Pay schedule', 'strict', 'open');
insert into t select 'bad', public.save_item(
  ((select v->>'id' from t where k = 'sess'))::uuid, null, 'compare', 'Which pay schedule would you prefer?',
  jsonb_set((select v from t where k = 'pay'), '{rows}', '[]'));
select pg_temp.check('save_item refuses a comparison with no rows, and says why',
  (select v->>'ok' from t where k = 'bad') = 'false'
  and (select v->>'reason' from t where k = 'bad') like '%one to fifteen rows%');
insert into t select 'q', public.save_item(
  ((select v->>'id' from t where k = 'sess'))::uuid, null, 'compare', 'Which pay schedule would you prefer?',
  (select v from t where k = 'pay'));
select pg_temp.check('and saves a good one',
  (select v->>'ok' from t where k = 'q') = 'true');
select pg_temp.check('a comparison is unscored, so it keeps no correct answer',
  not exists (select 1 from public.item_answers where item_id = ((select v->>'id' from t where k = 'q'))::uuid));
-- a scored one after it, to show the old rule still holds beside the new one
insert into t select 'q2', public.save_item(
  ((select v->>'id' from t where k = 'sess'))::uuid, null, 'choice', 'Payday?',
  '{"options":["Friday","Monday"]}'::jsonb, '{"correct":["Friday"]}'::jsonb);
select public.advance_session(((select v->>'id' from t where k = 'sess'))::uuid, 'start');

-- ---------------------------------------------------------------------------
-- Answering it on your own time
-- ---------------------------------------------------------------------------
set session "test.uid" = '54000000-0000-0000-0000-000000000002';
select public.begin_playing(((select v->>'id' from t where k = 'sess'))::uuid);
insert into t select 'served', public.current_item(((select v->>'id' from t where k = 'sess'))::uuid);
select pg_temp.check('the comparison is served first, with its table',
  (select v->>'kind' from t where k = 'served') = 'compare'
  and jsonb_array_length((select v->'payload'->'rows' from t where k = 'served')) = 3);

insert into t select 'nopick', public.answer_item(((select v->>'id' from t where k = 'q'))::uuid,
  '{"pick":"c"}'::jsonb);
select pg_temp.check('an answer that is not one of the options is refused',
  (select v->>'ok' from t where k = 'nopick') = 'false');
insert into t select 'plain', public.answer_item(((select v->>'id' from t where k = 'q'))::uuid,
  '"a"'::jsonb);
select pg_temp.check('and so is one that is not shaped as a pick',
  (select v->>'ok' from t where k = 'plain') = 'false');

insert into t select 'a1', public.answer_item(((select v->>'id' from t where k = 'q'))::uuid,
  '{"pick":"a","why":"  I budget by the fortnight  "}'::jsonb);
select pg_temp.check('a pick and a reason are taken',
  (select v->>'ok' from t where k = 'a1') = 'true');
select pg_temp.check('and stored as exactly that, trimmed',
  (select value from public.responses
   where item_id = ((select v->>'id' from t where k = 'q'))::uuid
     and user_id = '54000000-0000-0000-0000-000000000002')
  = '{"pick":"a","why":"I budget by the fortnight"}'::jsonb);

insert into t select 'a2', public.answer_item(((select v->>'id' from t where k = 'q'))::uuid,
  '{"pick":"b","why":"Rent is due on the first"}'::jsonb);
select pg_temp.check('it can be changed on your own time, which no other kind can',
  (select v->>'ok' from t where k = 'a2') = 'true'
  and (select value->>'pick' from public.responses
       where item_id = ((select v->>'id' from t where k = 'q'))::uuid
         and user_id = '54000000-0000-0000-0000-000000000002') = 'b');

insert into t select 'long', public.answer_item(((select v->>'id' from t where k = 'q'))::uuid,
  jsonb_build_object('pick', 'a', 'why', repeat('x', 1001)));
select pg_temp.check('a reason over 1000 characters is refused',
  (select v->>'ok' from t where k = 'long') = 'false');

select pg_temp.check('the next question follows once it is answered',
  (public.current_item(((select v->>'id' from t where k = 'sess'))::uuid)->>'id')
    = (select v->>'id' from t where k = 'q2'));
select pg_temp.check('the trail back lists the comparison answered',
  public.compare_trail(((select v->>'id' from t where k = 'sess'))::uuid)
    @> jsonb_build_array(jsonb_build_object('id', (select v->>'id' from t where k = 'q'))));
insert into t select 'back', public.revisit_item(((select v->>'id' from t where k = 'q'))::uuid);
select pg_temp.check('going back puts it in front of them again, with what they said',
  (select v->>'state' from t where k = 'back') = 'open'
  and (select v->'mine'->>'pick' from t where k = 'back') = 'b'
  and (select (v->>'number')::int from t where k = 'back') = 1);
select pg_temp.check('only a comparison can be gone back to',
  (public.revisit_item(((select v->>'id' from t where k = 'q2'))::uuid)->>'state') = 'none');

select public.answer_item(((select v->>'id' from t where k = 'q2'))::uuid, '"Friday"'::jsonb);
select pg_temp.check('a scored question is still answered once',
  (public.answer_item(((select v->>'id' from t where k = 'q2'))::uuid, '"Monday"'::jsonb)->>'ok') = 'false');

set session "test.uid" = '54000000-0000-0000-0000-000000000003';
select public.begin_playing(((select v->>'id' from t where k = 'sess'))::uuid);
select public.current_item(((select v->>'id' from t where k = 'sess'))::uuid);
select pg_temp.check('a trail is your own: Ada''s answer gives Bo nothing to go back to',
  public.compare_trail(((select v->>'id' from t where k = 'sess'))::uuid) = '[]'::jsonb
  and (public.revisit_item(((select v->>'id' from t where k = 'q'))::uuid)->>'state') = 'none');
select public.answer_item(((select v->>'id' from t where k = 'q'))::uuid, '{"pick":"none"}'::jsonb);
select pg_temp.check('no preference is an answer where the author allowed it',
  (select value->>'pick' from public.responses
   where item_id = ((select v->>'id' from t where k = 'q'))::uuid
     and user_id = '54000000-0000-0000-0000-000000000003') = 'none');

-- ---------------------------------------------------------------------------
-- What the results say
-- ---------------------------------------------------------------------------
insert into t select 'chart', public.item_chart(((select v->>'id' from t where k = 'q'))::uuid);
select pg_temp.check('the chart counts by option, in the order written, then no preference',
  (select v->'bars' from t where k = 'chart') = '[
    {"label":"Bi-weekly","count":0,"correct":null},
    {"label":"Semi-monthly","count":1,"correct":null},
    {"label":"No preference","count":1,"correct":null}]'::jsonb);
select pg_temp.check('the reasons come with the option picked',
  (select v->'comments' from t where k = 'chart')
    = '[{"pick":"Semi-monthly","text":"Rent is due on the first"}]'::jsonb);
select pg_temp.check('and with no name, no id and no time anywhere in the chart',
  (select v::text from t where k = 'chart') not like '%54000000%'
  and (select v::text from t where k = 'chart') not like '%compare-%'
  and (select v::text from t where k = 'chart') not like '%2026-%');

-- ---------------------------------------------------------------------------
-- In front of a room: the tally after the reveal
-- ---------------------------------------------------------------------------
set session "test.uid" = '54000000-0000-0000-0000-000000000001';
insert into t select 'room', public.create_session('Pay schedule, live');
insert into t select 'rq', public.save_item(
  ((select v->>'id' from t where k = 'room'))::uuid, null, 'compare', 'Which pay schedule would you prefer?',
  jsonb_set((select v from t where k = 'pay'), '{askWhy}', 'false'));
select public.advance_session(((select v->>'id' from t where k = 'room'))::uuid, 'start');
select public.advance_session(((select v->>'id' from t where k = 'room'))::uuid, 'show',
  ((select v->>'id' from t where k = 'rq'))::uuid);
set session "test.uid" = '54000000-0000-0000-0000-000000000002';
select public.answer_item(((select v->>'id' from t where k = 'rq'))::uuid,
  '{"pick":"a","why":"not asked for"}'::jsonb);
select pg_temp.check('a reason sent to a question that did not ask for one is dropped',
  (select value->'why' from public.responses
   where item_id = ((select v->>'id' from t where k = 'rq'))::uuid
     and user_id = '54000000-0000-0000-0000-000000000002') = 'null'::jsonb);
set session "test.uid" = '54000000-0000-0000-0000-000000000001';
select public.advance_session(((select v->>'id' from t where k = 'room'))::uuid, 'lock',
  ((select v->>'id' from t where k = 'rq'))::uuid);
select public.advance_session(((select v->>'id' from t where k = 'room'))::uuid, 'reveal',
  ((select v->>'id' from t where k = 'rq'))::uuid);
select pg_temp.check('the room''s tally is by option name, never the answers whole',
  (public.item_tally(((select v->>'id' from t where k = 'rq'))::uuid)->'counts') = '{"Bi-weekly":1}'::jsonb);

-- ---------------------------------------------------------------------------
-- Shuffling, when the question asks for it
-- ---------------------------------------------------------------------------
select pg_temp.check('a comparison set to shuffle shuffles its options and keeps their ids',
  (select array_agg(o->>'id' order by o->>'id')
   from jsonb_array_elements(public.served_payload('compare',
          jsonb_set((select v from t where k = 'pay'), '{shuffleOptions}', 'true'), false, 'seed')->'options') o)
    = array['a', 'b']);
select pg_temp.check('and one that is not left alone',
  public.served_payload('compare', (select v from t where k = 'pay'), false, 'seed')
    = (select v from t where k = 'pay'));

-- ---------------------------------------------------------------------------
-- Pictures
-- ---------------------------------------------------------------------------
select pg_temp.check('a row of pictures takes one in the bucket for each option',
  public.compare_payload_problem(jsonb_set((select v from t where k = 'pay'), '{rows}', '[
    {"id":"r9","label":"Floor plan","kind":"image",
     "values":{"a":"54000000-0000-0000-0000-000000000001/plan-a.jpg","b":"54000000-0000-0000-0000-000000000001/plan-b.webp"}}]'))
  is null);
select pg_temp.check('and refuses one missing, or a path that is not one of ours',
  public.compare_payload_problem(jsonb_set((select v from t where k = 'pay'), '{rows}', '[
    {"id":"r9","label":"Floor plan","kind":"image","values":{"a":"54000000-0000-0000-0000-000000000001/plan-a.jpg","b":""}}]'))
    = 'Row "Floor plan" needs a picture for each option.'
  and public.compare_payload_problem(jsonb_set((select v from t where k = 'pay'), '{rows}', '[
    {"id":"r9","label":"Floor plan","kind":"image","values":{"a":"../../etc/passwd","b":"x/y.jpg"}}]'))
    = 'Row "Floor plan" needs a picture for each option.');
