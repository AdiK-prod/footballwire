import { authorizeCronRequest } from "@/lib/cron/authorizeCronRequest";
import { runDailyPipeline } from "@/lib/pipeline/runDailyPipeline";

/**
 * Pipeline cron entrypoint — runs full daily pipeline (Phase 3).
 *
 * **Schedule:** `vercel.json` runs this route on a cron schedule. Times are **UTC**
 * (`0 6 * * *` = 06:00 UTC daily). Change the cron expression if you need local 6 AM
 * in a specific timezone.
 *
 * **Auth:** `Authorization: Bearer <CRON_SECRET>` — set `CRON_SECRET` in Vercel
 * (and locally for manual runs). Alias: `VERCEL_CRON_SECRET` in `getCronSecret()`.
 *
 * Vercel invokes scheduled jobs with **GET**; **POST** is supported for manual triggers.
 */

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

const handleAuthorized = async () => {
  await runDailyPipeline();
  return json(
    {
      ok: true,
      message: "Daily pipeline finished.",
    },
    200,
  );
};

export const GET = async (request: Request) => {
  if (!authorizeCronRequest(request)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return handleAuthorized();
};

export const POST = async (request: Request) => {
  if (!authorizeCronRequest(request)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return handleAuthorized();
};
