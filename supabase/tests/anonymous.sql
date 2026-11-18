-- Fully anonymous surveys.
--
-- The promise is made in the schema, so it is tested there: an answer is
-- stored with no person and no time, the person's key is what finds it again
-- and is stored nowhere, one person is one answer per question, results say
-- nothing until enough people have answered, and every route that used to
-- lead from an answer to a name is closed.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('55000000-0000-0000-0000-000000000001', 'anon-host@example.com'),
  ('55000000-0000-0000-0000-000000000002', 'anon-ada@example.com'),
  ('55000000-0000-0000-0000-000000000003', 'anon-bo@example.com'),
  ('55000000-0000-0000-0000-000000000004', 'anon-cy@example.com'),
  ('55000000-0000-0000-0000-000000000005', 'anon-di@example.com'),
  ('55000000-0000-0000-0000-000000000006', 'anon-ed@example.com'),
  ('55000000-0000-0000-0000-000000000007', 'anon-fi@example.com'),
  ('55000000-0000-0000-0000-000000000009', 'anon-admin@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role) values
  ('55000000-0000-0000-0000-000000000001', 'games.edit'),
  ('55000000-0000-0000-0000-000000000009', 'games.admin')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);
-- one browser's key each: what the page keeps in its storage
insert into t values
  ('k_ada', to_jsonb(repeat('a1', 32))),
  ('k_ada2', to_jsonb(repeat('a2', 32))),
  ('k_bo', to_jsonb(repeat('b0', 32)));
create or replace function pg_temp.key(k text) returns text language sql as $$
  select v #>> '{}' from t where t.k = $1 $$;
create or replace function pg_temp.id(k text) returns uuid language sql as $$
  select (v->>'id')::uuid from t where t.k = $1 $$;

insert into t values ('pay', '{
  "options": [{"id": "a", "name": "Bi-weekly"}, {"id": "b", "name": "Semi-monthly"}],
  "rows": [{"id": "r1", "label": "Paychecks a year", "kind": "text", "values": {"a": "26", "b": "24"}}],
  "allowNoPreference": true, "askWhy": true, "markDifferences": true, "shuffleOptions": false
}'::jsonb);

-- ---------------------------------------------------------------------------
-- The tables cannot hold a name or a time
-- ---------------------------------------------------------------------------
select pg_temp.check('survey_answers has no column for a person or a time',
  not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'survey_answers'
                and (column_name like '%user%' or data_type like 'timestamp%' or column_name like '%_at')));
select pg_temp.check('and survey_participation has no answer and no time',
  (select array_agg(column_name::text order by column_name) from information_schema.columns
   where table_schema = 'public' and table_name = 'survey_participation')
    = array['key_check', 'session_id', 'user_id']);
select pg_temp.check('no web role may read either',
  not has_table_privilege('authenticated', 'public.survey_answers', 'select')
  and not has_table_privilege('authenticated', 'public.survey_participation', 'select'));

-- ---------------------------------------------------------------------------
-- Setting it up
-- ---------------------------------------------------------------------------
set session "test.uid" = '55000000-0000-0000-0000-000000000001';
insert into t select 'sess', public.create_session('Pay schedule', 'strict', 'open');
select pg_temp.check('a session starts anonymous to the room only',
  (select privacy from public.sessions where id = pg_temp.id('sess')) = 'room');
select public.set_session_options(pg_temp.id('sess'), true, null, null, 'live');
insert into t select 'full', public.set_session_privacy(pg_temp.id('sess'), 'full');
select pg_temp.check('it can be made fully anonymous before anybody answers',
  (select v->>'ok' from t where k = 'full') = 'true');
select pg_temp.check('which turns off the room''s questions and the avatars on answers',
  (select not qa and avatars = 'off' from public.sessions where id = pg_temp.id('sess')));
select pg_temp.check('and they cannot be turned back on',
  (public.set_session_options(pg_temp.id('sess'), true)->>'ok') = 'false'
  and (public.set_session_options(pg_temp.id('sess'), null, null, null, 'reveal')->>'ok') = 'false');
select pg_temp.check('results wait for at least five',
  (public.set_session_privacy(pg_temp.id('sess'), null, 4)->>'ok') = 'false');
select pg_temp.check('a word game cannot go in: it has to know whose guesses are whose',
  (public.save_item(pg_temp.id('sess'), null, 'game', 'Guess', '{"slug":"guess","length":5,"tries":6}'::jsonb,
                    '{"word":"crane"}'::jsonb)->>'reason') like '%word game%');
