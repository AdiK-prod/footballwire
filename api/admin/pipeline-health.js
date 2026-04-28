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
var getLatestPipelineRunsPerTeam = async () => {
  const supabase = getServiceRoleClient();
  const { data: activeSubs, error: subsError } = await supabase.from("subscribers").select("team_id").eq("is_active", true);
  if (subsError) {
    throw new Error(`active teams query failed: ${subsError.message}`);
  }
  const activeTeamIds = [...new Set((activeSubs ?? []).map((r) => r.team_id))];
  if (activeTeamIds.length === 0) return [];
  const { data: teams, error: teamsError } = await supabase.from("teams").select("id, city, name").in("id", activeTeamIds);
  if (teamsError) {
    throw new Error(`teams query failed: ${teamsError.message}`);
  }
  const teamMap = /* @__PURE__ */ new Map();
  for (const t of teams ?? []) {
    teamMap.set(t.id, { city: t.city, name: t.name });
  }
  const { data: runs, error: runsError } = await supabase.from("pipeline_runs").select("id, team_id, run_at, status, articles_selected, notes").in("team_id", activeTeamIds).order("run_at", { ascending: false }).limit(activeTeamIds.length * 5);
  if (runsError) {
    throw new Error(`pipeline_runs query failed: ${runsError.message}`);
  }
  const latestByTeam = /* @__PURE__ */ new Map();
  for (const run of runs ?? []) {
    const tid = run.team_id;
    if (!latestByTeam.has(tid)) {
      latestByTeam.set(tid, run);
    }
  }
  const runIds = [...latestByTeam.values()].map((r) => r.id);
  const sentRunIds = /* @__PURE__ */ new Set();
  if (runIds.length > 0) {
    const { data: newsletters } = await supabase.from("newsletters").select("team_id, status, sent_at").eq("status", "sent").in("team_id", activeTeamIds);
    const runAtByTeam = /* @__PURE__ */ new Map();
    for (const [tid, run] of latestByTeam.entries()) {
      runAtByTeam.set(tid, run.run_at);
    }
    for (const nl of newsletters ?? []) {
      const tid = nl.team_id;
      const runAt = runAtByTeam.get(tid);
      if (runAt && nl.sent_at && nl.sent_at >= runAt) {
        const run = latestByTeam.get(tid);
        if (run) sentRunIds.add(run.id);
      }
    }
  }
  const results = [];
  for (const [teamId, run] of latestByTeam.entries()) {
    const team = teamMap.get(teamId);
    if (!team) continue;
    results.push({
      team_id: teamId,
      team_city: team.city,
      team_name: team.name,
      run_at: run.run_at,
      status: run.status,
      articles_selected: run.articles_selected ?? 0,
      newsletter_sent: sentRunIds.has(run.id),
      notes: run.notes
    });
  }
  return results.sort((a, b) => new Date(b.run_at).getTime() - new Date(a.run_at).getTime());
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

// server/vercel/admin/pipeline-health.ts
async function handler(req, res) {
  const user = await verifyAdminSession(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const runs = await getLatestPipelineRunsPerTeam();
    return res.status(200).json({ ok: true, runs });
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
