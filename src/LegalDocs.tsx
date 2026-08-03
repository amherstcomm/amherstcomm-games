// The privacy policy and terms, written to describe what the code actually
// does. If either drifts from the code, the code is the thing that's right and
// the document is the thing that's wrong — fix it here rather than softening
// the wording.

import type { ReactNode } from 'react';

export const LEGAL_UPDATED = '3 August 2026';
export const PRIVACY_EMAIL = 'privacy@anagrimoire.com';

function H({ children }: { children: ReactNode }) {
  return <h4 className="text-sm font-semibold text-slate-200 mt-5 mb-1.5">{children}</h4>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-slate-400 mb-2.5">{children}</p>;
}

function List({ children }: { children: ReactNode }) {
  return <ul className="text-slate-400 mb-2.5 space-y-1.5 list-disc list-outside pl-5">{children}</ul>;
}

function Mail() {
  return (
    <a
      href={`mailto:${PRIVACY_EMAIL}`}
      className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
    >
      {PRIVACY_EMAIL}
    </a>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
    >
      {children}
    </a>
  );
}

function Updated() {
  return <p className="text-xs text-slate-500 mb-4">Last updated {LEGAL_UPDATED}</p>;
}

export function PrivacyPolicy() {
  return (
    <div className="text-sm">
      <Updated />

      <P>
        Anagrimoire is an independent hobby project, not a company. This describes
        everything it does with data — there is no longer version.
      </P>

      <div className="rounded-xl bg-white/5 border border-white/10 p-4 my-4">
        <p className="text-slate-300">
          <strong className="font-semibold">The short version.</strong> The letters
          you type never leave your device. You can use every game and every solver
          without an account. If you make one, we store your email address and your
          game results — scores and times, never the words you found.
        </p>
      </div>

      <H>What never leaves your device</H>
      <P>
        Every solver and every game runs entirely in your browser. The dictionaries
        are downloaded to your device and searched there, so nothing you type is
        sent anywhere to be answered.
      </P>
      <P>
        <strong className="text-slate-300">
          What you type into a solver never leaves your device — ever, account or
          not.
        </strong>{' '}
        That is the one we consider absolute: a solver query says what puzzle
        you&apos;re stuck on, and it is nobody&apos;s business but yours. Signing in
        does sync your progress on the daily games, which is described below.
      </P>
      <P>These things are kept in your browser&apos;s local storage:</P>
      <List>
        <li>Your boards in progress, and which puzzles you&apos;ve finished</li>
        <li>Your lifetime statistics</li>
        <li>Your display settings — theme, colour palette, text size, keyboard layout</li>
        <li>
          A random identifier for this browser, used once: if you later sign in, it
          lets us add this browser&apos;s existing statistics to your account exactly
          once instead of twice. It is not used to track you and is never shared.
        </li>
        <li>Your answer to the analytics question, where we ask it</li>
      </List>
      <P>
        Clearing this site&apos;s data in your browser erases all of it. If you have
        no account, that is genuinely everything we hold.
      </P>

      <H>What happens even without an account</H>
      <List>
        <li>
          <strong className="text-slate-300">Hosting.</strong> The site is served by{' '}
          <Ext href="https://render.com/privacy">Render</Ext>, which keeps ordinary
          server logs including IP addresses.
        </li>
        <li>
          <strong className="text-slate-300">Puzzle data.</strong> Daily puzzles and
          the practice pool are static files fetched from{' '}
          <Ext href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
            GitHub
          </Ext>
          , so GitHub sees the request and your IP address the way any web server
          would.
        </li>
        <li>
          <strong className="text-slate-300">Analytics</strong>, described below.
        </li>
      </List>

      <H>If you create an account</H>
      <P>
        Accounts are optional and exist only to sync your statistics between
        devices. You can sign in with GitHub, with Google, or with a code emailed to
        you. Authentication is handled by{' '}
        <Ext href="https://supabase.com/privacy">Supabase</Ext>, and sign-in emails
        are delivered by <Ext href="https://resend.com/legal/privacy-policy">Resend</Ext>.
      </P>
      <P>We receive and store:</P>
      <List>
        <li>Your email address, an account identifier, and sign-in timestamps</li>
        <li>
          Your display settings, so they follow you between devices
        </li>
        <li>
          For each practice game you finish: which game it was and the result —
          score, time taken, number of guesses, hints used, whether you solved it.
          Numbers only, never the words.
        </li>
        <li>
          For each daily puzzle: the board as you left it, which does include the
          words you&apos;ve found so far, plus the same result numbers. This is what
          makes a daily follow you between devices — you can start on a phone and
          finish on a laptop, and you can&apos;t accidentally play the same day
          twice. It is one row per puzzle, overwritten as you play, and the words in
          it are answers to a puzzle we publish openly.
        </li>
        <li>
          A one-time snapshot, per browser, of the statistics you had accumulated
          before signing in
        </li>
      </List>
      <P>
        We never see your password. Signing in with GitHub or Google tells us your
        email address and nothing else — not your repositories, contacts, or any
        other part of those accounts. The database enforces, at the row level, that
        an account can only ever read or write its own rows.
      </P>

      <H>Site-wide numbers</H>
      <P>
        Figures like &ldquo;today across all registered players&rdquo; are produced
        by a database function that returns only counts and averages. It cannot
        return anyone&apos;s individual rows, and no player is identifiable from its
        output. Only results from signed-in accounts are counted, because they are
        the only ones we have.
      </P>

      <H>Analytics</H>
      <P>
        We use Google Analytics to count visits and see which games get played. It
        records page views, an approximate location derived from your IP address,
        and basic device and browser information. It never receives your letters,
        boards, or results. Google&apos;s handling is covered by its own{' '}
        <Ext href="https://policies.google.com/privacy">privacy policy</Ext>, and
        data is retained for the period configured in our property.
      </P>
      <P>
        Where consent is required — the EEA, the UK and Switzerland — nothing loads
        until you agree, and declining is a single click that we remember.
        Elsewhere it loads by default. If your browser sends a{' '}
        <Ext href="https://globalprivacycontrol.org/">Global Privacy Control</Ext>{' '}
        signal we treat that as a no, everywhere, without asking. To change your
        answer later, clear this site&apos;s data and you&apos;ll be asked again.
      </P>

      <H>What we don&apos;t do</H>
      <List>
        <li>No advertising, and no ad networks</li>
        <li>No selling or sharing of personal information, in any sense of those words</li>
        <li>No profiling you across other websites</li>
        <li>No third-party trackers beyond the analytics described above</li>
      </List>

      <H>Deleting your data</H>
      <P>
        Email <Mail /> from the address you signed up with and we will delete your
        account and everything attached to it. A button to do this yourself is being
        built; until it exists, email is the route. You can also ask for a copy of
        what we hold, or for something to be corrected.
      </P>
      <P>
        If you are in the EEA or the UK you have rights of access, correction,
        erasure, restriction, objection and portability, and you may complain to
        your local supervisory authority. Our basis for handling account data is
        performing the service you asked for; for analytics, it is your consent. If
        you are in California, note again that we do not sell or share personal
        information.
      </P>

      <H>Retention</H>
      <P>
        Account data is kept until you delete it or ask us to. Analytics data ages
        out on Google&apos;s schedule. Local storage stays in your browser until you
        clear it.
      </P>

      <H>Children</H>
      <P>
        This site is not directed at children under 13, and we do not knowingly
        collect anything from them. If you believe a child has created an account,
        email <Mail /> and we will remove it.
      </P>

      <H>Where data goes</H>
      <P>
        Our hosting, database, email and analytics providers may process data in the
        United States and other countries.
      </P>

      <H>Changes</H>
      <P>
        If this changes we&apos;ll update the date at the top, and say so in the site
        itself if the change is one that matters.
      </P>

      <H>Contact</H>
      <P>
        <Mail />
      </P>
    </div>
  );
}

