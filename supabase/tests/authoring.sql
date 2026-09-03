-- Authoring: creating and editing a session and its questions.
--
-- Every check prints PASS or FAIL and raises on FAIL, so the run stops at the
-- first one rather than reporting a wall of consequences. Nothing here trusts
-- that a function returned *something* — where a function claims to have
-- written a row, the row is read back.
--
-- Who the caller is comes from `test.uid`, which the harness's auth.uid() reads,
-- because that is what these functions gate on. The file runs as the database
-- owner; see the note above the grant checks at the end for why, and for what
-- that leaves those checks to cover.
--
-- This caught one real bug on its first run: move_item swapped two positions in
-- a single UPDATE, on the assumption that a unique constraint is checked once
-- per statement. It is checked per row unless declared deferrable, so every
-- reorder failed. Reading the function did not show it; running it did.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'editor@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'player@example.com')
on conflict do nothing;

insert into public.role_grants (user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got then 'PASS' else 'FAIL' end, label;
  if not got then raise exception 'failed: %', label; end if;
end $$;

-- ---------------------------------------------------------------------------
-- As the editor
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';

select pg_temp.check('editor can setup', public.can('games.setup'));

create temp table t (k text primary key, v jsonb);

insert into t select 'sess', public.create_session('October trivia, week one', 'open');
select pg_temp.check('create_session ok', (select v->>'ok' from t where k='sess') = 'true');

insert into t select 'blank', public.create_session('   ');
select pg_temp.check('a nameless session is refused',
  (select v->>'ok' from t where k='blank') = 'false');

select pg_temp.check('late_join was stored',
  (select late_join from public.sessions
   where id = ((select v->>'id' from t where k='sess'))::uuid) = 'open');

-- two items, one scored one not
insert into t select 'q1', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice',
  'Which year did we become employee owned?',
  '{"options":["2019","2021","2023"]}'::jsonb,
  '{"correct":["2021"]}'::jsonb);
select pg_temp.check('save_item created', (select v->>'ok' from t where k='q1') = 'true');

insert into t select 'q2', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'survey',
  'How is the coffee?', '{"options":["Fine","Not fine"]}'::jsonb,
  '{"correct":["Fine"]}'::jsonb);
select pg_temp.check('save_item created the survey', (select v->>'ok' from t where k='q2') = 'true');

-- the answer handling is the point of the function, so check the table itself
select pg_temp.check('the scored item has its answer',
  exists (select 1 from public.item_answers
          where item_id = ((select v->>'id' from t where k='q1'))::uuid));
select pg_temp.check('an answer passed to an unscored kind is dropped',
  not exists (select 1 from public.item_answers
              where item_id = ((select v->>'id' from t where k='q2'))::uuid));

select pg_temp.check('positions are 1 then 2',
  (select array_agg(position order by position) from public.items
   where session_id = ((select v->>'id' from t where k='sess'))::uuid) = array[1,2]);

-- editing
insert into t select 'edit', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid,
  ((select v->>'id' from t where k='q1'))::uuid,
  'choice', 'Which year did we become employee-owned?',
  '{"options":["2019","2021","2023"]}'::jsonb, '{"correct":["2021"]}'::jsonb);
select pg_temp.check('editing a pending item works', (select v->>'ok' from t where k='edit') = 'true');
select pg_temp.check('the edit landed',
  (select prompt from public.items where id = ((select v->>'id' from t where k='q1'))::uuid)
    = 'Which year did we become employee-owned?');
select pg_temp.check('editing did not renumber',
  (select count(*) from public.items
   where session_id = ((select v->>'id' from t where k='sess'))::uuid) = 2);

-- changing a scored kind to an unscored one drops the answer it had
insert into t select 'unscore', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid,
  ((select v->>'id' from t where k='q1'))::uuid,
  'survey', 'Which year felt longest?', '{"options":["2019","2021"]}'::jsonb, null);
select pg_temp.check('switching to an unscored kind drops the answer',
  not exists (select 1 from public.item_answers
              where item_id = ((select v->>'id' from t where k='q1'))::uuid));
-- put it back
select public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid,
  ((select v->>'id' from t where k='q1'))::uuid,
  'choice', 'Which year did we become employee-owned?',
  '{"options":["2019","2021","2023"]}'::jsonb, '{"correct":["2021"]}'::jsonb);