select pg_temp.check('trivia for a giveaway or a tournament is refused at the table',
  exists (select 1 from pg_trigger where tgname = 'giveaway_sessions_not_anonymous')
  and exists (select 1 from pg_trigger where tgname = 'tournament_sessions_not_anonymous'));

insert into t select 'q', public.save_item(pg_temp.id('sess'), null, 'compare',
  'Which pay schedule would you prefer?', (select v from t where k = 'pay'));
insert into t select 'q2', public.save_item(pg_temp.id('sess'), null, 'survey',
  'Payday?', '{"options":["Friday","Monday"]}'::jsonb);
select public.advance_session(pg_temp.id('sess'), 'start');

-- ---------------------------------------------------------------------------
-- Answering
-- ---------------------------------------------------------------------------
set session "test.uid" = '55000000-0000-0000-0000-000000000002';
insert into t select 'cur', public.current_item(pg_temp.id('sess'), null);
select pg_temp.check('a fresh browser is served the first question, with no clock',
  (select v->>'id' from t where k = 'cur') = (select v->>'id' from t where k = 'q')
  and (select v->>'privacy' from t where k = 'cur') = 'full'
  and (select v->'seconds' from t where k = 'cur') = 'null'::jsonb);
select pg_temp.check('answer_item will not take it beside a name',
  (public.answer_item(pg_temp.id('q'), '{"pick":"a"}'::jsonb)->>'ok') = 'false');
select pg_temp.check('a browser with no key is told so',
  (public.answer_anonymously(pg_temp.id('q'), '{"pick":"a"}'::jsonb, null)->>'ok') = 'false');
insert into t select 'a1', public.answer_anonymously(pg_temp.id('q'),
  '{"pick":"a","why":"Fortnightly budgeting"}'::jsonb, pg_temp.key('k_ada'));
select pg_temp.check('an answer with a key is taken',
  (select v->>'ok' from t where k = 'a1') = 'true');
select pg_temp.check('and goes nowhere near responses',
  not exists (select 1 from public.responses where item_id = pg_temp.id('q')));
select pg_temp.check('what is stored is the answer under a fingerprint, and not the key',
  (select count(*) from public.survey_answers where item_id = pg_temp.id('q')) = 1
  and (select value from public.survey_answers where item_id = pg_temp.id('q'))
      = '{"pick":"a","why":"Fortnightly budgeting"}'::jsonb
  and not exists (select 1 from public.survey_answers
                  where answer_key = pg_temp.key('k_ada') or value::text like '%' || pg_temp.key('k_ada') || '%')
  and not exists (select 1 from public.survey_participation where key_check = pg_temp.key('k_ada')));
select pg_temp.check('that she answered is recorded, and nothing about what',
  exists (select 1 from public.survey_participation
          where session_id = pg_temp.id('sess') and user_id = '55000000-0000-0000-0000-000000000002'));
select pg_temp.check('her key finds her answer and moves her on',
  (public.current_item(pg_temp.id('sess'), pg_temp.key('k_ada'))->>'id')
    = (select v->>'id' from t where k = 'q2'));
select pg_temp.check('and her way back to it',
  public.compare_trail(pg_temp.id('sess'), pg_temp.key('k_ada'))
    @> jsonb_build_array(jsonb_build_object('id', (select v->>'id' from t where k = 'q')))
  and (public.revisit_item(pg_temp.id('q'), pg_temp.key('k_ada'))->'mine'->>'pick') = 'a');
-- written first, then read: a check that writes and reads in one statement
-- reads the snapshot from before its own write
insert into t select 'change', public.answer_anonymously(pg_temp.id('q'),
  '{"pick":"b","why":"Rent"}'::jsonb, pg_temp.key('k_ada'));
select pg_temp.check('she can change it with the same key, and it is still one answer',
  (select v->>'ok' from t where k = 'change') = 'true'
  and (select count(*) from public.survey_answers where item_id = pg_temp.id('q')) = 1
  and (select value->>'pick' from public.survey_answers where item_id = pg_temp.id('q')) = 'b');
insert into t select 'other', public.answer_anonymously(pg_temp.id('q'), '{"pick":"a"}'::jsonb, pg_temp.key('k_ada2'));
select pg_temp.check('a second browser with a new key cannot add a second answer',
  (select v->>'ok' from t where k = 'other') = 'false'
  and (select v->>'key_lost' from t where k = 'other') = 'true'
  and (select count(*) from public.survey_answers where item_id = pg_temp.id('q')) = 1);
