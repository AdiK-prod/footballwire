// src/lib/config.ts
var viteEnv = import.meta.env ?? {};
var serverEnv = () => globalThis.process?.env;
var str = (value) => (value ?? "").trim();
var resolveSupabaseUrl = () => str(viteEnv.VITE_SUPABASE_URL) || str(serverEnv()?.VITE_SUPABASE_URL) || str(serverEnv()?.SUPABASE_URL) || str(serverEnv()?.NEXT_PUBLIC_SUPABASE_URL);
var resolveSupabaseAnonKey = () => str(viteEnv.VITE_SUPABASE_ANON_KEY) || str(serverEnv()?.VITE_SUPABASE_ANON_KEY) || str(serverEnv()?.SUPABASE_ANON_KEY) || str(serverEnv()?.NEXT_PUBLIC_SUPABASE_ANON_KEY);
var getCronSecret = () => {
  const e = serverEnv();
  return e?.CRON_SECRET ?? e?.VERCEL_CRON_SECRET ?? "";
};
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

// src/lib/cron/authorizeCronRequest.ts
function authorizeCronRequest(request) {
  const secret = getCronSecret();
  if (!secret) {
    return false;
  }
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return false;
  }
  return auth.slice("Bearer ".length) === secret;
}

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
var listDraftNewsletters = async (client) => {
  const supabase = withClient(client);
  const { data, error } = await supabase.from("newsletters").select("id, team_id, sent_at, subject_line, html_content, status").eq("status", "draft").order("id", { ascending: true }).limit(50);
  if (error) {
    throw new Error(`newsletters draft query failed: ${error.message}`);
  }
  return data ?? [];
};
var listActiveSubscribersByTeam = async (teamId, client) => {
  const supabase = withClient(client);
  const { data, error } = await supabase.from("subscribers").select("id, email, team_id").eq("team_id", teamId).eq("is_active", true).order("id", { ascending: true }).limit(5e3);
  if (error) {
    throw new Error(`active subscribers query failed: ${error.message}`);
  }
  return data ?? [];
};
var listNewsletterSendsByNewsletter = async (newsletterId, client) => {
  const supabase = withClient(client);
  const { data, error } = await supabase.from("newsletter_sends").select("subscriber_id, status").eq("newsletter_id", newsletterId).limit(5e3);
  if (error) {
    throw new Error(`newsletter_sends query failed: ${error.message}`);
  }
  return data ?? [];
};
var insertNewsletterSendSnapshots = async (rows, client) => {
  if (rows.length === 0) {
    return;
  }
  const supabase = withClient(client);
  const { error } = await supabase.from("newsletter_sends").insert(rows);
  if (error) {
    throw new Error(`newsletter_sends insert failed: ${error.message}`);
  }
};
var markNewsletterStatus = async (newsletterId, status, client) => {
  const supabase = withClient(client);
  const payload = status === "sent" ? { status, sent_at: (/* @__PURE__ */ new Date()).toISOString() } : { status };
  const { error } = await supabase.from("newsletters").update(payload).eq("id", newsletterId);
  if (error) {
    throw new Error(`newsletters update failed: ${error.message}`);
  }
};

// src/lib/security/signing.ts
import { createHmac, timingSafeEqual } from "node:crypto";
var normalize = (value) => value.trim();
var digest = (secret, payload) => createHmac("sha256", normalize(secret)).update(payload).digest("hex");
var signPayload = (secret, payload) => digest(secret, payload);
var newsletterSubscriberPayload = (newsletterId, subscriberId) => `${newsletterId}:${subscriberId}`;
var subscriberPayload = (subscriberId) => `${subscriberId}`;

// src/lib/services/adminNotificationService.ts
var notifyAdminOfFlaggedSource = async (params) => {
  if (!config.resendApiKey || !config.resendFrom || !config.adminAlertEmail) {
    return {
      delivered: false,
      reason: "Admin alert skipped: missing Resend or admin email config."
    };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.resendFrom,
      to: [config.adminAlertEmail],
      subject: `Football Wire source flagged (#${params.sourceId})`,
      html: `<p>A source was flagged during validation.</p>
<p><strong>Source:</strong> ${params.sourceUrl}</p>
<p><strong>Reason:</strong> ${params.reason}</p>`
    })
  });
  if (!response.ok) {
    return {
      delivered: false,
      reason: `Resend failed with ${response.status}`
    };
  }
  return {
    delivered: true,
    reason: "Alert sent."
  };
};

