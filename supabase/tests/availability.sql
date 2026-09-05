-- What is switched on, and when.
--
-- The checks worth arguing with are about what "no row" means. No row is
-- available — that is what makes an empty table the ordinary state and a fresh
-- deployment complete — so switching something back on deletes rather than
-- stores, and the table stays a list of exceptions rather than a hundred rows
-- saying "as usual".
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('f1111111-1111-1111-1111-111111111111', 'avail-admin@example.com'),
  ('f2222222-2222-2222-2222-222222222222', 'avail-editor@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role) values
  ('f1111111-1111-1111-1111-111111111111', 'games.admin'),
  ('f2222222-2222-2222-2222-222222222222', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

/** Whether one feature is currently off. */
create or replace function pg_temp.off(f text) returns boolean
language sql as $$ select public.read_availability() ? f $$;

set session "test.uid" = 'f1111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Nothing set is everything on
-- ---------------------------------------------------------------------------
select pg_temp.check('with nothing set, nothing is unavailable',
  public.read_availability() = '[]'::jsonb);

-- ---------------------------------------------------------------------------
-- Switching one off
-- ---------------------------------------------------------------------------
select pg_temp.check('a game can be switched off',
  (public.set_feature_window('game:hive', false)->>'ok') = 'true');
select pg_temp.check('and it is off', pg_temp.off('game:hive'));
select pg_temp.check('while its neighbours are not', not pg_temp.off('game:guess'));

-- A difficulty and a way of playing, because "any game or mode" was the ask.
select public.set_feature_window('difficulty:extreme', false);
select public.set_feature_window('view:solve', false);
select pg_temp.check('a difficulty can go too', pg_temp.off('difficulty:extreme'));
select pg_temp.check('and a way of playing', pg_temp.off('view:solve'));

-- No row is available, so switching back on removes the row rather than
-- storing "on" — the table stays a list of exceptions.
select pg_temp.check('switching it back on is allowed',
  (public.set_feature_window('game:hive', true)->>'cleared')::boolean);
select pg_temp.check('and leaves nothing behind',
  not pg_temp.off('game:hive')
  and not exists (select 1 from public.feature_windows where feature = 'game:hive'));

-- ---------------------------------------------------------------------------
-- Windows
--
-- A game a week is a reason to come back, and a game not ready yet is better
-- hidden than explained.
-- ---------------------------------------------------------------------------
select public.set_feature_window('game:ladder', true, now() + interval '1 day', null);
select pg_temp.check('something that has not started yet is unavailable',
  pg_temp.off('game:ladder'));
select public.set_feature_window('game:ladder', true, now() - interval '1 hour', null);
select pg_temp.check('and available once its time comes', not pg_temp.off('game:ladder'));

select public.set_feature_window('game:bridge', true,
  now() - interval '2 hours', now() - interval '1 hour');
select pg_temp.check('something whose window has closed is unavailable',
  pg_temp.off('game:bridge'));
select public.set_feature_window('game:bridge', true,
  now() - interval '1 hour', now() + interval '1 hour');
select pg_temp.check('and available inside it', not pg_temp.off('game:bridge'));

-- Off is off, whatever the window says: the switch is the simple thing and it
-- should not need the dates cleared to work.
select public.set_feature_window('game:bridge', false,
  now() - interval '1 hour', now() + interval '1 hour');
select pg_temp.check('off beats a window that is open', pg_temp.off('game:bridge'));

select pg_temp.check('and a window cannot finish before it starts',
  (public.set_feature_window('game:grid', true,
     now() + interval '2 hours', now() + interval '1 hour')->>'reason')
    = 'it cannot finish before it starts');

-- ---------------------------------------------------------------------------
-- What may be switched
--
-- The vocabulary lives in the client — src/games.ts is the one list of what
-- exists — but a shape is checked here so a typo becomes a refusal rather than
-- a row nothing will ever read.
-- ---------------------------------------------------------------------------
select pg_temp.check('a made-up kind of thing is refused',
  (public.set_feature_window('sandwich:ham', false)->>'reason')
    = 'that is not something that can be switched');
select pg_temp.check('and so is nonsense in the name',
  (public.set_feature_window('game:Hive!', false)->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
set session "test.uid" = 'f2222222-2222-2222-2222-222222222222';
select pg_temp.check('an editor may not switch a game off',
  (public.set_feature_window('game:guess', false)->>'ok') = 'false');
select pg_temp.check('nor see the list of switches',
  (public.feature_windows_sheet()->>'ok') = 'false');

-- Everybody reads it, including before signing in: the menu renders for
-- somebody who has not, and a game that vanished on sign-in would be worse
-- than one never offered.
set session "test.uid" = '';
select pg_temp.check('while anyone at all may read what is off',
  public.read_availability() ? 'game:hive' = false);
select pg_temp.check('and anon is granted that and nothing else',
  has_function_privilege('anon', 'public.read_availability()', 'execute')
  and not has_function_privilege('anon',
        'public.set_feature_window(text, boolean, timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.feature_windows_sheet()', 'execute'));

set session "test.uid" = 'f1111111-1111-1111-1111-111111111111';
select pg_temp.check('the sheet lists what has been set, and only that',
  (select count(*) from jsonb_array_elements(public.feature_windows_sheet()->'features'))
    = (select count(*) from public.feature_windows));

\echo '--- availability checks passed ---'

-- ---------------------------------------------------------------------------
-- The things that are not games
--
-- A deployment may want the quiz and nothing else — every game off and sessions
-- alone is a real thing to run during an event — or the games and no quiz. So
-- there is a fourth kind, and the constraint that allows it is its own rather
-- than inline on the column: `create table if not exists` does nothing on a
-- database that already has the table, so an inline check could never have been
-- widened.
-- ---------------------------------------------------------------------------
set session "test.uid" = 'f1111111-1111-1111-1111-111111111111';
select pg_temp.check('sessions can be switched off like anything else',
  (public.set_feature_window('site:sessions', false)->>'ok') = 'true');
select pg_temp.check('and are then unavailable', pg_temp.off('site:sessions'));
select public.set_feature_window('site:sessions', true);

-- Switching everything off is allowed. It is not the interface's business to
-- decide that a deployment must offer at least one game.
select pg_temp.check('every game at once is allowed',
  (select bool_and((public.set_feature_window('game:' || g, false)->>'ok') = 'true')
   from unnest(array['guess','scramble','hive','grid','boxed',
                     'weave','squares','cryptogram','ladder','bridge']) as g));
select pg_temp.check('and then every one of them is off',
  (select count(*) from jsonb_array_elements_text(public.read_availability()) f
   where f like 'game:%') = 10);
