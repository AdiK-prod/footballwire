import { getServiceRoleClient } from "../supabase/server";

export type AdminSourceRow = {
  id: number;
  team_id: number | null;
  url: string;
  name: string;
  type: "general" | "team_specific" | "user_submitted";
  feed_type: "news" | "blog";
  status: "pending" | "approved" | "rejected" | "flagged";
  relevance_score: number | null;
  validation_notes: string | null;
  paywall_rate: number | null;
  submitted_by: string | null;
  created_at: string;
  team_city: string | null;
  team_name: string | null;
  team_primary_color: string | null;
};

export type AdminNewsletterRow = {
  id: number;
  team_id: number;
  subject_line: string;
  status: "draft" | "sent" | "failed";
  sent_at: string | null;
  team_city: string;
  team_name: string;
  team_primary_color: string;
};

export type AdminArticleRow = {
  id: number;
  headline: string;
  original_url: string;
  source_name: string;
  source_type: string;
  category: string | null;
  composite_score: number | null;
  selection_reasoning: string | null;
  rejection_reason: string | null;
  passed_threshold: boolean;
  ai_summary: string | null;
  fetch_date: string;
};

export type TeamSubscriberStat = {
  team_id: number;
  team_city: string;
  team_name: string;
  team_primary_color: string;
  active_subscribers: number;
  newsletters_sent_7d: number;
  sends_total_7d: number;
  sends_failed_7d: number;
  opens_total_7d: number;
  thumbs_up_30d: number;
  thumbs_down_30d: number;
  churned_7d: number;
};

/** List pending + flagged sources with team info. Max 50 rows. */
export const listAdminSources = async (params?: {
  status?: string;
  teamId?: number;
  type?: string;
}): Promise<AdminSourceRow[]> => {
  const supabase = getServiceRoleClient();

  let query = supabase
    .from("sources")
    .select(
      "id, team_id, url, name, type, feed_type, status, relevance_score, validation_notes, paywall_rate, submitted_by, created_at, teams(city, name, primary_color)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (params?.status) {
    query = query.eq("status", params.status);
  } else {
    query = query.in("status", ["pending", "flagged"]);
  }
  if (params?.teamId) {
    query = query.eq("team_id", params.teamId);
  }
  if (params?.type) {
    query = query.eq("type", params.type);
  }

  const { data, error } = await query;
  if (error) throw new Error(`adminSources query failed: ${error.message}`);

  return (data ?? []).map((row) => {
    const team = row.teams as
      | { city: string; name: string; primary_color: string }
      | null
      | { city: string; name: string; primary_color: string }[];
    const t = Array.isArray(team) ? team[0] : team;
    return {
      id: row.id,
      team_id: row.team_id,
      url: row.url,
      name: row.name,
      type: row.type as AdminSourceRow["type"],
      feed_type: (row.feed_type as AdminSourceRow["feed_type"]) ?? "news",
      status: row.status as AdminSourceRow["status"],
      relevance_score: row.relevance_score,
      validation_notes: row.validation_notes,
      paywall_rate: row.paywall_rate,
      submitted_by: row.submitted_by,
      created_at: row.created_at,
      team_city: t?.city ?? null,
      team_name: t?.name ?? null,
      team_primary_color: t?.primary_color ?? null,
    };
  });
};

/** Approve, reject, or flag a source. */
export const adminSetSourceStatus = async (
  id: number,
  status: "approved" | "rejected" | "flagged",
  notes?: string,
) => {
  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("sources")
    .update({ status, validation_notes: notes ?? null })
    .eq("id", id);
  if (error) throw new Error(`adminSetSourceStatus failed: ${error.message}`);
};

