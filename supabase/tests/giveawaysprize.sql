-- A giveaway for a prize to keep rather than an event.
--
-- What has to hold: a giveaway is for an event or a prize, and nothing else;
-- a prize has no event day, even if one is sent; its winner accepting is a
-- win in the history and not an attendance, so it lowers nobody's chance next
-- time; and an event's winner going still is.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('0a000000-0000-0000-0000-000000000001', 'prize.organiser@example.com'),
  ('0a000000-0000-0000-0000-000000000002', 'ada.prize@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('0a000000-0000-0000-0000-000000000001', 'games.admin')
on conflict do nothing;
insert into public.profiles (id, display_name) values ('0a000000-0000-0000-0000-000000000002', 'Ada Prize')
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
create or replace function pg_temp.id(k text) returns uuid
language sql as $$ select (v->>'id')::uuid from t where t.k = id.k $$;
create or replace function pg_temp.ada() returns uuid
language sql as $$ select id from public.giveaway_people where user_id = '0a000000-0000-0000-0000-000000000002' $$;
create or replace function pg_temp.mine() returns jsonb
language sql as $$
  select x from jsonb_array_elements(public.giveaway_history()->'people') x where x->>'name' = 'Ada Prize'
$$;

select pg_temp.as_('0a000000-0000-0000-0000-000000000001');
select pg_temp.check('a giveaway is for an event or a prize to keep, nothing else',
  public.save_giveaway(null, 'Odd', '', '', 1, null, true, null, 1, 365, 'draw', 3, null, 3, 'raffle')->>'reason'
    = 'a giveaway is for an event or a prize to keep');
insert into t select 'prize', public.save_giveaway(null, 'Gift card', '$50 gift card', '', 1, current_date + 3,
  true, null, 1, 365, 'draw', 3, null, 3, 'prize');
insert into t select 'event', public.save_giveaway(null, 'Brewers vs Cubs', '2 tickets', '', 1, current_date + 3,
  true, null, 1, 365);
select pg_temp.check('a prize has no event day, even when one is sent',
  (select kind = 'prize' and event_on is null from public.giveaways where id = pg_temp.id('prize'))
  and public.giveaway_detail(pg_temp.id('prize'))->'giveaway'->>'kind' = 'prize');
select pg_temp.check('a giveaway left unsaid is for an event, as every one before was',
  (select kind = 'event' and event_on = current_date + 3 from public.giveaways where id = pg_temp.id('event'))
  and exists (select 1 from jsonb_array_elements(public.giveaways_list()->'giveaways') x
              where x->>'title' = 'Gift card' and x->>'kind' = 'prize'));

select pg_temp.as_('0a000000-0000-0000-0000-000000000002');
select public.enter_giveaway(pg_temp.id('prize'), true);
select public.enter_giveaway(pg_temp.id('event'), true);
select pg_temp.as_('0a000000-0000-0000-0000-000000000001');
update public.giveaways set status = 'drawn' where id in (pg_temp.id('prize'), pg_temp.id('event'));
insert into public.giveaway_winners (giveaway_id, person_id, draw_id, pick)
values (pg_temp.id('prize'), pg_temp.ada(), null, 1);
select public.decide_giveaway_winner(pg_temp.id('prize'), pg_temp.ada(), 'accepted');
select pg_temp.check('accepting a prize records no attendance, so their chance is unchanged',
  not exists (select 1 from public.giveaway_attendance where person_id = pg_temp.ada())
  and (pg_temp.mine()->>'weight')::int = 1000000);
select pg_temp.check('but it is in the history as a win',
  pg_temp.mine()->'won'->0->>'what' = 'Gift card'
  and (pg_temp.mine()->>'wins')::int = 1);
select pg_temp.check('and the record says it was a prize',
  exists (select 1 from public.giveaway_log l where l.giveaway_id = pg_temp.id('prize')
          and l.action = 'accepted' and l.detail->>'kind' = 'prize'));

insert into public.giveaway_winners (giveaway_id, person_id, draw_id, pick)
values (pg_temp.id('event'), pg_temp.ada(), null, 1);
select public.decide_giveaway_winner(pg_temp.id('event'), pg_temp.ada(), 'accepted');
select pg_temp.check('going to an event is still an attendance, and lowers their chance',
  exists (select 1 from public.giveaway_attendance where person_id = pg_temp.ada() and what = 'Brewers vs Cubs')
  and (pg_temp.mine()->>'weight')::int < 1000000
  and jsonb_array_length(pg_temp.mine()->'won') = 1);

-- Leave nothing behind but the log.
select public.delete_giveaway(pg_temp.id('prize'), 'Gift card');
select public.delete_giveaway(pg_temp.id('event'), 'Brewers vs Cubs');
select pg_temp.as_('');
delete from public.giveaway_people where user_id = '0a000000-0000-0000-0000-000000000002';

\echo '--- giveaway prize checks passed ---'
