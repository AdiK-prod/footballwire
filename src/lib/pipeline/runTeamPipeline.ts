import {
  checkContradiction,
  checkGenericSummary,
  checkTeamRelevance,
  classifyArticleCategory,
  selectAndRankArticles,
  summarizeArticleBody,
} from "../ai/claudePipeline";
import type { ArticleCategory } from "./articleCategory";
import { getCompositeForCategory, getScoreThreshold } from "./articleCategory";
import { categorizeFromTitleAndBody } from "./categorizeFromText";
import { deduplicateByHeadlines } from "./deduplicateCandidates";
import { enforceSourceDiversityInTopFive } from "./diversityTopFive";
import {
  countWords,
  fetchArticleHtml,
  stripHtmlToText,
} from "./fetchArticleBody";
import {
  classifyBlogItem,
  cleanBlogContent,
  fetchLatestRssItems,
} from "./fetchRssItems";
import type { ArticleUpsertPayload, ScoreLogPayload } from "./persistTeamRun";
import { upsertArticlesAndInsertScoreLogs } from "./persistTeamRun";
import type { ApprovedSourceRow } from "../db/pipelineDb";
import {
  createPipelineRun,
  finalizePipelineRun,
  getAlreadyProcessedUrlsToday,
  getTeamById,
  listApprovedSourcesForTeam,
} from "../db/pipelineDb";
import { getServiceRoleClient } from "../supabase/server";
import { createDraftFromSelectedArticles } from "../services/newsletterAssemblyService";
import { config } from "../config";

type Enriched = {
  source: ApprovedSourceRow;
  title: string;
  link: string;
  publishedAt: string;
  rawText: string | null;
  wordCount: number | null;
  passedQuality: boolean;
  relevantToTeam: boolean;
  relevanceReasoning: string | null;
  category: ArticleCategory;
  compositeScore: number;
  passedThreshold: boolean;
  thresholdUsed: number;
  rejectionReason: string | null;
};

type EnrichedRanked = Enriched & { sourceId: number };

const pipelineInfo = (msg: string, extra?: Record<string, unknown>) => {
  console.info(JSON.stringify({ scope: "pipeline", msg, ...extra }));
};

/** Non-NFL content keyword pre-filter — applied to article title before Claude relevance check. */
const NON_NFL_KEYWORDS = [
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
  "ncaa",
];

const isNonNflContent = (title: string): boolean => {
  const lower = title.toLowerCase();
  return NON_NFL_KEYWORDS.some((kw) => lower.includes(kw));
};

/** PRD: generic + contradiction checks — at most one regeneration after the first summary. */
const summarizeWithRetries = async (params: {
  teamDisplayName: string;
  title: string;
  body: string;
  headline: string;
}): Promise<{ summary: string; summaryVersion: number }> => {
  let summaryVersion = 1;
  let summary = await summarizeArticleBody({
    teamDisplayName: params.teamDisplayName,
    title: params.title,
    bodyExcerpt: params.body,
  });

  let bad = false;
  try {
    bad =
      (await checkGenericSummary(summary)) ||
      (await checkContradiction(params.headline, summary));
  } catch {
    bad = false;
  }

  if (bad) {
    summaryVersion = 2;
    summary = await summarizeArticleBody({
      teamDisplayName: params.teamDisplayName,
      title: params.title,
      bodyExcerpt: params.body,
    });
  }

  return { summary, summaryVersion };
};

const statSnippetFromText = (text: string): string | null => {
  const m = text.match(
    /\b\d{1,3}(?:,\d{3})*\s*(?:yards|YAC|TDs?|points|receptions?|carries?)\b/i,
  );
  return m ? m[0] : null;
};

