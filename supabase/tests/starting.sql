-- The Start button on a session played on your own time.
--
-- Opening the page used to be what started it: asking what you are looking at
-- is what serves the question, so its clock was running before anybody had read
-- the title. What has to hold: looking serves nothing, however many times, on
-- however many devices; Start serves the first question; and Start cannot be
-- used to get past anything else.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('4d000000-0000-0000-0000-000000000001', 'start.host@example.com'),
  ('4d000000-0000-0000-0000-000000000002', 'start.player@example.com'),
  ('4d000000-0000-0000-0000-000000000003', 'start.other@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('4d000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);
create or replace function pg_temp.id(key text) returns uuid
language sql as $$ select (v->>'id')::uuid from t where k = key $$;
create or replace function pg_temp.served(p_session uuid, p_user uuid) returns bigint
language sql as $$
  select count(*) from public.item_served s
  join public.items i on i.id = s.item_id
  where i.session_id = p_session and s.user_id = p_user
$$;

set session "test.uid" = '4d000000-0000-0000-0000-000000000001';
insert into t select 'sess', public.create_session('Start Line Trivia', 'strict', 'open');
insert into t select 'q1', public.save_item(pg_temp.id('sess'), null, 'choice', 'One',
  '{"options":["a","b"],"seconds":30}'::jsonb, '{"correct":["a"]}'::jsonb);
insert into t select 'q2', public.save_item(pg_temp.id('sess'), null, 'choice', 'Two',
  '{"options":["a","b"],"seconds":30}'::jsonb, '{"correct":["b"]}'::jsonb);
select public.advance_session(pg_temp.id('sess'), 'start');

-- ---------------------------------------------------------------------------
-- Looking
-- ---------------------------------------------------------------------------
set session "test.uid" = '4d000000-0000-0000-0000-000000000002';
insert into t select 'look', public.current_item(pg_temp.id('sess'));
select pg_temp.check('opening it shows the start, not a question',
  (select v->>'state' from t where k = 'look') = 'ready'
  and (select v->>'id' from t where k = 'look') is null
  and (select v->>'prompt' from t where k = 'look') is null);
select pg_temp.check('and says what they are starting',
  (select v->>'title' from t where k = 'look') = 'Start Line Trivia'
  and (select (v->>'total')::int from t where k = 'look') = 2
  and (select (v->>'timed')::int from t where k = 'look') = 2
  and (select (v->>'seconds_each')::int from t where k = 'look') = 30);
select public.current_item(pg_temp.id('sess'));
select pg_temp.check('however often they look, nothing is served',
  pg_temp.served(pg_temp.id('sess'), '4d000000-0000-0000-0000-000000000002') = 0);
select pg_temp.check('so nothing can be answered yet',
  public.answer_item(pg_temp.id('q1'), '"a"'::jsonb)->>'ok' is distinct from 'true');

-- ---------------------------------------------------------------------------
-- Who may start
-- ---------------------------------------------------------------------------
set session "test.uid" = '';
select pg_temp.check('nobody signed in can start',
  public.begin_playing(pg_temp.id('sess'))->>'ok' = 'false');
set session "test.uid" = '4d000000-0000-0000-0000-000000000001';
select pg_temp.check('its host cannot, and is dealt nothing',
  public.begin_playing(pg_temp.id('sess'))->>'ok' = 'false'
  and pg_temp.served(pg_temp.id('sess'), '4d000000-0000-0000-0000-000000000001') = 0);

