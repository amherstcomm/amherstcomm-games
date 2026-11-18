// About and the FAQ: a page since the layout spec (November 2026), where it
// was a panel over the game.
import type { ReactNode } from 'react';
import PageWithRail from '@/PageWithRail';
import { SITE_NAME } from '@/brand';

export default function AboutPage({ report }: {
  /** the report-a-problem control, which knows which puzzle you came from */
  report: ReactNode;
}) {
  return (
    <PageWithRail section="About" title={`About ${SITE_NAME}`}>

      <div className="space-y-5 text-sm text-slate-300">
        <p>
          {SITE_NAME} is a word game site for Amherst Communications staff: a fresh
          puzzle every morning, practice boards whenever you want one, and
          interactive guides for the games you have not met before.
        </p>
        <p className="text-slate-400">
          It runs on our own server, reachable only from inside the company. It is
          for fun — play it, ignore it, or take the leaderboard far too seriously.
        </p>

        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            FAQ
          </h3>
          <div className="space-y-3 text-slate-400">
            <div>
              <p className="text-slate-300 font-medium">
                Are the daily puzzles the same as the NYT&apos;s?
              </p>
              <p>
                No — every daily here is ours, generated on our own server, so
                playing never spoils (or copies) anyone else&apos;s puzzle.
              </p>
            </div>
            <div>
              <p className="text-slate-300 font-medium">
                What do Easy, Hard and Extreme change?
              </p>
              <p>
                They&apos;re three separate puzzles each day, not one puzzle with a
                setting — each difficulty keeps its own progress, statistics,
                streaks and leaderboards, and you can play all three. What changes
                depends on the game: Guess, Scramble, Hive and Boxed draw their
                answers from progressively less common words; Squares and Weave
                grow their boards; Grid keeps its dice and widens what scores.
              </p>
            </div>
            <div>
              <p className="text-slate-300 font-medium">Which words count?</p>
              <p>
                Each difficulty is scored against its own word list — Easy is
                everyday English, Hard adds the less common words, Extreme takes
                nearly everything. What a puzzle <em>accepts</em> is deliberately
                one size more generous than the list its <em>answers</em> come
                from, so the answer is always something you might recognise while
                your long shots get the benefit of the doubt.
              </p>
            </div>
            <div>
              <p className="text-slate-300 font-medium">
                Why was my word rejected?
              </p>
              <p>
                The lists are built from open dictionaries (SCOWL and friends —
                see Legal for credits), lowercase letters only: no proper nouns,
                no hyphens or apostrophes, no accents. Nothing is checked against
                any publisher&apos;s list, so our Hive and the NYT&apos;s bee will
                disagree at the margins. If a real word is missing, report it —
                the lists do get amended.
              </p>
            </div>
            <div>
              <p className="text-slate-300 font-medium">
                Do you filter offensive words?
              </p>
              <p>
                From what we publish, yes: no puzzle will hand you a slur as its
                answer. From what you type, no — refusing to publish a word and
                refusing to accept one you played are different things, and only
                the first is ours to decide.
              </p>
            </div>
            <div>
              <p className="text-slate-300 font-medium">Do I need an account?</p>
              <p>
                You already have one. Reaching this site at all means signing in
                with your Amherst account, and the site signs you in again behind
                the scenes so your statistics <em>and</em> today&apos;s unfinished
                puzzles follow you between devices — start on a phone, finish on a
                laptop, and a daily you have already played won&apos;t come back as
                a fresh board somewhere else. There is no separate password to
                remember and nothing to create.
              </p>
            </div>
            <div>
              <p className="text-slate-300 font-medium">Where does my data live?</p>
              <p>
                On a server inside the company, and in your browser. The letters
                you type are checked where you type them and never leave your
                device — only the result does, once you finish. Your completed
                games sync to your account on the same internal server; nothing
                about how you play goes to anyone outside Amherst.
              </p>
            </div>
            <div>
              <p className="text-slate-300 font-medium">When do new dailies arrive?</p>
              <p>
                At 2:00&nbsp;a.m. Central, every day — the boards themselves are
                generated a fortnight ahead, so a new one is waiting the moment the
                date turns over.
              </p>
            </div>
            <div>
              <p className="text-slate-300 font-medium">
                How do I report something?
              </p>
              <p>
                {report}{' '}
                at the bottom of any page. It covers a puzzle with something offensive on
                it, a display name, a privacy concern, a broken page, and anything
                else. You don&apos;t need an account, and for a puzzle or a player
                there is nothing to copy out — we look the board or the name up
                ourselves, so all you need to say is what&apos;s wrong with it. A
                practice board is the exception: it was dealt in your browser and
                never published, so reporting one sends the board along with you.
              </p>
              <p className="mt-2">
                You get a reference back. Keep it and{' '}
                <a
                  href="/report"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  look it up any time
                </a>{' '}
                to see whether it&apos;s still open and what was decided. Leave an
                email address as well and we&apos;ll write to you when it&apos;s
                dealt with.
              </p>
              <p className="mt-2">
                That address is used for those two emails and nothing else. It
                isn&apos;t attached to the report anyone reads — not on the page
                where reports get handled, and not in the daily summary, which says
                only that somebody asked to be told — and it&apos;s deleted once the
                outcome has gone out. Nothing else about a reporter is stored at
                all: even the limits on how many reports we take are counted per
                reported thing rather than per person, so there is nothing to count
                you by.
              </p>
            </div>
            <div>
              <p className="text-slate-300 font-medium">
                I&apos;ve found a security problem.
              </p>
              <p>
                Please tell us rather than anywhere public — that publishes the
                hole to everyone before it is fixed. The report form above has a
                security option; it goes straight to the internal queue and gives
                you a reference you can check. Nothing about it leaves the company.
              </p>
            </div>
            <div>
              <p className="text-slate-300 font-medium">
                Found a bug, or have an idea?
              </p>
              <p>
                Use the report form above — <em>a problem with the site</em> or{' '}
                <em>something else</em>. It reaches the same queue, needs nothing
                installed, and you get a reference back.
              </p>
            </div>
          </div>
        </div>

        <p>
          The code is free and open-source, released under the{' '}
          <a
            href="https://github.com/rptetzloff/anagrimoire/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
          >
            MIT License
          </a>{' '}
          and lives on{' '}
          <a
            href="https://github.com/rptetzloff/anagrimoire"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
          >
            GitHub
          </a>
          .
        </p>

        <p>
          Also by me:{' '}
          <a
            href="https://wordlock.net"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
          >
            wordlock.net
          </a>
          , a password generator.
        </p>

        <p className="text-slate-500 text-xs">
          Vibe-coded with{' '}
          <a
            href="https://claude.com/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-300 underline underline-offset-2"
          >
            Claude
          </a>
          .
        </p>
      </div>
    </PageWithRail>
  );
}
