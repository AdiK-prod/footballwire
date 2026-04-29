/** PRD Content Pipeline — Step 3 (Phases 1–7): fixed composite by category. Phase 8 replaces with Claude. */

export type ArticleCategory =
  | "transaction"
  | "injury"
  | "game_analysis"
  | "rumor"
  | "general"
  | "video_link";

export const COMPOSITE_BY_CATEGORY: Record<ArticleCategory, number> = {
  transaction: 85,
  injury: 80,
  game_analysis: 70,
  rumor: 60,
  general: 50,
  video_link: 0, // video items are not scored — they fill slots only when text < 4
};

export const getCompositeForCategory = (category: ArticleCategory): number =>
  COMPOSITE_BY_CATEGORY[category];

/** Standard 65 / low-volume 55 per PRD */
export const getScoreThreshold = (lowVolume: boolean): number =>
  lowVolume ? 55 : 65;
