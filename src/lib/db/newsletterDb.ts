import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "../supabase/server";

export type NewsletterDraftInsert = {
  team_id: number;
  subject_line: string;
  html_content: string;
  status: "draft";
};

export type NewsletterRow = {
  id: number;
  team_id: number;
  sent_at: string | null;
  subject_line: string;
  html_content: string;
  status: "draft" | "sent" | "failed";
};

export type ActiveSubscriberRow = {
  id: number;
  email: string;
  team_id: number;
};

export type NewsletterSendInsert = {
  newsletter_id: number;
  subscriber_id: number;
  status: "sent" | "failed" | "bounced";
  error_reason: string | null;
};

const withClient = (client?: SupabaseClient): SupabaseClient =>
  client ?? getServiceRoleClient();

export const createDraftNewsletter = async (
  draft: NewsletterDraftInsert,
  client?: SupabaseClient,
): Promise<number> => {
  const supabase = withClient(client);
  const { data, error } = await supabase
    .from("newsletters")
    .insert(draft)
    .select("id")
    .single<{ id: number }>();

  if (error || !data) {
    throw new Error(`newsletters insert failed: ${error?.message ?? "unknown"}`);
  }
  return data.id;
};

export const listDraftNewsletters = async (
  client?: SupabaseClient,
): Promise<NewsletterRow[]> => {
  const supabase = withClient(client);
  const { data, error } = await supabase
    .from("newsletters")
    .select("id, team_id, sent_at, subject_line, html_content, status")
    .eq("status", "draft")
    .order("id", { ascending: true })
    .limit(50);
  if (error) {
    throw new Error(`newsletters draft query failed: ${error.message}`);
  }
  return (data ?? []) as NewsletterRow[];
};

export const listActiveSubscribersByTeam = async (
  teamId: number,
  client?: SupabaseClient,
): Promise<ActiveSubscriberRow[]> => {
  const supabase = withClient(client);
  const { data, error } = await supabase
    .from("subscribers")
    .select("id, email, team_id")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .order("id", { ascending: true })
    .limit(5000);
  if (error) {
    throw new Error(`active subscribers query failed: ${error.message}`);
  }
  return (data ?? []) as ActiveSubscriberRow[];
};

export const listNewsletterSendsByNewsletter = async (
  newsletterId: number,
  client?: SupabaseClient,
): Promise<{ subscriber_id: number; status: string }[]> => {
  const supabase = withClient(client);
  const { data, error } = await supabase
    .from("newsletter_sends")
    .select("subscriber_id, status")
    .eq("newsletter_id", newsletterId)
    .limit(5000);
  if (error) {
    throw new Error(`newsletter_sends query failed: ${error.message}`);
  }
  return (data ?? []) as { subscriber_id: number; status: string }[];
};

export const insertNewsletterSendSnapshots = async (
  rows: NewsletterSendInsert[],
  client?: SupabaseClient,
): Promise<void> => {
  if (rows.length === 0) {
    return;
  }
  const supabase = withClient(client);
  const { error } = await supabase.from("newsletter_sends").insert(rows);
  if (error) {
    throw new Error(`newsletter_sends insert failed: ${error.message}`);
  }
};

export const markNewsletterStatus = async (
  newsletterId: number,
  status: "sent" | "failed",
  client?: SupabaseClient,
): Promise<void> => {
  const supabase = withClient(client);
  const payload =
    status === "sent"
      ? { status, sent_at: new Date().toISOString() }
      : { status };
  const { error } = await supabase
    .from("newsletters")
    .update(payload)
    .eq("id", newsletterId);
  if (error) {
    throw new Error(`newsletters update failed: ${error.message}`);
  }
};

export const upsertNewsletterMetricOpen = async (
  newsletterId: number,
  subscriberId: number,
  client?: SupabaseClient,
): Promise<void> => {
  const supabase = withClient(client);
  const { data, error } = await supabase
    .from("newsletter_metrics")
    .select("id, opened_at")
    .eq("newsletter_id", newsletterId)
    .eq("subscriber_id", subscriberId)
    .maybeSingle<{ id: number; opened_at: string | null }>();
  if (error) {
    throw new Error(`newsletter_metrics open lookup failed: ${error.message}`);
  }

  if (data?.opened_at) {
    return;
  }

  if (data?.id) {
    const { error: updateError } = await supabase
      .from("newsletter_metrics")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", data.id);
    if (updateError) {
      throw new Error(`newsletter_metrics open update failed: ${updateError.message}`);
    }
    return;
  }

  const { error: insertError } = await supabase.from("newsletter_metrics").insert({
    newsletter_id: newsletterId,
    subscriber_id: subscriberId,
    opened_at: new Date().toISOString(),
  });
  if (insertError) {
    throw new Error(`newsletter_metrics open insert failed: ${insertError.message}`);
  }
};

export const upsertNewsletterMetricFeedback = async (
  newsletterId: number,
  subscriberId: number,
  feedback: "thumbs_up" | "thumbs_down",
  client?: SupabaseClient,
): Promise<void> => {
  const supabase = withClient(client);
  const { data, error } = await supabase
    .from("newsletter_metrics")
    .select("id")
    .eq("newsletter_id", newsletterId)
    .eq("subscriber_id", subscriberId)
    .maybeSingle<{ id: number }>();
  if (error) {
    throw new Error(`newsletter_metrics feedback lookup failed: ${error.message}`);
  }

  if (data?.id) {
    const { error: updateError } = await supabase
      .from("newsletter_metrics")
      .update({ feedback })
      .eq("id", data.id);
    if (updateError) {
      throw new Error(
        `newsletter_metrics feedback update failed: ${updateError.message}`,
      );
    }
    return;
  }

  const { error: insertError } = await supabase.from("newsletter_metrics").insert({
    newsletter_id: newsletterId,
    subscriber_id: subscriberId,
    feedback,
  });
  if (insertError) {
    throw new Error(`newsletter_metrics feedback insert failed: ${insertError.message}`);
  }
};

export const deactivateSubscriber = async (
  subscriberId: number,
  client?: SupabaseClient,
): Promise<void> => {
  const supabase = withClient(client);
  const { error } = await supabase
    .from("subscribers")
    .update({ is_active: false })
    .eq("id", subscriberId);
  if (error) {
    throw new Error(`subscriber deactivate failed: ${error.message}`);
  }
};
