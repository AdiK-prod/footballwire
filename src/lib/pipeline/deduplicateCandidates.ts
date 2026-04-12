import { confirmSameStory } from "@/lib/ai/claudePipeline";
import {
  headlineTokenOverlapExceeds,
} from "@/lib/pipeline/tokenOverlap";

export type Dedupable = {
  title: string;
  compositeScore: number;
};

/**
 * Greedy dedup: process highest score first; drop later items that duplicate an
 * already-kept headline (Layer 1 overlap + Layer 2 Claude, with overlap fallback).
 */
export const deduplicateByHeadlines = async <T extends Dedupable>(
  sortedByScoreDesc: T[],
): Promise<{ kept: T[]; dropped: T[] }> => {
  const kept: T[] = [];
  const dropped: T[] = [];

  for (const cand of sortedByScoreDesc) {
    let isDup = false;
    for (const k of kept) {
      if (!headlineTokenOverlapExceeds(cand.title, k.title)) {
        continue;
      }
      let sameStory = false;
      try {
        sameStory = await confirmSameStory(cand.title, k.title);
      } catch {
        sameStory = headlineTokenOverlapExceeds(cand.title, k.title, 0.85);
      }
      if (sameStory) {
        dropped.push(cand);
        isDup = true;
        break;
      }
    }
    if (!isDup) {
      kept.push(cand);
    }
  }

  return { kept, dropped };
};
