import { config } from "../config";
import { formatAnthropicHttpError } from "./anthropicHttp";

type RelevanceResult = {
  relevant: boolean;
  confidence: number;
};

const stripJsonFences = (value: string) =>
  value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

export const checkTeamSourceRelevance = async (params: {
  sourceUrl: string;
  sourceTitle: string;
  teamName: string;
}) => {
  if (!config.anthropicApiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  const prompt = `Does this source substantively cover ${params.teamName}?
Source URL: ${params.sourceUrl}
Source title: ${params.sourceTitle}

Reply JSON only. confidence must be an integer 0-100:
{"relevant": boolean, "confidence": integer_0_to_100}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 100,
      temperature: 0.2,
      system:
        "You are a source relevance validator. Return strict JSON with no prose or markdown.",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await formatAnthropicHttpError(response);
    throw new Error(`Claude API failed: ${detail}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = payload.content?.find((item) => item.type === "text")?.text ?? "";
  const parsed = JSON.parse(stripJsonFences(text)) as RelevanceResult;

  if (typeof parsed.relevant !== "boolean" || typeof parsed.confidence !== "number") {
    throw new Error("Invalid Claude relevance JSON");
  }

  // Normalize 0-1 float to 0-100 integer if Claude ignores the scale instruction
  const confidence =
    parsed.confidence > 0 && parsed.confidence <= 1
      ? Math.round(parsed.confidence * 100)
      : Math.round(parsed.confidence);

  return { relevant: parsed.relevant, confidence };
};
