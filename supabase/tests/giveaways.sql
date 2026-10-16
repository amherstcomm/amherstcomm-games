-- Giveaways: drawings for staff, kept and checkable.
--
-- What has to hold: only people allowed to run giveaways can, and that can be
-- handed to one person without a role; staff enter themselves and organisers
-- enter anyone, typed names included; past attendance lowers the odds, recent
-- by more; a drawing commits to its entrants, weights and a future drand round
-- before anybody can know the result, refuses a round early or a randomness
-- that is not the hash of its signature, and picks exactly what the browser
-- would pick; winners taking or declining it writes the history; and nothing
-- in the log or a drawing can be rewritten.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('0e000000-0000-0000-0000-000000000001', 'give.admin@example.com'),
  ('0e000000-0000-0000-0000-000000000002', 'give.helper@example.com'),
  ('0e000000-0000-0000-0000-000000000003', 'ada.give@example.com'),
  ('0e000000-0000-0000-0000-000000000004', 'bea.give@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('0e000000-0000-0000-0000-000000000001', 'games.admin')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('0e000000-0000-0000-0000-000000000003', 'Ada Give'),
  ('0e000000-0000-0000-0000-000000000004', 'Bea Give')
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
grant all on t to public;

-- ---------------------------------------------------------------------------
-- Who may run them
-- ---------------------------------------------------------------------------
select pg_temp.as_('0e000000-0000-0000-0000-000000000002');
select pg_temp.check('a player cannot set up a giveaway',
  public.save_giveaway(null, 'Brewers tickets', '2 seats', '', 1, current_date + 7, true, null, 1, 365)->>'reason'
    = 'not allowed');

select pg_temp.as_('0e000000-0000-0000-0000-000000000001');
select pg_temp.check('only the listed capabilities can be handed to one person',
  public.set_person_capability('0e000000-0000-0000-0000-000000000002', 'users.manage', true)->>'reason'
    = 'that cannot be handed to one person');
select pg_temp.check('an administrator can hand one person the running of giveaways',
  public.set_person_capability('0e000000-0000-0000-0000-000000000002', 'giveaways.manage', true)->>'ok' = 'true');
select pg_temp.check('and the people page lists them though they hold no role',
  exists (select 1 from jsonb_array_elements(public.people_with_roles()->'people') x
          where x->>'user' = '0e000000-0000-0000-0000-000000000002'
            and x->'grants' ? 'giveaways.manage' and x->>'role' is null));

select pg_temp.as_('0e000000-0000-0000-0000-000000000002');
select pg_temp.check('which is now something they can do',
  public.can('giveaways.manage') and 'giveaways.manage' = any (public.my_capabilities())
  and not public.can('users.manage') and not public.can('games.setup'));
insert into t select 'g', public.save_giveaway(null, 'Brewers tickets', '2 seats behind home plate', 'Game on the 24th',
  2, current_date + 7, true, null, 1, 365);
select pg_temp.check('so they can set one up',
  (select v->>'ok' from t where k = 'g') = 'true');

-- ---------------------------------------------------------------------------
-- Entering
-- ---------------------------------------------------------------------------
-- Somebody who went last month, typed in by hand: the history from before.
insert into t select 'cy', public.record_giveaway_attendance(null, null, 'Cy Nosignin', current_date - 30, 'Bucks game');
select pg_temp.as_('0e000000-0000-0000-0000-000000000003');
select pg_temp.check('a player cannot type in history',
  public.record_giveaway_attendance(null, null, 'Somebody', current_date, 'x')->>'reason' = 'not allowed');
select pg_temp.check('a player can enter themselves',
  public.enter_giveaway((select (v->>'id')::uuid from t where k = 'g'), true)->>'ok' = 'true');
select pg_temp.check('but not enter anybody else',
  public.add_giveaway_entrant((select (v->>'id')::uuid from t where k = 'g'), null, null, 'Someone')->>'reason'
    = 'not allowed');
select pg_temp.as_('0e000000-0000-0000-0000-000000000004');
select public.enter_giveaway((select (v->>'id')::uuid from t where k = 'g'), true);

select pg_temp.as_('0e000000-0000-0000-0000-000000000002');
select pg_temp.check('an organiser can enter somebody who has never signed in, by an earlier record',
  public.add_giveaway_entrant((select (v->>'id')::uuid from t where k = 'g'),
    (select (v->>'person')::uuid from t where k = 'cy'), null, null)->>'ok' = 'true');
select pg_temp.check('or by a name typed in',
  public.add_giveaway_entrant((select (v->>'id')::uuid from t where k = 'g'), null, null, 'Dee Typed')->>'ok' = 'true');
select pg_temp.check('and nobody is in twice',
  public.add_giveaway_entrant((select (v->>'id')::uuid from t where k = 'g'),
    (select (v->>'person')::uuid from t where k = 'cy'), null, null)->>'reason' = 'they are already in it');

-- ---------------------------------------------------------------------------
-- The odds
-- ---------------------------------------------------------------------------
select pg_temp.as_('0e000000-0000-0000-0000-000000000004');
insert into t select 'detail', public.giveaway_detail((select (v->>'id')::uuid from t where k = 'g'));
select pg_temp.check('everybody signed in sees every entrant and their odds',
  jsonb_array_length((select v->'entrants' from t where k = 'detail')) = 4);
select pg_temp.check('somebody who has never been has the full weight',
  (select (x->>'weight')::int from t, jsonb_array_elements(v->'entrants') x
   where k = 'detail' and x->>'name' = 'Ada Give') = 1000000);
-- A month ago, with a year's half-life: 0.5^(30/365) = 0.9446, so 1/(1 + 0.9446).
select pg_temp.check('a recent attendance about halves it',
  (select (x->>'weight')::int from t, jsonb_array_elements(v->'entrants') x
   where k = 'detail' and x->>'name' = 'Cy Nosignin') = 514239);
select pg_temp.check('and an old one barely touches it',
  public.giveaway_weight((select (v->>'person')::uuid from t where k = 'cy'), current_date + 1065, 1, 365)
    = round(1000000 / (1 + power(0.5::numeric, 3.0))));

-- ---------------------------------------------------------------------------
-- Drawing
-- ---------------------------------------------------------------------------
select pg_temp.check('a player cannot draw',
  public.commit_giveaway_draw((select (v->>'id')::uuid from t where k = 'g'))->>'reason' = 'not allowed');

select pg_temp.as_('0e000000-0000-0000-0000-000000000002');
insert into t select 'draw', public.commit_giveaway_draw((select (v->>'id')::uuid from t where k = 'g'));
select pg_temp.check('committing names a drand round about thirty seconds out',
  (select v->>'ok' from t where k = 'draw') = 'true'
  and (select (v->>'round_at')::timestamptz from t where k = 'draw') between now() + interval '26 seconds'
                                                                         and now() + interval '34 seconds');
select pg_temp.check('and fingerprints exactly who is in it at what weight',
  (select d.snapshot_hash = encode(sha256(convert_to(public.giveaway_snapshot_text(
            d.giveaway_id, d.seq, d.wanted, d.chain, d.round, d.entrants), 'UTF8')), 'hex')
          and jsonb_array_length(d.entrants) = 4 and d.wanted = 2
   from public.giveaway_draws d where d.id = (select (v->>'draw')::uuid from t where k = 'draw')));
select pg_temp.check('after which nobody can join or leave',
  public.add_giveaway_entrant((select (v->>'id')::uuid from t where k = 'g'), null, null, 'Late')->>'reason'
    = 'entries are closed: it has been drawn'
  and public.save_giveaway((select (v->>'id')::uuid from t where k = 'g'), 'x', '', '', 3, null, true, null, 1, 365)->>'reason'
    = 'a giveaway that has been drawn cannot be changed');
select pg_temp.check('nor a second drawing be started over it',
  public.commit_giveaway_draw((select (v->>'id')::uuid from t where k = 'g'))->>'reason'
    = 'a drawing is already waiting on its round');

-- drand round 1000 of quicknet, as published: randomness is sha256(signature).
select pg_temp.check('the round cannot be revealed before it happens',
  public.reveal_giveaway_draw((select (v->>'draw')::uuid from t where k = 'draw'),
    (select (v->>'round')::bigint from t where k = 'draw'),
    'fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd',
    'b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39')->>'reason'
    = 'that round has not happened yet');
select pg_temp.check('nor with a round it did not name',
  public.reveal_giveaway_draw((select (v->>'draw')::uuid from t where k = 'draw'), 1000,
    'fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd',
    'b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39')->>'reason'
    = 'that is not the round this drawing named');

select pg_sleep(greatest(0, extract(epoch from (select (v->>'round_at')::timestamptz from t where k = 'draw') - now())) + 0.5);

select pg_temp.check('nor with a randomness that is not its signature''s hash',
  public.reveal_giveaway_draw((select (v->>'draw')::uuid from t where k = 'draw'),
    (select (v->>'round')::bigint from t where k = 'draw'),
    repeat('0', 64),
    'b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39')->>'reason'
    = 'that randomness does not belong to that signature');
insert into t select 'reveal', public.reveal_giveaway_draw((select (v->>'draw')::uuid from t where k = 'draw'),
    (select (v->>'round')::bigint from t where k = 'draw'),
    'FE290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd',
    'b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39');
select pg_temp.check('once it has, it picks the winners the arithmetic says',
  (select v->>'ok' from t where k = 'reveal') = 'true'
  and (select v->'winners' from t where k = 'reveal')
      = (select public.giveaway_pick(d.entrants, d.snapshot_hash, d.randomness, d.wanted)
         from public.giveaway_draws d where d.id = (select (v->>'draw')::uuid from t where k = 'draw'))
  and jsonb_array_length((select v->'winners' from t where k = 'reveal')) = 2);
select pg_temp.check('and only once',
  public.reveal_giveaway_draw((select (v->>'draw')::uuid from t where k = 'draw'),
    (select (v->>'round')::bigint from t where k = 'draw'),
    'fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd',
    'b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39')->>'reason'
    = 'that drawing has been revealed');

-- The pick itself, pinned: the same inputs give the same winners in
-- tests/unit/giveaways.test.ts, which runs the browser's copy.
select pg_temp.check('the pick is the one the browser makes from the same inputs',
  (select jsonb_agg(x->>'name' order by (x->>'pick')::int) from jsonb_array_elements(public.giveaway_pick(
     '[{"person":"00000000-0000-0000-0000-00000000000c","name":"Cy","weight":250000},
       {"person":"00000000-0000-0000-0000-00000000000a","name":"Ada","weight":1000000},
       {"person":"00000000-0000-0000-0000-00000000000b","name":"Bea","weight":500000}]'::jsonb,
     repeat('ab', 32), 'fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd', 2)) x)
  = '["Ada", "Bea"]'::jsonb
  and (public.giveaway_pick(
     '[{"person":"00000000-0000-0000-0000-00000000000a","name":"Ada","weight":1000000},
       {"person":"00000000-0000-0000-0000-00000000000b","name":"Bea","weight":500000},
       {"person":"00000000-0000-0000-0000-00000000000c","name":"Cy","weight":250000}]'::jsonb,
     repeat('ab', 32), 'fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd', 2)->0->>'target')::bigint = 959526);

