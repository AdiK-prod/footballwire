/**
 * Layer 1 dedup: token overlap > 70% between headlines (PRD).
 * Tokens = whitespace-split words, alphanumeric normalized.
 */

const tokenize = (headline: string): string[] => {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
};

/** Jaccard-like: |A∩B| / min(|A|,|B|) — same-story if > 0.7 */
export const headlineTokenOverlapExceeds = (
  headlineA: string,
  headlineB: string,
  threshold = 0.7,
): boolean => {
  const a = new Set(tokenize(headlineA));
  const b = new Set(tokenize(headlineB));
  if (a.size === 0 || b.size === 0) {
    return false;
  }
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) {
      inter += 1;
    }
  }
  const denom = Math.min(a.size, b.size);
  return inter / denom > threshold;
};
