-- A tournament that is the whole site.
--
-- A tournament can lock the site to itself for its whole span: availability
-- then reports everything outside the tournament as unavailable, and -- unless
-- the tournament keeps them open -- every session not attached to its round.
-- What has to hold: the lock follows the tournament's dates and its switch,
-- the sessions switch only matters while locked, and only an admin sets either.
\set ON_ERROR_STOP on

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.off(feature text) returns boolean
language sql as $$ select public.read_availability() ? feature $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-000000000001', 'lock.editor@amherstcomm.net'),
  ('d0000000-0000-0000-0000-000000000002', 'lock.player@amherstcomm.net')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('d0000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

set session "test.uid" = 'd0000000-0000-0000-0000-000000000001';

select pg_temp.check('nothing is locked with no tournament',
  not pg_temp.off('site:outside-tournament') and not pg_temp.off('site:other-sessions'));

-- An unlocked tournament covering today changes nothing.
create temp table t as
  select (public.save_tournament(null, 'Lock Cup', 'hard', pg_temp.d(-3), pg_temp.d(20))->>'id')::uuid id;
select pg_temp.check('a tournament that does not lock leaves the site alone',
  not pg_temp.off('site:outside-tournament'));

-- Locked: everything outside it, and other sessions with it.
select public.save_tournament((select id from t), 'Lock Cup', 'hard', pg_temp.d(-3), pg_temp.d(20), true, false);
select pg_temp.check('a locking tournament makes everything outside it unavailable',
  pg_temp.off('site:outside-tournament'));
select pg_temp.check('and every session not in its round',
  pg_temp.off('site:other-sessions'));

select public.save_tournament((select id from t), 'Lock Cup', 'hard', pg_temp.d(-3), pg_temp.d(20), true, true);
select pg_temp.check('unless it keeps other sessions open',
  pg_temp.off('site:outside-tournament') and not pg_temp.off('site:other-sessions'));

-- The switch for sessions means nothing while the site is not locked.
select public.save_tournament((select id from t), 'Lock Cup', 'hard', pg_temp.d(-3), pg_temp.d(20), false, false);
select pg_temp.check('sessions are not locked by a tournament that does not lock',
  not pg_temp.off('site:other-sessions'));

-- Its whole span, not only its rounds: a locking tournament that has not
-- started locks nothing yet, and one that is over has let go.
select public.save_tournament((select id from t), 'Lock Cup', 'hard', pg_temp.d(5), pg_temp.d(20), true, false);
select pg_temp.check('a locking tournament that has not started locks nothing yet',
  not pg_temp.off('site:outside-tournament'));
select public.save_tournament((select id from t), 'Lock Cup', 'hard', pg_temp.d(-20), pg_temp.d(-1), true, false);
select pg_temp.check('and one that is over has let go',
  not pg_temp.off('site:outside-tournament'));
select public.save_tournament((select id from t), 'Lock Cup', 'hard', pg_temp.d(-3), pg_temp.d(40), true, false);
select pg_temp.check('with no round on today it still locks, from its first day to its last',
  pg_temp.off('site:outside-tournament'));

-- Between rounds, what the tournament page shows.
insert into public.tournament_rounds (tournament_id, starts_on, ends_on, games)
values ((select id from t), pg_temp.d(30), pg_temp.d(35), array['hive']);
select pg_temp.check('the tournament covering today says when its next round starts',
  (public.current_tournament()->>'name') = 'Lock Cup'
  and (public.current_tournament()->>'next_round_starts_on')::date = pg_temp.d(30));

select pg_temp.check('the admin sheet shows both switches',
  (select (x->>'locks_site')::boolean and not (x->>'sessions_open')::boolean
   from jsonb_array_elements(public.tournaments_sheet()->'tournaments') x
   where x->>'name' = 'Lock Cup'));

-- Who may.
set session "test.uid" = 'd0000000-0000-0000-0000-000000000002';
select pg_temp.check('a player cannot lock or unlock the site',
  (public.save_tournament((select id from t), 'Lock Cup', 'hard', pg_temp.d(-3), pg_temp.d(40), false, true)->>'reason')
    = 'not allowed');
select pg_temp.check('anyone may ask what tournament is on',
  has_function_privilege('anon', 'public.current_tournament()', 'execute'));

-- Leave the database as it was: a locking tournament covering today would
-- change what every later file reads from read_availability.
reset "test.uid";
delete from public.tournaments where id = (select id from t);
select pg_temp.check('and gone again once it is removed',
  not pg_temp.off('site:outside-tournament'));

\echo '--- lockdown checks passed ---'
