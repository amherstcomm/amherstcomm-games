-- Trivia for extra chances in a giveaway.
--
-- What has to hold: a drawn giveaway can link trivia sessions and say what a
-- point is worth; each point an entrant scores there multiplies their ticket
-- -- one plus the bonus per point -- in the page's odds and in the drawing
-- itself; somebody with no account scores nothing; a judged giveaway has no
-- drawing to link trivia to; the link is fixed once drawn; and the sessions
-- of a giveaway still taking part are named, so a tournament's lock lets them in.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('09000000-0000-0000-0000-000000000001', 'trivia.organiser@example.com'),
  ('09000000-0000-0000-0000-000000000002', 'ada.trivia@example.com'),
  ('09000000-0000-0000-0000-000000000003', 'bea.trivia@example.com'),
  ('09000000-0000-0000-0000-000000000004', 'dee.trivia@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('09000000-0000-0000-0000-000000000001', 'games.admin')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('09000000-0000-0000-0000-000000000002', 'Ada Trivia'),
  ('09000000-0000-0000-0000-000000000003', 'Bea Trivia')
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
create or replace function pg_temp.weight(who text) returns int
language sql as $$
  select (x->>'weight')::int from jsonb_array_elements(public.giveaway_detail(pg_temp.gid())->'entrants') x
  where x->>'name' = who
$$;

-- A closed session of two questions, scored: Ada both right, Bea one.
insert into public.sessions (id, title, host, state, mode)
values ('09000000-0000-0000-0000-0000000000a1', 'Giveaway Trivia', '09000000-0000-0000-0000-000000000001', 'closed', 'live')
on conflict (id) do nothing;
insert into public.items (id, session_id, position, kind, prompt, state, opened_at) values
  ('09000000-0000-0000-0000-0000000000b1', '09000000-0000-0000-0000-0000000000a1', 1, 'choice', 'Who owns this company?', 'revealed', now() - interval '5 minutes'),
  ('09000000-0000-0000-0000-0000000000b2', '09000000-0000-0000-0000-0000000000a1', 2, 'choice', 'What year did the ESOP start?', 'revealed', now() - interval '4 minutes')
on conflict (id) do nothing;
insert into public.item_answers (item_id, answer) values
  ('09000000-0000-0000-0000-0000000000b1', '{"correct": ["us"]}'::jsonb),
  ('09000000-0000-0000-0000-0000000000b2', '{"correct": ["1998"]}'::jsonb)
on conflict (item_id) do update set answer = excluded.answer;
insert into public.responses (item_id, user_id, value, submitted_at) values
  ('09000000-0000-0000-0000-0000000000b1', '09000000-0000-0000-0000-000000000002', '"us"'::jsonb, now() - interval '4 minutes 50 seconds'),
  ('09000000-0000-0000-0000-0000000000b2', '09000000-0000-0000-0000-000000000002', '"1998"'::jsonb, now() - interval '3 minutes 50 seconds'),
  ('09000000-0000-0000-0000-0000000000b1', '09000000-0000-0000-0000-000000000003', '"us"'::jsonb, now() - interval '4 minutes 40 seconds'),
  ('09000000-0000-0000-0000-0000000000b2', '09000000-0000-0000-0000-000000000003', '"2011"'::jsonb, now() - interval '3 minutes 40 seconds')
on conflict do nothing;

select pg_temp.as_('09000000-0000-0000-0000-000000000001');
insert into t select 'g', public.save_giveaway(null, 'Bucks tickets', '2 seats', '', 1, current_date + 9, true, null, 1, 365);
insert into t select 'judged', public.save_giveaway(null, 'Judged one', '', '', 1, null, true, null, 1, 365,
  'judged', 3, '["Why?"]'::jsonb);
select pg_temp.check('a judged giveaway has no drawing for trivia to add chances in',
  public.set_giveaway_trivia((select (v->>'id')::uuid from t where k = 'judged'),
    array['09000000-0000-0000-0000-0000000000a1']::uuid[], 1)->>'reason'
    = 'a judged giveaway has no drawing for trivia to add chances in');
insert into public.sessions (id, title, host, state, mode)
values ('09000000-0000-0000-0000-0000000000a2', 'Trivia Still Being Written', '09000000-0000-0000-0000-000000000001', 'draft', 'open')
on conflict (id) do nothing;
select pg_temp.check('the organiser can choose from the sessions there are, drafts included',
  exists (select 1 from jsonb_array_elements(public.giveaway_trivia_choices()->'sessions') x
          where x->>'title' = 'Giveaway Trivia')
  and exists (select 1 from jsonb_array_elements(public.giveaway_trivia_choices()->'sessions') x
              where x->>'title' = 'Trivia Still Being Written' and x->>'state' = 'draft'));
select pg_temp.check('a drawing can link a session, each point worth one extra ticket',
  public.set_giveaway_trivia(pg_temp.gid(), array['09000000-0000-0000-0000-0000000000a1']::uuid[], 1)->>'ok' = 'true');

select pg_temp.as_('09000000-0000-0000-0000-000000000002');
select public.enter_giveaway(pg_temp.gid(), true);
select pg_temp.as_('09000000-0000-0000-0000-000000000003');
select public.enter_giveaway(pg_temp.gid(), true);
select pg_temp.as_('09000000-0000-0000-0000-000000000001');
select public.add_giveaway_entrant(pg_temp.gid(), null, null, 'Cy Paper');

-- ---------------------------------------------------------------------------
-- The giveaway's trivia is its entrants' alone
-- ---------------------------------------------------------------------------
insert into public.sessions (id, title, host, state, mode, code)
values ('09000000-0000-0000-0000-0000000000a4', 'Entrants Trivia', '09000000-0000-0000-0000-000000000001', 'live', 'open', 'GVTRIV')
on conflict (id) do nothing;
insert into public.items (id, session_id, position, kind, prompt, state, opened_at) values
  ('09000000-0000-0000-0000-0000000000b4', '09000000-0000-0000-0000-0000000000a4', 1, 'choice', 'Who owns this company?', 'open', now())
on conflict (id) do nothing;
insert into public.item_answers (item_id, answer) values ('09000000-0000-0000-0000-0000000000b4', '{"correct": ["us"]}'::jsonb)
on conflict (item_id) do nothing;
select public.set_giveaway_trivia(pg_temp.gid(), array['09000000-0000-0000-0000-0000000000a1',
                                                       '09000000-0000-0000-0000-0000000000a4']::uuid[], 1);

select pg_temp.as_('09000000-0000-0000-0000-000000000004');
select pg_temp.check('a giveaway''s trivia is on nobody''s list of sessions',
  not exists (select 1 from jsonb_array_elements(public.live_sessions()) x where x->>'title' = 'Entrants Trivia'));
select pg_temp.check('somebody not entered is told to enter the giveaway, and where',
  public.current_item('09000000-0000-0000-0000-0000000000a4')->>'state' = 'giveaway-only'
  and (public.current_item('09000000-0000-0000-0000-0000000000a4')->>'giveaway')::uuid = pg_temp.gid());
select pg_temp.check('cannot answer it',
  public.answer_item('09000000-0000-0000-0000-0000000000b4', '"us"'::jsonb)->>'reason'
    = 'this trivia is for the giveaway''s entrants: enter the giveaway first');
select pg_temp.check('nor get in with its code',
  public.session_by_code('gvtriv')->>'ok' = 'false');

select pg_temp.as_('09000000-0000-0000-0000-000000000002');
select pg_temp.check('while an entrant is served its question, and in by its code',
  public.current_item('09000000-0000-0000-0000-0000000000a4')->>'state' = 'open'
  and public.session_by_code('gvtriv')->>'ok' = 'true');

select pg_temp.as_('09000000-0000-0000-0000-000000000001');
select public.set_giveaway_trivia(pg_temp.gid(), array['09000000-0000-0000-0000-0000000000a1']::uuid[], 1);
select pg_temp.check('and once unlinked, it is anybody''s session again',
  exists (select 1 from jsonb_array_elements(public.live_sessions()) x where x->>'title' = 'Entrants Trivia'));

select pg_temp.check('two points is three times the ticket, one point twice, none once',
  pg_temp.weight('Ada Trivia') = 3000000 and pg_temp.weight('Bea Trivia') = 2000000
  and pg_temp.weight('Cy Paper') = 1000000);
select pg_temp.check('and the page says how many points each scored',
  (select jsonb_object_agg(x->>'name', (x->>'trivia')::numeric)
   from jsonb_array_elements(public.giveaway_detail(pg_temp.gid())->'entrants') x)
    = '{"Ada Trivia": 2, "Bea Trivia": 1, "Cy Paper": 0}'::jsonb);
-- An on-your-own-time session whose opening time has passed is open, though
-- the table still says draft until somebody visits it.
insert into public.sessions (id, title, host, state, mode, opens_at)
values ('09000000-0000-0000-0000-0000000000a3', 'Scheduled Trivia', '09000000-0000-0000-0000-000000000001',
        'draft', 'open', now() - interval '1 hour')
on conflict (id) do nothing;
select public.set_giveaway_trivia(pg_temp.gid(), array['09000000-0000-0000-0000-0000000000a1',
                                                       '09000000-0000-0000-0000-0000000000a3']::uuid[], 1);
select pg_temp.check('a scheduled session past its opening time reads as open, as its own page has it',
  (select x->>'state' from jsonb_array_elements(public.giveaway_detail(pg_temp.gid())->'giveaway'->'sessions') x
   where x->>'title' = 'Scheduled Trivia') = 'live'
  and (select x->>'state' from jsonb_array_elements(public.giveaway_trivia_choices()->'sessions') x
       where x->>'title' = 'Scheduled Trivia') = 'live');
select public.set_giveaway_trivia(pg_temp.gid(), array['09000000-0000-0000-0000-0000000000a1']::uuid[], 1);
-- Each reader sees their own progress through the trivia, for the checklist.
select pg_temp.as_('09000000-0000-0000-0000-000000000002');
select pg_temp.check('a reader sees how far through the trivia they are, and what they scored',
  (public.giveaway_detail(pg_temp.gid())->'giveaway'->'sessions'->0->'mine')
    = '{"total": 2, "done": 2, "points": 2}'::jsonb);
select pg_temp.as_('09000000-0000-0000-0000-000000000004');
select pg_temp.check('and somebody who has not played it sees none of it done',
  (public.giveaway_detail(pg_temp.gid())->'giveaway'->'sessions'->0->'mine')
    = '{"total": 2, "done": 0, "points": 0}'::jsonb);
select pg_temp.as_('09000000-0000-0000-0000-000000000001');
select pg_temp.check('the giveaway names its sessions',
  (public.giveaway_detail(pg_temp.gid())->'giveaway'->'sessions'->0->>'title') = 'Giveaway Trivia');
select pg_temp.check('a session of a giveaway still taking part is let through a tournament''s lock',
  '09000000-0000-0000-0000-0000000000a1'::uuid = any (public.giveaway_trivia_sessions()));

-- Half a ticket a point: Ada 1 + 0.5 x 2 = 2.
select public.set_giveaway_trivia(pg_temp.gid(), array['09000000-0000-0000-0000-0000000000a1']::uuid[], 0.5);
select pg_temp.check('the bonus is the organiser''s to set',
  pg_temp.weight('Ada Trivia') = 2000000 and pg_temp.weight('Bea Trivia') = 1500000);

insert into t select 'draw', public.commit_giveaway_draw(pg_temp.gid());
select pg_temp.check('the drawing freezes those weights, points and all',
  (select (x->>'weight')::int = 2000000 and (x->>'trivia')::numeric = 2
   from public.giveaway_draws d, jsonb_array_elements(d.entrants) x
   where d.id = (select (v->>'draw')::uuid from t where k = 'draw') and x->>'name' = 'Ada Trivia'));
select pg_temp.check('and after that the trivia cannot change',
  public.set_giveaway_trivia(pg_temp.gid(), '{}'::uuid[], 1)->>'reason' = 'it has been drawn: the trivia cannot change');

-- Leave nothing behind but the log.
select pg_temp.as_('');
delete from public.giveaways where id in (pg_temp.gid(), (select (v->>'id')::uuid from t where k = 'judged'));
delete from public.giveaway_people where name in ('Ada Trivia', 'Bea Trivia', 'Cy Paper');
delete from public.sessions where id in ('09000000-0000-0000-0000-0000000000a1', '09000000-0000-0000-0000-0000000000a2',
                                        '09000000-0000-0000-0000-0000000000a3', '09000000-0000-0000-0000-0000000000a4');

\echo '--- giveaway trivia checks passed ---'
