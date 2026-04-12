import Parser from "rss-parser";

const parser = new Parser();

export type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string;
};

export const fetchLatestRssItems = async (
  feedUrl: string,
  limit: number,
): Promise<RssItem[]> => {
  const parsed = await parser.parseURL(feedUrl);
  const items = (parsed.items ?? [])
    .filter((item) => item.title && item.link && item.pubDate)
    .map((item) => ({
      title: item.title as string,
      link: item.link as string,
      pubDate: item.pubDate as string,
      description: item.contentSnippet ?? item.description ?? "",
    }));

  items.sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));
  return items.slice(0, limit);
};