-- ---------------------------------------------------------------------------
-- Afterwards
-- ---------------------------------------------------------------------------
insert into t select 'first', (select v->'winners'->0 from t where k = 'reveal');
insert into t select 'second', (select v->'winners'->1 from t where k = 'reveal');
-- Separate statements: a check in the same statement as the change it checks
-- reads the database as it was before.
insert into t select 'accept', public.decide_giveaway_winner((select (v->>'id')::uuid from t where k = 'g'),
    (select (v->>'person')::uuid from t where k = 'first'), 'accepted');
select pg_temp.check('a winner who takes it has attended',
  (select v->>'ok' from t where k = 'accept') = 'true'
  and exists (select 1 from public.giveaway_attendance a
              where a.person_id = (select (v->>'person')::uuid from t where k = 'first')
                and a.source = 'giveaway' and a.attended_on = current_date + 7));
select pg_temp.check('a winner who declines makes room for another drawing',
  public.decide_giveaway_winner((select (v->>'id')::uuid from t where k = 'g'),
    (select (v->>'person')::uuid from t where k = 'second'), 'declined')->>'ok' = 'true');
insert into t select 'redraw', public.commit_giveaway_draw((select (v->>'id')::uuid from t where k = 'g'));
select pg_temp.check('which draws one, from the two never drawn',
  (select d.wanted = 1 and jsonb_array_length(d.entrants) = 2 and d.seq = 2 and d.reason like 'drawing again: % declined'
   from public.giveaway_draws d where d.id = (select (v->>'draw')::uuid from t where k = 'redraw')));
