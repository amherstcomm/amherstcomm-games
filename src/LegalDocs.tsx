// The privacy policy and terms, written to describe what the code actually
// does. If either drifts from the code, the code is the thing that's right and
// the document is the thing that's wrong — fix it here rather than softening
// the wording.

import type { ReactNode } from 'react';
import ReportMenu from '@/ReportMenu';
import { useSetting } from '@/settings';

export const LEGAL_UPDATED = '16 August 2026';

// Three addresses rather than one, because they are three different queues and
// a single inbox makes the wrong one the default. Privacy requests have to
// arrive by email when they are about somebody's own account — only the address
// on the account can show whose account it is — which is why that one cannot
// simply become a form.
// The upstream project had three addresses at its own domain — privacy,
// security, support. One configured address stands in for all of them now; see
// CONTACT_EMAIL in brand.ts for why, and for what the prose does when none is
// set. Aliasing it three ways would only be indirection with no second value
// behind it.

function H({ children }: { children: ReactNode }) {
  return <h4 className="text-sm font-semibold text-slate-200 mt-5 mb-1.5">{children}</h4>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-slate-400 mb-2.5">{children}</p>;
}

function List({ children }: { children: ReactNode }) {
  return <ul className="text-slate-400 mb-2.5 space-y-1.5 list-disc list-outside pl-5">{children}</ul>;
}

function Mail({ to }: { to?: string }) {
  // The default is a hook rather than a default parameter, which is why this
  // reads oddly: a default parameter is evaluated at the call, and the value
  // now lives in a store that only a component may read.
  const settingAddress = useSetting('contact_email');
  to = to ?? settingAddress;
  // An unset address rendered <a href="mailto:"></a> — a link with no target
  // and no text, which axe caught as a link-name violation on the privacy page.
  // Guarding each call site would have been the fragile fix, and was: I wrote
  // two guards and missed two. The component refuses instead, and the prose
  // around it is written so its absence still reads.
  if (!to) return null;
  return (
    <a
      href={`mailto:${to}`}
      className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
    >
      {to}
    </a>
  );
}

/** The report form, named in a sentence and openable from it.
 *
 *  A button rather than a link because it opens a dialog rather than going
 *  anywhere. The context is empty on purpose: there is no board behind a legal
 *  page, so the chooser says as much and offers the other five kinds. */
