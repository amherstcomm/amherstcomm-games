// Reading the blocklist, in one place.
//
// `blocklist.mjs` *writes* src/wordbands/blocked-words.json, rarely and by
// hand — or as the first step of the word rebuild workflow. This
// reads it, and everything that needs the list goes through here: the word
// build, the three pool harvests, the daily generator, the name blocklist and
// the contract tests.
//
// It exists because they each used to open the file themselves and pick their
// own subset, and the subsets drifted. 38 words added to the blocklist were
// never flagged in the word build, so they scored in every game while the
// generator refused to publish them — two lists that agreed until one of them
// changed.
//
// The scope is the whole vocabulary and it means one thing in each direction:
//
//   both        never generated, never accepted. No ordinary sense, so nothing
//               is lost by refusing it everywhere. This is also the `slur`
//               flag tier in the word build, and the substring tier in the name
//               blocklist — the same judgement, read three ways.
//   generation  never generated, still accepted if a player types it. Where the
//               ordinary words live: chink is a gap in a wall, gyp is in common
//               innocent use, retard is a verb, queer is reclaimed and everyday.
//               Filtering these out of what a player may *type* is where
//               Scunthorpe bites.
import { readFileSync } from 'node:fs';

const FILE = new URL('../src/wordbands/blocked-words.json', import.meta.url);

let cached = null;

/** Every entry, as written: { word, scope, origin }. */
export function blockedEntries() {
  if (!cached) cached = JSON.parse(readFileSync(FILE, 'utf8')).words;
  return cached;
}

/** The words at a scope, as a Set.
 *
 *  `scope` omitted means every blocked word, which is what a harvest wants —
 *  it is deciding what to build a puzzle out of, and neither tier belongs in
 *  one. Pass 'both' when the question is what may never be *shown*. */
export function blockedSet(scope = null) {
  return new Set(
    blockedEntries()
      .filter((w) => !scope || w.scope === scope)
      .map((w) => w.word)
  );
}

/** Never generated and never accepted — the tier with no innocent reading.
 *
 *  This is the set a *published* thing is checked against: a prompt, a passage,
 *  a pair. Not the wider list, because a cryptogram passage carrying Lincoln's
 *  "we may hasten or we may retard" is not a problem to solve. */
export function neverPublish() {
  return blockedSet('both');
}

/** The slurs among them: the `both` tier minus the swearing.
 *
 *  ESDB grades in two vocabularies and only one of them is about hate —
 *  offensive-1 and offensive-2 are slurs, vulgar-1 is strong swearing. Both
 *  sit at scope `both`, correctly, because neither is something to hand a
 *  player as an answer or let into a display name. But they are not the same
 *  judgement, and the word build must not read them as one.
 *
 *  It did. Taking `neverPublish()` as the slur flag promoted 44 swears — fuck,
 *  shit, cunt, asshole and their inflections — into the tier that never scores
 *  at any difficulty, which is not the ruling. The ruling was slurs, not
 *  swearing: a player who types a swear has typed an English word.
 *
 *  So the two are separated by origin rather than by scope, because scope is
 *  answering a different question. */
export function slurs() {
  return new Set(
    blockedEntries()
      .filter((e) => e.scope === 'both' && !/vulgar/.test(e.origin))
      .map((e) => e.word)
  );
}
