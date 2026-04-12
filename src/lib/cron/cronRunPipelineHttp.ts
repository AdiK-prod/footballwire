import { authorizeCronRequest } from "@/lib/cron/authorizeCronRequest";
import { runDailyPipeline } from "@/lib/pipeline/runDailyPipeline";

/**
 * Shared HTTP handler for the pipeline cron (used by `app/api` in tests and
 * root `/api/cron/run-pipeline` on Vercel — Vite builds do not deploy `app/api`).
 */

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

export const handleCronRunPipelineRequest = async (
  request: Request,
): Promise<Response> => {
  if (!authorizeCronRequest(request)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  await runDailyPipeline();
  return json(
    {
      ok: true,
      message: "Daily pipeline finished.",
    },
    200,
  );
};
