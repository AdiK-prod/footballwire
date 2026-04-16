/**
 * Source for the Vercel API bundle (see scripts/bundle-vercel-api.mjs).
 * Deployed artifact: api/validate-source.js (generated at build time).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleValidateSourceRequest } from "../../src/lib/services/validateSourceHttp";

export const config = {
  maxDuration: 60,
};

const vercelReqToWebRequest = async (
  req: VercelRequest,
): Promise<Request> => {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers.host || "localhost";
  const pathAndQuery = req.url || "/";
  const url = `${proto}://${host}${pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`}`;

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (typeof req.body === "string") {
      body = req.body;
    } else if (req.body !== undefined && req.body !== null) {
      body = JSON.stringify(req.body);
    }
  }

  return new Request(url, {
    method: req.method || "POST",
    headers: req.headers as HeadersInit,
    body,
  });
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).setHeader("content-type", "application/json");
    res.send(JSON.stringify({ ok: false, error: "Method not allowed" }));
    return;
  }

  const webReq = await vercelReqToWebRequest(req);
  const webRes = await handleValidateSourceRequest(webReq);
  const text = await webRes.text();
  res.status(webRes.status);
  const ct = webRes.headers.get("content-type");
  if (ct) {
    res.setHeader("content-type", ct);
  }
  res.send(text);
}
