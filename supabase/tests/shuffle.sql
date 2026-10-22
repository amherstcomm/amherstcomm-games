-- Shuffling a question's answer options.
--
-- What has to hold: off, the options come in the order they were written;
-- on, a session played on your own time gives each player their own order --
-- the same every time they come back -- and a live one gives the whole room
-- one order, the host's screen included; the options are always the same
-- set; and only its host can switch it.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('08000000-0000-0000-0000-000000000001', 'shuffle.host@example.com'),
  ('08000000-0000-0000-0000-000000000002', 'ada.shuffle@example.com'),
  ('08000000-0000-0000-0000-000000000003', 'bea.shuffle@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('08000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;
create or replace function pg_temp.as_(who text) returns void
language sql as $$ select set_config('test.uid', who, false) $$;
create or replace function pg_temp.options(p_session uuid) returns jsonb
language sql as $$ select public.current_item(p_session)->'payload'->'options' $$;

-- Six options, so two orders agreeing by chance is one in seven hundred.
insert into public.sessions (id, title, host, state, mode) values
  ('08000000-0000-0000-0000-0000000000a1', 'Shuffled On My Own Time', '08000000-0000-0000-0000-000000000001', 'live', 'open'),
  ('08000000-0000-0000-0000-0000000000a2', 'Shuffled Live', '08000000-0000-0000-0000-000000000001', 'live', 'live')
on conflict (id) do nothing;
insert into public.items (id, session_id, position, kind, prompt, payload, state, opened_at) values
  ('08000000-0000-0000-0000-0000000000b1', '08000000-0000-0000-0000-0000000000a1', 1, 'choice', 'Pick one',
   '{"options": ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"]}'::jsonb, 'open', now()),
  ('08000000-0000-0000-0000-0000000000b2', '08000000-0000-0000-0000-0000000000a2', 1, 'choice', 'Pick one',
   '{"options": ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"]}'::jsonb, 'open', now())
on conflict (id) do nothing;
update public.sessions set current_item = '08000000-0000-0000-0000-0000000000b2'
 where id = '08000000-0000-0000-0000-0000000000a2';

create temp table t (k text primary key, v jsonb);

-- ---------------------------------------------------------------------------
select pg_temp.as_('08000000-0000-0000-0000-000000000002');
select pg_temp.check('off, the options come in the order they were written',
  pg_temp.options('08000000-0000-0000-0000-0000000000a1') = '["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"]'::jsonb);
select pg_temp.check('and a player cannot switch it on',
  public.set_session_options('08000000-0000-0000-0000-0000000000a1', null, null, true)->>'reason' = 'not allowed');

select pg_temp.as_('08000000-0000-0000-0000-000000000001');
select pg_temp.check('its host can',
  public.set_session_options('08000000-0000-0000-0000-0000000000a1', null, null, true)->>'ok' = 'true'
  and public.set_session_options('08000000-0000-0000-0000-0000000000a2', null, null, true)->>'ok' = 'true');
select pg_temp.check('and the editor is told it is on',
  (public.session_sheet('08000000-0000-0000-0000-0000000000a1')->'session'->>'shuffle')::boolean
  or (public.session_sheet('08000000-0000-0000-0000-0000000000a1')->>'shuffle')::boolean);

-- On your own time: each player their own order.
select pg_temp.as_('08000000-0000-0000-0000-000000000002');
insert into t select 'ada', pg_temp.options('08000000-0000-0000-0000-0000000000a1');
insert into t select 'ada again', pg_temp.options('08000000-0000-0000-0000-0000000000a1');
select pg_temp.as_('08000000-0000-0000-0000-000000000003');
insert into t select 'bea', pg_temp.options('08000000-0000-0000-0000-0000000000a1');
select pg_temp.check('on your own time, each player gets their own order',
  (select v from t where k = 'ada') <> (select v from t where k = 'bea'));
select pg_temp.check('the same order every time they come back',
  (select v from t where k = 'ada') = (select v from t where k = 'ada again'));
select pg_temp.check('and always the same options, only moved',
  (select jsonb_agg(x order by x) from t, jsonb_array_elements(v) x where k = 'ada')
    = '["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"]'::jsonb
  and (select v from t where k = 'ada') <> '["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"]'::jsonb);

-- Live: one order for the room, and the host's screen shows it too.
select pg_temp.as_('08000000-0000-0000-0000-000000000002');
insert into t select 'live ada', pg_temp.options('08000000-0000-0000-0000-0000000000a2');
select pg_temp.as_('08000000-0000-0000-0000-000000000003');
insert into t select 'live bea', pg_temp.options('08000000-0000-0000-0000-0000000000a2');
select pg_temp.as_('08000000-0000-0000-0000-000000000001');
insert into t select 'live host', pg_temp.options('08000000-0000-0000-0000-0000000000a2');
select pg_temp.check('live, the whole room sees one order, the projector included',
  (select v from t where k = 'live ada') = (select v from t where k = 'live bea')
  and (select v from t where k = 'live ada') = (select v from t where k = 'live host')
  and (select v from t where k = 'live ada') <> '["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"]'::jsonb);

-- Leave nothing behind.
select pg_temp.as_('');
delete from public.sessions where id in ('08000000-0000-0000-0000-0000000000a1', '08000000-0000-0000-0000-0000000000a2');

\echo '--- shuffle checks passed ---'