-- the sheet
insert into t select 'sheet', public.session_sheet(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('the sheet is ok', (select v->>'ok' from t where k='sheet') = 'true');
select pg_temp.check('the sheet has both items',
  jsonb_array_length((select v->'items' from t where k='sheet')) = 2);
select pg_temp.check('the sheet shows the author the answer',
  (select v->'items'->0->'answer'->'correct'->>0 from t where k='sheet') = '2021');
select pg_temp.check('the sheet lists the kinds',
  jsonb_array_length((select v->'kinds' from t where k='sheet')) >= 6);

-- reordering
insert into t select 'move', public.move_item(((select v->>'id' from t where k='q2'))::uuid, -1);
select pg_temp.check('move up ok', (select v->>'ok' from t where k='move') = 'true');
select pg_temp.check('the survey is now first',
  (select position from public.items where id = ((select v->>'id' from t where k='q2'))::uuid) = 1);
insert into t select 'move2', public.move_item(((select v->>'id' from t where k='q2'))::uuid, -1);
select pg_temp.check('moving past the end is refused',
  (select v->>'ok' from t where k='move2') = 'false');

-- my_sessions
select pg_temp.check('my_sessions lists it',
  (select count(*) from jsonb_array_elements(public.my_sessions()) e
   where e->>'id' = (select v->>'id' from t where k='sess')) = 1);
select pg_temp.check('my_sessions counts the items',
  (select (e->>'items')::int from jsonb_array_elements(public.my_sessions()) e
   where e->>'id' = (select v->>'id' from t where k='sess')) = 2);

-- a shown item cannot be edited
update public.items set state = 'open', opened_at = now()
where id = ((select v->>'id' from t where k='q1'))::uuid;
insert into t select 'frozen', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid,
  ((select v->>'id' from t where k='q1'))::uuid,
  'choice', 'Sneaky rewrite', '{"options":["a"]}'::jsonb, '{"correct":["a"]}'::jsonb);
select pg_temp.check('a shown item refuses the edit',
  (select v->>'ok' from t where k='frozen') = 'false');
select pg_temp.check('and says why',
  (select v->>'reason' from t where k='frozen') like '%already been shown%');
select pg_temp.check('and did not write it anyway',
  (select prompt from public.items where id = ((select v->>'id' from t where k='q1'))::uuid)
    <> 'Sneaky rewrite');

-- but it can be deleted, answers and all
update public.sessions set state = 'live', current_item = ((select v->>'id' from t where k='q1'))::uuid
where id = ((select v->>'id' from t where k='sess'))::uuid;
insert into public.responses (item_id, user_id, value)
values (((select v->>'id' from t where k='q1'))::uuid,
        '22222222-2222-2222-2222-222222222222', '"2021"'::jsonb);
insert into t select 'del', public.delete_item(((select v->>'id' from t where k='q1'))::uuid);
select pg_temp.check('deleting a shown item works', (select v->>'ok' from t where k='del') = 'true');
select pg_temp.check('its responses went too',
  not exists (select 1 from public.responses
              where item_id = ((select v->>'id' from t where k='q1'))::uuid));
select pg_temp.check('current_item was cleared rather than dangling',
  (select current_item from public.sessions
   where id = ((select v->>'id' from t where k='sess'))::uuid) is null);

-- a session that has run is not deletable
insert into t select 'delsess', public.delete_session(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('a live session refuses deletion',
  (select v->>'ok' from t where k='delsess') = 'false');
update public.sessions set state = 'draft' where id = ((select v->>'id' from t where k='sess'))::uuid;

-- ---------------------------------------------------------------------------
-- As an ordinary player: none of it
-- ---------------------------------------------------------------------------
set session "test.uid" = '22222222-2222-2222-2222-222222222222';
select pg_temp.check('a player cannot setup', not public.can('games.setup'));
select pg_temp.check('my_sessions is empty for a player', public.my_sessions() = '[]'::jsonb);
select pg_temp.check('a player cannot create a session',
  (public.create_session('mine now')->>'ok') = 'false');
select pg_temp.check('a player cannot read the sheet',
  (public.session_sheet(((select v->>'id' from t where k='sess'))::uuid)->>'ok') = 'false');
select pg_temp.check('a player cannot add an item',
  (public.save_item(((select v->>'id' from t where k='sess'))::uuid, null, 'choice', 'x',
                    '{}'::jsonb, '{"correct":["x"]}'::jsonb)->>'ok') = 'false');
select pg_temp.check('a player cannot delete an item',
  (public.delete_item(((select v->>'id' from t where k='q2'))::uuid)->>'ok') = 'false');
select pg_temp.check('a player cannot reorder',
  (public.move_item(((select v->>'id' from t where k='q2'))::uuid, -1)->>'ok') = 'false');
select pg_temp.check('a player cannot delete a session',
  (public.delete_session(((select v->>'id' from t where k='sess'))::uuid)->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- The grants themselves. This file runs as the owner, because every function
-- here is security definer and gates on auth.uid() rather than on the calling
-- database role -- so running as `authenticated` would test nothing extra and
-- would fail on the harness's own direct reads. What that leaves untested is
-- whether the web role may call them at all, so assert that directly.
-- ---------------------------------------------------------------------------
select pg_temp.check('authenticated may call the authoring functions',
  (select bool_and(has_function_privilege('authenticated', oid, 'execute'))
   from pg_proc
   where proname in ('my_sessions', 'create_session', 'session_sheet', 'save_item',
                     'delete_item', 'move_item', 'delete_session')
     and pronamespace = 'public'::regnamespace));
select pg_temp.check('anon may call none of them',
  (select bool_or(has_function_privilege('anon', oid, 'execute'))
   from pg_proc
   where proname in ('my_sessions', 'create_session', 'session_sheet', 'save_item',
                     'delete_item', 'move_item', 'delete_session')
     and pronamespace = 'public'::regnamespace) is not true);

-- and the tables behind them stay unreachable by any route
select pg_temp.check('item_answers is not selectable',
  not has_table_privilege('authenticated', 'public.item_answers', 'select'));
select pg_temp.check('items is not selectable',
  not has_table_privilege('authenticated', 'public.items', 'select'));

\echo '--- all checks passed ---'