function Report({ children }: { children: ReactNode }) {
  return (
    <ReportMenu
      context={{}}
      label={String(children)}
      showIcon={false}
      className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
    />
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
  const contact = useSetting('contact_email');
  return (
    <div className="text-sm">
      <Updated />

      <P>
        This site is run by Amherst Communications for its own staff. It describes
        everything the site does with data — there is no longer version.
      </P>

      <div className="rounded-xl bg-white/5 border border-white/10 p-4 my-4">
        <p className="text-slate-300">
          <strong className="font-semibold">The short version.</strong> Everything runs
          on a server inside the company; nothing about how you play is sent to anyone
          outside it. Signing
          in happens through your Amherst account, and we store your results and the
          daily boards you have in progress so they follow you between devices. Nothing
          about you is visible to colleagues unless you choose a
          display name, which puts you on the leaderboards and can be cleared again
          at any time.
        </p>
      </div>

      <H>What never leaves your device</H>
      <P>
        Every game runs entirely in your browser. The dictionaries are downloaded to
        your device and searched there, so the letters you type are checked where you
        typed them and are never sent anywhere to be answered.
      </P>
      <P>
        <strong className="text-slate-300">
          What you type into a board never leaves your device — ever, account or not.
        </strong>{' '}
        Only the result does, and only once you finish: which puzzle, whether you won,
        the score and the time. Not the guesses that got you there.
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
        <li>Your answer to the analytics question, and the date you gave it</li>
        <li>
          While you&apos;re signed in, the token that keeps you signed in. Clearing
          this site&apos;s data signs you out, which is the same thing.
        </li>
      </List>
      <P>
        None of that is a cookie, and none of it is tracking — it&apos;s the site
        remembering what you asked it to remember, and the rules about storing
        things on your device carve out exactly that. We ask anyway, because
        &quot;we keep things on your device&quot; deserves an answer other than a
        banner that only offers yes. Two of them:
      </P>
      <List>
        <li>
          <strong className="text-slate-300">Keep essentials only</strong> — your
          answers on this page, and nothing else. Every game works
          exactly as it does otherwise; close the tab and it starts over, sign-in
          included, because staying signed in is itself a thing kept on your device.
        </li>
        <li>
          <strong className="text-slate-300">Keep my games and settings</strong> —
          boards, settings, statistics and your sign-in stay in this browser, as
          described above. They&apos;re on your machine.
        </li>
      </List>
      <P>
        There is no third setting for whether anything may reach our server, because
        signing in already is that answer. Nobody signs in by accident, and asking a
        second time would imply we might do it unasked. It leaves two separate
        questions rather than one muddled ladder: signing in decides whether anything
        leaves this device, and the setting above decides what stays on it. You can
        sign in under either — at the first, the session is held in memory and ends
        with the tab.
      </P>
      <P>
        It&apos;s under Settings → Privacy, alongside the analytics answer, and choosing
        less removes what was already there rather than merely stopping more. The one
        thing kept at every level is your answers themselves — remembering that you
        said no is the only way to honour it, and asking again on every load would be
        worse for you rather than better.
      </P>
      <P>
        <strong className="text-slate-300">Cookies specifically:</strong> the only
        cookies this site sets are Google Analytics&apos;s, and only after you agree.
        Say no and none are set; say nothing and none are set; say yes and later
        change your mind and the ones already there are removed. If your answer
        lapses after a year they&apos;re removed too, on the next visit, without
        waiting for you to answer again.
      </P>
      <P>
        Clearing this site&apos;s data in your browser erases all of it. If you have no
        account and have never sent us a report, that is genuinely everything we hold —
        a report is the one thing you can leave behind without an account, and it stays
        until it is dealt with.
      </P>

      <H>What happens even without an account</H>
      <List>
        <li>
          <strong className="text-slate-300">Hosting.</strong> The site and its database
          both run on a server inside the company, reachable only from the internal
          network. It keeps ordinary server logs, including IP addresses, the way any
          web server does.
        </li>
        <li>
          <strong className="text-slate-300">Puzzle data.</strong> Today&apos;s boards
          are asked for from that same internal database. The request carries no
          account and no identifier — it asks only for a game name, and the function it
          calls will not serve a future day. The practice pools come the same way.
        </li>
        <li>
          <strong className="text-slate-300">Reporting something.</strong> If you use
          the report form, what you write goes to the same database, with no account
          needed. There is a section on that below.
        </li>
        <li>
          <strong className="text-slate-300">Analytics</strong>, described below.
        </li>
      </List>

      <H>If you create an account</H>
      <P>
        Accounts are optional, and exist so your statistics, settings and
        half-finished dailies follow you from one device to the next. You can sign in
        with your Amherst account, through the company&apos;s own single sign-on. No
        separate password exists for this site, and no sign-in email is ever sent.
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
        <li>A display name, if you choose to set one — the next section is about that</li>
        <li>
          If you use invite links: who you are friends with, anyone you have blocked,
          and any invite codes you have minted and not yet let expire. A friendship is
          two names knowing about each other and nothing more — it changes whose scores
          you can see on a board, not what is stored about either of you.
        </li>
      </List>
      <P>
        We never see your password. Signing in with GitHub or Google tells us your
        email address and nothing else — not your repositories, contacts, or any
        other part of those accounts. The database enforces, at the row level, that
        an account can only ever read or write its own rows.
      </P>

      <H>Display names and leaderboards</H>
      <P>
        You can set a display name on your account. It is the{' '}
        <strong className="text-slate-300">only thing about you any other player can
        ever see</strong>, and setting one is entirely optional — accounts have no name
        until you give them one, and without one you don&apos;t appear on the
        leaderboards at all.
      </P>
      <P>
        Set one and your name appears on the daily leaderboards alongside your scores
        for those puzzles: how many you solved, points, times. That is the whole of
        it. The boards are built by a database function that can return names and
        numbers and nothing else — not your email, not anything you typed, and no way
        for a reader to get from a name back to the account it belongs to. Because the
        name is the public part, pick one you are happy to be seen under rather than
        one that identifies you.
      </P>
      <P>
        Clearing the name removes you from the boards immediately and permanently.
        Your own statistics carry on exactly as before; they just stop being public.
      </P>

      <H>Site-wide numbers</H>
      <P>
        Figures like &ldquo;today across all registered players&rdquo; are produced
        by a database function that returns only counts and averages. It cannot
        return anyone&apos;s individual rows, and no player is identifiable from its
        output. Only results from signed-in accounts are counted, because they are
        the only ones we have.
      </P>

      <H>If you report something</H>
      <P>
        A report stores what you told us and, for a puzzle or a player, what the
        server itself holds about the thing you reported — we look the board or
        the name up rather than trusting what your browser says it saw, so the
        report contains no record of your session. Nothing identifying about the
        reporter is stored: no address, no fingerprint, and rate limits are
        counted per reported thing rather than per reporter, precisely so there
        is nothing to count you by.
      </P>
      <P>
        The email address is optional and is the one exception. It is used to send
        you a receipt and the outcome, and nothing else. It is never shown
        alongside the report — not on the page where reports are handled, not in
        the daily summary, which says only that someone asked to be told — and it
        is deleted from the report once the outcome has been sent. We are not
        claiming it is technically unreachable by whoever runs the database; we
        are saying it is not put in front of anyone, not used for anything else,
        and not kept.
      </P>

      <H>Analytics</H>
      <P>
        There are none. No analytics service runs on this site — no page views,
        locations or device details are collected, and nothing is sent anywhere. There
        is nothing to consent to and nothing to switch off.
      </P>
      <P>
        The code that would have loaded Google Analytics is gone rather than switched
        off, which is a stronger statement than a policy can make: there is no
        measurement ID to set and no script to enable.
      </P>

      <H>What we don&apos;t do</H>
      <List>
        <li>No advertising, and no ad networks</li>
        <li>No selling or sharing of personal information, in any sense of those words</li>
        <li>No profiling you across other websites</li>
        <li>No third-party trackers of any kind</li>
      </List>

      <H>Deleting your data</H>
      <P>
        Both of these are buttons under Account, and neither needs to go through us:
      </P>
      <List>
        <li>
          <strong className="text-slate-300">Clear my statistics</strong> deletes every
          result on your account, the daily boards stored with it, and the totals
          imported from your browsers. The account itself stays, display name included.
        </li>
        <li>
          <strong className="text-slate-300">Delete my account</strong> removes the
          account and everything attached to it — results, daily boards, display name,
          settings, and the sign-in itself. Signing in again afterwards starts a new
          account rather than finding the old one.
        </li>
      </List>
      <P>
        Both are immediate and neither can be undone. If you would rather we did it, or
        you want a copy of what we hold or something corrected,{' '}
        {contact ? (
          <>
            email <Mail /> from your Amherst address — that one has to be email, because
            the request only means anything if it comes from the account it is about,
            and a form anyone can fill in cannot show that.
          </>
        ) : (
          <>ask whoever administers this site directly — a request about your own account
          only means anything if it comes from you, and a form anyone can fill in cannot
          show that.</>
        )}{' '}
        <Report>The report form</Report> is the right route for a privacy question that
        is not about your own account.
      </P>
      <P>
        Two things are worth saying plainly about what deletion does and doesn&apos;t
        reach. Your browser keeps its own copy of your boards and totals, so deletion
        offers to erase those here as well — ticked by default, and worth unticking
        only if you mean to carry on playing on this device without an account.
        Either way it is local, and clearing this site&apos;s data removes whatever is
        left.
      </P>
      <P>
        Analytics is the other. It was never tied to your account — we have never sent
        Google an account identifier, only the page you were on — so there is nothing
        there filed under you to delete, and we won&apos;t pretend we can reach into
        Google&apos;s records. What we can do is drop the browser-scoped cookie that
        ties those visits together, which deleting an account does automatically and
        the Settings → Analytics toggle does on its own.
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
        clear it. An address left on a report goes when that report is closed out.
      </P>

      <H>Children</H>
      <P>
        This site is for Amherst Communications staff and is reachable only from inside
        the company, so it is not directed to children and does not knowingly collect
        anything from them.
      </P>

      <H>Where data goes</H>
      <P>
        Nowhere. The site and its database run on company hardware on the internal
        network, and your play is not sent to any outside provider.
      </P>

      <H>Changes</H>
      <P>
        If this changes we&apos;ll update the date at the top, and say so in the site
        itself if the change is one that matters.
      </P>

      <H>Contact</H>
      <P>
        The quickest route is <Report>the report form</Report> at the bottom of any
        page, under <em>a privacy concern</em>. It needs no account, it gives you a
        reference you can check, and it puts your message in a queue that is worked
        through rather than an inbox that might not be — which is the honest
        difference between the two. Leave an address if you want a reply.
      </P>
      {contact && (
        <P>
          You can also email <Mail /> if you would rather, and you should if what you
          need to send us does not fit in a form.
        </P>
      )}
    </div>
  );
}

export function Terms() {
  const contact = useSetting('contact_email');
  return (
    <div className="text-sm">
      <Updated />

      <P>
        This site is run by Amherst Communications for its staff, and using it means
        accepting the following. There isn&apos;t much of it.
      </P>

      <H>What this is</H>
      <P>
        A set of word games and daily puzzles, run internally for Amherst
        Communications staff. It is offered for enjoyment, not as part of anyone&apos;s
        job, and playing or not playing is entirely up to you. Nothing here is sold and
        nothing is charged for.
      </P>

      <H>Not affiliated with anyone</H>
      <P>
        Amherst Communications is not affiliated with, endorsed by, or sponsored by The
        New York Times Company (Wordle, Spelling Bee, Letter Boxed, Strands), Hasbro or
        Mattel (Scrabble, Boggle), Tribune Content Agency (Jumble), or any other puzzle
        publisher. Those names are trademarks of their owners, used here only to
        describe the kinds of puzzles this site offers.
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
        Accounts are optional, and exist to carry your statistics, settings and daily
        progress between devices. Use an email address you control, and don&apos;t
        share an account with anyone else. You can delete yours at any time from the
        Account panel — see the privacy policy. We may suspend or remove an
        account that is being used to attack or abuse the site.
      </P>

      <H>Display names</H>
      <P>
        Optional, and the only part of your account other people see. Pick something
        you&apos;d be comfortable having on a public list. Don&apos;t impersonate
        anyone, and don&apos;t use a name intended to harass or abuse — those we will
        clear without warning, and repeat attempts will cost the account.
      </P>

      <H>Fair use of the site</H>
      <P>Please don&apos;t:</P>
      <List>
        <li>Attempt to access data belonging to anyone else</li>
        <li>Attack, overload, or probe the site for weaknesses</li>
        <li>Automate requests heavily enough to degrade it for other people</li>
        <li>Submit fabricated results to distort the shared statistics or the leaderboards</li>
      </List>
      <P>
        If you find a security problem, please report it rather than exploiting it, and
        please not anywhere public — that publishes the hole to everyone before it is
        fixed. Use the security option under <em>Report a problem</em> at the bottom of
        any page{contact ? <>, or <Mail /></> : null}. It goes
        to the same internal queue, and you get a reference you can check.
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
        To the fullest extent the law allows, this site is provided without
        warranties of any kind, express or implied, including fitness for a
        particular purpose. We are not liable for any loss arising from using it —
        including lost statistics, lost streaks, a board that would not load, or a
        puzzle answer that turned out to be wrong. Nothing here limits liability that
        cannot legally be limited.
      </P>

      <H>Prizes</H>
      <P>
        Prizes given out in connection with this site are offered in the same spirit
        and on the same terms: no warranty, and no guarantee that any particular
        prize will be awarded, that a leaderboard is a complete or accurate record of
        who played, or that a result the site recorded is the one you meant to send.
        Scores are written by your own browser and checked for plausibility on the
        way in; that is a filter, not a proof.
      </P>
      <P>
        Playing is voluntary and outside your job. Nothing here creates an
        entitlement to a prize, and how prizes are decided and handed out is up to
        Amherst Communications rather than to the site.
      </P>

      <H>The code</H>
      <P>
        This site is built on{' '}
        <Ext href="https://github.com/rptetzloff/anagrimoire">Anagrimoire</Ext>, an
        open-source project released under the{' '}
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
        <Report>The report form</Report> at the bottom of any page
        {contact ? <>, or <Mail /></> : null}. Security problems
        have their own route, above.
      </P>
    </div>
  );
}
