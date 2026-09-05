-- Running the same set of questions again.
--
-- Most of these are about what does *not* come across. A copy that carried
-- last week's answers would put last week's winner on this week's board, and
-- one that carried the code would collide with the session it came from —
-- both of which look like a working copy until somebody opens the scoreboard.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ray@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'otheredit@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'ada@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'games.edit'),
  ('22222222-2222-2222-2222-222222222222', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);
set session "test.uid" = '11111111-1111-1111-1111-111111111111';

insert into t select 'src', public.create_session('October, week one', 'strict', 'open', true);

insert into t select 'q1', public.save_item(
  ((select v->>'id' from t where k='src'))::uuid, null, 'choice', 'Which year?',
  '{"options":["2019","2021"],"seconds":30}'::jsonb, '{"correct":["2021"]}'::jsonb);
insert into t select 'q2', public.save_item(
  ((select v->>'id' from t where k='src'))::uuid, null, 'survey', 'Coffee?',
  '{"options":["Fine","Not fine"]}'::jsonb, null);
insert into t select 'q3', public.save_item(
  ((select v->>'id' from t where k='src'))::uuid, null, 'rank', 'In order',
  '{"options":["a","b","c","d"]}'::jsonb, '{"order":["a","b","c","d"]}'::jsonb);

-- run it, so there is something to leave behind
select public.advance_session(((select v->>'id' from t where k='src'))::uuid, 'start');
insert into public.responses (item_id, user_id, value) values
  (((select v->>'id' from t where k='q1'))::uuid, '33333333-3333-3333-3333-333333333333', '"2021"');
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select public.ask_question(((select v->>'id' from t where k='src'))::uuid, 'Is there cake?');
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
-- Settings the host changed after the fact, so what carries is what the session
-- ended up as rather than what create_session happened to default to.
select public.set_session_options(((select v->>'id' from t where k='src'))::uuid, false, true);

-- ---------------------------------------------------------------------------
-- The copy
-- ---------------------------------------------------------------------------
insert into t select 'dup', public.duplicate_session(((select v->>'id' from t where k='src'))::uuid);
select pg_temp.check('duplicating works', (select v->>'ok' from t where k='dup') = 'true');
select pg_temp.check('and says how many questions came across',
  (select (v->>'items')::int from t where k='dup') = 3);

select pg_temp.check('the copy is named after the original',
  (select title from public.sessions where id = ((select v->>'id' from t where k='dup'))::uuid)
    = 'October, week one (copy)');
select pg_temp.check('and is a draft, whatever the original was doing',
  (select state from public.sessions where id = ((select v->>'id' from t where k='dup'))::uuid)
    = 'draft');
select pg_temp.check('with the settings carried over',
  (select mode = 'open' and not qa and share_results from public.sessions
   where id = ((select v->>'id' from t where k='dup'))::uuid));

-- A copy sharing a code would collide with the session it came from.
select pg_temp.check('it gets its own code',
  (select a.code <> b.code from public.sessions a, public.sessions b
   where a.id = ((select v->>'id' from t where k='src'))::uuid
     and b.id = ((select v->>'id' from t where k='dup'))::uuid));

-- ---------------------------------------------------------------------------
-- The questions came, in order, with their answers
-- ---------------------------------------------------------------------------
select pg_temp.check('every question came across, in order',
  (select array_agg(prompt order by position) from public.items
   where session_id = ((select v->>'id' from t where k='dup'))::uuid)
    = array['Which year?', 'Coffee?', 'In order']);
select pg_temp.check('and none of them has been shown',
  (select bool_and(state = 'pending' and opened_at is null) from public.items
   where session_id = ((select v->>'id' from t where k='dup'))::uuid));
select pg_temp.check('the answers came too',
  (select a.answer -> 'correct' ->> 0 from public.items i
   join public.item_answers a on a.item_id = i.id
   where i.session_id = ((select v->>'id' from t where k='dup'))::uuid and i.position = 1)
    = '2021');
select pg_temp.check('an unscored question still has none',
  not exists (select 1 from public.items i
              join public.item_answers a on a.item_id = i.id
              where i.session_id = ((select v->>'id' from t where k='dup'))::uuid
                and i.position = 2));
select pg_temp.check('and the clock came with the question it was set on',
  (select payload ->> 'seconds' from public.items
   where session_id = ((select v->>'id' from t where k='dup'))::uuid and position = 1) = '30');

-- The arrangement is not part of the question — save_item scrambles it so the
-- payload is not the answer — so a copy reshuffles rather than handing a second
-- group the first group's screenshot.
select pg_temp.check('a ranking is not copied in its answer order',
  (select payload -> 'options' from public.items
   where session_id = ((select v->>'id' from t where k='dup'))::uuid and position = 3)
    <> '["a","b","c","d"]'::jsonb);
select pg_temp.check('but it is still the same four options',
  (select payload -> 'options' @> '["a","b","c","d"]'::jsonb from public.items
   where session_id = ((select v->>'id' from t where k='dup'))::uuid and position = 3));

-- ---------------------------------------------------------------------------
-- And nothing that happened
-- ---------------------------------------------------------------------------
select pg_temp.check('no answers anybody gave',
  not exists (select 1 from public.responses r
              join public.items i on i.id = r.item_id
              where i.session_id = ((select v->>'id' from t where k='dup'))::uuid));
select pg_temp.check('no questions anybody asked',
  not exists (select 1 from public.asks
              where session_id = ((select v->>'id' from t where k='dup'))::uuid));
select pg_temp.check('and a clean board',
  jsonb_array_length(
    (public.session_leaderboard(((select v->>'id' from t where k='dup'))::uuid))->'standings') = 0);
select pg_temp.check('while the original still has all of it',
  exists (select 1 from public.responses r
          join public.items i on i.id = r.item_id
          where i.session_id = ((select v->>'id' from t where k='src'))::uuid)
  and exists (select 1 from public.asks
              where session_id = ((select v->>'id' from t where k='src'))::uuid));

-- ---------------------------------------------------------------------------
-- Whose it is, and who may
-- ---------------------------------------------------------------------------
set session "test.uid" = '22222222-2222-2222-2222-222222222222';
insert into t select 'theirs', public.duplicate_session(
  ((select v->>'id' from t where k='src'))::uuid, 'Week two');
select pg_temp.check('another editor can copy it',
  (select v->>'ok' from t where k='theirs') = 'true');
select pg_temp.check('and can give it a name of their own',
  (select title from public.sessions where id = ((select v->>'id' from t where k='theirs'))::uuid)
    = 'Week two');
-- Whoever copied it is about to run it, and running it is what host decides.
select pg_temp.check('the copy belongs to whoever made it',
  (select host from public.sessions where id = ((select v->>'id' from t where k='theirs'))::uuid)
    = '22222222-2222-2222-2222-222222222222');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a player cannot copy anything',
  (public.duplicate_session(((select v->>'id' from t where k='src'))::uuid)->>'ok') = 'false');
select pg_temp.check('and anon may not call it',
  not has_function_privilege('anon', 'public.duplicate_session(uuid, text)', 'execute'));

\echo '--- duplication checks passed ---'
