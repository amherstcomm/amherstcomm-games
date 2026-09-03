# Security policy

Amherst Games is a word-game site for Amherst Communications staff: a static
bundle in the browser and a self-hosted Supabase behind it for accounts, synced
progress and leaderboards. It runs on an internal VM, reachable only over the
VPN and only after signing in, so the first line of defence is that a stranger
cannot reach it at all. What remains worth attacking is the database — whether
one account can reach another's rows, whether a leaderboard can be lied to, and
whether tomorrow's puzzle can be read today.

Report a problem through the site's own report form, under *a security
problem*. It goes to the internal queue and gives you a reference. Please don't
post it anywhere public while it is unfixed.

## Reporting a vulnerability

**Report a problem** at the bottom of any page has a security option. It goes
to the internal queue and gives you a reference you can check later.

The upstream project names GitHub's private advisory form first, because it is
private by construction and carries a disclosure process a report table cannot.
Neither applies here. This deployment is internal, the queue is already inside
the company, and sending an employee to a public code host to report a hole in
a staff tool is the opposite of the privacy that route exists to provide.

Please don't post anything exploitable anywhere public before there is a fix.
Anything already listed below as known is fine to raise internally.

There is no bug bounty and no payment. This is a personal project with one
maintainer; the honest expectation is a first reply within a week rather than
within a day. Credit in the advisory if you want it.

## Supported versions

The deployed site is the only supported version. There are no release branches
and no backports: the fix lands on `main` and deploys. If you are running a
copy, the fix is a `git pull`.

## In scope

- **Row-level security, and the functions that bypass it.**
  [supabase/schema.sql](supabase/schema.sql) is the whole server. Any way for
  one account to read or write another's rows is the most serious report here.
  The pattern throughout is RLS with grants revoked outright rather than merely
  unpoliced, and `security definer` functions pinned with `search_path = ''`; a
  gap in either is in scope, as is any definer function that returns more than
  it should.
- **The report system.** Action links carry a token *and* require an owner
  account signed in — neither alone should open anything, because an emailed
  link is read by more people than its recipient. The reports table grants
  nothing to web roles, a ticket answers status and nothing else, and a
  reporter's email address must never appear on a page or in the digest.
- **Leaderboard integrity.** Results are checked by `result_is_plausible`
  before they count. A way to post a score that could not have been played, or
  to appear on a board without a display name, is a finding.
- **The daily gate.** `daily_puzzle()` is a definer function that takes no date
  and refuses to serve past 3:15 a.m. Eastern, so the rolling fortnight of
  future rows sits there unaskable. A secret salt mixes into every generation
  seed, so future boards aren't computable from this repository either. A way
  to read tomorrow's board is in scope.
- **Display names.** They are the only thing about an account another player
  can see. A way past `name_is_blocked` — the normalisation, the substring and
  exact tiers, the allow-list carve-outs — is in scope, as is any route from a
  name back to the account behind it.
- **Cross-site scripting.** React escapes by default, but the paths that carry
  text somebody else wrote are display names, report reasons and the digest
  email. The email is deliberately plain text and never HTML.
- **Authentication.** The sign-in flow, the OAuth redirect handling, and
  anything that lets a session be taken or fixed.
- **The word-list artifacts.** They are fetched from a pinned tag and verified
  against an embedded version. A way to serve a client different words than the
  database accepts is in scope.

## Known and documented, not vulnerabilities

These are deliberate, and most are written up in the app or the roadmap.

- **Every answer is already in the browser.** This is a solver site: the
  dictionaries are downloaded and searched on your device, which is the whole
  product. A player who wants today's answer can read it out of the payload.
  The base64 on stored boards is spoiler-obfuscation so answers aren't sitting
  in plain sight in devtools — it is not a security measure and has never been
  described as one.
- **Therefore leaderboards cannot be cheat-proof.** `result_is_plausible`
  bounds the absurd; it cannot distinguish a fast solver from a fast player.
  Boards are opt-in via a display name for exactly this reason.
- **`Math.random()` picks practice boards.** It is predictable to anyone who
  can observe its output — and nobody can. Those draws are consumed in one
  browser by the person playing, who already knows the answer. Values that must
  be unguessable (ticket codes, invite codes) are minted server-side with
  `gen_random_uuid()`.
- **The anon key is public by design.** It is in the bundle, as Supabase
  intends; row-level security is what protects the data. A key in the page
  source is not a finding — a policy it can get past is.
- **There is no Content-Security-Policy yet.** A static SPA with no inline
  script needs can take a strict one, and it is the largest single hardening
  measure still outstanding. Tracked in [ROADMAP.md](ROADMAP.md); noted here so
  it is documented rather than discovered.
- **Reports are rate-limited per subject and per day, not per reporter.** That
  is on purpose: limiting per source means storing something identifying about
  people who are otherwise anonymous. It bounds volume, not intent. Someone
  determined can file one report against each of a thousand names, and the
  answer to that is moderation tooling rather than a bigger number.
- **A reporter's address reaches Resend** when the receipt or outcome is sent,
  because that is what sending email means. It is deleted from the report once
  the outcome has gone.
- **Anything requiring an attacker to already have your unlocked device**, your
  browser profile on disk, or a debugger attached to the page.

## Dependencies

Five at runtime — `@supabase/supabase-js`, `react`, `react-dom`,
`lucide-react`, `wordlist-english` — and everything else is build or test
tooling that never reaches a visitor. Dependabot and CodeQL both run on this
repository. An advisory in a build-only package is triaged on whether it could
reach the published bundle or process untrusted input; one in a runtime
dependency is treated as reaching a player until shown otherwise.
