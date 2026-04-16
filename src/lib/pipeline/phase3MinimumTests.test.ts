import { describe, expect, it } from "vitest";
import {
  COMPOSITE_BY_CATEGORY,
  getCompositeForCategory,
  getScoreThreshold,
} from "@/lib/pipeline/articleCategory";
import { enforceSourceDiversityInTopFive } from "@/lib/pipeline/diversityTopFive";
import { headlineTokenOverlapExceeds } from "@/lib/pipeline/tokenOverlap";
import { enforceMaxThreeSentences } from "@/lib/pipeline/summaryText";

describe("Phase 3.11 — category composite (PRD Step 3 Phases 1–7)", () => {
  it("returns correct composite_score per category", () => {
    expect(getCompositeForCategory("transaction")).toBe(85);
    expect(getCompositeForCategory("injury")).toBe(80);
    expect(getCompositeForCategory("game_analysis")).toBe(70);
    expect(getCompositeForCategory("rumor")).toBe(60);
    expect(getCompositeForCategory("general")).toBe(50);
    expect(COMPOSITE_BY_CATEGORY.transaction).toBe(85);
  });

  it("uses 65 / 55 threshold split", () => {
    expect(getScoreThreshold(false)).toBe(65);
    expect(getScoreThreshold(true)).toBe(55);
  });
});

describe("Phase 3.11 — dedup token overlap >70%", () => {
  it("identifies high-overlap headline pairs", () => {
    const a =
      "Patriots Mac Jones trade rumors swirling Tuesday afternoon Boston";
    const b =
      "Patriots Mac Jones trade rumors swirling Wednesday afternoon Boston";
    expect(headlineTokenOverlapExceeds(a, b, 0.7)).toBe(true);
  });

  it("does not flag unrelated headlines", () => {
    const a = "Stock market closes higher Tuesday afternoon";
    const b = "Local bakery wins regional pie competition";
    expect(headlineTokenOverlapExceeds(a, b, 0.7)).toBe(false);
  });
});

describe("Phase 3.11 — summary length cap", () => {
  it("truncates to at most three sentences", () => {
    const long =
      "First. Second. Third. Fourth sentence should be dropped.";
    expect(enforceMaxThreeSentences(long)).toBe("First. Second. Third.");
  });
});

describe("Phase 3.11 — source diversity (top 5)", () => {
  it("swaps fifth slot when all top five share one source", () => {
    type Row = { sourceId: number; compositeScore: number; key: string };
    const input: Row[] = [
      { sourceId: 1, compositeScore: 90, key: "a" },
      { sourceId: 1, compositeScore: 89, key: "b" },
      { sourceId: 1, compositeScore: 88, key: "c" },
      { sourceId: 1, compositeScore: 87, key: "d" },
      { sourceId: 1, compositeScore: 86, key: "e" },
      { sourceId: 2, compositeScore: 70, key: "f" },
    ];
    const out = enforceSourceDiversityInTopFive(input);
    expect(out[4]?.sourceId).toBe(2);
    expect(out[4]?.key).toBe("f");
  });
});