select pg_temp.check('and the declined winner cannot take the place back',
  public.decide_giveaway_winner((select (v->>'id')::uuid from t where k = 'g'),
    (select (v->>'person')::uuid from t where k = 'second'), 'accepted')->>'reason'
    = 'somebody has already been drawn in their place');
select pg_temp.check('a history typed in can be deleted, one from a giveaway cannot',
  public.delete_giveaway_attendance((select a.id from public.giveaway_attendance a
     where a.person_id = (select (v->>'person')::uuid from t where k = 'first') and a.source = 'giveaway'))->>'reason'
     = 'that came from a giveaway: change the winner there');

-- ---------------------------------------------------------------------------
-- Nothing taken back
-- ---------------------------------------------------------------------------
do $$ begin
  update public.giveaway_log set action = 'nothing happened'
   where giveaway_id = (select (v->>'id')::uuid from t where k = 'g');
  raise exception 'the log was rewritten';
exception when others then
  if sqlerrm = 'the log was rewritten' then raise; end if;
end $$;
do $$ begin
  update public.giveaway_draws set entrants = '[]'::jsonb
   where id = (select (v->>'draw')::uuid from t where k = 'draw');
  raise exception 'a drawing was rewritten';
exception when others then
  if sqlerrm = 'a drawing was rewritten' then raise; end if;
