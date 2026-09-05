-- Letting the clock open and shut an open session.
--
-- A survey that runs all week wants to be answerable on Monday without somebody
-- remembering to press a button at eight, and shut on Friday without somebody
-- remembering at all. The checks worth arguing with are about who wins when the
-- host and the clock disagree, and about the closing time actually stopping an
-- answer rather than only greying out a screen.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sched-host@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'sched-ada@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);

/** A fresh open session with one question, as a draft. */
create or replace function pg_temp.make(label text) returns uuid
language plpgsql as $$
declare id uuid;
begin
  id := (public.create_session(label, 'strict', 'open', true)->>'id')::uuid;
  perform public.save_item(id, null, 'choice', 'Which year?',
    '{"options":["2019","2021"]}'::jsonb, '{"correct":["2021"]}'::jsonb);
  return id;
end $$;

set session "test.uid" = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Opening on its own
-- ---------------------------------------------------------------------------
insert into t select 'later', to_jsonb(pg_temp.make('Opens later'));
select public.set_session_schedule(
  ((select v#>>'{}' from t where k='later'))::uuid, now() + interval '1 hour', null);

select pg_temp.check('a session whose time has not come is still a draft',
  (select public.scheduled_state(s) from public.sessions s
   where s.id = ((select v#>>'{}' from t where k='later'))::uuid) = 'draft');
select pg_temp.check('and is not listed as running',
  not exists (select 1 from jsonb_array_elements(public.live_sessions()) e
              where e->>'id' = (select v#>>'{}' from t where k='later')));
-- The code on the slide is the thing people type, so it has to refuse too.
select pg_temp.check('nor reachable by its code',
  (public.session_by_code((select s.code from public.sessions s
    where s.id = ((select v#>>'{}' from t where k='later'))::uuid))->>'ok') = 'false');

insert into t select 'now', to_jsonb(pg_temp.make('Opens already'));
select public.set_session_schedule(
  ((select v#>>'{}' from t where k='now'))::uuid, now() - interval '1 minute', null);

select pg_temp.check('one whose time has come is open',
  (select state from public.sessions
   where id = ((select v#>>'{}' from t where k='now'))::uuid) = 'live');
-- Opening an open session is not only a fact about the session: it is what
-- makes the questions answerable, which is a write and the whole reason the
-- clock does the work rather than the readers deriving it.
select pg_temp.check('and its questions are answerable, not left pending',
  (select bool_and(state = 'open') from public.items
   where session_id = ((select v#>>'{}' from t where k='now'))::uuid));
select pg_temp.check('and it is listed as running',
  exists (select 1 from jsonb_array_elements(public.live_sessions()) e
          where e->>'id' = (select v#>>'{}' from t where k='now')));

-- ---------------------------------------------------------------------------
-- Nobody has to have been by
-- ---------------------------------------------------------------------------
insert into t select 'sweep', to_jsonb(pg_temp.make('Opens with nobody watching'));
update public.sessions set opens_at = now() - interval '1 minute'
where id = ((select v#>>'{}' from t where k='sweep'))::uuid;
-- Asked as a player rather than as the host, who is never served a question in
-- an open session — being the one who set it is the point of not being in it.
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a window that passed while the site was quiet opens at the first visit',
  (public.current_item(((select v#>>'{}' from t where k='sweep'))::uuid)->>'state') = 'open');
set session "test.uid" = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Closing on its own, and actually stopping an answer
-- ---------------------------------------------------------------------------
insert into t select 'shut', to_jsonb(pg_temp.make('Shuts at five'));
select public.advance_session(((select v#>>'{}' from t where k='shut'))::uuid, 'start');
insert into t select 'shut-item', to_jsonb((select id from public.items
  where session_id = ((select v#>>'{}' from t where k='shut'))::uuid));

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
-- Served first, because in an open session being served is what starts the
-- clock on the question — see current_item.
select public.current_item(((select v#>>'{}' from t where k='shut'))::uuid);
select pg_temp.check('while it is open, it can be answered',
  (public.answer_item(((select v#>>'{}' from t where k='shut-item'))::uuid, '"2021"')->>'ok')
    = 'true');

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
update public.sessions set closes_at = now() - interval '1 second'
where id = ((select v#>>'{}' from t where k='shut'))::uuid;

-- The half that matters. A screen that has been open since before five would
-- otherwise post an answer at ten past and be taken, because the table still
-- said live and nothing had asked the clock.
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
delete from public.responses where item_id = ((select v#>>'{}' from t where k='shut-item'))::uuid;
select pg_temp.check('past its closing time, an answer is refused',
  (public.answer_item(((select v#>>'{}' from t where k='shut-item'))::uuid, '"2021"')->>'ok')
    = 'false');

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select pg_temp.check('and the session really is closed, not merely displayed as it',
  (select state from public.sessions
   where id = ((select v#>>'{}' from t where k='shut'))::uuid) = 'closed');
select pg_temp.check('with its questions locked',
  (select bool_and(state = 'locked') from public.items
   where session_id = ((select v#>>'{}' from t where k='shut'))::uuid));

-- ---------------------------------------------------------------------------
-- Who wins when the host and the clock disagree
-- ---------------------------------------------------------------------------
insert into t select 'early', to_jsonb(pg_temp.make('Closed early'));
select public.set_session_schedule(
  ((select v#>>'{}' from t where k='early'))::uuid,
  now() - interval '1 hour', now() + interval '1 hour');
select public.advance_session(((select v#>>'{}' from t where k='early'))::uuid, 'close');
-- "It shut and then came back" is the worst thing a survey can do to somebody
-- who has already answered it.
select pg_temp.check('a session the host closed is not reopened by its own window',
  (select public.scheduled_state(s) from public.sessions s
   where s.id = ((select v#>>'{}' from t where k='early'))::uuid) = 'closed');

insert into t select 'ahead', to_jsonb(pg_temp.make('Started ahead of time'));
select public.set_session_schedule(
  ((select v#>>'{}' from t where k='ahead'))::uuid,
  now() + interval '1 hour', now() + interval '2 hours');
select public.advance_session(((select v#>>'{}' from t where k='ahead'))::uuid, 'start');
select pg_temp.check('a host may open ahead of the window',
  (select public.scheduled_state(s) from public.sessions s
   where s.id = ((select v#>>'{}' from t where k='ahead'))::uuid) = 'live');
-- The closing half is what they were relying on, so it still applies.
update public.sessions set closes_at = now() - interval '1 second'
where id = ((select v#>>'{}' from t where k='ahead'))::uuid;
select pg_temp.check('and the closing time still shuts it',
  (select public.scheduled_state(s) from public.sessions s
   where s.id = ((select v#>>'{}' from t where k='ahead'))::uuid) = 'closed');

-- ---------------------------------------------------------------------------
-- Results open when the clock closes it
-- ---------------------------------------------------------------------------
insert into t select 'share', to_jsonb(pg_temp.make('Look afterwards'));
select public.set_session_options(((select v#>>'{}' from t where k='share'))::uuid, null, true);
select public.set_session_schedule(
  ((select v#>>'{}' from t where k='share'))::uuid, now() - interval '1 hour', null);
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('while it runs, the room still sees nothing',
  (public.session_results(((select v#>>'{}' from t where k='share'))::uuid)->>'ok') = 'false');
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
update public.sessions set closes_at = now() - interval '1 second'
where id = ((select v#>>'{}' from t where k='share'))::uuid;
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('and once the clock shuts it, they can look',
  (public.session_results(((select v#>>'{}' from t where k='share'))::uuid)->>'ok') = 'true');

-- ---------------------------------------------------------------------------
-- What may be scheduled, and by whom
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'live', public.create_session('Run by a person', 'strict', 'live', true);
select pg_temp.check('a session with a presenter is not scheduled',
  (public.set_session_schedule(((select v->>'id' from t where k='live'))::uuid,
     now(), now() + interval '1 hour')->>'reason')
    = 'a session with a presenter is not scheduled');

select pg_temp.check('and it cannot close before it opens',
  (public.set_session_schedule(((select v#>>'{}' from t where k='later'))::uuid,
     now() + interval '2 hours', now() + interval '1 hour')->>'reason')
    = 'it cannot close before it opens');

-- "Leave it alone" and "take it off" are different instructions, which is why
-- the arguments are not coalesced onto what is already there.
select public.set_session_schedule(((select v#>>'{}' from t where k='later'))::uuid,
  null, now() + interval '3 hours');
select pg_temp.check('setting one end leaves the other alone',
  (select opens_at is not null and closes_at is not null from public.sessions
   where id = ((select v#>>'{}' from t where k='later'))::uuid));
select public.set_session_schedule(((select v#>>'{}' from t where k='later'))::uuid,
  null, null, true);
select pg_temp.check('and a schedule can be taken off again',
  (select opens_at is null and closes_at is null from public.sessions
   where id = ((select v#>>'{}' from t where k='later'))::uuid));

-- A copy carrying last week's window would open and shut itself in the past.
insert into t select 'copy', public.duplicate_session(
  ((select v#>>'{}' from t where k='now'))::uuid);
select pg_temp.check('a duplicate does not inherit the window',
  (select opens_at is null and closes_at is null from public.sessions
   where id = ((select v->>'id' from t where k='copy'))::uuid));

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a player cannot set one',
  (public.set_session_schedule(((select v#>>'{}' from t where k='now'))::uuid,
     now(), null)->>'ok') = 'false');
select pg_temp.check('anon may not call it',
  not has_function_privilege('anon',
    'public.set_session_schedule(uuid, timestamptz, timestamptz, boolean)', 'execute'));
-- The clock is nobody's to run by hand.
select pg_temp.check('nor may anybody call the sweep itself',
  not has_function_privilege('authenticated', 'public.apply_schedule(uuid)', 'execute')
  and not has_function_privilege('authenticated',
        'public.open_session(uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
        'public.close_session(uuid, timestamptz)', 'execute'));

-- ---------------------------------------------------------------------------
-- When it says it happened
--
-- A schedule is honoured at the next visit, which is not the same instant as
-- the one it named. The record has to say the named one: a survey due at eight
-- that nobody reaches until ten past was taking answers from eight, and an
-- answer at one minute past five was already refused.
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'stamp', to_jsonb(pg_temp.make('Stamped at the hour'));
update public.sessions
   set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour'
 where id = ((select v#>>'{}' from t where k='stamp'))::uuid;
select public.apply_schedule(((select v#>>'{}' from t where k='stamp'))::uuid);
select pg_temp.check('it closed when it said it would, not when somebody noticed',
  (select closed_at = closes_at from public.sessions
   where id = ((select v#>>'{}' from t where k='stamp'))::uuid));
select pg_temp.check('and a host closing it by hand is still stamped now',
  (select abs(extract(epoch from (closed_at - now()))) < 5 from public.sessions s
   where s.id = ((select v#>>'{}' from t where k='early'))::uuid));

\echo '--- scheduling checks passed ---'
