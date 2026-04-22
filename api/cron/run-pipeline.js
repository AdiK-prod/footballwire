// src/lib/config.ts
var viteEnv = import.meta.env ?? {};
var serverEnv = () => globalThis.process?.env;
var str = (value) => (value ?? "").trim();
var resolveSupabaseUrl = () => str(viteEnv.VITE_SUPABASE_URL) || str(serverEnv()?.VITE_SUPABASE_URL) || str(serverEnv()?.SUPABASE_URL) || str(serverEnv()?.NEXT_PUBLIC_SUPABASE_URL);
var resolveSupabaseAnonKey = () => str(viteEnv.VITE_SUPABASE_ANON_KEY) || str(serverEnv()?.VITE_SUPABASE_ANON_KEY) || str(serverEnv()?.SUPABASE_ANON_KEY) || str(serverEnv()?.NEXT_PUBLIC_SUPABASE_ANON_KEY);
var getCronSecret = () => {
  const e = serverEnv();
  return e?.CRON_SECRET ?? e?.VERCEL_CRON_SECRET ?? "";
};
var config = {
  get supabaseUrl() {
    return resolveSupabaseUrl();
  },
  get supabaseAnonKey() {
    return resolveSupabaseAnonKey();
  },
  // Server-only values are intentionally non-VITE so they stay private.
  get supabaseServiceRoleKey() {
    return str(serverEnv()?.SUPABASE_SERVICE_ROLE_KEY);
  },
  get anthropicApiKey() {
    return str(serverEnv()?.ANTHROPIC_API_KEY);
  },
  /** Override default model if snapshot ID is unavailable (400). See docs.anthropic.com models. */
  get anthropicModel() {
    return str(serverEnv()?.ANTHROPIC_MODEL) || str(serverEnv()?.CLAUDE_MODEL) || "claude-haiku-4-5-20251001";
  },
  get resendApiKey() {
    return str(serverEnv()?.RESEND_API_KEY);
  },
  get resendFrom() {
    return str(serverEnv()?.RESEND_FROM);
  },
  get resendDisplayName() {
    return str(serverEnv()?.RESEND_DISPLAY_NAME) || "FootballWire";
  },
  get adminAlertEmail() {
    return str(serverEnv()?.ADMIN_ALERT_EMAIL);
  },
  get appBaseUrl() {
    return str(serverEnv()?.APP_BASE_URL) || str(serverEnv()?.NEXT_PUBLIC_APP_BASE_URL) || "https://www.footballwire.uk";
  },
  get trackingSecret() {
    return str(serverEnv()?.TRACKING_SECRET);
  },
  get unsubscribeSecret() {
    return str(serverEnv()?.UNSUBSCRIBE_SECRET) || str(serverEnv()?.TRACKING_SECRET);
  }
};

// src/lib/cron/authorizeCronRequest.ts
function authorizeCronRequest(request) {
  const secret = getCronSecret();
  if (!secret) {
    return false;
  }
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return false;
  }
  return auth.slice("Bearer ".length) === secret;
}

// src/lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";
var getServiceRoleClient = () => {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase URL or service role key. Set VITE_SUPABASE_URL or SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY (Vercel env for API routes)."
    );
  }
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

// src/lib/db/pipelineDb.ts
var getActiveSubscriberTeamIds = async () => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from("subscribers").select("team_id").eq("is_active", true);
  if (error) {
    throw new Error(`Active teams query failed: ${error.message}`);
  }
  const ids = /* @__PURE__ */ new Set();
  for (const row of data ?? []) {
    if (typeof row.team_id === "number") {
      ids.add(row.team_id);
    }
  }
  return [...ids];
};
var listApprovedSourcesForTeam = async (teamId) => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from("sources").select("id, team_id, url, name, type").eq("status", "approved").or(`team_id.is.null,team_id.eq.${teamId}`);
  if (error) {
    throw new Error(`Sources query failed: ${error.message}`);
  }
  return data ?? [];
};
var getTeamById = async (teamId) => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from("teams").select(
    "id, name, city, slug, abbreviation, primary_color, secondary_color, accent_color, division, conference"
  ).eq("id", teamId).single();
  if (error || !data) {
    throw new Error(`Team ${teamId} not found: ${error?.message ?? "unknown"}`);
  }
  return data;
};
var getAlreadyProcessedUrlsToday = async (teamId, fetchDate) => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from("article_scores_log").select("original_url").eq("team_id", teamId).eq("fetch_date", fetchDate);
  if (error) {
    throw new Error(`same-day dedup query failed: ${error.message}`);
  }
  const urls = /* @__PURE__ */ new Set();
  for (const row of data ?? []) {
    if (typeof row.original_url === "string") {
      urls.add(row.original_url);
    }
  }
  return urls;
};
var createPipelineRun = async (teamId) => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from("pipeline_runs").insert({
    team_id: teamId,
    status: "partial",
    articles_fetched: 0,
    articles_passed_quality_gate: 0,
    articles_scored: 0,
    articles_selected: 0
  }).select("id").single();
  if (error || !data) {
    throw new Error(`pipeline_runs insert failed: ${error?.message ?? "unknown"}`);
  }
  return data.id;
};
var finalizePipelineRun = async (params) => {
  const supabase = getServiceRoleClient();
  const { error } = await supabase.from("pipeline_runs").update({
    status: params.status,
    articles_fetched: params.articlesFetched,
    articles_passed_quality_gate: params.passedQuality,
    articles_scored: params.articlesScored,
    articles_selected: params.articlesSelected,
    notes: params.notes ?? null
  }).eq("id", params.runId);
  if (error) {
    throw new Error(`pipeline_runs finalize failed: ${error.message}`);
  }
};

