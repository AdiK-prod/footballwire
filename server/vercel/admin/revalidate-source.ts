/**
 * Re-runs RSS parse + Claude relevance check on an existing source by ID.
 * Auth: CRON_SECRET bearer token (same as pipeline endpoints).
 * POST body: { sourceId: number }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkTeamSourceRelevance } from "../../../src/lib/ai/claude";
import { getCronSecret } from "../../../src/lib/config";
import { getServiceRoleClient } from "../../../src/lib/supabase/server";
import { notifyAdminOfFlaggedSource } from "../../../src/lib/services/adminNotificationService";
import { resolveStatusFromConfidence } from "../../../src/lib/services/sourceService";
import Parser from "rss-parser";

const parser = new Parser();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth via CRON_SECRET
  const cronSecret = getCronSecret();
  const authHeader = req.headers.authorization ?? "";
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { sourceId } = req.body as { sourceId?: unknown };
  if (typeof sourceId !== "number") {
    return res.status(400).json({ ok: false, error: "sourceId (number) required" });
  }

  const supabase = getServiceRoleClient();

  // Fetch the existing source record
  const { data: source, error: fetchErr } = await supabase
    .from("sources")
    .select("id, url, name, type, team_id, teams(city, name)")
    .eq("id", sourceId)
    .single<{
      id: number;
      url: string;
      name: string;
      type: string;
      team_id: number | null;
      teams: { city: string; name: string } | null;
    }>();

  if (fetchErr || !source) {
    return res.status(404).json({ ok: false, error: `Source ${sourceId} not found` });
  }

  try {
    // Parse RSS to get a sample item
    const parsed = await parser.parseURL(source.url);
    const first = parsed.items[0];
    if (!first?.title || !first.link) {
      throw new Error("RSS feed is missing title or link");
    }

    const teamInfo = Array.isArray(source.teams) ? source.teams[0] : source.teams;
    const teamName = teamInfo ? `${teamInfo.city} ${teamInfo.name}` : "NFL";

    // Re-run Claude relevance check
    const relevance = await checkTeamSourceRelevance({
      sourceUrl: source.url,
      sourceTitle: first.title,
      teamName,
    });

    const status = resolveStatusFromConfidence(
      source.type as "general" | "team_specific" | "user_submitted",
      relevance.confidence,
    );

    await supabase
      .from("sources")
      .update({
        status,
        relevance_score: Math.round(relevance.confidence),
        validation_notes:
          status === "approved"
            ? `Re-validated. Approved with confidence ${relevance.confidence}.`
            : `Re-validated. Flagged due to low confidence (${relevance.confidence}).`,
      })
      .eq("id", sourceId);

    if (status === "flagged") {
      await notifyAdminOfFlaggedSource({
        sourceId: source.id,
        sourceUrl: source.url,
        reason: `Low relevance confidence after re-validation (${relevance.confidence}).`,
      });
    }

    return res.status(200).json({
      ok: true,
      sourceId,
      status,
      confidence: relevance.confidence,
      teamName,
      sampleTitle: first.title,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    await supabase
      .from("sources")
      .update({ status: "flagged", validation_notes: `Re-validation failed: ${msg}` })
      .eq("id", sourceId);
    return res.status(500).json({ ok: false, error: msg });
  }
}
