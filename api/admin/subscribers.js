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
var getSubscriberStatsByTeam = async () => {
  const supabase = getServiceRoleClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString();
  const { data: subData, error: subErr } = await supabase.from("subscribers").select("team_id, teams(city, name, primary_color)").eq("is_active", true).limit(1e4);
  if (subErr) throw new Error(`subscribers query failed: ${subErr.message}`);
  const { data: sendData, error: sendErr } = await supabase.from("newsletter_sends").select("newsletter_id, status, newsletters(team_id)").gte("sent_at", sevenDaysAgo).limit(5e3);
  if (sendErr) throw new Error(`newsletter_sends query failed: ${sendErr.message}`);
  const { data: openData, error: openErr } = await supabase.from("newsletter_metrics").select("newsletter_id, opened_at, newsletters(team_id)").gte("opened_at", sevenDaysAgo).not("opened_at", "is", null).limit(5e3);
  if (openErr) throw new Error(`newsletter_metrics open query failed: ${openErr.message}`);
  const { data: feedbackData, error: fbErr } = await supabase.from("newsletter_metrics").select("newsletter_id, feedback, newsletters(team_id)").gte("opened_at", thirtyDaysAgo).not("feedback", "is", null).limit(5e3);
  if (fbErr) throw new Error(`newsletter_metrics feedback query failed: ${fbErr.message}`);
  const { data: nlData } = await supabase.from("newsletters").select("id, team_id").eq("status", "sent").gte("sent_at", sevenDaysAgo).limit(500);
  const { data: churnData } = await supabase.from("churn_events").select("team_id").gte("churned_at", sevenDaysAgo).limit(1e3);
  const teamMap = /* @__PURE__ */ new Map();
  for (const row of subData ?? []) {
    if (!row.team_id) continue;
    const team = row.teams;
    const t = Array.isArray(team) ? team[0] : team;
    const existing = teamMap.get(row.team_id);
    if (existing) {
      existing.count += 1;
    } else {
      teamMap.set(row.team_id, {
        city: t?.city ?? "",
        name: t?.name ?? "",
        primary_color: t?.primary_color ?? "#111111",
        count: 1
      });
    }
  }
  const sentTeamIds = new Set((nlData ?? []).map((n) => n.team_id));
  const sendsByTeam = /* @__PURE__ */ new Map();
  for (const row of sendData ?? []) {
    const nlRaw = row.newsletters;
    const nl = Array.isArray(nlRaw) ? nlRaw[0] : nlRaw;
    if (!nl?.team_id) continue;
    const cur = sendsByTeam.get(nl.team_id) ?? { total: 0, failed: 0 };
    cur.total += 1;
    if (row.status === "failed" || row.status === "bounced") cur.failed += 1;
    sendsByTeam.set(nl.team_id, cur);
  }
  const opensByTeam = /* @__PURE__ */ new Map();
  for (const row of openData ?? []) {
    const nlRaw = row.newsletters;
    const nl = Array.isArray(nlRaw) ? nlRaw[0] : nlRaw;
    if (!nl?.team_id) continue;
    opensByTeam.set(nl.team_id, (opensByTeam.get(nl.team_id) ?? 0) + 1);
  }
  const feedbackByTeam = /* @__PURE__ */ new Map();
  for (const row of feedbackData ?? []) {
    const nlRaw = row.newsletters;
    const nl = Array.isArray(nlRaw) ? nlRaw[0] : nlRaw;
    if (!nl?.team_id) continue;
    const cur = feedbackByTeam.get(nl.team_id) ?? { up: 0, down: 0 };
    if (row.feedback === "thumbs_up") cur.up += 1;
    else if (row.feedback === "thumbs_down") cur.down += 1;
    feedbackByTeam.set(nl.team_id, cur);
  }
  const churnByTeam = /* @__PURE__ */ new Map();
  for (const row of churnData ?? []) {
    if (!row.team_id) continue;
    churnByTeam.set(row.team_id, (churnByTeam.get(row.team_id) ?? 0) + 1);
  }
  const results = [];
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
      churned_7d: churnByTeam.get(teamId) ?? 0
    });
  }
  return results.sort((a, b) => b.active_subscribers - a.active_subscribers);
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

// server/vercel/admin/subscribers.ts
async function handler(req, res) {
  const user = await verifyAdminSession(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const stats = await getSubscriberStatsByTeam();
    return res.status(200).json({ ok: true, stats });
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
