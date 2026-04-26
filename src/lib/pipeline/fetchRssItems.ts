import Parser from "rss-parser";

const parser = new Parser({
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["dc:creator", "author"],
    ],
  },
});

export type BlogContentType = "article" | "thread" | "video" | "short";

export type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  /** Present when the source feed_type is 'blog' and the RSS item includes <content:encoded> */
  contentEncoded?: string;
};

export const fetchLatestRssItems = async (
  feedUrl: string,
  limit: number,
): Promise<RssItem[]> => {
  const parsed = await parser.parseURL(feedUrl);
  const items = (parsed.items ?? [])
    .filter((item) => item.title && item.link && item.pubDate)
    .map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      const base: RssItem = {
        title: item.title as string,
        link: item.link as string,
        pubDate: item.pubDate as string,
        description:
          typeof raw.contentSnippet === "string"
            ? raw.contentSnippet
            : typeof raw.description === "string"
              ? raw.description
              : "",
      };
      const ce = raw.contentEncoded;
      if (typeof ce === "string" && ce.length > 0) {
        base.contentEncoded = ce;
      }
      return base;
    });

  items.sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));
  return items.slice(0, limit);
};

// ─── Blog feed helpers ────────────────────────────────────────────────────────

/** Decode the most common HTML entities (no external dep). */
const decodeHtmlEntities = (text: string): string =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, "\u201c")
    .replace(/&#8221;/g, "\u201d")
    .replace(/&#8230;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 10)),
    );

/** Strip HTML tags, decode entities, collapse whitespace. */
export const cleanBlogContent = (html: string): string => {
  const stripped = html.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(stripped);
  return decoded.replace(/\s+/g, " ").trim();
};

const THREAD_TITLE_PATTERNS = /\b(live thread|open thread|game thread|chat)\b/i;
const VIDEO_EMBED_PATTERNS =
  /(?:youtube\.com|youtu\.be|vimeo\.com|iframe[^>]+src)/i;

/** Extract the first YouTube URL from content:encoded HTML. */
export const extractYouTubeUrl = (html: string): string | null => {
  const m = html.match(
    /https?:\/\/(?:www\.)?youtu(?:be\.com\/(?:watch\?v=|embed\/)|\.be\/)([A-Za-z0-9_-]{11})/,
  );
  if (!m) return null;
  return `https://www.youtube.com/watch?v=${m[1]}`;
};

/** Classify a blog RSS item into a content type. */
export const classifyBlogItem = (params: {
  title: string;
  contentEncoded: string;
  wordCount: number;
}): BlogContentType => {
  if (THREAD_TITLE_PATTERNS.test(params.title)) return "thread";
  if (VIDEO_EMBED_PATTERNS.test(params.contentEncoded) && params.wordCount < 100) {
    return "video";
  }
  if (params.wordCount < 200) return "short";
  return "article";
};
