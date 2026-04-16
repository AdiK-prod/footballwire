import Parser from "rss-parser";
import { z } from "zod";
import { checkTeamSourceRelevance } from "../ai/claude";
import {
  createPendingSource,
  getTeamNameById,
  type SourceRecord,
  type SourceType,
  updateSourceStatus,
} from "../db/sources";
import { notifyAdminOfFlaggedSource } from "./adminNotificationService";

const parser = new Parser();

const validateSourceInputSchema = z
  .object({
    url: z.string().url(),
    teamId: z.number().int().positive().nullable(),
    sourceType: z.enum(["general", "team_specific", "user_submitted"]),
    submittedBy: z.string().min(1).default("system"),
  })
  .superRefine((value, ctx) => {
    if (value.sourceType !== "general" && value.teamId === null) {
      ctx.addIssue({
        code: "custom",
        message: "teamId is required for team_specific and user_submitted sources.",
        path: ["teamId"],
      });
    }
  });

type ValidateSourceInput = z.infer<typeof validateSourceInputSchema>;

type ValidationResult = {
  sourceId: number;
  status: "approved" | "rejected" | "flagged";
  reason: string;
  confidence: number | null;
  parserSample?: {
    title: string;
    link: string;
    pubDate: string;
    description: string;
  };
};

type SourceValidationDeps = {
  createPendingSource: typeof createPendingSource;
  updateSourceStatus: typeof updateSourceStatus;
  getTeamNameById: typeof getTeamNameById;
  checkTeamSourceRelevance: typeof checkTeamSourceRelevance;
  notifyAdminOfFlaggedSource: typeof notifyAdminOfFlaggedSource;
  parseRssFeedOrReject: (url: string) => Promise<{
    title: string;
    link: string;
    pubDate: string;
    description: string;
  }>;
  timeoutMs: number;
};

const parseRssFeedOrReject = async (url: string) => {
  const parsed = await parser.parseURL(url);
  const first = parsed.items[0];

  if (!first?.title || !first.link || !first.pubDate) {
    throw new Error("RSS feed is missing title, link, or pubDate");
  }

  return {
    title: first.title,
    link: first.link,
    pubDate: first.pubDate,
    description: first.description ?? first.contentSnippet ?? "",
  };
};

export const validateSourceInput = (value: unknown): ValidateSourceInput => {
  return validateSourceInputSchema.parse(value);
};

export const resolveStatusFromConfidence = (
  sourceType: SourceType,
  confidence: number,
): "approved" | "flagged" => {
  if (sourceType === "general") {
    return "approved";
  }

  return confidence >= 60 ? "approved" : "flagged";
};

export const validateSource = async (
  input: ValidateSourceInput,
): Promise<ValidationResult> => {
  const deps: SourceValidationDeps = {
    createPendingSource,
    updateSourceStatus,
    getTeamNameById,
    checkTeamSourceRelevance,
    notifyAdminOfFlaggedSource,
    parseRssFeedOrReject,
    timeoutMs: 10_000,
  };

  return validateSourceWithDeps(input, deps);
};

export const validateSourceWithDeps = async (
  input: ValidateSourceInput,
  deps: SourceValidationDeps,
): Promise<ValidationResult> => {
  if (input.sourceType === "general") {
    throw new Error("General sources are pre-approved and must bypass validation.");
  }

  const source: SourceRecord = await deps.createPendingSource({
    url: input.url,
    teamId: input.teamId,
    type: input.sourceType,
    submittedBy: input.submittedBy,
  });

  let sample: ValidationResult["parserSample"] | undefined;

  try {
    sample = await Promise.race([
      deps.parseRssFeedOrReject(input.url),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`RSS reachability timeout (${deps.timeoutMs / 1000}s)`)),
          deps.timeoutMs,
        ),
      ),
    ]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unreachable RSS feed";

    await deps.updateSourceStatus({
      id: source.id,
      status: "rejected",
      relevanceScore: null,
      validationNotes: reason,
    });

    return {
      sourceId: source.id,
      status: "rejected",
      reason,
      confidence: null,
    };
  }

  try {
    const teamName = input.teamId ? await deps.getTeamNameById(input.teamId) : "NFL";
    const relevance = await deps.checkTeamSourceRelevance({
      sourceUrl: input.url,
      sourceTitle: sample.title,
      teamName,
    });

    const status = resolveStatusFromConfidence(input.sourceType, relevance.confidence);

    await deps.updateSourceStatus({
      id: source.id,
      status,
      relevanceScore: relevance.confidence,
      validationNotes:
        status === "approved"
          ? `Approved with confidence ${relevance.confidence}.`
          : `Flagged due to low confidence (${relevance.confidence}).`,
    });

    if (status === "flagged") {
      await deps.notifyAdminOfFlaggedSource({
        sourceId: source.id,
        sourceUrl: input.url,
        reason: `Low relevance confidence (${relevance.confidence}).`,
      });
    }

    return {
      sourceId: source.id,
      status,
      reason:
        status === "approved"
          ? "Source approved based on Claude relevance confidence."
          : "Source flagged due to low Claude confidence.",
      confidence: relevance.confidence,
      parserSample: sample,
    };
  } catch (error) {
    await deps.updateSourceStatus({
      id: source.id,
      status: "flagged",
      relevanceScore: null,
      validationNotes:
        error instanceof Error ? `Claude check failed: ${error.message}` : "Claude check failed.",
    });

    await deps.notifyAdminOfFlaggedSource({
      sourceId: source.id,
      sourceUrl: input.url,
      reason:
        error instanceof Error ? `Claude check failed: ${error.message}` : "Claude check failed.",
    });

    return {
      sourceId: source.id,
      status: "flagged",
      reason:
        error instanceof Error
          ? `Claude check failed: ${error.message}`
          : "Claude check failed unexpectedly.",
      confidence: null,
      parserSample: sample,
    };
  }
};
