-- Rated, then drawn: judges rate the answers 1 to 5, blind; the entries that
-- meet the bar go into a pool; the pool is drawn like any drawing.
--
-- What has to hold: it cannot be drawn before the pool is set, and is then
-- drawn from the pool and nothing else; only its judges rate, 1 to 5, never
-- their own, blind until the pool; the organiser can move the bar when
-- setting the pool, and a bar nobody meets sets nothing; and once set, the
-- pool is public -- names, averages, every judge's rating.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('0a000000-0000-0000-0000-000000000001', 'rated.organiser@example.com'),
  ('0a000000-0000-0000-0000-000000000002', 'ada.rated@example.com'),
  ('0a000000-0000-0000-0000-000000000003', 'bea.rated@example.com'),
  ('0a000000-0000-0000-0000-000000000004', 'cy.rated@example.com'),
  ('0a000000-0000-0000-0000-000000000005', 'rater.one@example.com'),
  ('0a000000-0000-0000-0000-000000000006', 'rater.two@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('0a000000-0000-0000-0000-000000000001', 'games.admin')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('0a000000-0000-0000-0000-000000000002', 'Ada Rated'),
  ('0a000000-0000-0000-0000-000000000003', 'Bea Rated'),
  ('0a000000-0000-0000-0000-000000000004', 'Cy Rated'),
  ('0a000000-0000-0000-0000-000000000005', 'Rater One'),
  ('0a000000-0000-0000-0000-000000000006', 'Rater Two')
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
create or replace function pg_temp.q1() returns text
language sql as $$ select id::text from public.giveaway_questions where giveaway_id = pg_temp.gid() and position = 1 $$;
create or replace function pg_temp.label(who uuid) returns text
language sql as $$
  select l.label from public.giveaway_entry_labels(pg_temp.gid()) l
  join public.giveaway_people p on p.id = l.person_id where p.user_id = who
$$;

-- ---------------------------------------------------------------------------
-- Setting up and entering
-- ---------------------------------------------------------------------------
select pg_temp.as_('0a000000-0000-0000-0000-000000000001');
select pg_temp.check('the bar is a rating between 1 and 5',
  public.save_giveaway(null, 'Bucks tickets', '2 seats', '', 1, current_date + 9, true, null, 1, 365,
    'screened', 3, '["Why you?"]'::jsonb, 6)->>'reason' = 'the bar is a rating between 1 and 5');
insert into t select 'g', public.save_giveaway(null, 'Bucks tickets', '2 seats', '', 1, current_date + 9, true, null, 1, 365,
  'screened', 3, '["Why should you go?"]'::jsonb, 3);
select pg_temp.check('a rated-then-drawn giveaway is set up with its question and bar',
  (select v->>'ok' from t where k = 'g') = 'true'
  and (select mode = 'screened' and bar = 3 from public.giveaways where id = pg_temp.gid()));
select public.add_giveaway_judge(pg_temp.gid(), '0a000000-0000-0000-0000-000000000005');
select public.add_giveaway_judge(pg_temp.gid(), '0a000000-0000-0000-0000-000000000006');
select pg_temp.check('it cannot be drawn while it takes entries',
  public.commit_giveaway_draw(pg_temp.gid())->>'reason' = 'the entries are rated and the pool set before the drawing');

select pg_temp.as_('0a000000-0000-0000-0000-000000000002');
select pg_temp.check('it is entered by answering',
  public.enter_giveaway(pg_temp.gid(), true)->>'reason' = 'this one is entered by answering its questions'
  and public.enter_judged_giveaway(pg_temp.gid(), jsonb_build_object(pg_temp.q1(), 'I never miss a game'))->>'ok' = 'true');
select pg_temp.as_('0a000000-0000-0000-0000-000000000003');
select public.enter_judged_giveaway(pg_temp.gid(), jsonb_build_object(pg_temp.q1(), 'My kids have never been'));
select pg_temp.as_('0a000000-0000-0000-0000-000000000004');
select public.enter_judged_giveaway(pg_temp.gid(), jsonb_build_object(pg_temp.q1(), 'Free tickets'));
-- Rater One enters as well, and may not rate their own.
select pg_temp.as_('0a000000-0000-0000-0000-000000000005');
select public.enter_judged_giveaway(pg_temp.gid(), jsonb_build_object(pg_temp.q1(), 'Why not'));

-- ---------------------------------------------------------------------------
-- Rating
-- ---------------------------------------------------------------------------
select pg_temp.check('nobody rates before the rating starts',
  public.save_giveaway_ratings(pg_temp.gid(), jsonb_build_object(pg_temp.label('0a000000-0000-0000-0000-000000000002'), 4))->>'reason'
    = 'the rating has not started');
select pg_temp.as_('0a000000-0000-0000-0000-000000000001');
select pg_temp.check('the organiser closes the entries and starts the rating',
  public.start_giveaway_judging(pg_temp.gid())->>'ok' = 'true');
select pg_temp.check('and still cannot draw before the pool is set',
  public.commit_giveaway_draw(pg_temp.gid())->>'reason' = 'the entries are rated and the pool set before the drawing');

select pg_temp.as_('0a000000-0000-0000-0000-000000000005');
select pg_temp.check('a rating is from 1 to 5',
  public.save_giveaway_ratings(pg_temp.gid(), jsonb_build_object(pg_temp.label('0a000000-0000-0000-0000-000000000002'), 7))->>'reason'
    = 'a rating is from 1 to 5');
select pg_temp.check('a judge cannot rate their own entry',
  public.save_giveaway_ratings(pg_temp.gid(), jsonb_build_object(pg_temp.label('0a000000-0000-0000-0000-000000000005'), 5))->>'reason'
    = 'a judge cannot rate their own entry');
insert into t select 'blind', public.giveaway_judging(pg_temp.gid());
select pg_temp.check('a judge rates blind: labels and answers, no names, no averages',
  not exists (select 1 from t, jsonb_array_elements(v->'entries') e
              where k = 'blind' and (e->>'name' is not null or e->>'key' is not null or e->>'average' is not null)));
-- Ada 4 and 5 (4.5), Bea 3 and 2 (2.5), Cy 1 and 2 (1.5); Rater One's own
-- entry is rated 3 by Rater Two alone.
select pg_temp.check('Rater One rates',
  public.save_giveaway_ratings(pg_temp.gid(), jsonb_build_object(
    pg_temp.label('0a000000-0000-0000-0000-000000000002'), 4,
    pg_temp.label('0a000000-0000-0000-0000-000000000003'), 3,
    pg_temp.label('0a000000-0000-0000-0000-000000000004'), 1))->>'ok' = 'true');
insert into t select 'mine', public.giveaway_judging(pg_temp.gid());
select pg_temp.check('and sees their own ratings back, by label',
  (select (v->'my_ratings'->>pg_temp.label('0a000000-0000-0000-0000-000000000002'))::int from t where k = 'mine') = 4);
select pg_temp.as_('0a000000-0000-0000-0000-000000000006');
select public.save_giveaway_ratings(pg_temp.gid(), jsonb_build_object(
  pg_temp.label('0a000000-0000-0000-0000-000000000002'), 5,
  pg_temp.label('0a000000-0000-0000-0000-000000000003'), 2,
  pg_temp.label('0a000000-0000-0000-0000-000000000004'), 2,
  pg_temp.label('0a000000-0000-0000-0000-000000000005'), 3));

-- ---------------------------------------------------------------------------
-- The pool, and the drawing from it
-- ---------------------------------------------------------------------------
select pg_temp.as_('0a000000-0000-0000-0000-000000000001');
select pg_temp.check('a bar nobody meets sets nothing, so a lower one can be tried',
  public.qualify_giveaway(pg_temp.gid(), 5)->>'reason' = 'nobody averages 5 or more'
  and (select status from public.giveaways where id = pg_temp.gid()) = 'judging'
  and not exists (select 1 from public.giveaway_entries where giveaway_id = pg_temp.gid() and qualified is not null));
insert into t select 'pool', public.qualify_giveaway(pg_temp.gid(), 2.5);
select pg_temp.check('the organiser sets the pool at 2.5: Ada, Bea and Rater One are in, Cy is not',
  (select (v->>'in')::int from t where k = 'pool') = 3
  and (select array_agg(p.name order by p.name) from public.giveaway_entries e
       join public.giveaway_people p on p.id = e.person_id
       where e.giveaway_id = pg_temp.gid() and e.qualified) = array['Ada Rated', 'Bea Rated', 'Rater One']
  and (select bar from public.giveaways where id = pg_temp.gid()) = 2.5);
select pg_temp.as_('0a000000-0000-0000-0000-000000000006');
select pg_temp.check('the rating is over',
  public.save_giveaway_ratings(pg_temp.gid(), jsonb_build_object(pg_temp.label('0a000000-0000-0000-0000-000000000004'), 5))->>'reason'
    = 'the rating is over');

select pg_temp.as_('0a000000-0000-0000-0000-000000000004');
insert into t select 'open', public.giveaway_judging(pg_temp.gid());
select pg_temp.check('once the pool is set, everybody sees who is in, with averages and every rating',
  exists (select 1 from t, jsonb_array_elements(v->'entries') e
          where k = 'open' and e->>'name' = 'Ada Rated' and (e->>'average')::numeric = 4.5
            and (e->>'qualified')::boolean and jsonb_array_length(e->'ratings') = 2)
  and exists (select 1 from t, jsonb_array_elements(v->'entries') e
              where k = 'open' and e->>'name' = 'Cy Rated' and not (e->>'qualified')::boolean));

select pg_temp.as_('0a000000-0000-0000-0000-000000000001');
insert into t select 'draw', public.commit_giveaway_draw(pg_temp.gid());
select pg_temp.check('and the drawing is between the pool and nobody else',
  (select v->>'ok' from t where k = 'draw') = 'true'
  and (select jsonb_agg(x->>'name' order by x->>'name') from public.giveaway_draws d, jsonb_array_elements(d.entrants) x
       where d.id = (select (v->>'draw')::uuid from t where k = 'draw'))
      = '["Ada Rated", "Bea Rated", "Rater One"]'::jsonb);
select pg_temp.check('the record says how the pool was set',
  exists (select 1 from public.giveaway_log l where l.giveaway_id = pg_temp.gid() and l.action = 'pool set'
          and (l.detail->>'bar')::numeric = 2.5 and (l.detail->>'in')::int = 3));

-- Leave nothing behind but the log.
select pg_temp.as_('');
delete from public.giveaways where id = pg_temp.gid();
delete from public.giveaway_people where name in ('Ada Rated', 'Bea Rated', 'Cy Rated', 'Rater One');

\echo '--- rated giveaway checks passed ---'
