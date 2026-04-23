// src/lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";

// src/lib/config.ts
var viteEnv = import.meta.env ?? {};
var serverEnv = () => globalThis.process?.env;
var str = (value) => (value ?? "").trim();
var resolveSupabaseUrl = () => str(viteEnv.VITE_SUPABASE_URL) || str(serverEnv()?.VITE_SUPABASE_URL) || str(serverEnv()?.SUPABASE_URL) || str(serverEnv()?.NEXT_PUBLIC_SUPABASE_URL);
var resolveSupabaseAnonKey = () => str(viteEnv.VITE_SUPABASE_ANON_KEY) || str(serverEnv()?.VITE_SUPABASE_ANON_KEY) || str(serverEnv()?.SUPABASE_ANON_KEY) || str(serverEnv()?.NEXT_PUBLIC_SUPABASE_ANON_KEY);
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

// src/lib/supabase/server.ts
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

// src/lib/db/adminDb.ts
var listTodaysDraftNewsletters = async () => {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from("newsletters").select("id, team_id, subject_line, status, sent_at, teams(city, name, primary_color)").eq("status", "draft").order("id", { ascending: false }).limit(50);
  if (error) throw new Error(`listTodaysNewsletters failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const team = row.teams;
    const t = Array.isArray(team) ? team[0] : team;
    return {
      id: row.id,
      team_id: row.team_id,
      subject_line: row.subject_line,
      status: row.status,
      sent_at: row.sent_at,
      team_city: t?.city ?? "",
      team_name: t?.name ?? "",
      team_primary_color: t?.primary_color ?? "#111111"
    };
  });
};
var listTodaysArticlesForTeam = async (teamId) => {
  const supabase = getServiceRoleClient();
  const fetchDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const { data, error } = await supabase.from("article_scores_log").select(
    "id, headline, original_url, source_name, source_type, category, composite_score, selection_reasoning, rejection_reason, passed_threshold, fetch_date, articles(ai_summary)"
  ).eq("team_id", teamId).eq("fetch_date", fetchDate).order("composite_score", { ascending: false }).limit(50);
  if (error) throw new Error(`listTodaysArticles failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const art = Array.isArray(row.articles) ? row.articles[0] : row.articles;
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
      fetch_date: row.fetch_date
    };
  });
};

// src/lib/auth/verifyAdminSession.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
var verifyAdminSession = async (authHeader) => {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const supabase = createClient2(resolveSupabaseUrl(), resolveSupabaseAnonKey());
    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return { userId: user.id, email: user.email ?? "" };
  } catch {
    return null;
  }
};

// server/vercel/admin/newsletters.ts
async function handler(req, res) {
  const user = await verifyAdminSession(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const newsletters = await listTodaysDraftNewsletters();
    const enriched = await Promise.all(
      newsletters.map(async (nl) => {
        const articles = await listTodaysArticlesForTeam(nl.team_id);
        return { ...nl, articles };
      })
    );
    return res.status(200).json({ ok: true, newsletters: enriched });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "unknown"
    });
  }
}
export {
  handler as default
};