/** Today's draft newsletters with team info. */
export const listTodaysDraftNewsletters = async (): Promise<AdminNewsletterRow[]> => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("newsletters")
    .select("id, team_id, subject_line, status, sent_at, teams(city, name, primary_color)")
    .eq("status", "draft")
    .order("id", { ascending: false })
    .limit(50);

  if (error) throw new Error(`listTodaysNewsletters failed: ${error.message}`);

  return (data ?? []).map((row) => {
    const team = row.teams as
      | { city: string; name: string; primary_color: string }
      | null
      | { city: string; name: string; primary_color: string }[];
    const t = Array.isArray(team) ? team[0] : team;
    return {
      id: row.id,
      team_id: row.team_id,
      subject_line: row.subject_line,
      status: row.status as AdminNewsletterRow["status"],
      sent_at: row.sent_at,
      team_city: t?.city ?? "",
      team_name: t?.name ?? "",
      team_primary_color: t?.primary_color ?? "#111111",
    };
  });
};

/** Articles scored today for a given team — from article_scores_log joined with articles. */
export const listTodaysArticlesForTeam = async (
  teamId: number,
): Promise<AdminArticleRow[]> => {
  const supabase = getServiceRoleClient();
  const fetchDate = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("article_scores_log")
    .select(
      "id, headline, original_url, source_name, source_type, category, composite_score, selection_reasoning, rejection_reason, passed_threshold, fetch_date, articles(ai_summary)",
    )
    .eq("team_id", teamId)
    .eq("fetch_date", fetchDate)
    .order("composite_score", { ascending: false })
    .limit(50);

  if (error) throw new Error(`listTodaysArticles failed: ${error.message}`);

  return (data ?? []).map((row) => {
    const art = Array.isArray(row.articles)
      ? (row.articles[0] as { ai_summary: string | null } | undefined)
      : (row.articles as { ai_summary: string | null } | null);
    return {
      id: row.id,
      headline: row.headline,
      original_url: row.original_url,
      source_name: row.source_name,
      source_type: row.source_type,
      category: row.category,
      composite_score: row.composite_score,
      selection_reasoning: row.selection_reasoning,
      rejection_reason: row.rejection_reason,
      passed_threshold: row.passed_threshold,
      ai_summary: art?.ai_summary ?? null,
      fetch_date: row.fetch_date,
    };
  });
};

