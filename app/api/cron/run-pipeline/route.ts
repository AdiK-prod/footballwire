import { handleCronRunPipelineRequest } from "@/lib/cron/cronRunPipelineHttp";

/**
 * Test / future Next-style entry. **Production Vercel** uses root `api/cron/run-pipeline.ts`
 * (Vite does not ship `app/api` to serverless).
 *
 * **Schedule:** `vercel.json` — cron path `/api/cron/run-pipeline`. Times **UTC**.
 * **Auth:** `Authorization: Bearer <CRON_SECRET>`.
 */

export const GET = (request: Request) => handleCronRunPipelineRequest(request);

export const POST = (request: Request) => handleCronRunPipelineRequest(request);
