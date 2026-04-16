import type { ArticleCategory } from "./articleCategory";

const patterns: { category: ArticleCategory; re: RegExp }[] = [
  { category: "injury", re: /\b(ir\b|injury|injuries|injured|concussion|cleared to play|questionable|doubtful|out for|placed on ir)\b/i },
  { category: "transaction", re: /\b(trade|traded|signed|signing|contract extension|released|waived|cut\b|re-signed|franchise tag)\b/i },
  { category: "game_analysis", re: /\b(recap|film room|grades|snap counts|snap\b|breakdown|what we learned)\b/i },
  { category: "rumor", re: /\b(rumor|rumors|reportedly|per sources|hearing|could be|may be traded)\b/i },
];

/** Lightweight keyword router — Phase 8 may replace with Claude classification. */
export const categorizeFromTitleAndBody = (title: string, body: string): ArticleCategory => {
  const text = `${title}\n${body}`.slice(0, 8000);
  for (const { category, re } of patterns) {
    if (re.test(text)) {
      return category;
    }
  }
  return "general";
};
