-- Reporting a picture.
--
-- What has to hold: anybody signed in can report somebody's avatar; the
-- report is a player report carrying the picture as it was, so changing it
-- afterwards does not change the evidence; there is nothing to report for
-- somebody with no picture, or one already taken down; repeated reports of
-- one picture stop counting after the usual five; and nobody signed out can.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('53000000-0000-0000-0000-000000000001', 'pic.ann@example.com'),
  ('53000000-0000-0000-0000-000000000002', 'pic.bo@example.com')
on conflict do nothing;
insert into public.profiles (id, display_name, avatar_kind, avatar_value, avatar_color) values
  ('53000000-0000-0000-0000-000000000002', 'Bo Picture', 'preset', 'fox', '#2563eb')
on conflict (id) do update set display_name = excluded.display_name, avatar_kind = excluded.avatar_kind,
  avatar_value = excluded.avatar_value, avatar_color = excluded.avatar_color, avatar_blocked = false;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;
create or replace function pg_temp.as_(who text) returns void
language sql as $$ select set_config('test.uid', who, false) $$;

\set ANN '53000000-0000-0000-0000-000000000001'
\set BO '53000000-0000-0000-0000-000000000002'

delete from public.reports where subject like 'avatar:53000000-%';

select pg_temp.as_(:'ANN');
select pg_temp.check('somebody''s picture can be reported, and is filed with a ticket',
  public.report_avatar(:'BO', 'not appropriate for work')->>'recorded' = 'true');
select pg_temp.check('as a player report carrying the picture as it was',
  (select kind = 'player' and evidence->>'what' = 'avatar' and evidence->'avatar'->>'value' = 'fox'
          and (evidence->>'profile')::uuid = :'BO' and reason = 'not appropriate for work'
   from public.reports where subject = 'avatar:' || :'BO'));
update public.profiles set avatar_value = 'owl' where id = :'BO';
select pg_temp.check('changing the picture afterwards does not change the evidence',
  (select evidence->'avatar'->>'value' from public.reports where subject = 'avatar:' || :'BO') = 'fox');
select pg_temp.check('there is nothing to report for somebody with no picture',
  public.report_avatar(:'ANN')->>'reason' = 'there is no picture to report');
select public.report_avatar(:'BO') from generate_series(1, 6);
select pg_temp.check('reports of one picture stop counting after five',
  (select count(*) from public.reports where subject = 'avatar:' || :'BO') = 5);
update public.profiles set avatar_blocked = true, avatar_kind = null where id = :'BO';
select pg_temp.check('nor for one already taken down',
  public.report_avatar(:'BO')->>'ok' = 'false');
select pg_temp.as_('');
select pg_temp.check('nobody signed out can report one',
  public.report_avatar(:'BO')->>'ok' = 'false'
  and not has_function_privilege('anon', 'public.report_avatar(uuid, text)', 'execute'));

delete from public.reports where subject like 'avatar:53000000-%';
update public.profiles set avatar_kind = null, avatar_value = null, avatar_color = null, avatar_blocked = false
 where id::text like '53000000-%';

\echo '--- avatar report checks passed ---'
