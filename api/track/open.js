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

// src/lib/db/newsletterDb.ts
var withClient = (client) => client ?? getServiceRoleClient();
var upsertNewsletterMetricOpen = async (newsletterId, subscriberId, client) => {
  const supabase = withClient(client);
  const { data, error } = await supabase.from("newsletter_metrics").select("id, opened_at").eq("newsletter_id", newsletterId).eq("subscriber_id", subscriberId).maybeSingle();
  if (error) {
    throw new Error(`newsletter_metrics open lookup failed: ${error.message}`);
  }
  if (data?.opened_at) {
    return;
  }
  if (data?.id) {
    const { error: updateError } = await supabase.from("newsletter_metrics").update({ opened_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", data.id);
    if (updateError) {
      throw new Error(`newsletter_metrics open update failed: ${updateError.message}`);
    }
    return;
  }
  const { error: insertError } = await supabase.from("newsletter_metrics").insert({
    newsletter_id: newsletterId,
    subscriber_id: subscriberId,
    opened_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (insertError) {
    throw new Error(`newsletter_metrics open insert failed: ${insertError.message}`);
  }
};

// src/lib/security/signing.ts
import { createHmac, timingSafeEqual } from "node:crypto";
var normalize = (value) => value.trim();
var digest = (secret, payload) => createHmac("sha256", normalize(secret)).update(payload).digest("hex");
var verifySignature = (secret, payload, signature) => {
  if (!secret || !signature) {
    return false;
  }
  const expected = digest(secret, payload);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
};
var newsletterSubscriberPayload = (newsletterId, subscriberId) => `${newsletterId}:${subscriberId}`;

// src/lib/services/trackingHttp.ts
var pixelGif = Buffer.from(
  "R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=",
  "base64"
);
var parseIntParam = (value) => {
  if (!value) {
    return null;
  }
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
var handleTrackOpenRequest = async (request) => {
  try {
    const url = new URL(request.url);
    const newsletterId = parseIntParam(url.searchParams.get("nid"));
    const subscriberId = parseIntParam(url.searchParams.get("sid"));
    const sig = url.searchParams.get("sig") ?? "";
    if (!newsletterId || !subscriberId || !verifySignature(
      config.trackingSecret,
      newsletterSubscriberPayload(newsletterId, subscriberId),
      sig
    )) {
      return new Response(pixelGif, {
        status: 200,
        headers: { "content-type": "image/gif", "cache-control": "no-store" }
      });
    }
    await upsertNewsletterMetricOpen(newsletterId, subscriberId);
  } catch {
  }
  return new Response(pixelGif, {
    status: 200,
    headers: { "content-type": "image/gif", "cache-control": "no-store" }
  });
};

// server/vercel/track-open.ts
var toRequest = (req) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const pathAndQuery = req.url || "/";
  return new Request(`${proto}://${host}${pathAndQuery}`, {
    method: req.method || "GET",
    headers: req.headers
  });
};
async function handler(req, res) {
  const webRes = await handleTrackOpenRequest(toRequest(req));
  const bytes = Buffer.from(await webRes.arrayBuffer());
  res.status(webRes.status);
  const ct = webRes.headers.get("content-type");
  if (ct) {
    res.setHeader("content-type", ct);
  }
  const cache = webRes.headers.get("cache-control");
  if (cache) {
    res.setHeader("cache-control", cache);
  }
  res.send(bytes);
}
export {
  handler as default
};
