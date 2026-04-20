import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleTrackOpenRequest } from "../../src/lib/services/trackingHttp";

const toRequest = (req: VercelRequest): Request => {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers.host || "localhost";
  const pathAndQuery = req.url || "/";
  return new Request(`${proto}://${host}${pathAndQuery}`, {
    method: req.method || "GET",
    headers: req.headers as HeadersInit,
  });
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
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
