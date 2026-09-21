-- Contests: the entries half.
--
-- A contest is two windows -- entries, then voting -- and four decisions about
-- who enters and whose name is on what. What has to hold is the part a page
-- cannot hold for itself: entering is refused outside its window, a player
-- gets one entry and only their own, an organiser entering on everybody's
-- behalf is not held to that, voting cannot be scheduled while entering is
-- still open, and a blind contest is blind everywhere -- including for the
-- organiser reading the same view.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('d1111111-1111-1111-1111-111111111111', 'contest-organiser@example.com'),
  ('d2222222-2222-2222-2222-222222222222', 'carver.one@example.com'),
  ('d3333333-3333-3333-3333-333333333333', 'carver.two@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('d1111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

-- The contest as one person sees it, which is the only way to ask most of
-- these questions: everything a player can see comes back through this.
create or replace function pg_temp.seen(c uuid) returns jsonb
language sql as $$ select public.contest_view(c) $$;

set session "test.uid" = 'd1111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Setting one up
-- ---------------------------------------------------------------------------
select pg_temp.check('a contest needs a name',
  (public.save_contest(null, '   ', null, pg_temp.d(0), pg_temp.d(3),
                       pg_temp.d(4), pg_temp.d(7))->>'reason') = 'it needs a name');
select pg_temp.check('and each window has to end on or after it starts',
  (public.save_contest(null, 'Pumpkins', null, pg_temp.d(3), pg_temp.d(0),
                       pg_temp.d(4), pg_temp.d(7))->>'reason')
    = 'each part has to end on or after it starts');
-- The rule with a reason behind it: a ballot open while entries are still
-- arriving hands every early vote to whoever entered first.
select pg_temp.check('and voting cannot open before entering has finished',
  (public.save_contest(null, 'Pumpkins', null, pg_temp.d(0), pg_temp.d(5),
                       pg_temp.d(2), pg_temp.d(7))->>'reason')
    = 'voting starts once entering has finished, or the early entries collect every vote');
select pg_temp.check('and a voter ranks between one and five',
  (public.save_contest(null, 'Pumpkins', null, pg_temp.d(0), pg_temp.d(3),
                       pg_temp.d(4), pg_temp.d(7), 'players', true, false, 9)->>'reason')
    = 'a voter ranks between one and five');

create temp table pk as
  select (public.save_contest(null, 'Pumpkin carving', 'Carve one, photograph it.',
                              pg_temp.d(-1), pg_temp.d(2), pg_temp.d(3), pg_temp.d(6),
                              'players', true, false, 3, 'A day off')->>'id')::uuid id;
select pg_temp.check('a contest saves',
  (select count(*) from public.contests where id = (select id from pk)) = 1);
select pg_temp.check('and today it is taking entries',
  (select pg_temp.seen(id)->'contest'->>'phase' from pk) = 'entries');

-- Only an organiser sets one up. The page hides the tab; the refusal is what
-- makes that true rather than decorative.
set session "test.uid" = 'd2222222-2222-2222-2222-222222222222';
select pg_temp.check('a player cannot set one up',
  (public.save_contest(null, 'Mine', null, pg_temp.d(0), pg_temp.d(1),
                       pg_temp.d(2), pg_temp.d(3))->>'reason') = 'not allowed');
select pg_temp.check('nor delete one',
  (select (public.delete_contest(id)->>'reason') from pk) = 'not allowed'
  and (select count(*) from public.contests where id = (select id from pk)) = 1);
select pg_temp.check('nor read the organiser sheet',
  (public.contests_sheet()->>'reason') = 'not allowed');

-- ---------------------------------------------------------------------------
-- Entering
-- ---------------------------------------------------------------------------
create temp table e1 as
  select (public.save_contest_entry((select id from pk), null, 'Jack',
                                    'Carved with a butter knife.')->>'id')::uuid id;
select pg_temp.check('a player can enter',
  (select count(*) from public.contest_entries where id = (select id from e1)) = 1);
select pg_temp.check('and the entry is theirs',
  (select entrant from public.contest_entries where id = (select id from e1))
    = 'd2222222-2222-2222-2222-222222222222');
select pg_temp.check('an entry needs a title',
  (public.save_contest_entry((select id from pk), null, '  ', null)->>'reason')
    = 'it needs a title');

-- One each, or somebody files six pumpkins and the contest is a formality.
select pg_temp.check('and only one each',
  (public.save_contest_entry((select id from pk), null, 'Jack again', null)->>'reason')
    = 'you already have an entry in this one');

-- Saving again is a change rather than a second row, so the writing can be
-- fixed and the photo swapped until entering closes.
select public.save_contest_entry((select id from pk), (select id from e1), 'Jack the Ripper',
                                 'Fixed the nose.', 'd2222222-2222-2222-2222-222222222222/a.jpg');
select pg_temp.check('saving again changes the one entry',
  (select count(*) from public.contest_entries where contest_id = (select id from pk)) = 1
  and (select title from public.contest_entries where id = (select id from e1)) = 'Jack the Ripper');
select pg_temp.check('and the photo is remembered',
  (select image_path from public.contest_entries where id = (select id from e1))
    = 'd2222222-2222-2222-2222-222222222222/a.jpg');
-- The words can be fixed from a laptop without the photo being re-uploaded
-- from the phone that took it.
select public.save_contest_entry((select id from pk), (select id from e1), 'Jack the Ripper', 'Nose again');
select pg_temp.check('and a save with no photo keeps the one already there',
  (select image_path from public.contest_entries where id = (select id from e1))
    = 'd2222222-2222-2222-2222-222222222222/a.jpg');

-- A path has to be one this caller uploaded. The bucket is readable by
-- everybody signed in and the storage policy only governs writing, so without
-- this an entry could name a path out of somebody else's folder and show their
-- photograph as its own -- no upload, no policy broken, just a string sent to
-- the function by hand.
select pg_temp.check('a photo from another folder is refused',
  (public.save_contest_entry((select id from pk), (select id from e1), 'Jack the Ripper', null,
                             'd3333333-3333-3333-3333-333333333333/stolen.jpg')->>'reason')
    = 'that photo is not one you uploaded');
select pg_temp.check('and the entry keeps the photo it had',
  (select image_path from public.contest_entries where id = (select id from e1))
    = 'd2222222-2222-2222-2222-222222222222/a.jpg');
select pg_temp.check('a path in no folder at all is refused too',
  (public.save_contest_entry((select id from pk), (select id from e1), 'Jack the Ripper', null,
                             'loose.jpg')->>'reason') = 'that photo is not one you uploaded');

set session "test.uid" = 'd3333333-3333-3333-3333-333333333333';
select pg_temp.check('somebody else cannot change it',
  (public.save_contest_entry((select id from pk), (select id from e1), 'Mine now', null)->>'reason')
    = 'that is not yours to change');
select pg_temp.check('nor take it out',
  (public.delete_contest_entry((select id from e1))->>'reason') = 'that is not yours to remove'
  and (select count(*) from public.contest_entries where id = (select id from e1)) = 1);

create temp table e2 as
  select (public.save_contest_entry((select id from pk), null, 'Gourdon', null)->>'id')::uuid id;
select pg_temp.check('a second player enters their own',
  (select count(*) from public.contest_entries where contest_id = (select id from pk)) = 2);

-- ---------------------------------------------------------------------------
-- What each person sees
-- ---------------------------------------------------------------------------
select pg_temp.check('the view carries both entries',
  (select jsonb_array_length(pg_temp.seen(id)->'entries') from pk) = 2);
select pg_temp.check('and marks the one that is yours',
  (select count(*) from pk, jsonb_array_elements(pg_temp.seen(id)->'entries') x
   where (x->>'mine')::boolean) = 1);
select pg_temp.check('and names the entrants while the contest says to',
  (select x->>'entrant' from pk, jsonb_array_elements(pg_temp.seen(id)->'entries') x
   where x->>'title' = 'Jack the Ripper') = 'Carver One');

-- Blind means blind. The organiser reads the same function as everybody, so
-- there is no screen where the names come back.
set session "test.uid" = 'd1111111-1111-1111-1111-111111111111';
select public.save_contest((select id from pk), 'Pumpkin carving', null,
                           pg_temp.d(-1), pg_temp.d(2), pg_temp.d(3), pg_temp.d(6),
                           'players', false, false, 3, null);
select pg_temp.check('a blind contest names nobody, the organiser included',
  (select count(*) from pk, jsonb_array_elements(pg_temp.seen(id)->'entries') x
   where x->>'entrant' is not null) = 0);
select pg_temp.check('and the entries are still all there',
  (select jsonb_array_length(pg_temp.seen(id)->'entries') from pk) = 2);
select public.save_contest((select id from pk), 'Pumpkin carving', null,
                           pg_temp.d(-1), pg_temp.d(2), pg_temp.d(3), pg_temp.d(6),
                           'players', true, false, 3, null);

-- ---------------------------------------------------------------------------
-- The windows
-- ---------------------------------------------------------------------------
-- A contest that has not opened yet: the dates decide, not the page.
create temp table later as
  select (public.save_contest(null, 'Chili', null, pg_temp.d(10), pg_temp.d(12),
                              pg_temp.d(13), pg_temp.d(15))->>'id')::uuid id;
-- A save that was refused returns no id, and every check below would then be
-- asking about a contest that is not there -- which is a pass for the wrong
-- reason. So: say out loud that both of these exist.
select pg_temp.check('the two contests for the window checks were set up',
  (select id from later) is not null);
set session "test.uid" = 'd2222222-2222-2222-2222-222222222222';
select pg_temp.check('a contest that has not opened is not enterable',
  (select pg_temp.seen(id)->'contest'->>'phase' from later) = 'soon'
  and (select (pg_temp.seen(id)->'contest'->>'may_enter')::boolean from later) = false);
select pg_temp.check('and entering it is refused',
  (public.save_contest_entry((select id from later), null, 'Early', null)->>'reason')
    = 'this one has not opened for entries yet');

-- And one whose entry window has already closed: the field is fixed and
-- nobody can add to it. Set up as the organiser -- only they can -- and then
-- asked about as a player.
set session "test.uid" = 'd1111111-1111-1111-1111-111111111111';
create temp table shut as
  select (public.save_contest(null, 'Desks', null, pg_temp.d(-9), pg_temp.d(-5),
                              pg_temp.d(-2), pg_temp.d(4))->>'id')::uuid id;
set session "test.uid" = 'd2222222-2222-2222-2222-222222222222';
select pg_temp.check('a contest past its entry window is closed to entries',
  (select id from shut) is not null
  and (select pg_temp.seen(id)->'contest'->>'phase' from shut) = 'voting'
  and (public.save_contest_entry((select id from shut), null, 'Late', null)->>'reason')
    = 'entries have closed for this one');

-- An organiser can still put something right after the window: a photo that
-- arrived by email on the last evening is the ordinary case, and the rule
-- exists to stop players adding, not to stop the contest being run.
set session "test.uid" = 'd1111111-1111-1111-1111-111111111111';
select pg_temp.check('an organiser can still enter one after the window',
  (public.save_contest_entry((select id from shut), null, 'Arrived by email', null)->>'ok') = 'true');

-- The unchanged-path branch, which is why the rule compares against what is
-- already stored rather than refusing every foreign path outright: an
-- organiser fixing the spelling on somebody else's entry sends back the photo
-- that entry already has, out of a folder that is not theirs.
set session "test.uid" = 'd1111111-1111-1111-1111-111111111111';
select pg_temp.check('an organiser can edit an entry without re-uploading its photo',
  (public.save_contest_entry((select id from pk), (select id from e1), 'Jack the Ripper II', null,
                             'd2222222-2222-2222-2222-222222222222/a.jpg')->>'ok') = 'true');

-- ---------------------------------------------------------------------------
-- The organiser entering on everybody's behalf
-- ---------------------------------------------------------------------------
create temp table onbehalf as
  select (public.save_contest(null, 'Bake off', null, pg_temp.d(-1), pg_temp.d(2),
                              pg_temp.d(3), pg_temp.d(6), 'admins')->>'id')::uuid id;
-- Each save is its own statement: a count in the same statement as the insert
-- reads the statement's snapshot and cannot see the row that statement just
-- wrote, which reads as a failure that is really a question asked too early.
create temp table onbehalf_saves as
  select (public.save_contest_entry((select id from onbehalf), null, 'Sponge', null, null,
                                    'd2222222-2222-2222-2222-222222222222')->>'ok') a;
insert into onbehalf_saves
  select (public.save_contest_entry((select id from onbehalf), null, 'Tart', null, null,
                                    'd3333333-3333-3333-3333-333333333333')->>'ok');
select pg_temp.check('an organiser enters several, one per person',
  (select count(*) from onbehalf_saves where a = 'true') = 2
  and (select count(*) from public.contest_entries where contest_id = (select id from onbehalf)) = 2);
select pg_temp.check('and the entries belong to the people, not to the organiser',
  (select count(*) from public.contest_entries
   where contest_id = (select id from onbehalf)
     and entrant = 'd1111111-1111-1111-1111-111111111111') = 0);

set session "test.uid" = 'd2222222-2222-2222-2222-222222222222';
select pg_temp.check('a player cannot enter one an organiser runs',
  (public.save_contest_entry((select id from onbehalf), null, 'Mine', null)->>'reason')
    = 'an organiser enters this one on your behalf');
-- Nor change the one entered for them. The mode says who writes, and it says
-- it once: an organiser curating a field of entries that arrived by email
-- should not find one of them quietly rewritten afterwards. A correction goes
-- through the organiser, the same way the entry did.
select pg_temp.check('nor change the one entered for them',
  (public.save_contest_entry((select id from onbehalf),
     (select id from public.contest_entries
      where contest_id = (select id from onbehalf)
        and entrant = 'd2222222-2222-2222-2222-222222222222'),
     'Victoria sponge', null)->>'reason')
    = 'an organiser enters this one on your behalf');

-- ---------------------------------------------------------------------------
-- The lists
-- ---------------------------------------------------------------------------
select pg_temp.check('the running list leaves out the one that has not opened',
  (select count(*) from jsonb_array_elements(public.contests_on()) x
   where (x->>'id')::uuid = (select id from later)) = 0
  and (select count(*) from jsonb_array_elements(public.contests_on()) x
   where (x->>'id')::uuid = (select id from pk)) = 1);
select pg_temp.check('and counts the entries',
  (select (x->>'entries')::int from jsonb_array_elements(public.contests_on()) x
   where (x->>'id')::uuid = (select id from pk)) = 2);

set session "test.uid" = 'd1111111-1111-1111-1111-111111111111';
select pg_temp.check('the organiser sheet carries every contest, running or not',
  (select count(*) from jsonb_array_elements(public.contests_sheet()->'contests') x
   where (x->>'id')::uuid in ((select id from pk), (select id from later), (select id from shut))) = 3);

-- ---------------------------------------------------------------------------
-- Taking things out
-- ---------------------------------------------------------------------------
-- Each removal is its own statement before it is counted, for the snapshot
-- reason above: a count beside the delete that caused it reads the row as
-- still there.
set session "test.uid" = 'd3333333-3333-3333-3333-333333333333';
create temp table gone as select public.delete_contest_entry((select id from e2)) j;
select pg_temp.check('a player takes their own out while entering is open',
  (select j->>'ok' from gone) = 'true'
  and (select count(*) from public.contest_entries where id = (select id from e2)) = 0);

set session "test.uid" = 'd1111111-1111-1111-1111-111111111111';
select pg_temp.check('an organiser can take any of them out',
  (public.delete_contest_entry((select id from e1))->>'ok') = 'true');
-- Deleting the contest takes its entries with it: nothing is left pointing at
-- a contest that is gone.
create temp table dropped as select public.delete_contest((select id from onbehalf)) j;
select pg_temp.check('and deleting a contest takes its entries',
  (select j->>'ok' from dropped) = 'true'
  and (select count(*) from public.contest_entries where contest_id = (select id from onbehalf)) = 0);

-- Leave nothing behind: these dates overlap what later files set up.
delete from public.contests
 where id in ((select id from pk), (select id from later), (select id from shut));

\echo '--- contest checks passed ---'