// src/lib/pipeline/summaryText.ts
var SENTENCE_SPLIT = /(?<=[.!?])\s+/;
var enforceMaxThreeSentences = (text) => {
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

// src/lib/ai/anthropicHttp.ts
var formatAnthropicHttpError = async (response) => {
  try {
    const data = await response.json();
    const msg = data.error?.message?.trim();
    if (msg) {
      return `${response.status}: ${msg}`;
    }
  } catch {
  }
  return `${response.status}`;
};

// src/lib/ai/claudePipeline.ts
var VALID_CATEGORIES = [
  "transaction",
  "injury",
  "game_analysis",
  "rumor",
  "general"
];
var isArticleCategory = (value) => VALID_CATEGORIES.includes(value);
var stripJsonFences = (value) => value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
var postClaude = async (system, user, maxTokens) => {
  if (!config.anthropicApiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }]
    })
  });
  if (!response.ok) {
    const detail = await formatAnthropicHttpError(response);
    throw new Error(`Claude API failed: ${detail}`);
  }
  const payload = await response.json();
  return payload.content?.find((item) => item.type === "text")?.text ?? "";
};
var checkTeamRelevance = async (params) => {
  const confidenceThreshold = params.isGeneralSource ? 70 : 50;
  let raw = "";
  try {
    raw = await postClaude(
      "You assess NFL article team relevance. Reply JSON only.",
      `Is the ${params.teamDisplayName} a PRIMARY subject of this article?
PRIMARY means: the article is substantially about this team, their players, coaches, or front office decisions. A passing mention does not count.

Article title: ${params.title}
Article body excerpt: ${params.bodyExcerpt.slice(0, 1e3)}

Reply JSON only: { "relevant": boolean, "confidence": 0-100, "reasoning": "one sentence" }`,
      150
    );
    const parsed = JSON.parse(stripJsonFences(raw));
    const relevant = Boolean(parsed.relevant);
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "";
    const passes = relevant && confidence >= confidenceThreshold;
    return { relevant: passes, confidence, reasoning };
  } catch {
    return { relevant: false, confidence: 0, reasoning: "parse_error" };
  }
};
var classifyArticleCategory = async (params) => {
  const text = await postClaude(
    "You classify NFL news articles into exactly one category. JSON only.",
    `Choose one category: transaction | injury | game_analysis | rumor | general

transaction: trades, signings, cuts, waivers, roster moves
injury: injuries, IR, practice status, health
game_analysis: recaps, film, grades, snap counts, breakdowns
rumor: rumors, unnamed sources, speculation
general: everything else

Title: ${params.title}

Body excerpt:
${params.bodyExcerpt.slice(0, 8e3)}

Reply JSON: {"category":"transaction"|"injury"|"game_analysis"|"rumor"|"general"}`,
    200
  );
  const parsed = JSON.parse(stripJsonFences(text));
  const raw = parsed.category?.trim().toLowerCase() ?? "";
  if (isArticleCategory(raw)) {
    return raw;
  }
  return "general";
};
var confirmSameStory = async (headlineA, headlineB) => {
  const text = await postClaude(
    'You compare NFL news headlines. Reply JSON only: {"same_story": boolean}',
    `Do these two headlines refer to the same underlying news story?
A: ${headlineA}
B: ${headlineB}`,
    100
  );
  const parsed = JSON.parse(stripJsonFences(text));
  return Boolean(parsed.same_story);
};
var summarizeArticleBody = async (params) => {
  const text = await postClaude(
    "You write short factual newsletter summaries for NFL fans. Max 3 sentences. JSON only.",
    `Summarize for fans of ${params.teamDisplayName}. Title: ${params.title}

Body excerpt:
${params.bodyExcerpt.slice(0, 12e3)}

Reply JSON: {"summary": string}`,
    500
  );
  const parsed = JSON.parse(stripJsonFences(text));
  const summary = parsed.summary?.trim() ?? "";
  if (!summary) {
    throw new Error("Empty summary from Claude");
  }
  return enforceMaxThreeSentences(summary);
};
var checkGenericSummary = async (summary) => {
  const text = await postClaude(
    "Detect generic filler in summaries. JSON only.",
    `Is this summary mostly generic filler (e.g. "great game", "exciting news") without concrete facts?
${summary}

Reply JSON: {"generic": boolean}`,
    100
  );
  const parsed = JSON.parse(stripJsonFences(text));
  return Boolean(parsed.generic);
};
var checkContradiction = async (headline, summary) => {
  const text = await postClaude(
    "Detect contradiction between headline and summary. JSON only.",
    `Headline: ${headline}
Summary: ${summary}

Reply JSON: {"contradicts": boolean}`,
    100
  );
  const parsed = JSON.parse(stripJsonFences(text));
  return Boolean(parsed.contradicts);
};

