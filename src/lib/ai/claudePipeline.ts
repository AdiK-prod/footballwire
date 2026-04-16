import { config } from "../config";
import type { ArticleCategory } from "../pipeline/articleCategory";
import { enforceMaxThreeSentences } from "../pipeline/summaryText";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

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
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return payload.content?.find((item) => item.type === "text")?.text ?? "";
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
      `Title: ${params.title}\n\nBody excerpt:\n${params.bodyExcerpt.slice(0, 8000)}\n\n` +
      `Reply JSON: {"category":"transaction"|"injury"|"game_analysis"|"rumor"|"general"}`,
    200,
  );
  const parsed = JSON.parse(stripJsonFences(text)) as { category?: string };
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
  const parsed = JSON.parse(stripJsonFences(text)) as { same_story?: boolean };
  return Boolean(parsed.same_story);
};

export const summarizeArticleBody = async (params: {
  teamDisplayName: string;
  title: string;
  bodyExcerpt: string;
}) => {
  const text = await postClaude(
    "You write short factual newsletter summaries for NFL fans. Max 3 sentences. JSON only.",
    `Summarize for fans of ${params.teamDisplayName}. Title: ${params.title}\n\nBody excerpt:\n${params.bodyExcerpt.slice(0, 12_000)}\n\nReply JSON: {\"summary\": string}`,
    500,
  );
  const parsed = JSON.parse(stripJsonFences(text)) as { summary?: string };
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
  const parsed = JSON.parse(stripJsonFences(text)) as { generic?: boolean };
  return Boolean(parsed.generic);
};

export const checkContradiction = async (headline: string, summary: string) => {
  const text = await postClaude(
    "Detect contradiction between headline and summary. JSON only.",
    `Headline: ${headline}\nSummary: ${summary}\n\nReply JSON: {\"contradicts\": boolean}`,
    100,
  );
  const parsed = JSON.parse(stripJsonFences(text)) as { contradicts?: boolean };
  return Boolean(parsed.contradicts);
};