insert into t select 'room', public.create_session('Presented');
insert into t select 'rq', public.save_item(pg_temp.id('room'), null, 'choice', 'P',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
select public.advance_session(pg_temp.id('room'), 'start');
insert into t select 'draft', public.create_session('Not going yet', 'strict', 'open');
insert into t select 'dq', public.save_item(pg_temp.id('draft'), null, 'choice', 'D',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);

set session "test.uid" = '4d000000-0000-0000-0000-000000000002';
select pg_temp.check('a presented session has no start of its own',
  public.begin_playing(pg_temp.id('room'))->>'ok' = 'false');
select pg_temp.check('and one that is not running cannot be started',
  public.begin_playing(pg_temp.id('draft'))->>'ok' = 'false'
  and pg_temp.served(pg_temp.id('draft'), '4d000000-0000-0000-0000-000000000002') = 0);

-- ---------------------------------------------------------------------------
-- Starting
-- ---------------------------------------------------------------------------
select pg_temp.check('pressing Start works',
  public.begin_playing(pg_temp.id('sess'))->>'ok' = 'true');
insert into t select 'first', public.current_item(pg_temp.id('sess'));
select pg_temp.check('and the first question is in front of them, its clock running',
  (select (v->>'id')::uuid from t where k = 'first') = pg_temp.id('q1')
  and (select v->>'state' from t where k = 'first') = 'open'
  and (select v->>'opened_at' from t where k = 'first') is not null);
select pg_temp.check('nobody else has been started by it',
  (set_config('test.uid', '4d000000-0000-0000-0000-000000000003', false) is not null)
  and public.current_item(pg_temp.id('sess'))->>'state' = 'ready');
set session "test.uid" = '4d000000-0000-0000-0000-000000000002';

-- A second press, from a double tap or another device, has nothing to do.
select public.begin_playing(pg_temp.id('sess'));
select pg_temp.check('pressing it again serves nothing more',
  pg_temp.served(pg_temp.id('sess'), '4d000000-0000-0000-0000-000000000002') = 1);
select pg_temp.check('and a reload carries on, with no second start',
  (public.current_item(pg_temp.id('sess'))->>'id')::uuid = pg_temp.id('q1'));

-- The one thing Start must not become: a way past a pause.
select public.pause_session(pg_temp.id('sess'), true);
select public.answer_item(pg_temp.id('q1'), '"a"'::jsonb);
select public.begin_playing(pg_temp.id('sess'));
select pg_temp.check('it does not get anybody past a pause',
  public.current_item(pg_temp.id('sess'))->>'state' = 'paused'
  and pg_temp.served(pg_temp.id('sess'), '4d000000-0000-0000-0000-000000000002') = 1);
select public.pause_session(pg_temp.id('sess'), false);

-- ---------------------------------------------------------------------------
-- What it says
-- ---------------------------------------------------------------------------
set session "test.uid" = '4d000000-0000-0000-0000-000000000001';
insert into t select 'mixed', public.create_session('Some timed', 'strict', 'open');
insert into t select 'm1', public.save_item(pg_temp.id('mixed'), null, 'choice', 'M1',
  '{"options":["a","b"],"seconds":20}'::jsonb, '{"correct":["a"]}'::jsonb);
insert into t select 'm2', public.save_item(pg_temp.id('mixed'), null, 'choice', 'M2',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
select public.advance_session(pg_temp.id('mixed'), 'start');
insert into t select 'none', public.create_session('Nothing in it', 'strict', 'open');
select public.advance_session(pg_temp.id('none'), 'start');

set session "test.uid" = '4d000000-0000-0000-0000-000000000003';
insert into t select 'mlook', public.current_item(pg_temp.id('mixed'));
select pg_temp.check('a mixed session says how many are timed, and no one number',
  (select (v->>'timed')::int from t where k = 'mlook') = 1
  and (select v->>'seconds_each' from t where k = 'mlook') is null);
select pg_temp.check('and one with nothing to play has nothing to start',
  public.current_item(pg_temp.id('none'))->>'state' = 'done');

set session "test.uid" = '4d000000-0000-0000-0000-000000000001';
delete from public.sessions
 where id in (pg_temp.id('sess'), pg_temp.id('room'), pg_temp.id('draft'),
              pg_temp.id('mixed'), pg_temp.id('none'));

\echo '--- starting checks passed ---'