select pg_temp.check('and is told her answers stand, rather than shown questions it cannot answer',
  (public.current_item(pg_temp.id('sess'), pg_temp.key('k_ada2'))->>'state') = 'done'
  and (public.current_item(pg_temp.id('sess'), pg_temp.key('k_ada2'))->>'key_lost') = 'true');
select public.answer_anonymously(pg_temp.id('q2'), '"Friday"'::jsonb, pg_temp.key('k_ada'));
select pg_temp.check('a kind other than a comparison is still answered once',
  (public.answer_anonymously(pg_temp.id('q2'), '"Monday"'::jsonb, pg_temp.key('k_ada'))->>'ok') = 'false');

set session "test.uid" = '55000000-0000-0000-0000-000000000003';
select pg_temp.check('Bo, with his own key, starts at the beginning and finds nothing of Ada''s',
  (public.current_item(pg_temp.id('sess'), pg_temp.key('k_bo'))->>'id') = (select v->>'id' from t where k = 'q')
  and public.compare_trail(pg_temp.id('sess'), pg_temp.key('k_bo')) = '[]'::jsonb
  and (public.revisit_item(pg_temp.id('q'), pg_temp.key('k_bo'))->>'state') = 'none');
select public.answer_anonymously(pg_temp.id('q'), '{"pick":"b","why":"Bills on the 1st"}'::jsonb, pg_temp.key('k_bo'));

-- ---------------------------------------------------------------------------
-- Nobody can go from an answer to a name
-- ---------------------------------------------------------------------------
set session "test.uid" = '55000000-0000-0000-0000-000000000009';
select pg_temp.check('an admin is refused the identified answers, by name of the reason',
  (public.item_responses_identified(pg_temp.id('q'))->>'reason') like '%fully anonymous%');
set session "test.uid" = '55000000-0000-0000-0000-000000000001';
insert into t select 'pv', public.presenter_view(pg_temp.id('q'));
select pg_temp.check('the host is told how many, and given no list',
  (select (v->>'answered')::int from t where k = 'pv') = 2
  and (select v->'responses' from t where k = 'pv') = '[]'::jsonb);
