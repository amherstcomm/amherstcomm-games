-- Judged giveaways: entrants answer questions, chosen judges rank them.
--
-- What has to hold: a judged giveaway takes answers, not a bare entry, and
-- never draws; once anybody has answered, its questions and its kind are
-- fixed; only its own judges rank, never before the judging or after the
-- results, and never their own entry; judging is blind -- no names, no ids --
-- and other staff see no entries until the results; the totals decide, a tie
-- at the last winning place is the organiser's to settle; then everything is
-- open, and a declined place goes to the next in the ranking.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('0b000000-0000-0000-0000-000000000001', 'judged.organiser@example.com'),
  ('0b000000-0000-0000-0000-000000000002', 'ada.judged@example.com'),
  ('0b000000-0000-0000-0000-000000000003', 'bea.judged@example.com'),
  ('0b000000-0000-0000-0000-000000000004', 'cy.judged@example.com'),
  ('0b000000-0000-0000-0000-000000000005', 'judge.one@example.com'),
  ('0b000000-0000-0000-0000-000000000006', 'judge.two@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('0b000000-0000-0000-0000-000000000001', 'games.admin')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('0b000000-0000-0000-0000-000000000002', 'Ada Judged'),
  ('0b000000-0000-0000-0000-000000000003', 'Bea Judged'),
  ('0b000000-0000-0000-0000-000000000004', 'Cy Judged'),
  ('0b000000-0000-0000-0000-000000000005', 'Judge One'),
  ('0b000000-0000-0000-0000-000000000006', 'Judge Two')
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

-- The questions' ids, in order, to answer by.
create or replace function pg_temp.q(n int) returns text
language sql as $$
  select q.id::text from public.giveaway_questions q
  where q.giveaway_id = (select (v->>'id')::uuid from t where k = 'g') and q.position = n
$$;
create or replace function pg_temp.answers(a text, b text) returns jsonb
language sql as $$ select jsonb_build_object(pg_temp.q(1), a, pg_temp.q(2), b) $$;
create or replace function pg_temp.gid() returns uuid
language sql as $$ select (v->>'id')::uuid from t where k = 'g' $$;
-- The label a person's entry carries, which only the database knows.
create or replace function pg_temp.label(who uuid) returns text
language sql as $$
  select l.label from public.giveaway_entry_labels(pg_temp.gid()) l
  join public.giveaway_people p on p.id = l.person_id where p.user_id = who
$$;

-- ---------------------------------------------------------------------------
-- Setting one up
-- ---------------------------------------------------------------------------
select pg_temp.as_('0b000000-0000-0000-0000-000000000001');
select pg_temp.check('a judged giveaway needs a question',
  public.save_giveaway(null, 'Packers tickets', '2 seats', '', 1, current_date + 9, true, null, 1, 365,
    'judged', 2, '[]'::jsonb)->>'reason' = 'a judged giveaway needs at least one question');
insert into t select 'g', public.save_giveaway(null, 'Packers tickets', '2 seats', '', 2, current_date + 9, true, null, 1, 365,
  'judged', 2, '["What does ownership mean to you?", "Who would you take?"]'::jsonb);
select pg_temp.check('and is set up with its questions in order',
  (select v->>'ok' from t where k = 'g') = 'true'
  and (select array_agg(prompt order by position) from public.giveaway_questions where giveaway_id = pg_temp.gid())
      = array['What does ownership mean to you?', 'Who would you take?']);
select pg_temp.check('it is never drawn',
  public.commit_giveaway_draw(pg_temp.gid())->>'reason' = 'this one is judged, not drawn');
select pg_temp.check('a judge needs an account; two are added',
  public.add_giveaway_judge(pg_temp.gid(), gen_random_uuid())->>'reason' = 'a judge needs an account'
  and public.add_giveaway_judge(pg_temp.gid(), '0b000000-0000-0000-0000-000000000005')->>'ok' = 'true'
  and public.add_giveaway_judge(pg_temp.gid(), '0b000000-0000-0000-0000-000000000006')->>'ok' = 'true');

-- ---------------------------------------------------------------------------
-- Entering
-- ---------------------------------------------------------------------------
select pg_temp.as_('0b000000-0000-0000-0000-000000000002');
select pg_temp.check('it is entered by answering, not by putting yourself in',
  public.enter_giveaway(pg_temp.gid(), true)->>'reason' = 'this one is entered by answering its questions');
select pg_temp.check('every question needs an answer',
  public.enter_judged_giveaway(pg_temp.gid(), jsonb_build_object(pg_temp.q(1), 'Shared stake'))->>'reason'
    = 'question 2 has no answer');
select pg_temp.check('Ada answers both',
  public.enter_judged_giveaway(pg_temp.gid(), pg_temp.answers('A shared stake', 'My dad'))->>'ok' = 'true');
select pg_temp.check('and can change her answers while entries are open',
  public.enter_judged_giveaway(pg_temp.gid(), pg_temp.answers('A shared stake in the future', 'My dad'))->>'ok' = 'true');
insert into t select 'adaview', public.giveaway_judging(pg_temp.gid());
select pg_temp.check('she sees her own answers, and nobody else''s',
  (select v->'mine'->>pg_temp.q(1) from t where k = 'adaview') = 'A shared stake in the future'
  and (select v->'entries' from t where k = 'adaview') = '[]'::jsonb);
select pg_temp.check('a player cannot enter somebody else',
  public.enter_judged_giveaway(pg_temp.gid(), pg_temp.answers('x', 'y'), null, null, 'Someone')->>'reason' = 'not allowed');

select pg_temp.as_('0b000000-0000-0000-0000-000000000003');
select public.enter_judged_giveaway(pg_temp.gid(), pg_temp.answers('Voice in decisions', 'My sister'));
select pg_temp.as_('0b000000-0000-0000-0000-000000000004');
select public.enter_judged_giveaway(pg_temp.gid(), pg_temp.answers('Pride in the work', 'Nobody'));
-- Judge One enters too: a judge may enter, but not rank their own.
select pg_temp.as_('0b000000-0000-0000-0000-000000000005');
select public.enter_judged_giveaway(pg_temp.gid(), pg_temp.answers('Owning the outcome', 'My crew'));

select pg_temp.as_('0b000000-0000-0000-0000-000000000001');
select pg_temp.check('an organiser can enter somebody who never signs in, answers and all',
  public.enter_judged_giveaway(pg_temp.gid(), pg_temp.answers('Building something', 'My wife'), null, null, 'Dee Paper')->>'ok' = 'true');
select pg_temp.check('once anybody has answered, the questions are fixed',
  public.save_giveaway(pg_temp.gid(), 'Packers tickets', '2 seats', '', 2, current_date + 9, true, null, 1, 365,
    'judged', 2, '["Something else"]'::jsonb)->>'reason' = 'people have answered: the questions cannot change');
select pg_temp.check('and so is its kind',
  public.save_giveaway(pg_temp.gid(), 'Packers tickets', '2 seats', '', 2, current_date + 9, true, null, 1, 365,
    'draw', 2, null)->>'reason' = 'people have entered: it cannot change between drawn and judged');

-- ---------------------------------------------------------------------------
-- Judging
-- ---------------------------------------------------------------------------
select pg_temp.as_('0b000000-0000-0000-0000-000000000006');
select pg_temp.check('nobody ranks before the judging starts',
  public.save_giveaway_ranking(pg_temp.gid(), array[pg_temp.label('0b000000-0000-0000-0000-000000000002')])->>'reason'
    = 'the judging has not started');
select pg_temp.as_('0b000000-0000-0000-0000-000000000001');
select pg_temp.check('the organiser starts the judging',
  public.start_giveaway_judging(pg_temp.gid())->>'ok' = 'true');
select pg_temp.as_('0b000000-0000-0000-0000-000000000002');
select pg_temp.check('entries are closed now',
  public.enter_judged_giveaway(pg_temp.gid(), pg_temp.answers('late', 'late'))->>'reason' = 'entries are closed');
select pg_temp.check('and a player who is not a judge cannot rank',
  public.save_giveaway_ranking(pg_temp.gid(), array['Entry 1'])->>'reason' = 'only this giveaway''s judges can rank it');
insert into t select 'playerjudging', public.giveaway_judging(pg_temp.gid());
select pg_temp.check('nor see the entries while they are judged',
  (select v->'entries' from t where k = 'playerjudging') = '[]'::jsonb);

select pg_temp.as_('0b000000-0000-0000-0000-000000000006');
insert into t select 'blind', public.giveaway_judging(pg_temp.gid());
select pg_temp.check('a judge sees every entry, blind: answers and a label, no name and no id',
  jsonb_array_length((select v->'entries' from t where k = 'blind')) = 5
  and not exists (select 1 from t, jsonb_array_elements(v->'entries') e
                  where k = 'blind' and (e->>'name' is not null or e->>'person' is not null or e->>'key' is not null
                                         or e->>'points' is not null))
  and exists (select 1 from t, jsonb_array_elements(v->'entries') e
              where k = 'blind' and e->'answers'->0->>'answer' = 'A shared stake in the future'));
select pg_temp.check('a judge ranks at most their picks, each once',
  public.save_giveaway_ranking(pg_temp.gid(), array['Entry 1', 'Entry 2', 'Entry 3'])->>'reason' = 'rank at most 2'
  and public.save_giveaway_ranking(pg_temp.gid(), array['Entry 1', 'Entry 1'])->>'reason' = 'an entry can be ranked once'
  and public.save_giveaway_ranking(pg_temp.gid(), array['Entry 99'])->>'reason' = 'that is not an entry in this giveaway');
-- Judge Two: Ada first, Bea second.
select pg_temp.check('Judge Two ranks Ada then Bea',
  public.save_giveaway_ranking(pg_temp.gid(), array[pg_temp.label('0b000000-0000-0000-0000-000000000002'),
                                                     pg_temp.label('0b000000-0000-0000-0000-000000000003')])->>'ok' = 'true');
select pg_temp.as_('0b000000-0000-0000-0000-000000000005');
select pg_temp.check('a judge cannot rank their own entry',
  public.save_giveaway_ranking(pg_temp.gid(), array[pg_temp.label('0b000000-0000-0000-0000-000000000005')])->>'reason'
    = 'a judge cannot rank their own entry');
-- Judge One: Cy first, Bea second. Ada 2, Bea 1+1 = 2, Cy 2: a three-way tie
-- for two places.
select public.save_giveaway_ranking(pg_temp.gid(), array[pg_temp.label('0b000000-0000-0000-0000-000000000004'),
                                                          pg_temp.label('0b000000-0000-0000-0000-000000000003')]);
insert into t select 'mine', public.giveaway_judging(pg_temp.gid());
select pg_temp.check('and sees their own ranking back, by label',
  (select v->'my_ranking' from t where k = 'mine')
    = jsonb_build_array(pg_temp.label('0b000000-0000-0000-0000-000000000004'), pg_temp.label('0b000000-0000-0000-0000-000000000003')));

-- ---------------------------------------------------------------------------
-- The results
-- ---------------------------------------------------------------------------
select pg_temp.as_('0b000000-0000-0000-0000-000000000001');
insert into t select 'tie', public.announce_giveaway_results(pg_temp.gid());
select pg_temp.check('a tie across the last winning place is the organiser''s to settle',
  (select v->>'reason' from t where k = 'tie') = 'tie'
  and (select (v->>'need')::int from t where k = 'tie') = 2
  and jsonb_array_length((select v->'tied' from t where k = 'tie')) = 3);
select pg_temp.check('choosing the wrong number of them is refused',
  public.announce_giveaway_results(pg_temp.gid(), array[
    (select (e->>'key')::uuid from t, jsonb_array_elements(v->'tied') e where k = 'tie' limit 1)])->>'reason'
    = 'choose 2 of the tied entries');
select pg_temp.check('choosing two announces them',
  public.announce_giveaway_results(pg_temp.gid(), array(
    select p.id from public.giveaway_people p where p.user_id in ('0b000000-0000-0000-0000-000000000002',
                                                                  '0b000000-0000-0000-0000-000000000003')))->>'ok' = 'true');

select pg_temp.as_('0b000000-0000-0000-0000-000000000004');
insert into t select 'open', public.giveaway_judging(pg_temp.gid());
select pg_temp.check('then everybody sees every entry, named, with its points and each judge''s rank',
  jsonb_array_length((select v->'entries' from t where k = 'open')) = 5
  and exists (select 1 from t, jsonb_array_elements(v->'entries') e
              where k = 'open' and e->>'name' = 'Bea Judged' and (e->>'points')::int = 2
                and jsonb_array_length(e->'ranks') = 2));
select pg_temp.check('and the judges can no longer rank',
  (select public.save_giveaway_ranking(pg_temp.gid(), array['Entry 1']) from (select pg_temp.as_('0b000000-0000-0000-0000-000000000006')) x)->>'reason'
    = 'the judging is over');

-- A winner declines; the place goes to the next in the ranking, Cy.
select pg_temp.as_('0b000000-0000-0000-0000-000000000001');
select public.decide_giveaway_winner(pg_temp.gid(),
  (select id from public.giveaway_people where user_id = '0b000000-0000-0000-0000-000000000003'), 'declined');
insert into t select 'offer', public.offer_giveaway_place(pg_temp.gid());
select pg_temp.check('a declined place goes to the next-ranked entry',
  (select v->>'person' from t where k = 'offer')::uuid
    = (select id from public.giveaway_people where user_id = '0b000000-0000-0000-0000-000000000004'));
select pg_temp.check('and the declined winner cannot take it back',
  public.decide_giveaway_winner(pg_temp.gid(),
    (select id from public.giveaway_people where user_id = '0b000000-0000-0000-0000-000000000003'), 'accepted')->>'reason'
    = 'somebody has already been drawn in their place');
select pg_temp.check('the record has it all',
  (select jsonb_agg(x.e->>'action' order by x.n) from jsonb_array_elements(
     public.giveaway_detail(pg_temp.gid())->'log') with ordinality as x(e, n))
   = '["created", "judge added", "judge added", "entered", "answers changed", "entered", "entered", "entered", "entered",
       "judging started", "ranked", "ranked", "announced", "declined", "offered"]'::jsonb);

-- Leave nothing behind but the log.
select pg_temp.as_('');
delete from public.giveaways where id = pg_temp.gid();
delete from public.giveaway_people where name in ('Ada Judged', 'Bea Judged', 'Cy Judged', 'Judge One', 'Dee Paper');

\echo '--- judged giveaway checks passed ---'