// src/lib/pipeline/articleCategory.ts
var COMPOSITE_BY_CATEGORY = {
  transaction: 85,
  injury: 80,
  game_analysis: 70,
  rumor: 60,
  general: 50
};
var getCompositeForCategory = (category) => COMPOSITE_BY_CATEGORY[category];
var getScoreThreshold = (lowVolume) => lowVolume ? 55 : 65;

// src/lib/pipeline/categorizeFromText.ts
var patterns = [
  { category: "injury", re: /\b(ir\b|injury|injuries|injured|concussion|cleared to play|questionable|doubtful|out for|placed on ir)\b/i },
  { category: "transaction", re: /\b(trade|traded|signed|signing|contract extension|released|waived|cut\b|re-signed|franchise tag)\b/i },
  { category: "game_analysis", re: /\b(recap|film room|grades|snap counts|snap\b|breakdown|what we learned)\b/i },
  { category: "rumor", re: /\b(rumor|rumors|reportedly|per sources|hearing|could be|may be traded)\b/i }
];
var categorizeFromTitleAndBody = (title, body) => {
  const text = `${title}
${body}`.slice(0, 8e3);
  for (const { category, re } of patterns) {
    if (re.test(text)) {
      return category;
    }
  }
  return "general";
};

// src/lib/pipeline/tokenOverlap.ts
var tokenize = (headline) => {
  return headline.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
};
var headlineTokenOverlapExceeds = (headlineA, headlineB, threshold = 0.7) => {
  const a = new Set(tokenize(headlineA));
  const b = new Set(tokenize(headlineB));
  if (a.size === 0 || b.size === 0) {
    return false;
  }
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) {
      inter += 1;
    }
  }
  const denom = Math.min(a.size, b.size);
  return inter / denom > threshold;
};

// src/lib/pipeline/deduplicateCandidates.ts
var deduplicateByHeadlines = async (sortedByScoreDesc) => {
  const kept = [];
  const dropped = [];
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

// src/lib/pipeline/diversityTopFive.ts
var enforceSourceDiversityInTopFive = (sortedDesc) => {
  if (sortedDesc.length < 5) {
    return sortedDesc;
  }
  const top5 = sortedDesc.slice(0, 5);
  const firstSource = top5[0]?.sourceId;
  const allSame = firstSource !== void 0 && top5.every((x) => x.sourceId === firstSource);
  if (!allSame) {
    return sortedDesc;
  }
  const rest = sortedDesc.slice(5);
  const replacement = rest.find((x) => x.sourceId !== firstSource);
  if (!replacement) {
    return sortedDesc;
  }
  const next = [...sortedDesc];
  next[4] = replacement;
  return next;
};

// src/lib/pipeline/fetchArticleBody.ts
var stripHtmlToText = (html) => {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutStyles.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
};
var countWords = (text) => {
  if (!text.trim()) {
    return 0;
  }
  return text.trim().split(/\s+/).length;
};
var fetchArticleHtml = async (url, timeoutMs = 15e3) => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "FootballWireBot/1.0 (+https://footballwire.uk)",
        accept: "text/html,application/xhtml+xml"
      }
    });
    clearTimeout(id);
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const html = await res.text();
    if (!html.trim()) {
      return { ok: false, reason: "Empty body" };
    }
    return { ok: true, html };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "fetch failed";
    return { ok: false, reason: msg };
  }
};

// src/lib/pipeline/fetchRssItems.ts
import Parser from "rss-parser";
var parser = new Parser();
var fetchLatestRssItems = async (feedUrl, limit) => {
  const parsed = await parser.parseURL(feedUrl);
  const items = (parsed.items ?? []).filter((item) => item.title && item.link && item.pubDate).map((item) => ({
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    description: item.contentSnippet ?? item.description ?? ""
  }));
  items.sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));
  return items.slice(0, limit);
};

// src/lib/pipeline/persistTeamRun.ts
var upsertArticlesAndInsertScoreLogs = async (supabase, params) => {
  const urlToId = /* @__PURE__ */ new Map();
  if (params.articles.length > 0) {
    const { data: upserted, error: upsertError } = await supabase.from("articles").upsert(
      params.articles.map((a) => ({
        source_id: a.source_id,
        team_id: a.team_id,
        title: a.title,
        original_url: a.original_url,
        raw_content: a.raw_content,
        ai_summary: a.ai_summary,
        published_at: a.published_at,
        category: a.category,
        composite_score: a.composite_score,
        relevance_score: a.relevance_score,
        significance_score: a.significance_score,
        credibility_score: a.credibility_score,
        uniqueness_score: a.uniqueness_score,
        selection_reasoning: a.selection_reasoning,
        rejection_reason: a.rejection_reason,
        passed_threshold: a.passed_threshold,
        summary_version: a.summary_version,
        word_count: a.word_count
      })),
      { onConflict: "original_url" }
    ).select("id, original_url");
    if (upsertError) {
      throw new Error(`articles upsert failed: ${upsertError.message}`);
    }
    for (const row of upserted ?? []) {
      urlToId.set(row.original_url, row.id);
    }
  }
  const logsResolved = params.logs.map((log2) => ({
    ...log2,
    article_id: log2.article_id ?? urlToId.get(log2.original_url) ?? null
  }));
  if (logsResolved.length === 0) {
    return urlToId;
  }
  const { error: logError } = await supabase.from("article_scores_log").insert(logsResolved);
  if (logError) {
    throw new Error(`article_scores_log insert failed: ${logError.message}`);
  }
  return urlToId;
};

