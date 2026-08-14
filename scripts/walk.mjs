// Dealing a pool one item a day, without a ledger.
//
// A fresh random pick per day repeats on birthday-paradox time — weeks, at the
// sizes here — and a stateless generator cannot remember what it already
// served. A permutation walk needs no memory: days walk a shuffled order of
// the whole pool, so the first repeat arrives after poolSize days and the next
// cycle reshuffles. The shuffle is seeded by the *cycle* rather than the date,
// because every day in a cycle has to deal the same permutation or the
// no-repeat guarantee is just random picks wearing a hat.
//
// Written for the cryptogram passages and now shared with the word ladder,
// which has the same problem and no reason to solve it twice.

export function cycleOf(position, poolSize) {
  return Math.floor(position / poolSize);
}

export function permutedIndex(cycleRng, poolSize, position) {
  const perm = [...Array(poolSize).keys()];
  for (let i = poolSize - 1; i > 0; i--) {
    const j = Math.floor(cycleRng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm[position % poolSize];
}
