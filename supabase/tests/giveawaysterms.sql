-- Terms and conditions on giveaways.
--
-- What has to hold: only an organiser sets the standard terms, and every
-- giveaway nobody has entered takes them; a giveaway's terms are the standard
-- ones then its own; entering yourself means agreeing to exactly those, by
-- their fingerprint, and the text agreed to is kept; somebody an organiser
-- puts in has agreed to nothing, and cannot be marked as accepting a win
-- until they agree, themselves or recorded by an organiser; and once anybody
-- is in, the terms they agreed to do not change.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('0b000000-0000-0000-0000-000000000001', 'terms.organiser@example.com'),
  ('0b000000-0000-0000-0000-000000000002', 'ada.terms@example.com'),
  ('0b000000-0000-0000-0000-000000000003', 'bea.terms@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('0b000000-0000-0000-0000-000000000001', 'games.admin')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('0b000000-0000-0000-0000-000000000002', 'Ada Terms'),
  ('0b000000-0000-0000-0000-000000000003', 'Bea Terms')
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
create or replace function pg_temp.hash(k text) returns text
language sql as $$ select public.giveaway_detail(pg_temp.id(k))->'giveaway'->>'terms_hash' $$;
create or replace function pg_temp.person(u text) returns uuid
language sql as $$ select id from public.giveaway_people where user_id = u::uuid $$;

-- ---------------------------------------------------------------------------
select pg_temp.as_('0b000000-0000-0000-0000-000000000002');
select pg_temp.check('a player cannot set the standard terms',
  public.set_giveaway_standard_terms('Anything goes.')->>'reason' = 'not allowed');
select pg_temp.as_('0b000000-0000-0000-0000-000000000001');
select public.set_giveaway_standard_terms('Staff only. No cash in place of a prize.');
insert into t select 'g', public.save_giveaway(null, 'Bucks tickets', '2 tickets', '', 1, null, true, null, 1, 365,
  'draw', 3, null, 3, 'event', 'You must be able to go on the 30th.');
select pg_temp.check('a giveaway''s terms are the standard ones, then its own',
  public.giveaway_detail(pg_temp.id('g'))->'giveaway'->>'terms_text'
    = E'Staff only. No cash in place of a prize.\n\nYou must be able to go on the 30th.'
  and length(pg_temp.hash('g')) = 64
  and public.giveaways_list()->>'standard_terms' = 'Staff only. No cash in place of a prize.');

-- Entering yourself is agreeing, to exactly these terms.
select pg_temp.as_('0b000000-0000-0000-0000-000000000002');
select pg_temp.check('entering without agreeing is refused',
  public.enter_giveaway(pg_temp.id('g'), true)->>'reason' = 'agree to the terms to enter');
select pg_temp.check('and so is agreeing to some other terms',
  public.enter_giveaway(pg_temp.id('g'), true, repeat('0', 64))->>'reason' = 'the terms have changed: read them again');
select public.enter_giveaway(pg_temp.id('g'), true, pg_temp.hash('g'));
select pg_temp.check('agreeing to these, they are in and the text they agreed to is kept',
  exists (select 1 from public.giveaway_entries e
          join public.giveaway_terms_texts x on x.hash = e.agreed_hash
          where e.giveaway_id = pg_temp.id('g') and e.person_id = pg_temp.person('0b000000-0000-0000-0000-000000000002')
            and x.body like 'Staff only.%the 30th.')
  and exists (select 1 from jsonb_array_elements(public.giveaway_detail(pg_temp.id('g'))->'entrants') x
              where x->>'name' = 'Ada Terms' and (x->>'agreed')::boolean and (x->>'agreed_self')::boolean));

-- Somebody put in by an organiser has agreed to nothing.
select pg_temp.as_('0b000000-0000-0000-0000-000000000001');
select public.add_giveaway_entrant(pg_temp.id('g'), null, '0b000000-0000-0000-0000-000000000003', null);
select public.add_giveaway_entrant(pg_temp.id('g'), null, null, 'Cy Typed');
select pg_temp.check('somebody an organiser enters has not agreed',
  exists (select 1 from jsonb_array_elements(public.giveaway_detail(pg_temp.id('g'))->'entrants') x
          where x->>'name' = 'Bea Terms' and not (x->>'agreed')::boolean));

-- Once anybody is in, the terms stay what they agreed to.
select pg_temp.check('a giveaway''s own terms cannot change once people are in',
  public.save_giveaway(pg_temp.id('g'), 'Bucks tickets', '2 tickets', '', 1, null, true, null, 1, 365,
    'draw', 3, null, 3, 'event', 'You must be able to go on the 31st.')->>'reason'
    = 'people have entered under these terms: they cannot change');
select pg_temp.check('though everything else about it can',
  public.save_giveaway(pg_temp.id('g'), 'Bucks tickets', '2 tickets, section 112', '', 1, null, true, null, 1, 365,
    'draw', 3, null, 3, 'event', 'You must be able to go on the 30th.')->>'ok' = 'true');
insert into t select 'fresh', public.save_giveaway(null, 'Gift card', '', '', 1, null, true, null, 1, 365,
  'draw', 3, null, 3, 'prize');
insert into t select 'std', public.set_giveaway_standard_terms('Staff only.');
select pg_temp.check('changing the standard terms reaches only the giveaways nobody has entered',
  (select v->>'applied' from t where k = 'std') = '1'
  and public.giveaway_detail(pg_temp.id('fresh'))->'giveaway'->>'terms_text' = 'Staff only.'
  and public.giveaway_detail(pg_temp.id('g'))->'giveaway'->>'standard_terms' = 'Staff only. No cash in place of a prize.'
  and exists (select 1 from public.giveaway_log l where l.giveaway_id is null and l.action = 'standard terms changed'));

-- A winner who has not agreed cannot be marked as accepting.
update public.giveaways set status = 'drawn' where id = pg_temp.id('g');
insert into public.giveaway_winners (giveaway_id, person_id, draw_id, pick) values
  (pg_temp.id('g'), pg_temp.person('0b000000-0000-0000-0000-000000000003'), null, 1),
  (pg_temp.id('g'), (select id from public.giveaway_people where name = 'Cy Typed'), null, 2);
select pg_temp.check('a winner who has not agreed cannot be marked as accepting',
  public.decide_giveaway_winner(pg_temp.id('g'), pg_temp.person('0b000000-0000-0000-0000-000000000003'), 'accepted')->>'reason'
    = 'Bea Terms has not agreed to the terms yet');
select pg_temp.as_('0b000000-0000-0000-0000-000000000003');
select pg_temp.check('a player cannot record somebody else''s agreement',
  public.agree_giveaway_terms(pg_temp.id('g'), pg_temp.hash('g'), (select id from public.giveaway_people where name = 'Cy Typed'))->>'reason'
    = 'not allowed');
insert into t select 'bea', public.agree_giveaway_terms(pg_temp.id('g'), pg_temp.hash('g'));
select pg_temp.check('they agree for themselves, after being entered',
  (select v->>'ok' from t where k = 'bea') = 'true'
  and exists (select 1 from public.giveaway_log l where l.giveaway_id = pg_temp.id('g') and l.action = 'terms agreed'
              and l.detail->>'name' = 'Bea Terms' and (l.detail->>'self')::boolean));
select pg_temp.as_('0b000000-0000-0000-0000-000000000001');
select pg_temp.check('and then can be marked as accepting',
  public.decide_giveaway_winner(pg_temp.id('g'), pg_temp.person('0b000000-0000-0000-0000-000000000003'), 'accepted')->>'ok' = 'true');
insert into t select 'cy', public.agree_giveaway_terms(pg_temp.id('g'), pg_temp.hash('g'),
  (select id from public.giveaway_people where name = 'Cy Typed'));
select pg_temp.check('an organiser records the agreement of somebody without an account, on the record',
  (select v->>'ok' from t where k = 'cy') = 'true'
  and exists (select 1 from public.giveaway_log l where l.giveaway_id = pg_temp.id('g') and l.action = 'terms agreed'
              and l.detail->>'name' = 'Cy Typed' and not (l.detail->>'self')::boolean));

-- A judged one: answering yourself is agreeing, too.
insert into t select 'j', public.save_giveaway(null, 'Why ownership', '', '', 1, null, true, null, 1, 365,
  'judged', 3, '["Why?"]'::jsonb, 3, 'prize');
select pg_temp.as_('0b000000-0000-0000-0000-000000000002');
select pg_temp.check('answering a judged one without agreeing is refused',
  public.enter_judged_giveaway(pg_temp.id('j'),
    jsonb_build_object((select id from public.giveaway_questions where giveaway_id = pg_temp.id('j'))::text, 'Because.'))->>'reason'
    = 'agree to the terms to enter');
insert into t select 'jin', public.enter_judged_giveaway(pg_temp.id('j'),
  jsonb_build_object((select id from public.giveaway_questions where giveaway_id = pg_temp.id('j'))::text, 'Because.'),
  null, null, null, pg_temp.hash('j'));
select pg_temp.check('and agreeing, they are in',
  (select v->>'ok' from t where k = 'jin') = 'true'
  and exists (select 1 from public.giveaway_entries where giveaway_id = pg_temp.id('j') and agreed_hash = pg_temp.hash('j')));

-- With no terms at all, there is nothing to agree to.
select pg_temp.as_('0b000000-0000-0000-0000-000000000001');
select public.set_giveaway_standard_terms('');
select pg_temp.check('with no terms, entering needs no agreement',
  pg_temp.hash('fresh') is null
  and (select public.enter_giveaway(pg_temp.id('fresh'), true)->>'ok') = 'true');

-- Leave nothing behind but the log, and no standard terms for the tests after.
select public.delete_giveaway(pg_temp.id('g'), 'Bucks tickets');
select public.delete_giveaway(pg_temp.id('fresh'), 'Gift card');
select public.delete_giveaway(pg_temp.id('j'), 'Why ownership');
select pg_temp.as_('');
delete from public.giveaway_people where user_id in ('0b000000-0000-0000-0000-000000000001',
  '0b000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000003') or name = 'Cy Typed';

\echo '--- giveaway terms checks passed ---'
