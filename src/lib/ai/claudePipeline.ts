import { config } from "../config";
import type { ArticleCategory } from "../pipeline/articleCategory";
import { enforceMaxThreeSentences } from "../pipeline/summaryText";
import { formatAnthropicHttpError } from "./anthropicHttp";

const VALID_CATEGORIES: readonly ArticleCategory[] = [
  "transaction",
  "injury",
  "game_analysis",
  "rumor",
  "general",
];

const isArticleCategory = (value: string): value is ArticleCategory =>
  (VALID_CATEGORIES as readonly string[]).includes(value);

const stripJsonFences = (value: string) =>
  value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

/** Remove chars that commonly break JSON inside Claude string values. */
const sanitizeForPrompt = (text: string): string =>
  text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ").replace(/\\/g, "\\\\").slice(0, 8000);

/** JSON.parse with a fallback — never lets a bad Claude response crash the pipeline. */
const safeJsonParse = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(stripJsonFences(text)) as T;
  } catch {
    return fallback;
  }
};

const postClaude = async (system: string, user: string, maxTokens: number) => {
  if (!config.anthropicApiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!response.ok) {
    const detail = await formatAnthropicHttpError(response);
    throw new Error(`Claude API failed: ${detail}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return payload.content?.find((item) => item.type === "text")?.text ?? "";
};

/**
 * Step 2 Filter — Claude team relevance gate.
 * General sources: relevant=true AND confidence >= 70.
 * Team-specific sources: relevant=true AND confidence >= 50.
 * Parse failure defaults to not_relevant (never passes articles through on error).
 */
export const checkTeamRelevance = async (params: {
  teamDisplayName: string;
  title: string;
  bodyExcerpt: string;
  isGeneralSource: boolean;
}): Promise<{ relevant: boolean; confidence: number; reasoning: string }> => {
  const confidenceThreshold = params.isGeneralSource ? 70 : 50;
  let raw = "";
  try {
    raw = await postClaude(
      "You assess NFL article team relevance. Reply JSON only.",
      `Is the ${params.teamDisplayName} a PRIMARY subject of this article?\n` +
        `PRIMARY means: the article is substantially about this team, their players, coaches, or front office decisions. A passing mention does not count.\n\n` +
        `Article title: ${params.title}\n` +
        `Article body excerpt: ${params.bodyExcerpt.slice(0, 1000)}\n\n` +
        `Reply JSON only: { "relevant": boolean, "confidence": 0-100, "reasoning": "one sentence" }`,
      150,
    );
    const parsed = JSON.parse(stripJsonFences(raw)) as {
      relevant?: boolean;
      confidence?: number;
      reasoning?: string;
    };
    const relevant = Boolean(parsed.relevant);
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "";
    const passes = relevant && confidence >= confidenceThreshold;
    return { relevant: passes, confidence, reasoning };
  } catch {
    return { relevant: false, confidence: 0, reasoning: "parse_error" };
  }
};

/**
 * Phase 3 — category only (Phases 1–7). Composite comes from fixed weights in articleCategory.
 * Four dimension scores are Phase 8.
 */
export const classifyArticleCategory = async (params: {
  title: string;
  bodyExcerpt: string;
}): Promise<ArticleCategory> => {
  const text = await postClaude(
    "You classify NFL news articles into exactly one category. JSON only.",
    `Choose one category: transaction | injury | game_analysis | rumor | general\n\n` +
      `transaction: trades, signings, cuts, waivers, roster moves\n` +
      `injury: injuries, IR, practice status, health\n` +
      `game_analysis: recaps, film, grades, snap counts, breakdowns\n` +
      `rumor: rumors, unnamed sources, speculation\n` +
      `general: everything else\n\n` +
      `Title: ${params.title}\n\nBody excerpt:\n${sanitizeForPrompt(params.bodyExcerpt)}\n\n` +
      `Reply JSON: {"category":"transaction"|"injury"|"game_analysis"|"rumor"|"general"}`,
    200,
  );
  const parsed = safeJsonParse<{ category?: string }>(text, {});
  const raw = parsed.category?.trim().toLowerCase() ?? "";
  if (isArticleCategory(raw)) {
    return raw;
  }
  return "general";
};

/** Layer 2 dedup — only when Layer 1 flagged a pair. */
export const confirmSameStory = async (headlineA: string, headlineB: string) => {
  const text = await postClaude(
    "You compare NFL news headlines. Reply JSON only: {\"same_story\": boolean}",
    `Do these two headlines refer to the same underlying news story?\nA: ${headlineA}\nB: ${headlineB}`,
    100,
  );
  const parsed = safeJsonParse<{ same_story?: boolean }>(text, {});
  return Boolean(parsed.same_story);
};

export const summarizeArticleBody = async (params: {
  teamDisplayName: string;
  title: string;
  bodyExcerpt: string;
}) => {
  const text = await postClaude(
    "You write short factual newsletter summaries for NFL fans. Max 3 sentences. JSON only.",
    `Summarize for fans of ${params.teamDisplayName}. Title: ${params.title}\n\nBody excerpt:\n${sanitizeForPrompt(params.bodyExcerpt)}\n\nReply JSON: {\"summary\": string}`,
    500,
  );
  const parsed = safeJsonParse<{ summary?: string }>(text, {});
  const summary = parsed.summary?.trim() ?? "";
  if (!summary) {
    throw new Error("Empty summary from Claude");
  }
  return enforceMaxThreeSentences(summary);
};

export const checkGenericSummary = async (summary: string) => {
  const text = await postClaude(
    "Detect generic filler in summaries. JSON only.",
    `Is this summary mostly generic filler (e.g. "great game", "exciting news") without concrete facts?\n${summary}\n\nReply JSON: {\"generic\": boolean}`,
    100,
  );
  const parsed = safeJsonParse<{ generic?: boolean }>(text, {});
  return Boolean(parsed.generic);
};

export const checkContradiction = async (headline: string, summary: string) => {
  const text = await postClaude(
    "Detect contradiction between headline and summary. JSON only.",
    `Headline: ${headline}\nSummary: ${summary}\n\nReply JSON: {\"contradicts\": boolean}`,
    100,
  );
  const parsed = safeJsonParse<{ contradicts?: boolean }>(text, {});
  return Boolean(parsed.contradicts);
};