/** Aggregate subscriber stats per team. */
export const getSubscriberStatsByTeam = async (): Promise<TeamSubscriberStat[]> => {
  const supabase = getServiceRoleClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Active subscribers per team (with team info)
  const { data: subData, error: subErr } = await supabase
    .from("subscribers")
    .select("team_id, teams(city, name, primary_color)")
    .eq("is_active", true)
    .limit(10000);
  if (subErr) throw new Error(`subscribers query failed: ${subErr.message}`);

  // Newsletter sends in last 7 days
  const { data: sendData, error: sendErr } = await supabase
    .from("newsletter_sends")
    .select("newsletter_id, status, newsletters(team_id)")
    .gte("sent_at", sevenDaysAgo)
    .limit(5000);
  if (sendErr) throw new Error(`newsletter_sends query failed: ${sendErr.message}`);

  // Opens in last 7 days
  const { data: openData, error: openErr } = await supabase
    .from("newsletter_metrics")
    .select("newsletter_id, opened_at, newsletters(team_id)")
    .gte("opened_at", sevenDaysAgo)
    .not("opened_at", "is", null)
    .limit(5000);
  if (openErr) throw new Error(`newsletter_metrics open query failed: ${openErr.message}`);

  // Feedback in last 30 days
  const { data: feedbackData, error: fbErr } = await supabase
    .from("newsletter_metrics")
    .select("newsletter_id, feedback, newsletters(team_id)")
    .gte("opened_at", thirtyDaysAgo)
    .not("feedback", "is", null)
    .limit(5000);
  if (fbErr) throw new Error(`newsletter_metrics feedback query failed: ${fbErr.message}`);

  // Newsletters sent in last 7 days (for count)
  const { data: nlData } = await supabase
    .from("newsletters")
    .select("id, team_id")
    .eq("status", "sent")
    .gte("sent_at", sevenDaysAgo)
    .limit(500);

  // Churn events in last 7 days
  const { data: churnData } = await supabase
    .from("churn_events")
    .select("team_id")
    .gte("churned_at", sevenDaysAgo)
    .limit(1000);

  // Build team map from subscriber data
  const teamMap = new Map<
    number,
    { city: string; name: string; primary_color: string; count: number }
  >();
  for (const row of subData ?? []) {
    if (!row.team_id) continue;
    const team = row.teams as
      | { city: string; name: string; primary_color: string }
      | null
      | { city: string; name: string; primary_color: string }[];
    const t = Array.isArray(team) ? team[0] : team;
    const existing = teamMap.get(row.team_id);
    if (existing) {
      existing.count += 1;
    } else {
      teamMap.set(row.team_id, {
        city: t?.city ?? "",
        name: t?.name ?? "",
        primary_color: t?.primary_color ?? "#111111",
        count: 1,
      });
    }
  }

  // Aggregate sends/opens/feedback/churns by team_id
  const sentTeamIds = new Set((nlData ?? []).map((n) => n.team_id));
  const sendsByTeam = new Map<number, { total: number; failed: number }>();
  for (const row of sendData ?? []) {
    const nlRaw = row.newsletters;
    const nl = (Array.isArray(nlRaw) ? nlRaw[0] : nlRaw) as { team_id: number } | null;
    if (!nl?.team_id) continue;
    const cur = sendsByTeam.get(nl.team_id) ?? { total: 0, failed: 0 };
    cur.total += 1;
    if (row.status === "failed" || row.status === "bounced") cur.failed += 1;
    sendsByTeam.set(nl.team_id, cur);
  }

  const opensByTeam = new Map<number, number>();
  for (const row of openData ?? []) {
    const nlRaw = row.newsletters;
    const nl = (Array.isArray(nlRaw) ? nlRaw[0] : nlRaw) as { team_id: number } | null;
    if (!nl?.team_id) continue;
    opensByTeam.set(nl.team_id, (opensByTeam.get(nl.team_id) ?? 0) + 1);
  }

  const feedbackByTeam = new Map<number, { up: number; down: number }>();
  for (const row of feedbackData ?? []) {
    const nlRaw = row.newsletters;
    const nl = (Array.isArray(nlRaw) ? nlRaw[0] : nlRaw) as { team_id: number } | null;
    if (!nl?.team_id) continue;
    const cur = feedbackByTeam.get(nl.team_id) ?? { up: 0, down: 0 };
    if (row.feedback === "thumbs_up") cur.up += 1;
    else if (row.feedback === "thumbs_down") cur.down += 1;
    feedbackByTeam.set(nl.team_id, cur);
  }

  const churnByTeam = new Map<number, number>();
  for (const row of churnData ?? []) {
    if (!row.team_id) continue;
    churnByTeam.set(row.team_id, (churnByTeam.get(row.team_id) ?? 0) + 1);
  }

  const results: TeamSubscriberStat[] = [];
  for (const [teamId, info] of teamMap.entries()) {
    const sends = sendsByTeam.get(teamId) ?? { total: 0, failed: 0 };
    const fb = feedbackByTeam.get(teamId) ?? { up: 0, down: 0 };
    results.push({
      team_id: teamId,
      team_city: info.city,
      team_name: info.name,
      team_primary_color: info.primary_color,
      active_subscribers: info.count,
      newsletters_sent_7d: sentTeamIds.has(teamId) ? 1 : 0,
      sends_total_7d: sends.total,
      sends_failed_7d: sends.failed,
      opens_total_7d: opensByTeam.get(teamId) ?? 0,
      thumbs_up_30d: fb.up,
      thumbs_down_30d: fb.down,
      churned_7d: churnByTeam.get(teamId) ?? 0,
    });
  }

  return results.sort((a, b) => b.active_subscribers - a.active_subscribers);
};
