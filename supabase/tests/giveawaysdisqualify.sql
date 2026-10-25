-- Disqualifying entries, barring people, and winners accepting for themselves.
--
-- What has to hold: only an organiser disqualifies, with a reason only
-- organisers see; a disqualified entry stays listed but is in no drawing, and
-- cannot be withdrawn to clear it; it is reinstated only while the giveaway
-- takes entries; a disqualified winner loses the place, so a replacement can
-- be drawn; a bar keeps somebody out of every giveaway until lifted. And a
-- winner accepts or declines for themselves, accepting only by agreeing to
-- the terms, and only within the giveaway's window.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('1d000000-0000-0000-0000-000000000001', 'dq.organiser@example.com'),
  ('1d000000-0000-0000-0000-000000000002', 'ada.dq@example.com'),
  ('1d000000-0000-0000-0000-000000000003', 'bea.dq@example.com'),
  ('1d000000-0000-0000-0000-000000000004', 'cy.dq@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('1d000000-0000-0000-0000-000000000001', 'games.admin')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('1d000000-0000-0000-0000-000000000002', 'Ada Dq'),
  ('1d000000-0000-0000-0000-000000000003', 'Bea Dq'),
  ('1d000000-0000-0000-0000-000000000004', 'Cy Dq')
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
create or replace function pg_temp.person(n int) returns uuid
language sql as $$ select id from public.giveaway_people where user_id = ('1d000000-0000-0000-0000-00000000000' || n)::uuid $$;
create or replace function pg_temp.entrant(k text, n int) returns jsonb
language sql as $$
  select x from jsonb_array_elements(public.giveaway_detail(pg_temp.id(k))->'entrants') x
  where x->>'person' = pg_temp.person(n)::text
$$;

select pg_temp.as_('1d000000-0000-0000-0000-000000000001');
insert into t select 'g', public.save_giveaway(null, 'Bucks tickets', '2 tickets', '', 1, null, true, null, 1, 365);
insert into t select 'other', public.save_giveaway(null, 'Gift card', '', '', 1, null, true, null, 1, 365);
select pg_temp.as_('1d000000-0000-0000-0000-000000000002');
select public.enter_giveaway(pg_temp.id('g'), true);
select pg_temp.as_('1d000000-0000-0000-0000-000000000003');
select public.enter_giveaway(pg_temp.id('g'), true);
select public.enter_giveaway(pg_temp.id('other'), true);

-- ---------------------------------------------------------------------------
select pg_temp.check('a player cannot disqualify anybody',
  public.disqualify_giveaway_entry(pg_temp.id('g'), pg_temp.person(2), 'No reason')->>'reason' = 'not allowed');
select pg_temp.as_('1d000000-0000-0000-0000-000000000001');
select pg_temp.check('a disqualification needs a reason',
  public.disqualify_giveaway_entry(pg_temp.id('g'), pg_temp.person(2), '  ')->>'reason' = 'say why, in up to 500 characters');
insert into t select 'dq', public.disqualify_giveaway_entry(pg_temp.id('g'), pg_temp.person(2), 'Entered twice under two names');
select pg_temp.check('disqualified, the entry stays listed, and organisers see why',
  (select v->>'ok' from t where k = 'dq') = 'true'
  and (pg_temp.entrant('g', 2)->>'disqualified')::boolean
  and pg_temp.entrant('g', 2)->>'disqualified_reason' = 'Entered twice under two names'
  and exists (select 1 from public.giveaway_log l where l.giveaway_id = pg_temp.id('g') and l.action = 'disqualified'
              and l.detail->>'name' = 'Ada Dq' and not l.detail ? 'reason'));
select pg_temp.as_('1d000000-0000-0000-0000-000000000003');
select pg_temp.check('everyone sees that it happened, and nobody else sees why',
  (pg_temp.entrant('g', 2)->>'disqualified')::boolean and pg_temp.entrant('g', 2)->>'disqualified_reason' is null);
select pg_temp.as_('1d000000-0000-0000-0000-000000000002');
select pg_temp.check('somebody disqualified cannot withdraw to clear it',
  public.enter_giveaway(pg_temp.id('g'), false)->>'reason' = 'your entry was disqualified, so it stays as it is');
select pg_temp.as_('1d000000-0000-0000-0000-000000000001');
select pg_temp.check('nor be taken out by an organiser without reinstating them first',
  public.remove_giveaway_entrant(pg_temp.id('g'), pg_temp.person(2))->>'reason'
    = 'they were disqualified: reinstate them before taking them out');
insert into t select 'back', public.reinstate_giveaway_entry(pg_temp.id('g'), pg_temp.person(2));
select pg_temp.check('while it takes entries, a disqualification can be undone, on the record',
  (select v->>'ok' from t where k = 'back') = 'true'
  and not (pg_temp.entrant('g', 2)->>'disqualified')::boolean
  and exists (select 1 from public.giveaway_log l where l.giveaway_id = pg_temp.id('g') and l.action = 'reinstated'));
select public.disqualify_giveaway_entry(pg_temp.id('g'), pg_temp.person(2), 'Entered twice under two names');

-- The drawing is between the rest.
insert into t select 'draw', public.commit_giveaway_draw(pg_temp.id('g'));
select pg_temp.check('a disqualified entry is in no drawing',
  (select jsonb_agg(x->>'name') from public.giveaway_draws d, jsonb_array_elements(d.entrants) x
   where d.giveaway_id = pg_temp.id('g')) = '["Bea Dq"]'::jsonb);
select pg_temp.check('and cannot be reinstated once it has been drawn without them',
  public.reinstate_giveaway_entry(pg_temp.id('g'), pg_temp.person(2))->>'reason'
    = 'only while it is taking entries: after that it went ahead without them');

-- A winner disqualified loses the place.
update public.giveaways set status = 'drawn' where id = pg_temp.id('g');
insert into public.giveaway_winners (giveaway_id, person_id, draw_id, pick)
values (pg_temp.id('g'), pg_temp.person(3), (select id from public.giveaway_draws where giveaway_id = pg_temp.id('g')), 1);
select public.decide_giveaway_winner(pg_temp.id('g'), pg_temp.person(3), 'accepted');
insert into t select 'dqw', public.disqualify_giveaway_entry(pg_temp.id('g'), pg_temp.person(3), 'Not staff', true);
select pg_temp.check('a disqualified winner loses the place, and the attendance with it',
  (select status from public.giveaway_winners where giveaway_id = pg_temp.id('g') and person_id = pg_temp.person(3)) = 'declined'
  and not exists (select 1 from public.giveaway_attendance where person_id = pg_temp.person(3)));
select pg_temp.check('and cannot be put back as accepted',
  public.decide_giveaway_winner(pg_temp.id('g'), pg_temp.person(3), 'accepted')->>'reason' = 'they were disqualified');

-- Barred: out of every giveaway still taking entries, and no new ones.
select pg_temp.check('barring disqualifies them from the other giveaways still taking entries',
  (pg_temp.entrant('other', 3)->>'disqualified')::boolean
  and (pg_temp.entrant('other', 3)->>'barred')::boolean
  and exists (select 1 from public.giveaway_log l where l.giveaway_id is null and l.action = 'barred'
              and l.detail->>'name' = 'Bea Dq'));
insert into t select 'third', public.save_giveaway(null, 'Swag', '', '', 1, null, true, null, 1, 365);
select pg_temp.check('an organiser cannot enter somebody barred',
  public.add_giveaway_entrant(pg_temp.id('third'), pg_temp.person(3), null, null)->>'reason' = 'Bea Dq is barred from giveaways');
select pg_temp.as_('1d000000-0000-0000-0000-000000000003');
select pg_temp.check('nor can they enter themselves',
  public.enter_giveaway(pg_temp.id('third'), true)->>'reason' = 'Bea Dq is barred from giveaways');
select pg_temp.as_('1d000000-0000-0000-0000-000000000001');
select pg_temp.check('a barred person is not reinstated anywhere until the bar is lifted',
  public.reinstate_giveaway_entry(pg_temp.id('other'), pg_temp.person(3))->>'reason'
    = 'they are barred from giveaways: lift that first');
select public.lift_giveaway_bar(pg_temp.person(3));
select pg_temp.check('lifted, they can be entered again, and their entries reinstated one by one',
  public.add_giveaway_entrant(pg_temp.id('third'), pg_temp.person(3), null, null)->>'ok' = 'true'
  and public.reinstate_giveaway_entry(pg_temp.id('other'), pg_temp.person(3))->>'ok' = 'true');

-- ---------------------------------------------------------------------------
-- Winners accepting for themselves
-- ---------------------------------------------------------------------------
select public.set_giveaway_standard_terms('Staff only.');
insert into t select 'w', public.save_giveaway(null, 'Brewers tickets', '', '', 2, null, true, null, 1, 365,
  'draw', 3, null, 3, 'event', null, 48);
select pg_temp.as_('1d000000-0000-0000-0000-000000000004');
select public.enter_giveaway(pg_temp.id('w'), true,
  public.giveaway_detail(pg_temp.id('w'))->'giveaway'->>'terms_hash');
select pg_temp.as_('1d000000-0000-0000-0000-000000000001');
select public.add_giveaway_entrant(pg_temp.id('w'), pg_temp.person(2), null, null);
insert into t select 'wdraw', public.commit_giveaway_draw(pg_temp.id('w'));
update public.giveaways set status = 'drawn' where id = pg_temp.id('w');
insert into public.giveaway_winners (giveaway_id, person_id, draw_id, pick) values
  (pg_temp.id('w'), pg_temp.person(4), (select id from public.giveaway_draws where giveaway_id = pg_temp.id('w')), 1),
  (pg_temp.id('w'), pg_temp.person(2), (select id from public.giveaway_draws where giveaway_id = pg_temp.id('w')), 2);
select pg_temp.check('each winner has the window to accept, from when they were drawn',
  (select bool_and(respond_by between now() + interval '47 hours' and now() + interval '49 hours')
   from public.giveaway_winners where giveaway_id = pg_temp.id('w'))
  and public.giveaway_detail(pg_temp.id('w'))->'winners'->0->>'respond_by' is not null);

select pg_temp.as_('1d000000-0000-0000-0000-000000000003');
select pg_temp.check('somebody not drawn cannot answer',
  public.respond_to_giveaway_win(pg_temp.id('w'), true)->>'reason' = 'you were not drawn');
select pg_temp.as_('1d000000-0000-0000-0000-000000000002');
select pg_temp.check('accepting means agreeing to the terms',
  public.respond_to_giveaway_win(pg_temp.id('w'), true)->>'reason' = 'agree to the terms to accept');
insert into t select 'acc', public.respond_to_giveaway_win(pg_temp.id('w'), true,
  public.giveaway_detail(pg_temp.id('w'))->'giveaway'->>'terms_hash');
select pg_temp.check('agreeing, a winner put in by an organiser accepts for themselves',
  (select v->>'ok' from t where k = 'acc') = 'true'
  and (select status from public.giveaway_winners where giveaway_id = pg_temp.id('w') and person_id = pg_temp.person(2)) = 'accepted'
  and exists (select 1 from public.giveaway_entries where giveaway_id = pg_temp.id('w') and person_id = pg_temp.person(2)
              and agreed_hash is not null)
  and exists (select 1 from public.giveaway_attendance where person_id = pg_temp.person(2) and giveaway_id = pg_temp.id('w'))
  and exists (select 1 from public.giveaway_log l where l.giveaway_id = pg_temp.id('w') and l.action = 'accepted'
              and (l.detail->>'self')::boolean));
select pg_temp.check('and cannot change their mind on their own',
  public.respond_to_giveaway_win(pg_temp.id('w'), false)->>'reason'
    = 'you have already answered: ask an organiser to change it');

-- Past the window, they cannot; an organiser marks them as having missed it.
update public.giveaway_winners set respond_by = now() - interval '1 minute'
 where giveaway_id = pg_temp.id('w') and person_id = pg_temp.person(4);
select pg_temp.as_('1d000000-0000-0000-0000-000000000004');
select pg_temp.check('past the window, a winner cannot accept',
  public.respond_to_giveaway_win(pg_temp.id('w'), true,
    public.giveaway_detail(pg_temp.id('w'))->'giveaway'->>'terms_hash')->>'reason' = 'the time to accept has passed');
select pg_temp.as_('1d000000-0000-0000-0000-000000000001');
select public.decide_giveaway_winner(pg_temp.id('w'), pg_temp.person(4), 'declined');
select pg_temp.check('an organiser marks them declined, and the record says they let it lapse',
  exists (select 1 from public.giveaway_log l where l.giveaway_id = pg_temp.id('w') and l.action = 'declined'
          and (l.detail->>'lapsed')::boolean));

-- Leave nothing behind but the log, and no standard terms for the tests after.
select public.set_giveaway_standard_terms('');
select public.delete_giveaway(pg_temp.id('g'), 'Bucks tickets');
select public.delete_giveaway(pg_temp.id('other'), 'Gift card');
select public.delete_giveaway(pg_temp.id('third'), 'Swag');
select public.delete_giveaway(pg_temp.id('w'), 'Brewers tickets');
select pg_temp.as_('');
delete from public.giveaway_people where user_id in ('1d000000-0000-0000-0000-000000000001',
  '1d000000-0000-0000-0000-000000000002', '1d000000-0000-0000-0000-000000000003', '1d000000-0000-0000-0000-000000000004');

\echo '--- giveaway disqualify checks passed ---'
