// Deterministic PRNG so a question's choice order is stable for a given player.
// The client fetches the same question more than once (prefetch on answer, then
// a refetch when the prefetch failed, plus any reload), and a fresh random order
// on each fetch would visibly reshuffle the list mid-question.
function seedFrom(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates: a uniform permutation, so every choice lands on a distinct
// position and none is dropped or duplicated.
export function shuffleChoices<T>(choices: readonly T[], seed: string): T[] {
  const out = [...choices];
  const rand = mulberry32(seedFrom(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

