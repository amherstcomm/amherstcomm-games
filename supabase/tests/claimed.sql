-- The one report whose evidence the browser supplies.
--
-- Everything else about reporting rests on the server looking the thing up: a
-- puzzle report names a published board and the server fetches it, so nothing a
-- client says is trusted. A practice board is dealt in the page and never
-- published, so there is nothing to fetch — it is the single case where the
-- input the rest of this refuses is the only evidence there can be.
--
-- What is asserted here is that the two do not blur into each other: a claimed
-- row says it is claimed, a verified one still says verified, and the surfaces
-- that show a board to somebody deciding what to do about it carry the
-- difference.
\set ON_ERROR_STOP on

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

-- A published board, so the verified path has something to find, and so the
-- game-name check has a game to recognise.
insert into public.daily_puzzles (puzzle_date, env, game, payload)
values (current_date, 'prod', 'words',
        '{"date": "2026-10-08", "byDifficulty": {"easy": {"words": {"5": "c2hhcmVz"}}}}'::jsonb)
on conflict (puzzle_date, env, game) do update set payload = excluded.payload;

-- ---------------------------------------------------------------------------
-- What is refused
-- ---------------------------------------------------------------------------
-- The game has to be one this site has. Otherwise the subject is whatever
-- somebody typed, and the per-subject limit protects nothing.
select pg_temp.check('a game this site does not have is refused',
  (public.report_practice_puzzle('quidditch', '{"letters": "abc"}'::jsonb, 'x')->>'reason')
    = 'no such game');
select pg_temp.check('and a board that is not an object',
  (public.report_practice_puzzle('words', '"just a string"'::jsonb, 'x')->>'reason') = 'no board');
select pg_temp.check('and one too big to be a board',
  (public.report_practice_puzzle(
     'words',
     jsonb_build_object('padding', repeat('x', 9000)),
     'x')->>'reason') = 'that board is too big to send');

-- ---------------------------------------------------------------------------
-- What is filed
-- ---------------------------------------------------------------------------
select pg_temp.check('a practice board can be reported at all',
  (public.report_practice_puzzle('words',
     '{"letters": "sharse", "answer": "shares"}'::jsonb,
     'the rack spells something rude')->>'recorded') = 'true');

select pg_temp.check('and the row says the evidence was claimed, not read',
  (select trust from public.reports
   where reason = 'the rack spells something rude') = 'claimed');
select pg_temp.check('and it keeps the board the browser sent',
  (select evidence->'board'->>'answer' from public.reports
   where reason = 'the rack spells something rude') = 'shares');
select pg_temp.check('and says it was a practice board',
  (select evidence->>'practice' from public.reports
   where reason = 'the rack spells something rude') = 'true');

-- The ordinary path must not have moved: a report the server can verify is
-- still verified, and that is the default for every row that existed before
-- this column did.
select public.report_puzzle('words', current_date, 'easy', 'prod', 'a real board');
select pg_temp.check('while a daily board reported the usual way is verified',
  (select trust from public.reports where reason = 'a real board') = 'verified');

-- ---------------------------------------------------------------------------
-- Repeats
-- ---------------------------------------------------------------------------
-- The subject carries a hash of the board rather than just the game, so the
-- per-subject limit collapses the same board reported twice and still lets a
-- different board through. A per-game subject would silence the second
-- practice board anybody complained about that month.
select pg_temp.check('two different practice boards are two subjects',
  (select count(distinct subject) from public.reports where subject like 'practice:%') = 1);
select public.report_practice_puzzle('words', '{"letters": "other"}'::jsonb, 'another one');
select pg_temp.check('and a second board files under its own',
  (select count(distinct subject) from public.reports where subject like 'practice:%') = 2);
select pg_temp.check('while the same board again is the same subject',
  (select count(*) from public.reports
   where subject = (select subject from public.reports
                    where reason = 'the rack spells something rude')) = 1);

-- ---------------------------------------------------------------------------
-- What the surfaces show
-- ---------------------------------------------------------------------------
-- Both of them, because a claimed board and a verified one look identical once
-- printed and only one of them is evidence.
select pg_temp.check('the digest is told which is which',
  exists (select 1 from public.open_reports() where trust = 'claimed'));
-- An owner, because that page is only ever drawn for one. Its own user rather
-- than borrowing another test's: a suite where one file quietly depends on the
-- roles another granted is a suite that passes in one order and not another.
insert into auth.users (id, email)
values ('e9999999-9999-9999-9999-999999999999', 'claimed-owner@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('e9999999-9999-9999-9999-999999999999', 'games.admin')
on conflict do nothing;
set session "test.uid" = 'e9999999-9999-9999-9999-999999999999';
select pg_temp.check('and so is the page the owner reads',
  exists (select 1 from public.owner_reports() where trust = 'claimed'));

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
-- Anonymous, like every other report: somebody who has not signed in is
-- exactly who most needs to be able to say a board is offensive.
select pg_temp.check('anyone may file one',
  has_function_privilege('anon', 'public.report_practice_puzzle(text, jsonb, text, text)', 'execute')
  and has_function_privilege('authenticated',
        'public.report_practice_puzzle(text, jsonb, text, text)', 'execute'));

\echo '--- claimed report checks passed ---'
