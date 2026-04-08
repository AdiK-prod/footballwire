import { describe, expect, it } from "vitest";
import {
  resolveStatusFromConfidence,
  validateSourceInput,
  validateSourceWithDeps,
} from "@/lib/services/sourceService";

describe("validateSourceInput", () => {
  it("accepts valid payload", () => {
    const parsed = validateSourceInput({
      url: "https://example.com/feed.xml",
      teamId: 1,
      sourceType: "team_specific",
      submittedBy: "qa@test.local",
    });

    expect(parsed.sourceType).toBe("team_specific");
    expect(parsed.teamId).toBe(1);
  });

  it("rejects invalid payload", () => {
    expect(() =>
      validateSourceInput({
        url: "not-a-url",
        teamId: "1",
        sourceType: "general",
      }),
    ).toThrow();
  });

  it("requires teamId for non-general source types", () => {
    expect(() =>
      validateSourceInput({
        url: "https://example.com/feed.xml",
        teamId: null,
        sourceType: "team_specific",
        submittedBy: "qa@test.local",
      }),
    ).toThrow();
  });
});

describe("resolveStatusFromConfidence", () => {
  it("approves team-specific source with confidence >= 60", () => {
    expect(resolveStatusFromConfidence("team_specific", 60)).toBe("approved");
  });

  it("flags team-specific source with confidence < 60", () => {
    expect(resolveStatusFromConfidence("team_specific", 59)).toBe("flagged");
  });

  it("always approves general sources", () => {
    expect(resolveStatusFromConfidence("general", 10)).toBe("approved");
  });
});

describe("validateSourceWithDeps", () => {
  const baseInput = {
    url: "https://example.com/feed.xml",
    teamId: 1,
    sourceType: "team_specific" as const,
    submittedBy: "qa@test.local",
  };

  const baseDeps = {
    createPendingSource: async () =>
      ({
        id: 42,
        team_id: 1,
        url: "https://example.com/feed.xml",
        name: "example.com",
        type: "team_specific",
        status: "pending",
        relevance_score: null,
      }) as const,
    updateSourceStatus: async (_params: {
      id: number;
      status: "pending" | "approved" | "rejected" | "flagged";
      relevanceScore: number | null;
      validationNotes: string;
    }) => undefined,
    getTeamNameById: async () => "Seattle Seahawks",
    checkTeamSourceRelevance: async () => ({ relevant: true, confidence: 80 }),
    notifyAdminOfFlaggedSource: async () => ({ delivered: true, reason: "ok" }),
    parseRssFeedOrReject: async () => ({
      title: "Story",
      link: "https://example.com/story",
      pubDate: "2026-04-08",
      description: "desc",
    }),
    timeoutMs: 10_000,
  };

  it("approves valid source", async () => {
    const result = await validateSourceWithDeps(baseInput, baseDeps);
    expect(result.status).toBe("approved");
    expect(result.confidence).toBe(80);
  });

  it("rejects unreachable source", async () => {
    const result = await validateSourceWithDeps(baseInput, {
      ...baseDeps,
      parseRssFeedOrReject: async () => {
        throw new Error("unreachable");
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("unreachable");
  });

  it("flags low confidence source", async () => {
    let notified = false;
    const result = await validateSourceWithDeps(baseInput, {
      ...baseDeps,
      checkTeamSourceRelevance: async () => ({ relevant: false, confidence: 20 }),
      notifyAdminOfFlaggedSource: async () => {
        notified = true;
        return { delivered: true, reason: "ok" };
      },
    });

    expect(result.status).toBe("flagged");
    expect(result.confidence).toBe(20);
    expect(notified).toBe(true);
  });
});
