import {
  checkContradiction,
  checkGenericSummary,
  classifyArticleCategory,
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
import { fetchLatestRssItems } from "./fetchRssItems";
import type { ArticleUpsertPayload, ScoreLogPayload } from "./persistTeamRun";
import { upsertArticlesAndInsertScoreLogs } from "./persistTeamRun";
import { textMentionsTeam } from "./teamMention";
import type { ApprovedSourceRow } from "../db/pipelineDb";
import {
  createPipelineRun,
  finalizePipelineRun,
  getTeamById,
  listApprovedSourcesForTeam,
} from "../db/pipelineDb";
import { getServiceRoleClient } from "../supabase/server";

type Enriched = {
  source: ApprovedSourceRow;
  title: string;
  link: string;
  publishedAt: string;
  rawText: string | null;
  wordCount: number | null;
  passedQuality: boolean;
  mentionsTeam: boolean;
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
}): ScoreLogPayload[] =>
  params.attempts.map((e) => ({
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
    selection_reasoning: null,
    rejection_reason: params.duplicateUrls.has(e.link) ? "duplicate" : e.rejectionReason,
    passed_quality_gate: e.passedQuality,
    passed_threshold: e.passedThreshold,
    threshold_at_time: e.thresholdUsed,
    summary_generated: false,
  }));

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
            mentionsTeam: false,
            category: "general",
            compositeScore: getCompositeForCategory("general"),
            passedThreshold: false,
            thresholdUsed: getScoreThreshold(false),
            rejectionReason: bodyRes.reason,
          });
          continue;
        }

        const rawText = stripHtmlToText(bodyRes.html);
        const wc = countWords(rawText);
        const passedQuality = wc >= 200;
        if (passedQuality) {
          passedQualityCount += 1;
        }

        let category: ArticleCategory = "general";
        try {
          category = await classifyArticleCategory({
            title: item.title,
            bodyExcerpt: rawText,
          });
        } catch (err) {
          pipelineInfo("category_claude_failed", {
            teamId,
            sourceId: source.id,
            message: err instanceof Error ? err.message : "unknown",
          });
          category = categorizeFromTitleAndBody(item.title, rawText);
        }

        const compositeScore = getCompositeForCategory(category);
        scoredCount += 1;

        const mentions =
          source.type !== "general"
            ? true
            : textMentionsTeam(`${item.title}\n${rawText}`, team);
        const threshold = getScoreThreshold(false);
        const passedThreshold = passedQuality && mentions && compositeScore >= threshold;

        attempts.push({
          source,
          title: item.title,
          link: item.link,
          publishedAt: new Date(item.pubDate).toISOString(),
          rawText,
          wordCount: wc,
          passedQuality,
          mentionsTeam: mentions,
          category,
          compositeScore,
          passedThreshold,
          thresholdUsed: threshold,
          rejectionReason: !passedQuality
            ? "quality_gate"
            : !mentions
              ? "team_filter"
              : !passedThreshold
                ? "below_threshold"
                : null,
        });
      }
    }

    const teamDisplay = `${team.city} ${team.name}`;

    const qualityPassedSorted = [...attempts.filter((a) => a.passedQuality)].sort(
      (a, b) => b.compositeScore - a.compositeScore,
    );

    const { kept, dropped } = await deduplicateByHeadlines(qualityPassedSorted);
    const duplicateUrls = new Set(dropped.map((d) => d.link));

    const thresholdKept = kept.filter((k) => k.passedThreshold);
    const nonInjuryRanked = thresholdKept
      .filter((k) => k.category !== "injury")
      .map(toRanked);

    const diversified = enforceSourceDiversityInTopFive(nonInjuryRanked);

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

    const articlesPayload: ArticleUpsertPayload[] = [];

    for (const item of toSummarize) {
      if (!item.passedQuality || !item.mentionsTeam) {
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
        selection_reasoning: "selected_for_newsletter",
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
      (x) => x.passedQuality && x.mentionsTeam,
    ).length;

    const urlToId = await upsertArticlesAndInsertScoreLogs(supabase, {
      articles: articlesPayload,
      logs: scoreLogs,
    });

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
