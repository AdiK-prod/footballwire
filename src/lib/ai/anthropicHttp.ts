/**
 * Anthropic error bodies: { type: "error", error: { type, message } }.
 * Surfaces API message in thrown errors (Vercel logs, cron JSON 500).
 */
export const formatAnthropicHttpError = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as {
      error?: { message?: string; type?: string };
    };
    const msg = data.error?.message?.trim();
    if (msg) {
      return `${response.status}: ${msg}`;
    }
  } catch {
    /* ignore non-JSON body */
  }
  return `${response.status}`;
};