end $$;
select pg_temp.check('the log and the drawings cannot be rewritten', true);
select pg_temp.check('and the log has every step, for everybody to read',
  (select jsonb_agg(x.e->>'action' order by x.n) from jsonb_array_elements(
     public.giveaway_detail((select (v->>'id')::uuid from t where k = 'g'))->'log') with ordinality as x(e, n))
   = '["created", "entered", "entered", "entered", "entered", "committed", "revealed", "accepted", "declined", "committed"]'::jsonb);

-- A typed name joined to the account its owner signs in with later, when
-- they had meanwhile entered themselves too: one person, both histories.
select pg_temp.as_('0e000000-0000-0000-0000-000000000002');
insert into t select 'h', public.save_giveaway(null, 'Bucks tickets', '', '', 1, null, true, null, 1, 365);
select pg_temp.as_('0e000000-0000-0000-0000-000000000004');
select public.enter_giveaway((select (v->>'id')::uuid from t where k = 'h'), true);
select pg_temp.as_('0e000000-0000-0000-0000-000000000002');
insert into t select 'join', public.update_giveaway_person((select (v->>'person')::uuid from t where k = 'cy'), null,
    '0e000000-0000-0000-0000-000000000004');
select pg_temp.check('a typed name joined to an account becomes one person with both histories',
  (select v->>'ok' from t where k = 'join') = 'true'
  and (select count(*) from public.giveaway_people where user_id = '0e000000-0000-0000-0000-000000000004') = 1
  and (select user_id from public.giveaway_people where id = (select (v->>'person')::uuid from t where k = 'cy'))
      = '0e000000-0000-0000-0000-000000000004'
  and exists (select 1 from public.giveaway_entries e
              where e.person_id = (select (v->>'person')::uuid from t where k = 'cy')
                and e.giveaway_id = (select (v->>'id')::uuid from t where k = 'h'))
  and exists (select 1 from public.giveaway_attendance a
              where a.person_id = (select (v->>'person')::uuid from t where k = 'cy') and a.what = 'Bucks game'));

-- Leave nothing behind but the log, which cannot be removed by design.
select pg_temp.as_('');
delete from public.giveaways where id in (select (v->>'id')::uuid from t where k in ('g', 'h'));
delete from public.giveaway_people where name in ('Dee Typed', 'Cy Nosignin', 'Ada Give', 'Bea Give');
delete from public.capability_grants where user_id = '0e000000-0000-0000-0000-000000000002';

\echo '--- giveaway checks passed ---'
