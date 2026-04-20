import { config } from "../config";
import {
  insertNewsletterSendSnapshots,
  listActiveSubscribersByTeam,
  listDraftNewsletters,
  listNewsletterSendsByNewsletter,
  markNewsletterStatus,
  type NewsletterSendInsert,
} from "../db/newsletterDb";
import { newsletterSubscriberPayload, signPayload, subscriberPayload } from "../security/signing";
import { notifyAdminOfFlaggedSource } from "./adminNotificationService";

const log = (msg: string, extra?: Record<string, unknown>) => {
  console.info(JSON.stringify({ scope: "send-newsletters", msg, ...extra }));
};

const rewriteTrackingUrls = (params: {
  html: string;
  newsletterId: number;
  subscriberId: number;
}): string => {
  const base = config.appBaseUrl.replace(/\/+$/, "");
  const nsPayload = newsletterSubscriberPayload(params.newsletterId, params.subscriberId);
  const metricSig = signPayload(config.trackingSecret, nsPayload);
  const unsubSig = signPayload(
    config.unsubscribeSecret,
    subscriberPayload(params.subscriberId),
  );

  return params.html
    .replace(
      /\/api\/track\/open\?nid=0&sid=0&sig=SIGNATURE/g,
      `${base}/api/track/open?nid=${params.newsletterId}&sid=${params.subscriberId}&sig=${metricSig}`,
    )
    .replace(
      /\/api\/track\/feedback\?nid=0&sid=0&v=thumbs_up&sig=SIGNATURE/g,
      `${base}/api/track/feedback?nid=${params.newsletterId}&sid=${params.subscriberId}&v=thumbs_up&sig=${metricSig}`,
    )
    .replace(
      /\/api\/track\/feedback\?nid=0&sid=0&v=thumbs_down&sig=SIGNATURE/g,
      `${base}/api/track/feedback?nid=${params.newsletterId}&sid=${params.subscriberId}&v=thumbs_down&sig=${metricSig}`,
    )
    .replace(
      /\/api\/unsubscribe\?sid=0&sig=SIGNATURE/g,
      `${base}/api/unsubscribe?sid=${params.subscriberId}&sig=${unsubSig}`,
    );
};

const sendViaResend = async (params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; reason: string | null }> => {
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
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    body: JSON.stringify({
      from: `${config.resendDisplayName} <${config.resendFrom}>`,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (response.ok) {
    return { ok: true, reason: null };
  }
  let reason = `Resend failed with ${response.status}`;
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) {
      reason = `${reason}: ${body.message}`;
    }
  } catch {
    /* ignore */
  }
  return { ok: false, reason };
};

const notifyFailureRate = async (params: {
  newsletterId: number;
  failed: number;
  total: number;
}): Promise<void> => {
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
    reason: `Delivery failure rate exceeded 10% (${params.failed}/${params.total})`,
  });
};

export const sendDraftNewsletters = async (): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skippedNoSubscribers: number;
  skippedAlreadySent: number;
}> => {
  const drafts = await listDraftNewsletters();
  if (drafts.length === 0) {
    await notifyAdminOfFlaggedSource({
      sourceId: 0,
      sourceUrl: `${config.appBaseUrl}/admin`,
      reason: "No draft newsletters found at send cron.",
    });
    log("no_drafts");
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      skippedNoSubscribers: 0,
      skippedAlreadySent: 0,
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

    const snapshots: NewsletterSendInsert[] = [];
    for (const subscriber of subscribers) {
      try {
        const html = rewriteTrackingUrls({
          html: draft.html_content,
          newsletterId: draft.id,
          subscriberId: subscriber.id,
        });
        const result = await sendViaResend({
          to: subscriber.email,
          subject: draft.subject_line,
          html,
        });
        snapshots.push({
          newsletter_id: draft.id,
          subscriber_id: subscriber.id,
          status: result.ok ? "sent" : "failed",
          error_reason: result.reason,
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
          error_reason: reason,
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
      total: snapshots.length,
    });
  }

  return {
    processed: drafts.length,
    sent,
    failed,
    skippedNoSubscribers,
    skippedAlreadySent,
  };
};
