import { authorizeCronRequest } from "./authorizeCronRequest";
import { runDailyPipeline } from "../pipeline/runDailyPipeline";

/**
 * Shared HTTP handler for the pipeline cron (used by `app/api` in tests and
 * root `/api/cron/run-pipeline` on Vercel — Vite builds do not deploy `app/api`).
 *
 * Idempotent in the sense of safe to retry: no partial pipeline_runs rows left
 * stuck after handler exit (team run finalizes in finally on failure). A
 * manual invocation still creates a new run row per successful execution.
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
