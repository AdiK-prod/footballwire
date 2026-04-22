import { getServiceRoleClient } from "../supabase/server";
import type { Team } from "../types";

export const getActiveSubscriberTeamIds = async (): Promise<number[]> => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("subscribers")
    .select("team_id")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Active teams query failed: ${error.message}`);
  }

  const ids = new Set<number>();
  for (const row of data ?? []) {
    if (typeof row.team_id === "number") {
      ids.add(row.team_id);
    }
  }
  return [...ids];
};

export type ApprovedSourceRow = {
  id: number;
  team_id: number | null;
  url: string;
  name: string;
  type: "general" | "team_specific" | "user_submitted";
};

export const listApprovedSourcesForTeam = async (
  teamId: number,
): Promise<ApprovedSourceRow[]> => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("sources")
    .select("id, team_id, url, name, type")
    .eq("status", "approved")
    .or(`team_id.is.null,team_id.eq.${teamId}`);

  if (error) {
    throw new Error(`Sources query failed: ${error.message}`);
  }

  return (data ?? []) as ApprovedSourceRow[];
};

export const getTeamById = async (teamId: number): Promise<Team> => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("teams")
    .select(
      "id, name, city, slug, abbreviation, primary_color, secondary_color, accent_color, division, conference",
    )
    .eq("id", teamId)
    .single();

  if (error || !data) {
    throw new Error(`Team ${teamId} not found: ${error?.message ?? "unknown"}`);
  }

  return data as Team;
};

/**
 * Same-day URL deduplication: returns URLs already logged for this team today.
 * Prevents re-processing the same articles when pipeline is invoked multiple times per day.
 */
export const getAlreadyProcessedUrlsToday = async (
  teamId: number,
  fetchDate: string,
): Promise<Set<string>> => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("article_scores_log")
    .select("original_url")
    .eq("team_id", teamId)
    .eq("fetch_date", fetchDate);

  if (error) {
    throw new Error(`same-day dedup query failed: ${error.message}`);
  }

  const urls = new Set<string>();
  for (const row of data ?? []) {
    if (typeof row.original_url === "string") {
      urls.add(row.original_url);
    }
  }
  return urls;
};

export const createPipelineRun = async (teamId: number) => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("pipeline_runs")
    .insert({
      team_id: teamId,
      status: "partial",
      articles_fetched: 0,
      articles_passed_quality_gate: 0,
      articles_scored: 0,
      articles_selected: 0,
    })
    .select("id")
    .single<{ id: number }>();

  if (error || !data) {
    throw new Error(`pipeline_runs insert failed: ${error?.message ?? "unknown"}`);
  }

  return data.id;
};

export const finalizePipelineRun = async (params: {
  runId: number;
  status: "completed" | "failed";
  articlesFetched: number;
  passedQuality: number;
  articlesScored: number;
  articlesSelected: number;
  notes?: string | null;
}) => {
  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("pipeline_runs")
    .update({
      status: params.status,
      articles_fetched: params.articlesFetched,
      articles_passed_quality_gate: params.passedQuality,
      articles_scored: params.articlesScored,
      articles_selected: params.articlesSelected,
      notes: params.notes ?? null,
    })
    .eq("id", params.runId);

  if (error) {
    throw new Error(`pipeline_runs finalize failed: ${error.message}`);
  }
};
