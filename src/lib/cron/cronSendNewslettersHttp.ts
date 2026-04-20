import { authorizeCronRequest } from "./authorizeCronRequest";
import { sendDraftNewsletters } from "../services/newsletterSendService";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const handleCronSendNewslettersRequest = async (
  request: Request,
): Promise<Response> => {
  if (!authorizeCronRequest(request)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const result = await sendDraftNewsletters();
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "send cron failed";
    console.error(JSON.stringify({ scope: "send-newsletters-cron", error: message }));
    return json({ ok: false, error: message }, 500);
  }
};
