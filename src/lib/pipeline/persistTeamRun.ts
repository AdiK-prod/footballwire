/**
 * End-of-run persistence: upsert articles, bulk insert article_scores_log.
 * Not a single DB transaction (PostgREST) — if log insert fails, callers should
 * surface error; optional hardening: add `pipeline_commit_team_run` RPC migration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ArticleUpsertPayload = {
  source_id: number;
  team_id: number;
  title: string;
  original_url: string;
  raw_content: string | null;
  ai_summary: string | null;
  published_at: string;
  category: string;
  composite_score: number | null;
  relevance_score: null;
  significance_score: null;
  credibility_score: null;
  uniqueness_score: null;
  selection_reasoning: string | null;
  rejection_reason: string | null;
  passed_threshold: boolean;
  summary_version: number;
  word_count: number | null;
};

export type ScoreLogPayload = {
  pipeline_run_id: number;
  article_id: number | null;
  team_id: number;
  source_id: number;
  source_name: string;
  source_type: string;
  fetch_date: string;
  headline: string;
  original_url: string;
  word_count: number | null;
  relevance_score: number | null;
  significance_score: number | null;
  credibility_score: number | null;
  uniqueness_score: number | null;
  composite_score: number | null;
  selection_reasoning: string | null;
  rejection_reason: string | null;
  passed_quality_gate: boolean;
  passed_threshold: boolean;
  threshold_at_time: number | null;
  summary_generated: boolean;
};

export const upsertArticlesAndInsertScoreLogs = async (
  supabase: SupabaseClient,
  params: {
    articles: ArticleUpsertPayload[];
    logs: ScoreLogPayload[];
  },
): Promise<void> => {
  const urlToId = new Map<string, number>();

  if (params.articles.length > 0) {
    const { data: upserted, error: upsertError } = await supabase
      .from("articles")
      .upsert(
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
          word_count: a.word_count,
        })),
        { onConflict: "original_url" },
      )
      .select("id, original_url");

    if (upsertError) {
      throw new Error(`articles upsert failed: ${upsertError.message}`);
    }

    for (const row of upserted ?? []) {
      urlToId.set(row.original_url, row.id);
    }
  }

  const logsResolved = params.logs.map((log) => ({
    ...log,
    article_id: log.article_id ?? urlToId.get(log.original_url) ?? null,
  }));

  if (logsResolved.length === 0) {
    return;
  }

  const { error: logError } = await supabase.from("article_scores_log").insert(logsResolved);

  if (logError) {
    throw new Error(`article_scores_log insert failed: ${logError.message}`);
  }
};
