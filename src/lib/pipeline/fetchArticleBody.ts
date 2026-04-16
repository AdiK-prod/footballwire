/** Strip tags and collapse whitespace for word count + NLP. */

export const stripHtmlToText = (html: string): string => {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutStyles.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
};

export const countWords = (text: string): number => {
  if (!text.trim()) {
    return 0;
  }
  return text.trim().split(/\s+/).length;
};

export const fetchArticleHtml = async (
  url: string,
  timeoutMs = 15_000,
): Promise<{ ok: true; html: string } | { ok: false; reason: string }> => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "FootballWireBot/1.0 (+https://footballwire.uk)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(id);
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const html = await res.text();
    if (!html.trim()) {
      return { ok: false, reason: "Empty body" };
    }
    return { ok: true, html };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "fetch failed";
    return { ok: false, reason: msg };
  }
};
