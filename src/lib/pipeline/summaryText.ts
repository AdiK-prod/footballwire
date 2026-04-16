/**
 * PRD Phase 3 — max 3 sentences enforced programmatically (in addition to Claude prompt).
 */

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

export const enforceMaxThreeSentences = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }
  const parts = trimmed.split(SENTENCE_SPLIT).filter((p) => p.length > 0);
  if (parts.length <= 3) {
    return trimmed;
  }
  return parts.slice(0, 3).join(" ").trim();
};
