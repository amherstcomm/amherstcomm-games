-- Deleting a test giveaway and a test person; and the way back from trivia.
--
-- What has to hold: only an organiser deletes, and only by typing the
-- giveaway's name; it takes its entries, winners and the attendance it
-- recorded with it, and leaves one line in the general record; a person who
-- won a giveaway that still exists cannot be deleted, and once it is gone
-- they can; and a giveaway's trivia session knows its way back.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('07000000-0000-0000-0000-000000000001', 'delete.organiser@example.com'),
  ('07000000-0000-0000-0000-000000000002', 'ada.delete@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('07000000-0000-0000-0000-000000000001', 'games.admin')
on conflict do nothing;
insert into public.profiles (id, display_name) values ('07000000-0000-0000-0000-000000000002', 'Ada Delete')
on conflict (id) do update set display_name = excluded.display_name;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;
create or replace function pg_temp.as_(who text) returns void
language sql as $$ select set_config('test.uid', who, false) $$;

create temp table t (k text primary key, v jsonb);
create or replace function pg_temp.gid() returns uuid
language sql as $$ select (v->>'id')::uuid from t where k = 'g' $$;
create or replace function pg_temp.ada() returns uuid
language sql as $$ select id from public.giveaway_people where user_id = '07000000-0000-0000-0000-000000000002' $$;

select pg_temp.as_('07000000-0000-0000-0000-000000000001');
insert into t select 'g', public.save_giveaway(null, 'Test Test Test', '1 ticket', '', 1, current_date + 2, true, null, 1, 365);
select pg_temp.as_('07000000-0000-0000-0000-000000000002');
select public.enter_giveaway(pg_temp.gid(), true);

-- A test win, marked going: the attendance a real drawing would weigh.
select pg_temp.as_('07000000-0000-0000-0000-000000000001');
update public.giveaways set status = 'drawn' where id = pg_temp.gid();
insert into public.giveaway_winners (giveaway_id, person_id, draw_id, pick) values (pg_temp.gid(), pg_temp.ada(), null, 1);
select public.decide_giveaway_winner(pg_temp.gid(), pg_temp.ada(), 'accepted');

-- The way back from its trivia.
insert into public.sessions (id, title, host, state, mode)
values ('07000000-0000-0000-0000-0000000000a1', 'Delete Trivia', '07000000-0000-0000-0000-000000000001', 'live', 'open')
on conflict (id) do nothing;
insert into public.giveaway_sessions (giveaway_id, session_id) values (pg_temp.gid(), '07000000-0000-0000-0000-0000000000a1');
select pg_temp.as_('07000000-0000-0000-0000-000000000002');
select pg_temp.check('a giveaway''s trivia knows its way back to the giveaway',
  public.session_giveaway('07000000-0000-0000-0000-0000000000a1') = jsonb_build_object('id', pg_temp.gid(), 'title', 'Test Test Test'));

-- ---------------------------------------------------------------------------
select pg_temp.check('a player cannot delete a giveaway',
  public.delete_giveaway(pg_temp.gid(), 'Test Test Test')->>'reason' = 'not allowed');
select pg_temp.as_('07000000-0000-0000-0000-000000000001');
select pg_temp.check('a person who won a giveaway that still exists cannot be deleted',
  public.delete_giveaway_person(pg_temp.ada())->>'reason' = 'Ada Delete won Test Test Test: delete that giveaway first if it was a test');
select pg_temp.check('a giveaway is deleted only by typing its name',
  public.delete_giveaway(pg_temp.gid(), 'Test')->>'reason' = 'type its name exactly to delete it');
insert into t select 'deleted', public.delete_giveaway(pg_temp.gid(), '  test test TEST ');
select pg_temp.check('typed, it goes, with its winners and the attendance it recorded',
  (select v->>'ok' from t where k = 'deleted') = 'true'
  and not exists (select 1 from public.giveaways where id = pg_temp.gid())
  and not exists (select 1 from public.giveaway_attendance where person_id = pg_temp.ada())
  and not exists (select 1 from public.giveaway_winners where person_id = pg_temp.ada()));
select pg_temp.check('and one line stays in the general record',
  exists (select 1 from public.giveaway_log l where l.action = 'giveaway deleted' and l.giveaway_id is null
          and l.detail->>'title' = 'Test Test Test' and l.detail->'winners' = '["Ada Delete"]'::jsonb));
select pg_temp.check('a session is no longer a giveaway''s once the giveaway is gone',
  public.session_giveaway('07000000-0000-0000-0000-0000000000a1') is null);

select pg_temp.check('now the test person can be deleted too',
  public.delete_giveaway_person(pg_temp.ada())->>'ok' = 'true');
select pg_temp.check('and is gone from the history',
  not exists (select 1 from public.giveaway_people where user_id = '07000000-0000-0000-0000-000000000002')
  and exists (select 1 from public.giveaway_log l where l.action = 'person deleted' and l.detail->>'name' = 'Ada Delete'));

-- ---------------------------------------------------------------------------
-- A test entry, removed quietly
-- ---------------------------------------------------------------------------
insert into t select 'q', public.save_giveaway(null, 'Quiet Test', '', '', 1, null, true, null, 1, 365);
select public.add_giveaway_entrant((select (v->>'id')::uuid from t where k = 'q'), null, null, 'Test Person');
select public.add_giveaway_entrant((select (v->>'id')::uuid from t where k = 'q'), null, null, 'Real Person');
select pg_temp.as_('07000000-0000-0000-0000-000000000002');
select pg_temp.check('a player cannot remove a test entry',
  public.remove_test_entrant((select (v->>'id')::uuid from t where k = 'q'),
    (select id from public.giveaway_people where name = 'Test Person'))->>'reason' = 'not allowed');
select pg_temp.as_('07000000-0000-0000-0000-000000000001');
insert into t select 'quiet', public.remove_test_entrant((select (v->>'id')::uuid from t where k = 'q'),
  (select id from public.giveaway_people where name = 'Test Person'));
select pg_temp.check('a test entry goes, and its lines with it, from the public record',
  (select v->>'ok' from t where k = 'quiet') = 'true'
  and (select jsonb_agg(x->>'action' order by x->>'at') from jsonb_array_elements(
         public.giveaway_detail((select (v->>'id')::uuid from t where k = 'q'))->'log') x)
      = '["created", "entered"]'::jsonb
  and not exists (select 1 from jsonb_array_elements(
                    public.giveaway_detail((select (v->>'id')::uuid from t where k = 'q'))->'log') x
                  where x->'detail'->>'name' = 'Test Person'));
select pg_temp.check('and so does the typed name, used nowhere else',
  not exists (select 1 from public.giveaway_people where name = 'Test Person'));
select pg_temp.check('but organisers can see that it happened',
  (public.giveaway_detail((select (v->>'id')::uuid from t where k = 'q'))->'private_log'->0->>'action') = 'test entry removed'
  and (public.giveaway_detail((select (v->>'id')::uuid from t where k = 'q'))->'private_log'->0->'detail'->>'name') = 'Test Person');
select pg_temp.as_('07000000-0000-0000-0000-000000000002');
select pg_temp.check('and nobody else can',
  public.giveaway_detail((select (v->>'id')::uuid from t where k = 'q'))->'private_log' = 'null'::jsonb
  or public.giveaway_detail((select (v->>'id')::uuid from t where k = 'q'))->>'private_log' is null);
select pg_temp.as_('07000000-0000-0000-0000-000000000001');
-- Once anything is drawn, an entry has taken part in a decision and stays.
update public.giveaways set status = 'drawing' where id = (select (v->>'id')::uuid from t where k = 'q');
select pg_temp.check('after the drawing starts, an entry cannot be removed quietly',
  public.remove_test_entrant((select (v->>'id')::uuid from t where k = 'q'),
    (select id from public.giveaway_people where name = 'Real Person'))->>'reason'
    = 'only while it is taking entries: after that the entry has been part of what was decided');
select pg_temp.check('and the public record still cannot be deleted from directly',
  (select count(*) from public.giveaway_log where giveaway_id = (select (v->>'id')::uuid from t where k = 'q')) = 2);
do $$ begin
  delete from public.giveaway_log where giveaway_id = (select (v->>'id')::uuid from t where k = 'q');
  raise exception 'the log was deleted from';
exception when others then
  if sqlerrm = 'the log was deleted from' then raise; end if;
end $$;
select pg_temp.as_('');
delete from public.giveaways where id = (select (v->>'id')::uuid from t where k = 'q');
delete from public.giveaway_people where name = 'Real Person';

-- Leave nothing behind but the log.
select pg_temp.as_('');
delete from public.sessions where id = '07000000-0000-0000-0000-0000000000a1';

\echo '--- giveaway delete checks passed ---'