const findStatFromArticles = (
  ordered: Enriched[],
): { snippet: string; article: Enriched } | null => {
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

const buildScoreLogs = (params: {
  runId: number;
  teamId: number;
  fetchDate: string;
  attempts: Enriched[];
  duplicateUrls: Set<string>;
  selectedUrls: Set<string>;
}): ScoreLogPayload[] =>
  params.attempts.map((e) => {
    const isSelected = params.selectedUrls.has(e.link);
    const isDuplicate = params.duplicateUrls.has(e.link);

    let selectionReasoning: string;
    if (isSelected) {
      selectionReasoning = `Selected: ${e.category} article (score: ${e.compositeScore})`;
    } else if (isDuplicate) {
      selectionReasoning = `Rejected: duplicate`;
    } else if (!e.passedQuality) {
      const detail = e.rejectionReason?.includes("unreachable") ? "unreachable" : "word_count";
      selectionReasoning = `Rejected: quality_gate (${detail})`;
    } else if (!e.relevantToTeam) {
      const reasoning = e.relevanceReasoning ?? "not_relevant";
      selectionReasoning = `Rejected: not_relevant — ${reasoning}`;
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
      summary_generated: false,
    };
  });

const toRanked = (e: Enriched): EnrichedRanked => ({
  ...e,
  sourceId: e.source.id,
});

export const runTeamPipeline = async (teamId: number): Promise<void> => {
  let articlesFetched = 0;
  let passedQualityCount = 0;
  let scoredCount = 0;

  const attempts: Enriched[] = [];

  let runId = 0;
  let pipelineSucceeded = false;
  let lastError: string | null = null;

  try {
    const team = await getTeamById(teamId);
    runId = await createPipelineRun(teamId);
    const fetchDate = new Date().toISOString().slice(0, 10);
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
        notes: "No approved sources",
      });
      pipelineSucceeded = true;
      return;
    }

    // Same-day URL deduplication — fetch once before source loop
    let alreadyProcessedUrls: Set<string>;
    try {
      alreadyProcessedUrls = await getAlreadyProcessedUrlsToday(teamId, fetchDate);
    } catch (err) {
      pipelineInfo("same_day_dedup_query_failed", {
        teamId,
        message: err instanceof Error ? err.message : "unknown",
      });
      alreadyProcessedUrls = new Set();
    }

    // Track source name per URL for newsletter assembly
    const urlToSourceName = new Map<string, string>();

    for (const source of sources) {
      let items: Awaited<ReturnType<typeof fetchLatestRssItems>> = [];
      try {
        items = await fetchLatestRssItems(source.url, 3);
      } catch (error) {
        pipelineInfo("rss_failed", {
          sourceId: source.id,
          error: error instanceof Error ? error.message : "unknown",
        });
        continue;
      }

      for (const item of items) {
        articlesFetched += 1;

        // Same-day URL deduplication — skip entirely (don't log)
        if (alreadyProcessedUrls.has(item.link)) {
          pipelineInfo("same_day_dedup_skip", { teamId, url: item.link });
          articlesFetched -= 1; // Don't count skipped articles
          continue;
        }

        // ── Body extraction: blog feeds use content:encoded; news feeds scrape ──
        let rawText: string | null = null;
        let wc = 0;

        if (source.feed_type === "blog") {
          const ce = item.contentEncoded ?? "";
          const blogType = classifyBlogItem({
            title: item.title,
            contentEncoded: ce,
            wordCount: countWords(cleanBlogContent(ce)),
          });

          if (blogType === "video") {
            // Video items have no summarisable text — skip entirely
            articlesFetched -= 1;
            pipelineInfo("blog_video_skipped", { teamId, sourceId: source.id, url: item.link });
            continue;
          }

          rawText = cleanBlogContent(ce);
          wc = countWords(rawText);
        } else {
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
              rejectionReason: "quality_gate (unreachable)",
            });
            continue;
          }
          rawText = stripHtmlToText(bodyRes.html);
          wc = countWords(rawText);
        }

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
            rejectionReason: "quality_gate (word_count)",
          });
          continue;
        }

        passedQualityCount += 1;

        // Non-NFL pre-filter: discard non-NFL content before Claude API call
        if (isNonNflContent(item.title)) {
          attempts.push({
            source,
            title: item.title,
            link: item.link,
            publishedAt: new Date(item.pubDate).toISOString(),
            rawText: rawText ?? null,
            wordCount: wc,
            passedQuality: true,
            relevantToTeam: false,
            relevanceReasoning: "non-NFL content",
            category: "general",
            compositeScore: getCompositeForCategory("general"),
            passedThreshold: false,
            thresholdUsed: getScoreThreshold(false),
            rejectionReason: "not_relevant",
          });
          continue;
        }

        // Team relevance gate — Claude API call per article
        let relevantToTeam = false;
        let relevanceReasoning = "";
        const isGeneralSource = source.type === "general";
        try {
          const relResult = await checkTeamRelevance({
            teamDisplayName: teamDisplay,
            title: item.title,
            bodyExcerpt: rawText ?? "",
            isGeneralSource,
          });
          relevantToTeam = relResult.relevant;
          relevanceReasoning = relResult.reasoning;
        } catch (err) {
          pipelineInfo("relevance_claude_failed", {
            teamId,
            sourceId: source.id,
            message: err instanceof Error ? err.message : "unknown",
          });
          // Default to not_relevant on API failure — never pass articles through on error
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
            rejectionReason: "not_relevant",
          });
          continue;
        }

        // Category classification
        let category: ArticleCategory = "general";
        try {
          category = await classifyArticleCategory({
            title: item.title,
            bodyExcerpt: rawText ?? "",
          });
        } catch (err) {
          pipelineInfo("category_claude_failed", {
            teamId,
            sourceId: source.id,
            message: err instanceof Error ? err.message : "unknown",
          });
          category = categorizeFromTitleAndBody(item.title, rawText ?? "");
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
          rejectionReason: passedThreshold ? null : "below_threshold",
        });
      }
    }

    // Dedup runs on quality + relevance passed articles only (Step 4 per PRD)
    const relevancePassedSorted = [
      ...attempts.filter((a) => a.passedQuality && a.relevantToTeam),
    ].sort((a, b) => b.compositeScore - a.compositeScore);

    const { kept, dropped } = await deduplicateByHeadlines(relevancePassedSorted);
    const duplicateUrls = new Set(dropped.map((d) => d.link));

    const thresholdKept = kept.filter((k) => k.passedThreshold);
    const nonInjuryRanked = thresholdKept
      .filter((k) => k.category !== "injury")
      .map(toRanked);

    // ── Claude prioritization: when > 5 non-injury candidates compete, ask
    //    Claude to pick the best 5 rather than blindly taking the top scores ──
    let diversified: typeof nonInjuryRanked;
    if (nonInjuryRanked.length > 5) {
      const candidates = nonInjuryRanked.map((a, i) => ({
        index: i,
        title: a.title,
        category: a.category,
        compositeScore: a.compositeScore,
        wordCount: a.wordCount,
        sourceType: a.source.type,
      }));
      try {
        const chosen = await selectAndRankArticles({
          teamDisplayName: teamDisplay,
          candidates,
          limit: 5,
        });
        const claudePicked = chosen.map((i) => nonInjuryRanked[i]).filter(Boolean);
        diversified = enforceSourceDiversityInTopFive(claudePicked);
      } catch {
        diversified = enforceSourceDiversityInTopFive(nonInjuryRanked);
      }
    } else {
      diversified = enforceSourceDiversityInTopFive(nonInjuryRanked);
    }

    const lead = diversified[0];
    const quick = diversified.slice(1, 5);
    const injuries = kept.filter((k) => k.category === "injury");

    const toSummarize: Enriched[] = [];
    const seen = new Set<string>();
    const pushUnique = (e: Enriched | undefined) => {
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

    const articlesPayload: ArticleUpsertPayload[] = [];

    for (const item of toSummarize) {
      if (!item.passedQuality || !item.relevantToTeam) {
        continue;
      }
      const bodyText = item.rawText ?? "";
      const { summary, summaryVersion } = await summarizeWithRetries({
        teamDisplayName: teamDisplay,
        title: item.title,
        body: bodyText,
        headline: item.title,
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
        word_count: item.wordCount,
      });
    }

    const scoreLogs = buildScoreLogs({
      runId,
      teamId,
      fetchDate,
      attempts,
      duplicateUrls,
      selectedUrls,
    });

    for (const log of scoreLogs) {
      if (articlesPayload.some((a) => a.original_url === log.original_url)) {
        log.summary_generated = true;
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
      (x) => x.passedQuality && x.relevantToTeam,
    ).length;

    const urlToId = await upsertArticlesAndInsertScoreLogs(supabase, {
      articles: articlesPayload,
      logs: scoreLogs,
    });

    if (articlesPayload.length > 0) {
      try {
        await createDraftFromSelectedArticles({
          team,
          selectedArticles: articlesPayload
            .map((a) => ({
              id: urlToId.get(a.original_url) ?? 0,
              title: a.title,
              ai_summary: a.ai_summary,
              original_url: a.original_url,
              source_name: urlToSourceName.get(a.original_url) ?? "",
              category: a.category as ArticleCategory,
              published_at: a.published_at,
            }))
            .filter((a) => a.id > 0),
          pipelineNotes: statHit
            ? JSON.stringify({
                statSnippet: statHit.snippet,
                statArticleId: urlToId.get(statHit.article.link) ?? null,
                statSourceName: urlToSourceName.get(statHit.article.link) ?? null,
              })
            : null,
          appBaseUrl: config.appBaseUrl,
        });
      } catch (draftError) {
        pipelineInfo("newsletter_draft_failed", {
          teamId,
          message: draftError instanceof Error ? draftError.message : "unknown",
        });
      }
    }

    let notes: string | null = null;
    if (statHit) {
      notes = JSON.stringify({
        statSnippet: statHit.snippet,
        statArticleId: urlToId.get(statHit.article.link) ?? null,
      });
    }

    await finalizePipelineRun({
      runId,
      status: "completed",
      articlesFetched,
      passedQuality: passedQualityCount,
      articlesScored: scoredCount,
      articlesSelected,
      notes,
    });
    pipelineSucceeded = true;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "pipeline failed";
    const stack = error instanceof Error ? (error.stack ?? "no stack") : "no stack";
    // Include first 3 stack frames in notes so error source is visible in DB
    const stackSummary = stack.split("\n").slice(0, 4).join(" | ").slice(0, 500);
    pipelineInfo("team_pipeline_failed", { teamId, message: lastError, stack: stackSummary });
    lastError = `${lastError} | stack: ${stackSummary}`;
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
          notes: lastError ?? "pipeline_failed_before_success_finalize",
        });
      } catch (finalizeErr) {
        pipelineInfo("finalize_failed_in_finally", {
          runId,
          message: finalizeErr instanceof Error ? finalizeErr.message : "unknown",
        });
      }
    }
  }
};
