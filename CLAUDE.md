# House rules

Ten rules, so they get applied rather than rediscovered. Short on purpose.

## Measure, don't assert

If a claim can be checked against the running thing, check it before writing
it down. Every serious bug here looked fine in the source: the nav bar grew a
second row, a solver printed the entire dictionary under its answer, Learn
swallowed a keypress — all of it typechecked, linted, and passed the suite of
the day. Reading the code would not have found any of them.

Corollary: a test that reads the source proves the source, not the behaviour.
Keep both.

## Comments explain why, never what

When a value was chosen by measurement, record the number **and** the rejected
alternative. "ΔE 79 dark / 61 light from rose" is worth more than the hex.

## Reversals stay visible

When a decision is overturned, mark the old one and say what changed. Do not
quietly edit it away. The trail is why the conclusion is trustworthy — a
document that only ever agreed with itself is not evidence of anything.

## State the limit of the claim

Say what a thing does *not* do, in the same breath. If a guarantee has an
exception, the exception ships next to it. When a claim stops being true,
rewrite it deliberately rather than deleting it.

## Tests assert rules, and fail on the old code

Where a rule can be read out of an artifact, assert it against the artifact.
Verify a new test fails before the fix, by reverting — a test that never
failed has proved nothing, and this repo has shipped several that could not.

A number pinned in two suites is wrong in one of them the day it moves. Exact
counts live in the layer closest to the artifact (`tests/unit/`); every other
layer asserts the relation — distinct, ordered, subset — not the snapshot.

## Derived data stays derived

If it can be rebuilt from sources, rebuild it; never store it and hand-edit.
Stored derivations last exactly until the source is regenerated — the plurals
were lost that way twice. And two lists that must agree are one list read
twice: the `slur` flag is read out of the blocklist, not kept beside it. When
two tiers look like the same judgement from two directions, check — scope
`both` and flag `slur` were not.

## Colour and theme

All colour through CSS variables in `index.css`; never a literal in a
component. axe checks *text* contrast only, so anything it cannot see — tile
fills against the page ground, palette-to-palette drift — gets its own ΔE
floor in `tests/unit/palettes.test.ts`. Every theme × palette combination
holds WCAG AA, because a pair that passes in one can fail in another.

## Dependencies default to none

A new runtime dependency needs a reason in the PR. vitest stays on 3.x; after
any install, `npm ci --dry-run` has to come back clean before committing the
lockfile.

## Commits and branches

A subject line stating what the change makes true — no conventional-commit
prefixes, no ticket refs. The body is as long as the reasoning needs,
including what was measured and what was rejected.

### Development happens on `dev`. Every PR is `dev` into `main`.

No topic branches — the whole history is "from rptetzloff/dev", and CI costs
~15 minutes a run, so a branch between you and `dev` buys a second run for
nothing. Run whichever suite can catch the change locally before pushing;
CI is for confirming, not discovering. The word-list rebuild workflow builds
from `main`: a change to that pipeline either lands on `main` before the
dispatch, or the rebuilt files are generated locally and shipped in the same
PR — which also collapses the two-dispatch dance into one.

## Files

Extract when a file stops being readable, not at a line count. Known
exception: `App.tsx` is far past that and is being reduced by extraction
(`GameMenu`, `LadderRow`, …), not by a rewrite.

---

*Repo-specific facts — the games, the schema, what shipped and why — live in
`ROADMAP.md` and in the module headers, not here. The rules are the same in
every repo; the examples are this one's, because a rule with no scar attached
gets skipped.*
