import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAdminSession } from "../../../src/lib/auth/verifyAdminSession";
import { sendDraftNewsletters } from "../../../src/lib/services/newsletterSendService";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await verifyAdminSession(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const result = await sendDraftNewsletters();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
