import Parser from "rss-parser";

const parser = new Parser();

const feeds = [
  "https://www.espn.com/espn/rss/nfl/news",
  "https://profootballtalk.nbcsports.com/feed/",
  "https://theathletic.com/rss/nfl",
];

const run = async () => {
  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed);
      const sample = parsed.items[0] ?? {};

      if (!sample.title || !sample.link || !sample.pubDate) {
        throw new Error("Missing one of required fields: title/link/pubDate");
      }

      console.log(
        `[OK] ${feed} -> title/link/pubDate/description available: ${Boolean(
          sample.description,
        )}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(`[FAIL] ${feed} -> ${message}`);
    }
  }
};

await run();
