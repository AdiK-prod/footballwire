/**
 * Source for the Vercel cron bundle (see scripts/bundle-vercel-api.mjs).
 * Deployed artifact: api/cron/run-pipeline.js (generated at build time).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCronRunPipelineRequest } from "../../src/lib/cron/cronRunPipelineHttp";

export const config = {
  maxDuration: 300,
};

const vercelReqToWebRequest = (req: VercelRequest): Request => {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers.host || "localhost";
  const pathAndQuery = req.url || "/";
  const url = `${proto}://${host}${pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`}`;

  return new Request(url, {
    method: req.method || "GET",
    headers: req.headers as HeadersInit,
  });
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const webRes = await handleCronRunPipelineRequest(vercelReqToWebRequest(req));
  const body = await webRes.text();
  res.status(webRes.status);
  const ct = webRes.headers.get("content-type");
  if (ct) {
    res.setHeader("content-type", ct);
  }
  res.send(body);
}
