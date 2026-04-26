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
var listAdminSources = async (params) => {
  const supabase = getServiceRoleClient();
  let query = supabase.from("sources").select(
    "id, team_id, url, name, type, feed_type, status, relevance_score, validation_notes, paywall_rate, submitted_by, created_at, teams(city, name, primary_color)"
  ).order("created_at", { ascending: false }).limit(50);
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
    const team = row.teams;
    const t = Array.isArray(team) ? team[0] : team;
    return {
      id: row.id,
      team_id: row.team_id,
      url: row.url,
      name: row.name,
      type: row.type,
      feed_type: row.feed_type ?? "news",
      status: row.status,
      relevance_score: row.relevance_score,
      validation_notes: row.validation_notes,
      paywall_rate: row.paywall_rate,
      submitted_by: row.submitted_by,
      created_at: row.created_at,
      team_city: t?.city ?? null,
      team_name: t?.name ?? null,
      team_primary_color: t?.primary_color ?? null
    };
  });
};
var adminSetSourceStatus = async (id, status, notes) => {
  const supabase = getServiceRoleClient();
  const { error } = await supabase.from("sources").update({ status, validation_notes: notes ?? null }).eq("id", id);
  if (error) throw new Error(`adminSetSourceStatus failed: ${error.message}`);
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

// server/vercel/admin/sources.ts
async function handler(req, res) {
  const user = await verifyAdminSession(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  if (req.method === "GET") {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : void 0;
      const type = typeof req.query.type === "string" ? req.query.type : void 0;
      const teamId = req.query.teamId ? Number(req.query.teamId) : void 0;
      const sources = await listAdminSources({ status, teamId, type });
      return res.status(200).json({ ok: true, sources });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "unknown"
      });
    }
  }
  if (req.method === "POST") {
    try {
      const { id, action, notes } = req.body;
      if (typeof id !== "number" || !["approved", "rejected", "flagged"].includes(action)) {
        return res.status(400).json({ ok: false, error: "Invalid id or action" });
      }
      await adminSetSourceStatus(
        id,
        action,
        typeof notes === "string" ? notes : void 0
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "unknown"
      });
    }
  }
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
export {
  handler as default
};
