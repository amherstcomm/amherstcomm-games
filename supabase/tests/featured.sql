-- Featuring things on the home page.
--
-- What has to hold: whoever runs a kind of thing may feature it, and nobody
-- else -- a giveaway manager their giveaways, an editor sessions, contests and
-- tournaments; the home page shows what is featured, in order, within its
-- dates; and a feature goes by itself when the thing is over or not for the
-- reader, while the organiser's page says why it is not showing.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('3e000000-0000-0000-0000-000000000001', 'feature.editor@example.com'),
  ('3e000000-0000-0000-0000-000000000002', 'feature.giver@example.com'),
  ('3e000000-0000-0000-0000-000000000003', 'feature.player@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('3e000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;
insert into public.capability_grants (user_id, capability)
values ('3e000000-0000-0000-0000-000000000002', 'giveaways.manage')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;
create or replace function pg_temp.as_(who text) returns void
language sql as $$ select set_config('test.uid', who, false) $$;
create temp table t (k text primary key, v jsonb);
create or replace function pg_temp.home() returns jsonb
language sql as $$ select public.home_features()->'features' $$;
create or replace function pg_temp.kinds() returns jsonb
language sql as $$ select coalesce(jsonb_agg(x->>'kind' order by ord), '[]'::jsonb)
                   from jsonb_array_elements(pg_temp.home()) with ordinality as a(x, ord) $$;

-- One of each.
insert into public.sessions (id, title, host, state, mode) values
  ('3e000000-0000-0000-0000-0000000000a1', 'Friday Trivia', '3e000000-0000-0000-0000-000000000001', 'live', 'live'),
  ('3e000000-0000-0000-0000-0000000000a2', 'Still Being Written', '3e000000-0000-0000-0000-000000000001', 'draft', 'live')
on conflict (id) do nothing;
insert into public.contests (id, name, entries_open_on, entries_close_on, votes_open_on, votes_close_on) values
  ('3e000000-0000-0000-0000-0000000000c1', 'Desk Photos', public.puzzle_day() - 1, public.puzzle_day() + 3,
   public.puzzle_day() + 4, public.puzzle_day() + 6)
on conflict (id) do nothing;
insert into public.tournaments (id, name, difficulty, starts_on, ends_on) values
  ('3e000000-0000-0000-0000-0000000000d1', 'Ownership Cup', 'easy', public.puzzle_day() - 2, public.puzzle_day() + 5),
  ('3e000000-0000-0000-0000-0000000000d2', 'Last Year', 'easy', public.puzzle_day() - 40, public.puzzle_day() - 30)
on conflict (id) do nothing;
select pg_temp.as_('3e000000-0000-0000-0000-000000000002');
insert into t select 'g', public.save_giveaway(null, 'Bucks tickets', '2 tickets', '', 1, null, true, null, 1, 365);

-- ---------------------------------------------------------------------------
select pg_temp.as_('3e000000-0000-0000-0000-000000000003');
select pg_temp.check('a player cannot feature anything',
  public.save_home_feature('session', '3e000000-0000-0000-0000-0000000000a1')->>'reason' = 'not allowed');
select pg_temp.as_('3e000000-0000-0000-0000-000000000002');
select pg_temp.check('a giveaway manager may feature a giveaway, but not a session',
  public.save_home_feature('giveaway', (select (v->>'id')::uuid from t where k = 'g'), 'Win Bucks tickets', null, null, null, 1)->>'ok' = 'true'
  and public.save_home_feature('session', '3e000000-0000-0000-0000-0000000000a1')->>'reason' = 'not allowed');
select pg_temp.check('nor a picture somebody else uploaded',
  public.save_home_feature('giveaway', (select (v->>'id')::uuid from t where k = 'g'), '',
    '3e000000-0000-0000-0000-000000000001/feature-0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f.webp')->>'reason'
    = 'that picture is not one you uploaded');
select pg_temp.as_('3e000000-0000-0000-0000-000000000001');
select pg_temp.check('an editor features a session, a contest and a tournament',
  public.save_home_feature('session', '3e000000-0000-0000-0000-0000000000a1', '', null, null, null, 0)->>'ok' = 'true'
  and public.save_home_feature('contest', '3e000000-0000-0000-0000-0000000000c1', '', null, null, null, 2)->>'ok' = 'true'
  and public.save_home_feature('tournament', '3e000000-0000-0000-0000-0000000000d1', '', null, null, null, 3)->>'ok' = 'true');
select pg_temp.check('the dates have to make sense',
  public.save_home_feature('contest', '3e000000-0000-0000-0000-0000000000c1', '', null, now(), now() - interval '1 day')->>'reason'
    = 'it cannot finish before it starts');

select pg_temp.as_('3e000000-0000-0000-0000-000000000003');
select pg_temp.check('the home page shows them, in order, with the blurb',
  pg_temp.kinds() = '["session", "giveaway", "contest", "tournament"]'::jsonb
  and pg_temp.home()->1->>'blurb' = 'Win Bucks tickets'
  and pg_temp.home()->0->'item'->>'title' = 'Friday Trivia'
  and pg_temp.home()->0->'item'->>'state' = 'live'
  and pg_temp.home()->3->'item'->>'on' = 'true');

-- Things that are not for showing.
select pg_temp.as_('3e000000-0000-0000-0000-000000000001');
select public.save_home_feature('session', '3e000000-0000-0000-0000-0000000000a2');
select public.save_home_feature('tournament', '3e000000-0000-0000-0000-0000000000d2');
select public.save_home_feature('contest', '3e000000-0000-0000-0000-0000000000c1', '', null, now() + interval '1 day', null, 2);
select pg_temp.as_('3e000000-0000-0000-0000-000000000003');
select pg_temp.check('not a draft, not a tournament that is over, not before its start date',
  pg_temp.kinds() = '["session", "giveaway", "tournament"]'::jsonb);
update public.sessions set state = 'closed' where id = '3e000000-0000-0000-0000-0000000000a1';
update public.giveaways set status = 'drawn' where id = (select (v->>'id')::uuid from t where k = 'g');
select pg_temp.check('and it goes by itself when the thing is over',
  pg_temp.kinds() = '["tournament"]'::jsonb);

select pg_temp.as_('3e000000-0000-0000-0000-000000000001');
select pg_temp.check('the organiser''s page says what is not showing, and why',
  exists (select 1 from jsonb_array_elements(public.home_features_sheet()->'features') x
          where x->>'title' = 'Desk Photos' and not (x->>'showing')::boolean and x->>'why_not' = 'not until its start')
  and exists (select 1 from jsonb_array_elements(public.home_features_sheet()->'features') x
              where x->>'title' = 'Friday Trivia' and x->>'why_not' = 'over, or not open yet'));
select pg_temp.check('and offers what could be featured, but not what is over',
  exists (select 1 from jsonb_array_elements(public.home_features_sheet()->'choices'->'tournament') x
          where x->>'title' = 'Ownership Cup')
  and not exists (select 1 from jsonb_array_elements(public.home_features_sheet()->'choices'->'tournament') x
                  where x->>'title' = 'Last Year'));
select pg_temp.check('a giveaway feature is not an editor''s to take down',
  public.remove_home_feature((select id from public.home_features where kind = 'giveaway'
                              and ref = (select (v->>'id')::uuid from t where k = 'g')))->>'reason' = 'not allowed');
insert into t select 'rm', public.remove_home_feature((select id from public.home_features
  where kind = 'tournament' and ref = '3e000000-0000-0000-0000-0000000000d1'));
select pg_temp.check('but their own is',
  (select v->>'ok' from t where k = 'rm') = 'true'
  and not exists (select 1 from public.home_features where ref = '3e000000-0000-0000-0000-0000000000d1'));

-- Leave nothing behind.
select pg_temp.as_('');
delete from public.home_features where created_by::text like '3e000000-%';
delete from public.sessions where id::text like '3e000000-%';
delete from public.contests where id::text like '3e000000-%';
delete from public.tournaments where id::text like '3e000000-%';
delete from public.giveaways where id = (select (v->>'id')::uuid from t where k = 'g');
delete from public.capability_grants where user_id = '3e000000-0000-0000-0000-000000000002';

\echo '--- featured checks passed ---'