export function Terms() {
  return (
    <div className="text-sm">
      <Updated />

      <P>
        Anagrimoire is free, and using it means accepting the following. There
        isn&apos;t much of it.
      </P>

      <H>What this is</H>
      <P>
        A set of word game solvers and playable puzzles, run as an independent hobby
        project. No account is required for any of it. Nothing here is sold, and
        nothing is charged for.
      </P>

      <H>Not affiliated with anyone</H>
      <P>
        Anagrimoire is not affiliated with, endorsed by, or sponsored by The New York
        Times Company (Wordle, Spelling Bee, Letter Boxed, Strands), Hasbro or Mattel
        (Scrabble, Boggle), Tribune Content Agency (Jumble), or any other puzzle
        publisher. Those names are trademarks of their owners, used here only to
        describe the kinds of puzzles this tool can help with.
      </P>

      <H>The word lists are ours, not theirs</H>
      <P>
        Our dictionaries are open word lists. They are not any publisher&apos;s
        official list, and no game is obliged to agree with them. A word we accept
        may be rejected elsewhere, and the reverse. Solver output is a suggestion,
        not an authority.
      </P>

      <H>Accounts</H>
      <P>
        Accounts are optional and exist to sync your statistics. Use an email address
        you control, and don&apos;t share an account with anyone else. You can delete
        yours at any time — see the privacy policy. We may suspend or remove an
        account that is being used to attack or abuse the site.
      </P>

      <H>Fair use of the site</H>
      <P>Please don&apos;t:</P>
      <List>
        <li>Attempt to access data belonging to anyone else</li>
        <li>Attack, overload, or probe the site for weaknesses</li>
        <li>Automate requests heavily enough to degrade it for other people</li>
        <li>Submit fabricated results to distort the shared statistics</li>
      </List>
      <P>
        If you find a security problem, please report it via{' '}
        <Ext href="https://github.com/rptetzloff/anagrimoire/issues">GitHub issues</Ext>{' '}
        or to <Mail /> rather than exploiting it.
      </P>

      <H>No promises about availability</H>
      <P>
        The site may be slow, broken, or gone. Daily puzzles are produced by an
        automated pipeline that can fail. Features may change or be removed, and
        statistics may be lost. It is a hobby project run at someone&apos;s own
        expense, and comes with no uptime commitment of any kind.
      </P>

      <H>Provided as-is</H>
      <P>
        To the fullest extent the law allows, Anagrimoire is provided without
        warranties of any kind, express or implied, including fitness for a
        particular purpose. We are not liable for any loss arising from using it —
        including lost statistics, lost streaks, or a puzzle answer that turned out
        to be wrong. Nothing here limits liability that cannot legally be limited.
      </P>

      <H>The code</H>
      <P>
        The site&apos;s source is released under the{' '}
        <Ext href="https://github.com/rptetzloff/anagrimoire/blob/main/LICENSE">
          MIT License
        </Ext>
        . The word lists carry their own licences, credited under Notices.
      </P>

      <H>Changes</H>
      <P>
        These terms may change; the date at the top will say when. Continuing to use
        the site after a change means accepting it.
      </P>

      <H>Contact</H>
      <P>
        <Mail />
      </P>
    </div>
  );
}
