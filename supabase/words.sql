-- The word list, server-side.
--
-- This is not the dictionary the solvers use. Those stay bundled in the
-- browser, which is what makes "nothing you type into a solver leaves your
-- device" true. This table exists so the server can do two things the client
-- can't be trusted to: generate puzzles per difficulty, and check that a
-- submitted result contains real words.
--
-- Build the CSV with `npm run build-words`, then load it (it is gitignored —
-- derived, and 8MB):
--
--   psql "$DATABASE_URL" -c "\copy public.words from 'scripts/words.csv' with (format csv, header)"
--
-- or use Supabase's table import. Safe to re-run: truncate first.

create table if not exists public.words (
  word   text primary key,
  len    smallint not null,
  -- letters sorted. Anagram and subset questions — which is most of Hive,
  -- Boxed, Scramble and Squares — become an index hit rather than a scan.
  sorted text not null,
  -- The SCOWL size the word enters at: 10 is the most common, 70 the largest
  -- list, null means it only appears in the large word list and so is
  -- extreme-only. Stored rather than a difficulty because generation and
  -- validation use different bands — a level-60 word is generatable only at
  -- extreme but accepted from hard, and one column can't say both.
  level  smallint,
  -- Part of speech from ESDB, pipe-separated because it's a set, not a value:
  -- run is n|v, blue is aj|n|v.
  pos    text,
  -- The headword this inflects from, where ESDB knows it. Only about a third
  -- of rows have one, so null means "not known to be an inflection" and never
  -- "not an inflection" — do not use its absence as proof.
  lemma  text
);

-- Generation picks by length within a band.
create index if not exists words_len_level_idx on public.words (len, level);
-- Anagram and subset lookups.
create index if not exists words_sorted_idx on public.words (sorted);
-- "is this word's stem also in the pool?", which is what replaces guessing at
-- plurals by looking for a trailing s.
create index if not exists words_lemma_idx on public.words (lemma) where lemma is not null;

-- Readable by anyone: it's a dictionary, and the same words already ship in
-- the browser bundle. Writable by nobody through the API — it's loaded out of
-- band and changes only when a word list does.
alter table public.words enable row level security;

drop policy if exists words_read on public.words;
create policy words_read on public.words for select to anon, authenticated using (true);

-- The difficulty bands, as views, so a band change is an edit here rather than
-- a re-seed. Generation sits one band below validation at every level: answers
-- should be recognisable at your difficulty, while what's accepted stays
-- generous.
--
--   easy     generates from level <= 35   accepts level <= 55
--   hard     generates from level <= 55   accepts level <= 70
--   extreme  generates from level <= 70   accepts level <= 80
-- Every row has a level: SCOWL is the whole list.
create or replace view public.words_easy_answers as
  select * from public.words where level <= 35;
create or replace view public.words_hard_answers as
  select * from public.words where level <= 55;
create or replace view public.words_extreme_answers as
  select * from public.words where level <= 70;

-- ---------------------------------------------------------------------------
-- Content columns and the blocklist (applied 2026-08-09 as migration
-- word_content_columns_and_blocklist).
--
--   flag     slur | strong | mild. A slur never scores and is never shown,
--            at any difficulty under any setting — acceptance is the level
--            cut MINUS slurs, and the client's published band files carry
--            the same flags from the same build. strong and mild score;
--            they exist so a player can choose not to be shown them.
--   domains  WordNet noun categories as a text[] (e.g. {animal,food}).
--            For themed generation someday, and for other projects reading
--            the shared word-list files. Sparse: inflections inherit their
--            lemma's domains where WordNet only knows the base form.
alter table public.words add column if not exists flag text
  check (flag in ('slur', 'strong', 'mild'));
alter table public.words add column if not exists domains text[];

-- What we won't PUBLISH as an answer, with the reason each word is here.
-- Deliberately a different thing from flag: this list can be generous
-- (LDNOOBW's breadth is fine when it only governs generation), while flag
-- must stay narrow because refusing a typed word is where Scunthorpe bites.
-- scope 'both' additionally keeps a word out of hand-written content.
-- Mirrors scripts/blocked-words.json; the rebuild workflow keeps them in
-- step. No web role reads it — it is the generator's business.
create table if not exists public.blocked_words (
  word text primary key,
  scope text not null check (scope in ('both', 'generation')),
  origin text not null
);
alter table public.blocked_words enable row level security;
revoke all on public.blocked_words from anon, authenticated;
