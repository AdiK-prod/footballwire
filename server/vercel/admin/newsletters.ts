import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  listTodaysArticlesForTeam,
  listTodaysDraftNewsletters,
} from "../../../src/lib/db/adminDb";
import { verifyAdminSession } from "../../../src/lib/auth/verifyAdminSession";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await verifyAdminSession(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const newsletters = await listTodaysDraftNewsletters();

    // Enrich each newsletter with its articles
    const enriched = await Promise.all(
      newsletters.map(async (nl) => {
        const articles = await listTodaysArticlesForTeam(nl.team_id);
        return { ...nl, articles };
      }),
    );

    return res.status(200).json({ ok: true, newsletters: enriched });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