select pg_temp.check('privacy cannot change now that people have answered',
  (public.set_session_privacy(pg_temp.id('sess'), 'room')->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- Nothing until enough have answered
-- ---------------------------------------------------------------------------
insert into t select 'hidden', public.item_chart(pg_temp.id('q'));
select pg_temp.check('with two answers the chart says only that it is waiting',
  (select v->>'type' from t where k = 'hidden') = 'hidden'
  and (select (v->>'answered')::int from t where k = 'hidden') = 2
  and (select (v->>'needed')::int from t where k = 'hidden') = 5
  and not ((select v from t where k = 'hidden') ? 'bars'));
select pg_temp.check('the minimum can go up after people have answered',
  (public.set_session_privacy(pg_temp.id('sess'), null, 6)->>'ok') = 'true');
select pg_temp.check('but not back down',
  (public.set_session_privacy(pg_temp.id('sess'), null, 5)->>'ok') = 'false');

-- four more, to six
set session "test.uid" = '55000000-0000-0000-0000-000000000004';
select public.answer_anonymously(pg_temp.id('q'), '{"pick":"a","why":"Fridays are easy"}'::jsonb, repeat('c4', 32));
set session "test.uid" = '55000000-0000-0000-0000-000000000005';
select public.answer_anonymously(pg_temp.id('q'), '{"pick":"none"}'::jsonb, repeat('d5', 32));
set session "test.uid" = '55000000-0000-0000-0000-000000000006';
select public.answer_anonymously(pg_temp.id('q'), '{"pick":"b"}'::jsonb, repeat('e6', 32));
select pg_temp.check('five of a minimum of six is still nothing',
  (public.item_chart(pg_temp.id('q'))->>'type') = 'hidden');
set session "test.uid" = '55000000-0000-0000-0000-000000000007';
select public.answer_anonymously(pg_temp.id('q'), '{"pick":"b"}'::jsonb, repeat('f7', 32));

set session "test.uid" = '55000000-0000-0000-0000-000000000001';
insert into t select 'open', public.item_chart(pg_temp.id('q'));
select pg_temp.check('at the minimum, the counts by option',
  (select v->'bars' from t where k = 'open') = '[
    {"label":"Bi-weekly","count":1,"correct":null},
    {"label":"Semi-monthly","count":4,"correct":null},
    {"label":"No preference","count":1,"correct":null}]'::jsonb);
select pg_temp.check('but not the reasons yet: six is under twice the minimum, and it is still open',
  (select v->'comments' from t where k = 'open') = '[]'::jsonb
  and (select v->>'comments_held' from t where k = 'open') = 'true');
select pg_temp.check('the results say how many answered, and that it is anonymous',
  (public.session_results(pg_temp.id('sess'))->>'privacy') = 'full'
  and (public.session_results(pg_temp.id('sess'))->>'answered')::int = 6);

select public.advance_session(pg_temp.id('sess'), 'close');
insert into t select 'closed', public.item_chart(pg_temp.id('q'));
select pg_temp.check('once it closes, the reasons, with the pick and nothing else',
  jsonb_array_length((select v->'comments' from t where k = 'closed')) = 3
  and (select v->'comments' from t where k = 'closed') @> '[{"pick":"Semi-monthly","text":"Rent"}]'::jsonb
  and (select v::text from t where k = 'closed') not like '%55000000%'
  and (select v::text from t where k = 'closed') not like '%anon-%');
select public.set_session_privacy(pg_temp.id('sess'), null, null, false);
select pg_temp.check('and none at all when the author switched them off',
  (public.item_chart(pg_temp.id('q'))->'comments') = '[]'::jsonb
  and (public.item_chart(pg_temp.id('q'))->>'comments_held') = 'false');

-- ---------------------------------------------------------------------------
-- In front of a room
-- ---------------------------------------------------------------------------
insert into t select 'room', public.create_session('Pay schedule, live');
select public.set_session_privacy(pg_temp.id('room'), 'full');
insert into t select 'rq', public.save_item(pg_temp.id('room'), null, 'compare',
  'Which pay schedule would you prefer?', (select v from t where k = 'pay'));
select public.advance_session(pg_temp.id('room'), 'start');
select public.advance_session(pg_temp.id('room'), 'show', pg_temp.id('rq'));
set session "test.uid" = '55000000-0000-0000-0000-000000000002';
select public.answer_anonymously(pg_temp.id('rq'), '{"pick":"a"}'::jsonb, repeat('99', 32));
select pg_temp.check('live, the question on screen carries their own answer by key',
  (public.current_item(pg_temp.id('room'), repeat('99', 32))->'mine'->>'pick') = 'a'
  and (public.current_item(pg_temp.id('room'), null)->'mine') = 'null'::jsonb);
set session "test.uid" = '55000000-0000-0000-0000-000000000001';
select public.advance_session(pg_temp.id('room'), 'lock', pg_temp.id('rq'));
select public.advance_session(pg_temp.id('room'), 'reveal', pg_temp.id('rq'));
select pg_temp.check('and the room is shown no tally while fewer than five have answered',
  (public.item_tally(pg_temp.id('rq'))->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- Everything else is as it was
-- ---------------------------------------------------------------------------
insert into t select 'plain', public.create_session('Ordinary trivia');
insert into t select 'pq', public.save_item(pg_temp.id('plain'), null, 'survey', 'Tea?', '{"options":["Yes","No"]}'::jsonb);
select pg_temp.check('a session left alone is anonymous to the room only',
  (select privacy from public.sessions where id = pg_temp.id('plain')) = 'room');
select pg_temp.check('and will not take an answer by key',
  (public.answer_anonymously(pg_temp.id('pq'), '"Yes"'::jsonb, repeat('99', 32))->>'reason')
    = 'this survey is not fully anonymous');

-- ---------------------------------------------------------------------------
-- What the banner is told
-- ---------------------------------------------------------------------------
set session "test.uid" = '55000000-0000-0000-0000-000000000004';
select pg_temp.check('the question carries the survey''s own minimum and whether reasons are shown',
  (public.current_item(pg_temp.id('room'), null)->>'min_results')::int = 5
  and (public.current_item(pg_temp.id('room'), null)->>'show_comments') = 'true');
set session "test.uid" = '55000000-0000-0000-0000-000000000001';
select public.set_session_privacy(pg_temp.id('room'), null, 7, false);
set session "test.uid" = '55000000-0000-0000-0000-000000000004';
select pg_temp.check('and follows them when the author changes them',
  (public.current_item(pg_temp.id('room'), null)->>'min_results')::int = 7
  and (public.current_item(pg_temp.id('room'), null)->>'show_comments') = 'false');
