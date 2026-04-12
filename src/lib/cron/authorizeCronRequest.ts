import { getCronSecret } from "@/lib/config";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set.
 * Manual invocations must use the same header.
 */
export function authorizeCronRequest(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) {
    return false;
  }

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return false;
  }

  return auth.slice("Bearer ".length) === secret;
}