// src/lib/db/newsletterDb.ts
var withClient = (client) => client ?? getServiceRoleClient();
var createDraftNewsletter = async (draft, client) => {
  const supabase = withClient(client);
  const { data, error } = await supabase.from("newsletters").insert(draft).select("id").single();
  if (error || !data) {
    throw new Error(`newsletters insert failed: ${error?.message ?? "unknown"}`);
  }
  return data.id;
};

// src/lib/services/newsletterAssemblyService.ts
var esc = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
var formatShortDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    });
  } catch {
    return iso;
  }
};
var formatLongDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC"
    });
  } catch {
    return iso;
  }
};
var extractStat = (note) => {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note);
    const snippet = parsed.statSnippet?.trim();
    if (!snippet) return null;
    return { snippet, sourceName: parsed.statSourceName ?? null };
  } catch {
    return null;
  }
};
var sectionLabel = (text, bgColor) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:${bgColor};padding:8px 32px;">
<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#ffffff;line-height:1;">${esc(text)}</span>
</td></tr></table>`;
var buildTopStory = (a, teamColor) => {
  const summary = a.ai_summary ? esc(a.ai_summary) : "";
  const meta = `${esc(a.source_name)} \xB7 ${esc(formatShortDate(a.published_at))}`;
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:#ffffff;padding:24px 32px;">
<p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:700;color:#111111;line-height:1.2;">${esc(a.title)}</p>
${summary ? `<p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:400;color:#444444;line-height:1.6;">${summary}</p>` : ""}
<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;line-height:1.4;">${meta}</p>
<p style="margin:0;"><a href="${esc(a.original_url)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:${teamColor};text-decoration:none;">Read more &#8594;</a></p>
</td></tr></table>`;
};
var buildQuickHit = (a, teamColor, isLast) => {
  const summary = a.ai_summary ? esc(a.ai_summary) : "";
  const meta = `${esc(a.source_name)} \xB7 ${esc(formatShortDate(a.published_at))}`;
  const borderBottom = isLast ? "" : "border-bottom:1px solid #eeeeee;";
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td width="3" style="background:${teamColor};width:3px;"></td>
<td style="background:#f9f9f9;padding:16px 32px 16px 20px;${borderBottom}">
<p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:600;color:#111111;line-height:1.3;">${esc(a.title)}</p>
${summary ? `<p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:400;color:#444444;line-height:1.55;">${summary}</p>` : ""}
<p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;line-height:1.4;">${meta}</p>
<p style="margin:0;"><a href="${esc(a.original_url)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:${teamColor};text-decoration:none;">Read more &#8594;</a></p>
</td></tr></table>`;
};
var buildInjuryRow = (a, isLast) => {
  const summary = a.ai_summary ? esc(a.ai_summary) : "";
  const borderBottom = isLast ? "" : "border-bottom:1px solid #fecaca;";
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:#fff5f5;padding:16px 32px;${borderBottom}">
<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:600;color:#111111;line-height:1.3;">
<span style="color:#dc2626;margin-right:6px;">&#9679;</span>${esc(a.title)}</p>
${summary ? `<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#666666;line-height:1.5;">${summary}</p>` : ""}
<p style="margin:0;"><a href="${esc(a.original_url)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#dc2626;text-decoration:none;">Read more &#8594;</a></p>
</td></tr></table>`;
};
var buildStatBlock = (snippet, sourceName, teamColor) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:#ffffff;padding:28px 32px;text-align:center;">
<p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:40px;font-weight:700;color:${teamColor};line-height:1.1;">${esc(snippet)}</p>
${sourceName ? `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;line-height:1.4;">Source: ${esc(sourceName)}</p>` : ""}
</td></tr></table>`;
var buildLightNewsDayNotice = (teamDisplayName) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:#fffbeb;border:1px solid #fde68a;padding:14px 32px;">
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#92400e;line-height:1.5;">
&#9888; Light news day for ${esc(teamDisplayName)} &#8212; Limited verified coverage today.</p>
</td></tr></table>`;
var buildNewsletterHtml = (params) => {
  const teamColor = params.team.primary_color || "#111111";
  const teamDisplayName = `${params.team.city} ${params.team.name}`;
  const dateStr = formatLongDate((/* @__PURE__ */ new Date()).toISOString());
  const nonInjury = params.selectedArticles.filter((a) => a.category !== "injury");
  const lead = nonInjury[0];
  const quick = nonInjury.slice(1, 5);
  const injuries = params.selectedArticles.filter((a) => a.category === "injury");
  const statData = extractStat(params.pipelineNotes);
  const tracking = params.trackingFor(
    params.newsletterIdForTemplate,
    params.subscriberIdForTemplate
  );
  const bodyBlocks = [];
  if (params.selectedArticles.length < 3) {
    bodyBlocks.push(buildLightNewsDayNotice(teamDisplayName));
  }
  if (lead) {
    bodyBlocks.push(sectionLabel("TOP STORY", teamColor));
    bodyBlocks.push(buildTopStory(lead, teamColor));
  }
  if (quick.length > 0) {
    bodyBlocks.push(sectionLabel("QUICK HITS", teamColor));
    quick.forEach((a, i) => {
      bodyBlocks.push(buildQuickHit(a, teamColor, i === quick.length - 1));
    });
  }
  if (injuries.length > 0) {
    bodyBlocks.push(sectionLabel("INJURY REPORT", "#dc2626"));
    injuries.forEach((a, i) => {
      bodyBlocks.push(buildInjuryRow(a, i === injuries.length - 1));
    });
  }
  if (statData) {
    bodyBlocks.push(sectionLabel("STAT OF THE DAY", teamColor));
    bodyBlocks.push(buildStatBlock(statData.snippet, statData.sourceName, teamColor));
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr><td align="center" style="padding:20px 0;">

<table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;">

<!-- HEADER -->
<tr><td style="background:#111111;padding:28px 32px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr><td>
<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#ffffff;line-height:1;">FOOTBALLWIRE</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr><td height="3" style="height:3px;background:${teamColor};font-size:0;line-height:0;">&nbsp;</td></tr>
</table>
<p style="margin:10px 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:22px;font-weight:700;color:#ffffff;line-height:1.2;">${esc(teamDisplayName)} Daily Briefing</p>
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;color:#999999;line-height:1.4;">${esc(dateStr)} &middot; 5-min read</p>
</td></tr>
</table>
</td></tr>

<!-- BODY CONTENT -->
<tr><td>
${bodyBlocks.join("\n")}
</td></tr>

<!-- FOOTER -->
<tr><td style="background:#f4f4f4;border-top:1px solid #e0e0e0;padding:24px 32px;text-align:center;">
<p style="margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#888888;line-height:1.4;">Was this useful?</p>
<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:0 auto 16px auto;">
<tr>
<td style="padding-right:8px;">
<a href="${esc(tracking.thumbsUpUrl)}" style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#444444;text-decoration:none;border:1px solid #dddddd;background:#ffffff;padding:8px 20px;border-radius:4px;">&#128077; Yes</a>
</td>
<td>
<a href="${esc(tracking.thumbsDownUrl)}" style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#444444;text-decoration:none;border:1px solid #dddddd;background:#ffffff;padding:8px 20px;border-radius:4px;">&#128078; No</a>
</td>
</tr>
</table>
<p style="margin:0 0 8px 0;">
<a href="${esc(tracking.unsubscribeUrl)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;text-decoration:none;">Unsubscribe</a>
<span style="color:#bbbbbb;margin:0 6px;">&#183;</span>
<a href="${esc(params.appBaseUrl)}/submit-source" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;text-decoration:none;">Submit a source</a>
</p>
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#bbbbbb;line-height:1.4;">FOOTBALLWIRE &middot; Daily team briefings</p>
</td></tr>

</table>

</td></tr>
</table>

<img src="${esc(tracking.openPixelUrl)}" alt="" width="1" height="1" style="display:block;border:0;width:1px;height:1px;" />
</body>
</html>`;
  return {
    subject: `${teamDisplayName} | Daily Briefing`,
    html
  };
};
var createDraftFromSelectedArticles = async (params) => {
  if (params.selectedArticles.length === 0) {
    return null;
  }
  const placeholderSubscriberId = params.placeholderSubscriberId ?? 0;
  const placeholderNewsletterId = 0;
  const template = buildNewsletterHtml({
    team: params.team,
    selectedArticles: params.selectedArticles,
    pipelineNotes: params.pipelineNotes,
    appBaseUrl: params.appBaseUrl,
    newsletterIdForTemplate: placeholderNewsletterId,
    subscriberIdForTemplate: placeholderSubscriberId,
    trackingFor: (newsletterId, subscriberId) => {
      const base = params.appBaseUrl.replace(/\/+$/, "");
      return {
        openPixelUrl: `${base}/api/track/open?nid=${newsletterId}&sid=${subscriberId}&sig=SIGNATURE`,
        thumbsUpUrl: `${base}/api/track/feedback?nid=${newsletterId}&sid=${subscriberId}&v=thumbs_up&sig=SIGNATURE`,
        thumbsDownUrl: `${base}/api/track/feedback?nid=${newsletterId}&sid=${subscriberId}&v=thumbs_down&sig=SIGNATURE`,
        unsubscribeUrl: `${base}/api/unsubscribe?sid=${subscriberId}&sig=SIGNATURE`
      };
    }
  });
  return createDraftNewsletter({
    team_id: params.team.id,
    subject_line: template.subject,
    html_content: template.html,
    status: "draft"
  });
};

// src/lib/pipeline/runTeamPipeline.ts
var pipelineInfo = (msg, extra) => {
  console.info(JSON.stringify({ scope: "pipeline", msg, ...extra }));
};
var NON_NFL_KEYWORDS = [
  "ufl",
  "mls",
  "mlb",
  "nba",
  "nhl",
  "golf",
  "soccer",
  "tennis",
  "cricket",
  "college football",
  "ncaa"
];
var isNonNflContent = (title) => {
  const lower = title.toLowerCase();
  return NON_NFL_KEYWORDS.some((kw) => lower.includes(kw));
};
var summarizeWithRetries = async (params) => {
  let summaryVersion = 1;
  let summary = await summarizeArticleBody({
    teamDisplayName: params.teamDisplayName,
    title: params.title,
    bodyExcerpt: params.body
  });
  let bad = false;
  try {
    bad = await checkGenericSummary(summary) || await checkContradiction(params.headline, summary);
  } catch {
    bad = false;
  }
  if (bad) {
    summaryVersion = 2;
    summary = await summarizeArticleBody({
      teamDisplayName: params.teamDisplayName,
      title: params.title,
      bodyExcerpt: params.body
    });
  }
  return { summary, summaryVersion };
};
var statSnippetFromText = (text) => {
  const m = text.match(
    /\b\d{1,3}(?:,\d{3})*\s*(?:yards|YAC|TDs?|points|receptions?|carries?)\b/i
  );
  return m ? m[0] : null;
};
var findStatFromArticles = (ordered) => {
  for (const a of ordered) {
    if (!a.rawText || !a.passedQuality) {
      continue;
    }
    const s = statSnippetFromText(a.rawText);
    if (s) {
      return { snippet: s, article: a };
    }
  }
  return null;
};
var buildScoreLogs = (params) => params.attempts.map((e) => {
  const isSelected = params.selectedUrls.has(e.link);
  const isDuplicate = params.duplicateUrls.has(e.link);
  let selectionReasoning;
  if (isSelected) {
    selectionReasoning = `Selected: ${e.category} article (score: ${e.compositeScore})`;
  } else if (isDuplicate) {
    selectionReasoning = `Rejected: duplicate`;
  } else if (!e.passedQuality) {
    const detail = e.rejectionReason?.includes("unreachable") ? "unreachable" : "word_count";
    selectionReasoning = `Rejected: quality_gate (${detail})`;
  } else if (!e.relevantToTeam) {
    const reasoning = e.relevanceReasoning ?? "not_relevant";
    selectionReasoning = `Rejected: not_relevant \u2014 ${reasoning}`;
  } else {
    selectionReasoning = `Rejected: below_threshold (score: ${e.compositeScore}, threshold: ${e.thresholdUsed})`;
  }
  return {
    pipeline_run_id: params.runId,
    article_id: null,
    team_id: params.teamId,
    source_id: e.source.id,
    source_name: e.source.name,
    source_type: e.source.type,
    fetch_date: params.fetchDate,
    headline: e.title,
    original_url: e.link,
    word_count: e.wordCount,
    relevance_score: null,
    significance_score: null,
    credibility_score: null,
    uniqueness_score: null,
    composite_score: e.compositeScore,
    selection_reasoning: selectionReasoning,
    rejection_reason: isDuplicate ? "duplicate" : e.rejectionReason,
    passed_quality_gate: e.passedQuality,
    passed_threshold: e.passedThreshold,
    threshold_at_time: e.thresholdUsed,
    summary_generated: false
  };
});
var toRanked = (e) => ({
  ...e,
  sourceId: e.source.id
});
var runTeamPipeline = async (teamId) => {
  let articlesFetched = 0;
  let passedQualityCount = 0;
  let scoredCount = 0;
  const attempts = [];
  let runId = 0;
  let pipelineSucceeded = false;
  let lastError = null;
  try {
    const team = await getTeamById(teamId);
    runId = await createPipelineRun(teamId);
    const fetchDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const supabase = getServiceRoleClient();
    const teamDisplay = `${team.city} ${team.name}`;
    const sources = await listApprovedSourcesForTeam(teamId);
    if (sources.length === 0) {
      pipelineInfo("no_approved_sources", { teamId });
      await finalizePipelineRun({
        runId,
        status: "completed",
        articlesFetched: 0,
        passedQuality: 0,
        articlesScored: 0,
        articlesSelected: 0,
        notes: "No approved sources"
      });
      pipelineSucceeded = true;
      return;
    }
    let alreadyProcessedUrls;
    try {
      alreadyProcessedUrls = await getAlreadyProcessedUrlsToday(teamId, fetchDate);
    } catch (err) {
      pipelineInfo("same_day_dedup_query_failed", {
        teamId,
        message: err instanceof Error ? err.message : "unknown"
      });
      alreadyProcessedUrls = /* @__PURE__ */ new Set();
    }
    const urlToSourceName = /* @__PURE__ */ new Map();
    for (const source of sources) {
      let items = [];
      try {
        items = await fetchLatestRssItems(source.url, 3);
      } catch (error) {
        pipelineInfo("rss_failed", {
          sourceId: source.id,
          error: error instanceof Error ? error.message : "unknown"
        });
        continue;
      }
      for (const item of items) {
        articlesFetched += 1;
        if (alreadyProcessedUrls.has(item.link)) {
          pipelineInfo("same_day_dedup_skip", { teamId, url: item.link });
          articlesFetched -= 1;
          continue;
        }
        const bodyRes = await fetchArticleHtml(item.link);
        if (!bodyRes.ok) {
          attempts.push({
            source,
            title: item.title,
            link: item.link,
            publishedAt: new Date(item.pubDate).toISOString(),
            rawText: null,
            wordCount: null,
            passedQuality: false,
            relevantToTeam: false,
            relevanceReasoning: null,
            category: "general",
            compositeScore: getCompositeForCategory("general"),
            passedThreshold: false,
            thresholdUsed: getScoreThreshold(false),
            rejectionReason: "quality_gate (unreachable)"
          });
          continue;
        }
        const rawText = stripHtmlToText(bodyRes.html);
        const wc = countWords(rawText);
        if (wc < 200) {
          attempts.push({
            source,
            title: item.title,
            link: item.link,
            publishedAt: new Date(item.pubDate).toISOString(),
            rawText,
            wordCount: wc,
            passedQuality: false,
            relevantToTeam: false,
            relevanceReasoning: null,
            category: "general",
            compositeScore: getCompositeForCategory("general"),
            passedThreshold: false,
            thresholdUsed: getScoreThreshold(false),
            rejectionReason: "quality_gate (word_count)"
          });
          continue;
        }
        passedQualityCount += 1;
        if (isNonNflContent(item.title)) {
          attempts.push({
            source,
            title: item.title,
            link: item.link,
            publishedAt: new Date(item.pubDate).toISOString(),
            rawText,
            wordCount: wc,
            passedQuality: true,
            relevantToTeam: false,
            relevanceReasoning: "non-NFL content",
            category: "general",
            compositeScore: getCompositeForCategory("general"),
            passedThreshold: false,
            thresholdUsed: getScoreThreshold(false),
            rejectionReason: "not_relevant"
          });
          continue;
        }
        let relevantToTeam = false;
        let relevanceReasoning = "";
        const isGeneralSource = source.type === "general";
        try {
          const relResult = await checkTeamRelevance({
            teamDisplayName: teamDisplay,
            title: item.title,
            bodyExcerpt: rawText,
            isGeneralSource
          });
          relevantToTeam = relResult.relevant;
          relevanceReasoning = relResult.reasoning;
        } catch (err) {
          pipelineInfo("relevance_claude_failed", {
            teamId,
            sourceId: source.id,
            message: err instanceof Error ? err.message : "unknown"
          });
          relevantToTeam = false;
          relevanceReasoning = "relevance_check_failed";
        }
        if (!relevantToTeam) {
          attempts.push({
            source,
            title: item.title,
            link: item.link,
            publishedAt: new Date(item.pubDate).toISOString(),
            rawText,
            wordCount: wc,
            passedQuality: true,
            relevantToTeam: false,
            relevanceReasoning: relevanceReasoning || "not_relevant",
            category: "general",
            compositeScore: getCompositeForCategory("general"),
            passedThreshold: false,
            thresholdUsed: getScoreThreshold(false),
            rejectionReason: "not_relevant"
          });
          continue;
        }
        let category = "general";
        try {
          category = await classifyArticleCategory({
            title: item.title,
            bodyExcerpt: rawText
          });
        } catch (err) {
          pipelineInfo("category_claude_failed", {
            teamId,
            sourceId: source.id,
            message: err instanceof Error ? err.message : "unknown"
          });
          category = categorizeFromTitleAndBody(item.title, rawText);
        }
        const compositeScore = getCompositeForCategory(category);
        scoredCount += 1;
        const threshold = getScoreThreshold(false);
        const passedThreshold = compositeScore >= threshold;
        urlToSourceName.set(item.link, source.name);
        attempts.push({
          source,
          title: item.title,
          link: item.link,
          publishedAt: new Date(item.pubDate).toISOString(),
          rawText,
          wordCount: wc,
          passedQuality: true,
          relevantToTeam: true,
          relevanceReasoning,
          category,
          compositeScore,
          passedThreshold,
          thresholdUsed: threshold,
          rejectionReason: passedThreshold ? null : "below_threshold"
        });
      }
    }
    const relevancePassedSorted = [
      ...attempts.filter((a) => a.passedQuality && a.relevantToTeam)
    ].sort((a, b) => b.compositeScore - a.compositeScore);
    const { kept, dropped } = await deduplicateByHeadlines(relevancePassedSorted);
    const duplicateUrls = new Set(dropped.map((d) => d.link));
    const thresholdKept = kept.filter((k) => k.passedThreshold);
    const nonInjuryRanked = thresholdKept.filter((k) => k.category !== "injury").map(toRanked);
    const diversified = enforceSourceDiversityInTopFive(nonInjuryRanked);
    const lead = diversified[0];
    const quick = diversified.slice(1, 5);
    const injuries = kept.filter((k) => k.category === "injury");
    const toSummarize = [];
    const seen = /* @__PURE__ */ new Set();
    const pushUnique = (e) => {
      if (!e || seen.has(e.link)) {
        return;
      }
      seen.add(e.link);
      toSummarize.push(e);
    };
    pushUnique(lead);
    for (const q of quick) {
      pushUnique(q);
    }
    for (const inj of injuries) {
      pushUnique(inj);
    }
    const selectedUrls = new Set(toSummarize.map((a) => a.link));
    const articlesPayload = [];
    for (const item of toSummarize) {
      if (!item.passedQuality || !item.relevantToTeam) {
        continue;
      }
      const bodyText = item.rawText ?? "";
      const { summary, summaryVersion } = await summarizeWithRetries({
        teamDisplayName: teamDisplay,
        title: item.title,
        body: bodyText,
        headline: item.title
      });
      articlesPayload.push({
        source_id: item.source.id,
        team_id: teamId,
        title: item.title,
        original_url: item.link,
        raw_content: bodyText,
        ai_summary: summary,
        published_at: item.publishedAt,
        category: item.category,
        composite_score: item.compositeScore,
        relevance_score: null,
        significance_score: null,
        credibility_score: null,
        uniqueness_score: null,
        selection_reasoning: `Selected: ${item.category} article (score: ${item.compositeScore})`,
        rejection_reason: null,
        passed_threshold: true,
        summary_version: summaryVersion,
        word_count: item.wordCount
      });
    }
    const scoreLogs = buildScoreLogs({
      runId,
      teamId,
      fetchDate,
      attempts,
      duplicateUrls,
      selectedUrls
    });
    for (const log2 of scoreLogs) {
      if (articlesPayload.some((a) => a.original_url === log2.original_url)) {
        log2.summary_generated = true;
      }
    }
    const statOrdered = [...kept].sort((a, b) => {
      const ga = a.source.type === "general" ? 1 : 0;
      const gb = b.source.type === "general" ? 1 : 0;
      if (ga !== gb) {
        return ga - gb;
      }
      return b.compositeScore - a.compositeScore;
    });
    const statHit = findStatFromArticles(statOrdered);
    if (statHit) {
      pipelineInfo("stat_snippet", { teamId, statLine: statHit.snippet });
    }
    const articlesSelected = toSummarize.filter(
      (x) => x.passedQuality && x.relevantToTeam
    ).length;
    const urlToId = await upsertArticlesAndInsertScoreLogs(supabase, {
      articles: articlesPayload,
      logs: scoreLogs
    });
    if (articlesPayload.length > 0) {
      try {
        await createDraftFromSelectedArticles({
          team,
          selectedArticles: articlesPayload.map((a) => ({
            id: urlToId.get(a.original_url) ?? 0,
            title: a.title,
            ai_summary: a.ai_summary,
            original_url: a.original_url,
            source_name: urlToSourceName.get(a.original_url) ?? "",
            category: a.category,
            published_at: a.published_at
          })).filter((a) => a.id > 0),
          pipelineNotes: statHit ? JSON.stringify({
            statSnippet: statHit.snippet,
            statArticleId: urlToId.get(statHit.article.link) ?? null,
            statSourceName: urlToSourceName.get(statHit.article.link) ?? null
          }) : null,
          appBaseUrl: config.appBaseUrl
        });
      } catch (draftError) {
        pipelineInfo("newsletter_draft_failed", {
          teamId,
          message: draftError instanceof Error ? draftError.message : "unknown"
        });
      }
    }
    let notes = null;
    if (statHit) {
      notes = JSON.stringify({
        statSnippet: statHit.snippet,
        statArticleId: urlToId.get(statHit.article.link) ?? null
      });
    }
    await finalizePipelineRun({
      runId,
      status: "completed",
      articlesFetched,
      passedQuality: passedQualityCount,
      articlesScored: scoredCount,
      articlesSelected,
      notes
    });
    pipelineSucceeded = true;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "pipeline failed";
    pipelineInfo("team_pipeline_failed", { teamId, message: lastError });
    throw error;
  } finally {
    if (runId > 0 && !pipelineSucceeded) {
      try {
        await finalizePipelineRun({
          runId,
          status: "failed",
          articlesFetched,
          passedQuality: passedQualityCount,
          articlesScored: scoredCount,
          articlesSelected: 0,
          notes: lastError ?? "pipeline_failed_before_success_finalize"
        });
      } catch (finalizeErr) {
        pipelineInfo("finalize_failed_in_finally", {
          runId,
          message: finalizeErr instanceof Error ? finalizeErr.message : "unknown"
        });
      }
    }
  }
};

// src/lib/pipeline/runDailyPipeline.ts
var log = (msg, extra) => {
  console.info(JSON.stringify({ scope: "pipeline-orchestrator", msg, ...extra }));
};
var runDailyPipeline = async () => {
  const teamIds = await getActiveSubscriberTeamIds();
  log("active_teams", { count: teamIds.length, teamIds });
  for (const teamId of teamIds) {
    try {
      await runTeamPipeline(teamId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      log("team_run_failed_continuing", { teamId, message });
    }
  }
};

// src/lib/cron/cronRunPipelineHttp.ts
var json = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json"
  }
});
var handleCronRunPipelineRequest = async (request) => {
  if (!authorizeCronRequest(request)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  try {
    await runDailyPipeline();
  } catch (error) {
    const message = error instanceof Error ? error.message : "pipeline failed";
    console.error(JSON.stringify({ scope: "cron", pipelineError: message }));
    return json({ ok: false, error: message }, 500);
  }
  return json(
    {
      ok: true,
      message: "Daily pipeline finished."
    },
    200
  );
};

// server/vercel/run-pipeline.ts
var config2 = {
  maxDuration: 300
};
var vercelReqToWebRequest = (req) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const pathAndQuery = req.url || "/";
  const url = `${proto}://${host}${pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`}`;
  return new Request(url, {
    method: req.method || "GET",
    headers: req.headers
  });
};
async function handler(req, res) {
  const webRes = await handleCronRunPipelineRequest(vercelReqToWebRequest(req));
  const body = await webRes.text();
  res.status(webRes.status);
  const ct = webRes.headers.get("content-type");
  if (ct) {
    res.setHeader("content-type", ct);
  }
  res.send(body);
}
export {
  config2 as config,
  handler as default
};
