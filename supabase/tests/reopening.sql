-- Reopening a closed session.
--
-- A session counting in a running round was found closed, nobody remembered
-- closing it, and the only way back was SQL -- which, written the obvious way,
-- put the session back to live with every question still locked, so every
-- answer was refused. What has to hold: reopening undoes everything a close
-- did, keeps everything a close kept (answers, where people were), and cannot
-- be undone by the clock a minute later.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('0e000000-0000-0000-0000-000000000001', 'reopen.host@example.com'),
  ('0e000000-0000-0000-0000-000000000002', 'reopen.player@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('0e000000-0000-0000-0000-000000000001', 'games.edit')
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

-- An open session, started, with one answer given.
set session "test.uid" = '0e000000-0000-0000-0000-000000000001';
insert into t select 'sess', public.create_session('About Us Trivia', 'strict', 'open');
insert into t select 'q1', public.save_item(pg_temp.id('sess'), null, 'choice', 'One',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
insert into t select 'q2', public.save_item(pg_temp.id('sess'), null, 'choice', 'Two',
  '{"options":["a","b"]}'::jsonb, '{"correct":["b"]}'::jsonb);
select public.advance_session(pg_temp.id('sess'), 'start');

set session "test.uid" = '0e000000-0000-0000-0000-000000000002';
select public.current_item(pg_temp.id('sess'));
insert into t select 'a1', public.answer_item(pg_temp.id('q1'), '"a"'::jsonb);
select pg_temp.check('a player answers the first question',
  (select v->>'ok' from t where k = 'a1') = 'true');

set session "test.uid" = '0e000000-0000-0000-0000-000000000001';
select public.advance_session(pg_temp.id('sess'), 'close');
select pg_temp.check('closing locks every question',
  (select count(*) from public.items where session_id = pg_temp.id('sess') and state = 'locked') = 2);

-- ---------------------------------------------------------------------------
-- Reopening
-- ---------------------------------------------------------------------------
set session "test.uid" = '0e000000-0000-0000-0000-000000000002';
select pg_temp.check('a player cannot reopen it',
  (public.advance_session(pg_temp.id('sess'), 'reopen')->>'reason') = 'not allowed');

set session "test.uid" = '0e000000-0000-0000-0000-000000000001';
insert into t select 'r', public.advance_session(pg_temp.id('sess'), 'reopen');
select pg_temp.check('the host can reopen it',
  (select v->>'state' from t where k = 'r') = 'live'
  and (select state from public.sessions where id = pg_temp.id('sess')) = 'live');
-- The half the obvious SQL missed.
select pg_temp.check('and its questions are open again, not left locked',
  (select count(*) from public.items where session_id = pg_temp.id('sess') and state = 'open') = 2);
select pg_temp.check('and what people had already answered is kept',
  exists (select 1 from public.responses
          where item_id = pg_temp.id('q1') and user_id = '0e000000-0000-0000-0000-000000000002'));

set session "test.uid" = '0e000000-0000-0000-0000-000000000002';
insert into t select 'next', public.current_item(pg_temp.id('sess'));
insert into t select 'a2', public.answer_item(pg_temp.id('q2'), '"b"'::jsonb);
select pg_temp.check('so the player carries on from where they were, and can answer',
  (select (v->>'id')::uuid from t where k = 'next') = pg_temp.id('q2')
  and (select v->>'ok' from t where k = 'a2') = 'true');

set session "test.uid" = '0e000000-0000-0000-0000-000000000001';
select pg_temp.check('reopening something open is refused',
  (public.advance_session(pg_temp.id('sess'), 'reopen')->>'reason') = 'it is not closed');

-- ---------------------------------------------------------------------------
-- The clock does not shut it again
-- ---------------------------------------------------------------------------
-- Closed by its schedule; reopened by hand. Left alone, the closing time that
-- has already passed would close it again at the next sweep.
update public.sessions set closes_at = now() - interval '1 hour' where id = pg_temp.id('sess');
select public.apply_schedules();
select pg_temp.check('a closing time that has passed closes it',
  (select state from public.sessions where id = pg_temp.id('sess')) = 'closed');
insert into t select 'r2', public.advance_session(pg_temp.id('sess'), 'reopen');
select pg_temp.check('reopening clears the closing time that had passed, and says so',
  (select closes_at from public.sessions where id = pg_temp.id('sess')) is null
  and (select v->>'schedule_cleared' from t where k = 'r2') = 'true');
select public.apply_schedules();
select pg_temp.check('so the next sweep leaves it open',
  (select state from public.sessions where id = pg_temp.id('sess')) = 'live');

-- ---------------------------------------------------------------------------
-- Its code
-- ---------------------------------------------------------------------------
-- A closed session's code can be given to a new one. Reopening the old one
-- must not leave two live sessions answering to the same code.
select public.advance_session(pg_temp.id('sess'), 'close');
insert into t select 'new', public.create_session('Newer session');
update public.sessions set code = (select code from public.sessions where id = pg_temp.id('sess'))
 where id = pg_temp.id('new');
select public.advance_session(pg_temp.id('new'), 'start');
insert into t select 'r3', public.advance_session(pg_temp.id('sess'), 'reopen');
select pg_temp.check('a code taken in the meantime is replaced, not shared',
  (select v->>'code' from t where k = 'r3') <> (select code from public.sessions where id = pg_temp.id('new'))
  and (select code from public.sessions where id = pg_temp.id('sess')) = (select v->>'code' from t where k = 'r3'));

-- ---------------------------------------------------------------------------
-- A presented session
-- ---------------------------------------------------------------------------
-- Only the question the close caught opens again; one the presenter had
-- already locked stays locked.
insert into t select 'live', public.create_session('Presented');
insert into t select 'p1', public.save_item(pg_temp.id('live'), null, 'choice', 'P1',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
insert into t select 'p2', public.save_item(pg_temp.id('live'), null, 'choice', 'P2',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
select public.advance_session(pg_temp.id('live'), 'start');
select public.advance_session(pg_temp.id('live'), 'show');
select public.advance_session(pg_temp.id('live'), 'lock');
-- the presenter's own lock, a moment before the close
update public.items set locked_at = now() - interval '1 minute' where id = pg_temp.id('p1');
select public.advance_session(pg_temp.id('live'), 'show');
select public.advance_session(pg_temp.id('live'), 'close');
select public.advance_session(pg_temp.id('live'), 'reopen');
select pg_temp.check('in a presented session only the question the close caught opens again',
  (select state from public.items where id = pg_temp.id('p1')) = 'locked'
  and (select state from public.items where id = pg_temp.id('p2')) = 'open');

-- A window that passed with nobody visiting: the clock takes the session from
-- draft straight to closed, so its questions were never released. Giving it a
-- later end and reopening it has to release them, or it goes live with nothing
-- to ask and tells everybody "that is all of them".
insert into t select 'missed', public.create_session('Never visited', 'strict', 'open');
insert into t select 'm1', public.save_item(pg_temp.id('missed'), null, 'choice', 'One',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
select public.set_session_schedule(pg_temp.id('missed'), now() - interval '2 days', now() - interval '1 day');
select pg_temp.check('a window that passed unvisited closes it without releasing anything',
  (select state from public.sessions where id = pg_temp.id('missed')) = 'closed'
  and (select state from public.items where id = pg_temp.id('m1')) = 'pending'
  and (select started_at is null from public.sessions where id = pg_temp.id('missed')));
select public.set_session_schedule(pg_temp.id('missed'), null, now() + interval '7 days');
select public.advance_session(pg_temp.id('missed'), 'reopen');
select pg_temp.check('extending it and reopening it releases its questions',
  (select state from public.items where id = pg_temp.id('m1')) = 'open'
  and (select state from public.sessions where id = pg_temp.id('missed')) = 'live'
  and (select started_at is not null from public.sessions where id = pg_temp.id('missed')));
set session "test.uid" = '0e000000-0000-0000-0000-000000000002';
insert into t select 'mnext', public.current_item(pg_temp.id('missed'));
select pg_temp.check('so a player is asked it',
  (select v->>'state' from t where k = 'mnext') = 'open');
set session "test.uid" = '0e000000-0000-0000-0000-000000000001';

delete from public.sessions where id in (pg_temp.id('sess'), pg_temp.id('new'), pg_temp.id('live'), pg_temp.id('missed'));

\echo '--- reopening checks passed ---'
