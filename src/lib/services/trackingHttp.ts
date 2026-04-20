import { config } from "../config";
import {
  deactivateSubscriber,
  upsertNewsletterMetricFeedback,
  upsertNewsletterMetricOpen,
} from "../db/newsletterDb";
import { newsletterSubscriberPayload, subscriberPayload, verifySignature } from "../security/signing";

const pixelGif = Buffer.from(
  "R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=",
  "base64",
);

const parseIntParam = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const html = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

export const handleTrackOpenRequest = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const newsletterId = parseIntParam(url.searchParams.get("nid"));
    const subscriberId = parseIntParam(url.searchParams.get("sid"));
    const sig = url.searchParams.get("sig") ?? "";

    if (
      !newsletterId ||
      !subscriberId ||
      !verifySignature(
        config.trackingSecret,
        newsletterSubscriberPayload(newsletterId, subscriberId),
        sig,
      )
    ) {
      return new Response(pixelGif, {
        status: 200,
        headers: { "content-type": "image/gif", "cache-control": "no-store" },
      });
    }

    await upsertNewsletterMetricOpen(newsletterId, subscriberId);
  } catch {
    // tracking endpoints should be non-breaking for clients
  }
  return new Response(pixelGif, {
    status: 200,
    headers: { "content-type": "image/gif", "cache-control": "no-store" },
  });
};

export const handleTrackFeedbackRequest = async (
  request: Request,
): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const newsletterId = parseIntParam(url.searchParams.get("nid"));
    const subscriberId = parseIntParam(url.searchParams.get("sid"));
    const sig = url.searchParams.get("sig") ?? "";
    const value = url.searchParams.get("v");

    const validValue = value === "thumbs_up" || value === "thumbs_down";
    if (
      !newsletterId ||
      !subscriberId ||
      !validValue ||
      !verifySignature(
        config.trackingSecret,
        newsletterSubscriberPayload(newsletterId, subscriberId),
        sig,
      )
    ) {
      return html("<h1>Invalid feedback link</h1>", 400);
    }

    await upsertNewsletterMetricFeedback(newsletterId, subscriberId, value);
    return html("<h1>Thanks for your feedback.</h1>", 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "feedback failed";
    return html(`<h1>Feedback failed</h1><p>${msg}</p>`, 500);
  }
};

export const handleUnsubscribeRequest = async (
  request: Request,
): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const subscriberId = parseIntParam(url.searchParams.get("sid"));
    const sig = url.searchParams.get("sig") ?? "";

    if (
      !subscriberId ||
      !verifySignature(config.unsubscribeSecret, subscriberPayload(subscriberId), sig)
    ) {
      return html("<h1>Invalid unsubscribe link</h1>", 400);
    }

    await deactivateSubscriber(subscriberId);
    return html("<h1>You have been unsubscribed.</h1>", 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unsubscribe failed";
    return html(`<h1>Unsubscribe failed</h1><p>${msg}</p>`, 500);
  }
};
