// Which boards a passage of your own can go on.
//
// The cryptogram has two length bands and they are not a preference: at 50-100
// letters the frequency profile is a fair likeness of English and there are
// repeated shapes to lever against; at 35-49 there are fewer, which is why
// extreme plays the short band and why the curated short passages are put
// through a uniqueness guard before they are kept. A passage outside 35-100
// has no board at all.
//
// So this is the same job the Weave calculator does: say what somebody is
// writing can be used for, while they are writing it, instead of leaving it to
// be discovered by a nightly run that quietly reached for a curated quotation
// instead.
//
// The numbers are the harvest's own (scripts/cryptogram-harvest.mjs) and the
// tier mapping is the generator's (scripts/cryptogram.mjs); both are read out
// of those files by tests/unit/cryptogramFit.test.ts rather than trusted here.

export type Band = 'standard' | 'short';
export type Tier = 'easy' | 'hard' | 'extreme';

export const BANDS: Record<Band, { min: number; max: number }> = {
  standard: { min: 50, max: 100 },
  short: { min: 35, max: 49 },
};

export const TIER_BAND: Record<Tier, Band> = {
  easy: 'standard',
  hard: 'standard',
  extreme: 'short',
};

export const TIERS: Tier[] = ['easy', 'hard', 'extreme'];

/** What the cipher will actually encipher. Spaces and punctuation are carried
 *  through as themselves, so they are not part of the length — which is the
 *  thing that surprises people typing a long-looking sentence of short words. */
export function lettersIn(text: string): number {
  return (text.toLowerCase().match(/[a-z]/g) ?? []).length;
}

/** The tiers this passage could be dealt to. Empty means no board takes it,
 *  which is the case the server refuses outright. */
export function tiersFor(text: string): Tier[] {
  const letters = lettersIn(text);
  return TIERS.filter((tier) => {
    const { min, max } = BANDS[TIER_BAND[tier]];
    return letters >= min && letters <= max;
  });
}

/** What to say about it, in the words somebody writing one would use.
 *
 *  Three different sentences rather than one with a number in it, because the
 *  three situations want different things done about them: lengthen it, shorten
 *  it, or nothing at all. */
export function fitNote(text: string): { ok: boolean; short: boolean; note: string } {
  const letters = lettersIn(text);
  const tiers = tiersFor(text);
  if (letters === 0) return { ok: false, short: false, note: '' };
  if (tiers.length > 0) {
    return {
      ok: true,
      // The uniqueness guard is a curation step this cannot run — it needs the
      // whole dictionary and a search — so a short passage is flagged rather
      // than blocked. A second common-word reading is a solution the answer
      // check calls wrong, and on a passage somebody wrote for their own event
      // that is a trade worth making knowingly.
      short: TIER_BAND[tiers[0]] === 'short',
      note: `${letters} letters — plays at ${tiers.join(', ')}`,
    };
  }
  // Two cases and not three: the bands meet at 49 and 50, so anything between
  // 35 and 100 has a board. A gap would need saying separately, because "50
  // letters" and "49 letters" would then be a board and no board with nothing
  // in the sentence to say which.
  if (letters < BANDS.short.min) {
    return {
      ok: false,
      short: false,
      note: `${letters} letters — ${BANDS.short.min - letters} short of the smallest board`,
    };
  }
  return {
    ok: false,
    short: false,
    note: `${letters} letters — ${letters - BANDS.standard.max} past the largest board`,
  };
}
