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

-- ---------------------------------------------------------------------------
-- A test giveaway that really was drawn: committed drawings go with it
-- ---------------------------------------------------------------------------
select pg_temp.as_('07000000-0000-0000-0000-000000000001');
insert into t select 'd', public.save_giveaway(null, 'Drawn Test', '', '', 1, null, true, null, 1, 365);
select public.add_giveaway_entrant((select (v->>'id')::uuid from t where k = 'd'), null, null, 'Drawn Person');
insert into t select 'ddraw', public.commit_giveaway_draw((select (v->>'id')::uuid from t where k = 'd'));
select pg_temp.check('the test giveaway has a committed drawing',
  exists (select 1 from public.giveaway_draws where giveaway_id = (select (v->>'id')::uuid from t where k = 'd')));
insert into t select 'ddeleted', public.delete_giveaway((select (v->>'id')::uuid from t where k = 'd'), 'Drawn Test');
select pg_temp.check('a drawn test giveaway can be deleted, drawings and all',
  (select v->>'ok' from t where k = 'ddeleted') = 'true'
  and not exists (select 1 from public.giveaways where id = (select (v->>'id')::uuid from t where k = 'd'))
  and not exists (select 1 from public.giveaway_draws where giveaway_id = (select (v->>'id')::uuid from t where k = 'd')));
delete from public.giveaway_people where name = 'Drawn Person';

-- ---------------------------------------------------------------------------
-- Resetting somebody's trivia, so they can take it again
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('07000000-0000-0000-0000-000000000003', 'cy.reset@example.com'),
  ('07000000-0000-0000-0000-000000000004', 'di.reset@example.com')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('07000000-0000-0000-0000-000000000003', 'Cy Reset'),
  ('07000000-0000-0000-0000-000000000004', 'Di Reset')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.sessions (id, title, host, state, mode)
values ('07000000-0000-0000-0000-0000000000a2', 'Reset Trivia', '07000000-0000-0000-0000-000000000001', 'closed', 'live')
on conflict (id) do nothing;
insert into public.items (id, session_id, position, kind, prompt, state, opened_at) values
  ('07000000-0000-0000-0000-0000000000b1', '07000000-0000-0000-0000-0000000000a2', 1, 'choice', 'Who owns this company?', 'revealed', now() - interval '5 minutes')
on conflict (id) do nothing;
insert into public.item_answers (item_id, answer)
values ('07000000-0000-0000-0000-0000000000b1', '{"correct": ["us"]}'::jsonb)
on conflict (item_id) do update set answer = excluded.answer;
insert into public.responses (item_id, user_id, value, submitted_at) values
  ('07000000-0000-0000-0000-0000000000b1', '07000000-0000-0000-0000-000000000003', '"us"'::jsonb, now() - interval '4 minutes 50 seconds'),
  ('07000000-0000-0000-0000-0000000000b1', '07000000-0000-0000-0000-000000000004', '"us"'::jsonb, now() - interval '4 minutes 40 seconds')
on conflict do nothing;
insert into public.item_served (item_id, user_id)
values ('07000000-0000-0000-0000-0000000000b1', '07000000-0000-0000-0000-000000000003') on conflict do nothing;
insert into public.session_pauses (session_id, user_id)
values ('07000000-0000-0000-0000-0000000000a2', '07000000-0000-0000-0000-000000000003') on conflict do nothing;

select pg_temp.as_('07000000-0000-0000-0000-000000000001');
insert into t select 'r', public.save_giveaway(null, 'Reset Test', '', '', 1, null, true, null, 1, 365);
select public.set_giveaway_trivia((select (v->>'id')::uuid from t where k = 'r'),
  array['07000000-0000-0000-0000-0000000000a2']::uuid[], 1);
select pg_temp.as_('07000000-0000-0000-0000-000000000003');
select public.enter_giveaway((select (v->>'id')::uuid from t where k = 'r'), true);
select pg_temp.as_('07000000-0000-0000-0000-000000000004');
select public.enter_giveaway((select (v->>'id')::uuid from t where k = 'r'), true);
create or replace function pg_temp.cy() returns uuid
language sql as $$ select id from public.giveaway_people where user_id = '07000000-0000-0000-0000-000000000003' $$;
create or replace function pg_temp.rid() returns uuid
language sql as $$ select (v->>'id')::uuid from t where k = 'r' $$;
select pg_temp.check('the test person has a trivia point to reset',
  public.giveaway_trivia_points(pg_temp.rid(), pg_temp.cy()) = 1);
select pg_temp.check('a player cannot reset somebody''s trivia',
  public.reset_giveaway_trivia(pg_temp.rid(), pg_temp.cy())->>'reason' = 'not allowed');
select pg_temp.as_('07000000-0000-0000-0000-000000000001');
insert into t select 'reset', public.reset_giveaway_trivia(pg_temp.rid(), pg_temp.cy());
select pg_temp.check('an organiser resets it: their answer, what they were shown and their pause go',
  (select v->>'answers' from t where k = 'reset') = '1'
  and not exists (select 1 from public.responses where user_id = '07000000-0000-0000-0000-000000000003')
  and not exists (select 1 from public.item_served where user_id = '07000000-0000-0000-0000-000000000003')
  and not exists (select 1 from public.session_pauses where user_id = '07000000-0000-0000-0000-000000000003'));
select pg_temp.check('so their extra chances go with it, and they stay entered',
  public.giveaway_trivia_points(pg_temp.rid(), pg_temp.cy()) = 0
  and exists (select 1 from public.giveaway_entries where giveaway_id = pg_temp.rid() and person_id = pg_temp.cy()));
select pg_temp.check('nobody else''s answers are touched',
  exists (select 1 from public.responses where user_id = '07000000-0000-0000-0000-000000000004'));
select pg_temp.check('organisers can see that it was reset, and the public record says nothing',
  exists (select 1 from jsonb_array_elements(public.giveaway_detail(pg_temp.rid())->'private_log') x
          where x->>'action' = 'trivia reset' and x->'detail'->>'name' = 'Cy Reset')
  and not exists (select 1 from jsonb_array_elements(public.giveaway_detail(pg_temp.rid())->'log') x
                  where x->>'action' = 'trivia reset'));
insert into t select 'rdraw', public.commit_giveaway_draw(pg_temp.rid());
select pg_temp.check('once it is drawn, trivia is part of the odds and cannot be reset',
  public.reset_giveaway_trivia(pg_temp.rid(), pg_temp.cy())->>'reason'
    = 'only while it is taking entries: after that their trivia is part of the odds that were drawn');
select public.delete_giveaway(pg_temp.rid(), 'Reset Test');
select pg_temp.as_('');
delete from public.giveaway_people where user_id in ('07000000-0000-0000-0000-000000000003', '07000000-0000-0000-0000-000000000004');
delete from public.sessions where id = '07000000-0000-0000-0000-0000000000a2';

-- Leave nothing behind but the log.
select pg_temp.as_('');
delete from public.sessions where id = '07000000-0000-0000-0000-0000000000a1';

\echo '--- giveaway delete checks passed ---'