// src/lib/services/newsletterSendService.ts
var log = (msg, extra) => {
  console.info(JSON.stringify({ scope: "send-newsletters", msg, ...extra }));
};
var rewriteTrackingUrls = (params) => {
  const base = config.appBaseUrl.replace(/\/+$/, "");
  const nsPayload = newsletterSubscriberPayload(params.newsletterId, params.subscriberId);
  const metricSig = signPayload(config.trackingSecret, nsPayload);
  const unsubSig = signPayload(
    config.unsubscribeSecret,
    subscriberPayload(params.subscriberId)
  );
  return params.html.replace(
    /\/api\/track\/open\?nid=0&sid=0&sig=SIGNATURE/g,
    `${base}/api/track/open?nid=${params.newsletterId}&sid=${params.subscriberId}&sig=${metricSig}`
  ).replace(
    /\/api\/track\/feedback\?nid=0&sid=0&v=thumbs_up&sig=SIGNATURE/g,
    `${base}/api/track/feedback?nid=${params.newsletterId}&sid=${params.subscriberId}&v=thumbs_up&sig=${metricSig}`
  ).replace(
    /\/api\/track\/feedback\?nid=0&sid=0&v=thumbs_down&sig=SIGNATURE/g,
    `${base}/api/track/feedback?nid=${params.newsletterId}&sid=${params.subscriberId}&v=thumbs_down&sig=${metricSig}`
  ).replace(
    /\/api\/unsubscribe\?sid=0&sig=SIGNATURE/g,
    `${base}/api/unsubscribe?sid=${params.subscriberId}&sig=${unsubSig}`
  );
};
var sendViaResend = async (params) => {
  if (!config.resendApiKey || !config.resendFrom) {
    return { ok: false, reason: "Missing RESEND_API_KEY or RESEND_FROM" };
  }
  const unsubscribe = `<mailto:${config.resendFrom}?subject=unsubscribe>, <${config.appBaseUrl}/unsubscribe>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
      "List-Unsubscribe": unsubscribe,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    },
    body: JSON.stringify({
      from: config.resendFrom,
      to: [params.to],
      subject: params.subject,
      html: params.html
    })
  });
  if (response.ok) {
    return { ok: true, reason: null };
  }
  let reason = `Resend failed with ${response.status}`;
  try {
    const body = await response.json();
    if (body.message) {
      reason = `${reason}: ${body.message}`;
    }
  } catch {
  }
  return { ok: false, reason };
};
var notifyFailureRate = async (params) => {
  if (params.total === 0) {
    return;
  }
  const pct = params.failed / params.total;
  if (pct <= 0.1) {
    return;
  }
  await notifyAdminOfFlaggedSource({
    sourceId: params.newsletterId,
    sourceUrl: `${config.appBaseUrl}/admin`,
    reason: `Delivery failure rate exceeded 10% (${params.failed}/${params.total})`
  });
};
var sendDraftNewsletters = async () => {
  const drafts = await listDraftNewsletters();
  if (drafts.length === 0) {
    await notifyAdminOfFlaggedSource({
      sourceId: 0,
      sourceUrl: `${config.appBaseUrl}/admin`,
      reason: "No draft newsletters found at send cron."
    });
    log("no_drafts");
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      skippedNoSubscribers: 0,
      skippedAlreadySent: 0
    };
  }
  let sent = 0;
  let failed = 0;
  let skippedNoSubscribers = 0;
  let skippedAlreadySent = 0;
  for (const draft of drafts) {
    const existing = await listNewsletterSendsByNewsletter(draft.id);
    if (existing.length > 0) {
      skippedAlreadySent += 1;
      log("skip_already_sent", { newsletterId: draft.id, existing: existing.length });
      continue;
    }
    const subscribers = await listActiveSubscribersByTeam(draft.team_id);
    if (subscribers.length === 0) {
      skippedNoSubscribers += 1;
      await markNewsletterStatus(draft.id, "failed");
      continue;
    }
    const snapshots = [];
    for (const subscriber of subscribers) {
      try {
        const html = rewriteTrackingUrls({
          html: draft.html_content,
          newsletterId: draft.id,
          subscriberId: subscriber.id
        });
        const result = await sendViaResend({
          to: subscriber.email,
          subject: draft.subject_line,
          html
        });
        snapshots.push({
          newsletter_id: draft.id,
          subscriber_id: subscriber.id,
          status: result.ok ? "sent" : "failed",
          error_reason: result.reason
        });
        if (result.ok) {
          sent += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : "send failed";
        snapshots.push({
          newsletter_id: draft.id,
          subscriber_id: subscriber.id,
          status: "failed",
          error_reason: reason
        });
        failed += 1;
      }
    }
    await insertNewsletterSendSnapshots(snapshots);
    const sentCount = snapshots.filter((x) => x.status === "sent").length;
    await markNewsletterStatus(draft.id, sentCount > 0 ? "sent" : "failed");
    await notifyFailureRate({
      newsletterId: draft.id,
      failed: snapshots.length - sentCount,
      total: snapshots.length
    });
  }
  return {
    processed: drafts.length,
    sent,
    failed,
    skippedNoSubscribers,
    skippedAlreadySent
  };
};

// src/lib/cron/cronSendNewslettersHttp.ts
var json = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" }
});
var handleCronSendNewslettersRequest = async (request) => {
  if (!authorizeCronRequest(request)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  try {
    const result = await sendDraftNewsletters();
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "send cron failed";
    console.error(JSON.stringify({ scope: "send-newsletters-cron", error: message }));
    return json({ ok: false, error: message }, 500);
  }
};

// server/vercel/send-newsletters.ts
var config2 = {
  maxDuration: 300
};
var vercelReqToWebRequest = (req) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const pathAndQuery = req.url || "/";
  const url = `${proto}://${host}${pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`}`;
  return new Request(url, {
    method: req.method || "GET",
    headers: req.headers
  });
};
async function handler(req, res) {
  const webRes = await handleCronSendNewslettersRequest(vercelReqToWebRequest(req));
  const body = await webRes.text();
  res.status(webRes.status);
  const ct = webRes.headers.get("content-type");
  if (ct) {
    res.setHeader("content-type", ct);
  }
  res.send(body);
}
export {
  config2 as config,
  handler as default
};
