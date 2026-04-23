import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminSetSourceStatus, listAdminSources } from "../../../src/lib/db/adminDb";
import { verifyAdminSession } from "../../../src/lib/auth/verifyAdminSession";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await verifyAdminSession(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  if (req.method === "GET") {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
      const sources = await listAdminSources({ status, teamId, type });
      return res.status(200).json({ ok: true, sources });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  if (req.method === "POST") {
    try {
      const { id, action, notes } = req.body as {
        id?: unknown;
        action?: unknown;
        notes?: unknown;
      };
      if (typeof id !== "number" || !["approved", "rejected", "flagged"].includes(action as string)) {
        return res.status(400).json({ ok: false, error: "Invalid id or action" });
      }
      await adminSetSourceStatus(
        id,
        action as "approved" | "rejected" | "flagged",
        typeof notes === "string" ? notes : undefined,
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
