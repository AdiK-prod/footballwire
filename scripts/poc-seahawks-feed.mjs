/**
 * POC: Seahawks Draft Blog Feed Processor
 *
 * Validates what content can be extracted and how it could appear in the newsletter.
 * Run: node scripts/poc-seahawks-feed.mjs
 * Run with Claude summarization: ANTHROPIC_API_KEY=xxx node scripts/poc-seahawks-feed.mjs
 */

import Parser from "rss-parser";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const FEED_URL = "https://seahawksdraftblog.com/feed";
const TEAM_NAME = "Seattle Seahawks";
const MODEL = "claude-haiku-4-5-20251001";
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env for ANTHROPIC_API_KEY (optional — POC works without it)
const ANTHROPIC_API_KEY = (() => {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const lines = readFileSync(join(__dirname, "..", ".env"), "utf-8").split("\n");
    for (const line of lines) {
      const [k, ...v] = line.split("=");
      if (k?.trim() === "ANTHROPIC_API_KEY") return v.join("=").trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return null;
})();

// ─── RSS Parser (with content:encoded) ───────────────────────────────────────

const parser = new Parser({
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["dc:creator", "author"],
    ],
  },
});

// ─── Text utilities ───────────────────────────────────────────────────────────

const decodeHtmlEntities = (text) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&[a-zA-Z]+;/g, " ");

const stripHtml = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<video[\s\S]*?<\/video>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cleanText = (html) => decodeHtmlEntities(stripHtml(html || ""));

const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);

// ─── Content type classifier ──────────────────────────────────────────────────

const CONTENT_TYPES = {
  VIDEO: "video",       // YouTube embed / video only — no text
  ARTICLE: "article",   // Full written piece ≥200 words
  THREAD: "thread",     // Live/open thread — running commentary ≥200 words
  SHORT: "short",       // Too short to summarize (<200 words, >0)
};

const classify = (item, text, wc) => {
  if (wc === 0) return CONTENT_TYPES.VIDEO;
  const t = item.title?.toLowerCase() ?? "";
  if (t.includes("live thread") || t.includes("open thread") || t.includes("live stream"))
    return wc >= 50 ? CONTENT_TYPES.THREAD : CONTENT_TYPES.VIDEO;
  if (wc < 200) return CONTENT_TYPES.SHORT;
  return CONTENT_TYPES.ARTICLE;
};

// ─── YouTube link extractor ───────────────────────────────────────────────────

const extractYouTubeUrl = (contentEncoded = "") => {
  const match = contentEncoded.match(/src="(https?:\/\/(?:www\.)?youtube\.com\/embed\/([^?"]+)[^"]*)"/);
  if (!match) return null;
  const videoId = match[2];
  return `https://www.youtube.com/watch?v=${videoId}`;
};

// ─── Claude summarization ─────────────────────────────────────────────────────

const summarizeWithClaude = async (title, bodyExcerpt) => {
  if (!ANTHROPIC_API_KEY) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      temperature: 0.3,
      system: "You write short factual newsletter summaries for NFL fans. 2-3 sentences max. Reply JSON only.",
      messages: [
        {
          role: "user",
          content:
            `Summarize for fans of ${TEAM_NAME}.\nTitle: ${title}\n\n` +
            `Body:\n${bodyExcerpt.slice(0, 3000)}\n\nReply JSON: {"summary": "..."}`,
        },
      ],
    }),
  });

  if (!res.ok) return `(Claude error: ${res.status})`;

  try {
    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    const clean = text.replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(clean).summary ?? text;
  } catch {
    return "(parse error)";
  }
};

// ─── Newsletter block renderers ───────────────────────────────────────────────

const divider = (char = "─", len = 64) => char.repeat(len);

const renderTopStory = (item, summary) => [
  "  ┌" + divider("─", 60) + "┐",
  `  │ 🏈 TOP STORY${" ".repeat(46)}│`,
  "  ├" + divider("─", 60) + "┤",
  `  │ ${item.title.slice(0, 58).padEnd(58)} │`,
  "  │" + " ".repeat(60) + "│",
  ...(summary ? wrapLines(summary, 58).map((l) => `  │ ${l.padEnd(58)} │`) : []),
  "  │" + " ".repeat(60) + "│",
  `  │ Read more → ${item.link.slice(0, 44)}${"".padEnd(Math.max(0, 44 - item.link.slice(0, 44).length))} │`,
  "  └" + divider("─", 60) + "┘",
].join("\n");

const renderQuickHit = (item, summary) =>
  [
    `  • ${item.title}`,
    summary ? `    ${summary}` : "",
    `    → ${item.link}`,
  ]
    .filter(Boolean)
    .join("\n");

const renderWatchItem = (item, ytUrl) =>
  `  ▶  ${item.title}\n     → ${ytUrl || item.link}`;

const wrapLines = (text, maxLen) => {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length <= maxLen) {
      current = (current + " " + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
};

// ─── Real newsletter HTML renderer (matches production template) ──────────────

const esc = (str) =>
  (str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
    });
  } catch { return iso; }
};

const sectionLabel = (text, bgColor) =>
  `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:${bgColor};padding:8px 32px;">
<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#ffffff;line-height:1;">${esc(text)}</span>
</td></tr></table>`;

const buildTopStory = (article, teamColor) => {
  const meta = `${esc(article.source)} · ${esc(formatDate(article.pubDate))}`;
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:#ffffff;padding:24px 32px;">
<p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:700;color:#111111;line-height:1.2;">${esc(article.title)}</p>
${article.summary ? `<p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:400;color:#444444;line-height:1.6;">${esc(article.summary)}</p>` : ""}
<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;line-height:1.4;">${meta}</p>
<p style="margin:0;"><a href="${esc(article.link)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:${teamColor};text-decoration:none;">Read more &#8594;</a></p>
</td></tr></table>`;
};

const buildQuickHit = (article, teamColor, isLast) => {
  const meta = `${esc(article.source)} · ${esc(formatDate(article.pubDate))}`;
  const border = isLast ? "" : "border-bottom:1px solid #eeeeee;";
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td width="3" style="background:${teamColor};width:3px;"></td>
<td style="background:#f9f9f9;padding:16px 32px 16px 20px;${border}">
<p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:600;color:#111111;line-height:1.3;">${esc(article.title)}</p>
${article.summary ? `<p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:400;color:#444444;line-height:1.55;">${esc(article.summary)}</p>` : ""}
<p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;line-height:1.4;">${meta}</p>
<p style="margin:0;"><a href="${esc(article.link)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:${teamColor};text-decoration:none;">Read more &#8594;</a></p>
</td></tr></table>`;
};

const buildWatchBlock = (videoItems, teamColor) => {
  const rows = videoItems
    .map(
      (v, i) => {
        const border = i < videoItems.length - 1 ? "border-bottom:1px solid #eeeeee;" : "";
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="padding:14px 32px;${border}background:#f9f9f9;">
<p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:600;color:#111111;line-height:1.3;">
<span style="margin-right:6px;">&#9654;</span>${esc(v.title)}</p>
<p style="margin:0;"><a href="${esc(v.ytUrl || v.link)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:${teamColor};text-decoration:none;">Watch on YouTube &#8594;</a></p>
</td></tr></table>`;
      }
    )
    .join("\n");
  return rows;
};

const buildNewsletterHtml = ({ teamName, teamColor, articles, videoItems, dateStr }) => {
  const nonInjury = articles.filter((a) => a.type !== "injury");
  const injuries  = articles.filter((a) => a.type === "injury");
  const lead      = nonInjury[0];
  const quick     = nonInjury.slice(1, 5);

  const blocks = [];

  if (articles.length < 3) {
    blocks.push(`<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:#fffbeb;border:1px solid #fde68a;padding:14px 32px;">
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#92400e;line-height:1.5;">
&#9888; Light news day for ${esc(teamName)} &#8212; Limited verified coverage today.</p>
</td></tr></table>`);
  }

  if (lead) {
    blocks.push(sectionLabel("TOP STORY", teamColor));
    blocks.push(buildTopStory(lead, teamColor));
  }

  if (quick.length > 0) {
    blocks.push(sectionLabel("QUICK HITS", teamColor));
    quick.forEach((a, i) => blocks.push(buildQuickHit(a, teamColor, i === quick.length - 1)));
  }

  if (injuries.length > 0) {
    blocks.push(sectionLabel("INJURY REPORT", "#dc2626"));
    injuries.forEach((a, i) => {
      const border = i < injuries.length - 1 ? "border-bottom:1px solid #fecaca;" : "";
      blocks.push(`<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:#fff5f5;padding:16px 32px;${border}">
<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:600;color:#111111;line-height:1.3;">
<span style="color:#dc2626;margin-right:6px;">&#9679;</span>${esc(a.title)}</p>
${a.summary ? `<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#666666;line-height:1.5;">${esc(a.summary)}</p>` : ""}
<p style="margin:0;"><a href="${esc(a.link)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#dc2626;text-decoration:none;">Read more &#8594;</a></p>
</td></tr></table>`);
    });
  }

  if (videoItems.length > 0) {
    blocks.push(sectionLabel("WATCH / LISTEN", "#6b7280"));
    blocks.push(buildWatchBlock(videoItems, teamColor));
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(teamName)} Daily Briefing — POC Preview</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr><td align="center" style="padding:20px 0;">
<table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;">

<!-- HEADER -->
<tr><td style="background:#111111;padding:28px 32px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr><td>
<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#ffffff;line-height:1;">FOOTBALLWIRE</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr><td height="3" style="height:3px;background:${teamColor};font-size:0;line-height:0;">&nbsp;</td></tr>
</table>
<p style="margin:10px 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:22px;font-weight:700;color:#ffffff;line-height:1.2;">${esc(teamName)} Daily Briefing</p>
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;color:#999999;line-height:1.4;">${esc(dateStr)} &middot; 5-min read</p>
</td></tr>
</table>
</td></tr>

<!-- BODY -->
<tr><td>
${blocks.join("\n")}
</td></tr>

<!-- FOOTER -->
<tr><td style="background:#f4f4f4;border-top:1px solid #e0e0e0;padding:24px 32px;text-align:center;">
<p style="margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#888888;line-height:1.4;">Was this useful?</p>
<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:0 auto 16px auto;">
<tr>
<td style="padding-right:8px;"><a href="#" style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#444444;text-decoration:none;border:1px solid #dddddd;background:#ffffff;padding:8px 20px;border-radius:4px;">&#128077; Yes</a></td>
<td><a href="#" style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#444444;text-decoration:none;border:1px solid #dddddd;background:#ffffff;padding:8px 20px;border-radius:4px;">&#128078; No</a></td>
</tr>
</table>
<p style="margin:0 0 8px 0;">
<a href="#" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;text-decoration:none;">Unsubscribe</a>
<span style="color:#bbbbbb;margin:0 6px;">&#183;</span>
<a href="#" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;text-decoration:none;">Submit a source</a>
</p>
<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#bbbbbb;line-height:1.4;">FOOTBALLWIRE &middot; Daily team briefings</p>
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;color:#dddddd;">⚠ POC PREVIEW — not a real email</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  console.log("\n" + divider("═"));
  console.log("  POC — Seahawks Draft Blog Feed Processor");
  console.log("  " + FEED_URL);
  console.log(divider("═") + "\n");

  if (!ANTHROPIC_API_KEY) {
    console.log("  ⚠  No ANTHROPIC_API_KEY found — running without Claude summarization.");
    console.log("     Set ANTHROPIC_API_KEY=xxx to enable summaries.\n");
  }

  // 1. Fetch feed
  process.stdout.write("  Fetching feed...");
  const feed = await parser.parseURL(FEED_URL);
  const rawItems = (feed.items ?? []).filter((i) => i.title && i.link);
  console.log(` ✓  ${rawItems.length} items from "${feed.title}"\n`);

  // 2. Classify each item
  const items = rawItems.map((item) => {
    const html = item.contentEncoded || item.content || item.description || "";
    const text = cleanText(html);
    const wc = wordCount(text);
    const type = classify(item, text, wc);
    const ytUrl = type === CONTENT_TYPES.VIDEO ? extractYouTubeUrl(item.contentEncoded || "") : null;
    return { item, html, text, wc, type, ytUrl };
  });

  // 3. Classification summary
  console.log("  " + divider("─", 60));
  console.log("  CONTENT CLASSIFICATION");
  console.log("  " + divider("─", 60));
  const typeLabels = {
    [CONTENT_TYPES.ARTICLE]: "📝 ARTICLE ",
    [CONTENT_TYPES.THREAD]:  "🔴 THREAD  ",
    [CONTENT_TYPES.SHORT]:   "⚡ SHORT   ",
    [CONTENT_TYPES.VIDEO]:   "▶  VIDEO   ",
  };
  for (const r of items) {
    const label = typeLabels[r.type] ?? "?  UNKNOWN ";
    const wordInfo = r.wc > 0 ? `${r.wc} words` : "no text";
    console.log(`  ${label} │ ${wordInfo.padEnd(8)} │ ${r.item.title.slice(0, 50)}`);
  }
  console.log();

  // 4. Deep-dive each processable item
  const processable = items.filter((r) => r.type === CONTENT_TYPES.ARTICLE || r.type === CONTENT_TYPES.THREAD);
  const videoItems = items.filter((r) => r.type === CONTENT_TYPES.VIDEO);
  const shortItems = items.filter((r) => r.type === CONTENT_TYPES.SHORT);

  console.log("  " + divider("─", 60));
  console.log(`  PROCESSABLE ITEMS (${processable.length} articles/threads)`);
  console.log("  " + divider("─", 60) + "\n");

  const summaries = new Map();

  for (const r of processable) {
    console.log(`  [${r.type.toUpperCase()}] ${r.item.title}`);
    console.log(`  Author: ${r.item.author || "unknown"}  |  Published: ${r.item.pubDate}`);
    console.log(`  Words: ${r.wc}  |  Source: RSS content:encoded ✓`);
    console.log(`  Excerpt: "${r.text.slice(0, 200)}..."`);

    if (ANTHROPIC_API_KEY) {
      process.stdout.write("  Summarizing with Claude...");
      const summary = await summarizeWithClaude(r.item.title, r.text);
      summaries.set(r.item.link, summary);
      console.log(`\r  Summary: ${summary}`);
    }
    console.log();
  }

  // 5. Video items
  if (videoItems.length > 0) {
    console.log("  " + divider("─", 60));
    console.log(`  VIDEO ITEMS (${videoItems.length} — no text to summarize)`);
    console.log("  " + divider("─", 60) + "\n");
    for (const r of videoItems) {
      console.log(`  ▶  ${r.item.title}`);
      console.log(`     YouTube: ${r.ytUrl || "(no YouTube link found)"}`);
      console.log(`     Article: ${r.item.link}`);
      console.log();
    }
  }

  // 6. Short items
  if (shortItems.length > 0) {
    console.log("  " + divider("─", 60));
    console.log(`  SHORT ITEMS (${shortItems.length} — below 200-word threshold)`);
    console.log("  " + divider("─", 60) + "\n");
    for (const r of shortItems) {
      console.log(`  ⚡  ${r.item.title}  (${r.wc} words)`);
      console.log(`     "${r.text.slice(0, 150)}..."`);
      console.log();
    }
  }

  // 7. Build real newsletter HTML and save
  console.log("\n" + divider("═"));
  console.log("  GENERATING NEWSLETTER HTML PREVIEW");
  console.log(divider("═") + "\n");

  const TEAM_NAME  = "Seattle Seahawks";
  const TEAM_COLOR = "#002244"; // Seahawks navy

  const newsletterArticles = processable.map((r) => ({
    title:   r.item.title,
    summary: summaries.get(r.item.link) ?? null,
    link:    r.item.link,
    source:  "Seahawks Draft Blog",
    pubDate: r.item.pubDate,
    type:    "general",
  }));

  const htmlVideoItems = videoItems.map((r) => ({
    title:  r.item.title,
    link:   r.item.link,
    ytUrl:  r.ytUrl,
    pubDate: r.item.pubDate,
  }));

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const html = buildNewsletterHtml({
    teamName:   TEAM_NAME,
    teamColor:  TEAM_COLOR,
    articles:   newsletterArticles,
    videoItems: htmlVideoItems,
    dateStr,
  });

  const outputPath = join(dirname(fileURLToPath(import.meta.url)), "poc-newsletter-preview.html");
  writeFileSync(outputPath, html, "utf-8");
  console.log(`  ✓  Saved to: scripts/poc-newsletter-preview.html`);
  console.log(`     Open it in your browser:\n`);
  console.log(`     open scripts/poc-newsletter-preview.html\n`);

  // 8. POC conclusions
  console.log(divider("═") + "\n");
  console.log("  CONCLUSIONS\n");
  console.log(`  ✓  Feed has ${processable.length} text article(s) suitable for newsletter summarization`);
  console.log(`  ✓  ${videoItems.length} video item(s) can appear as Watch/Listen links (no summarization needed)`);
  console.log(`  ✗  ${shortItems.length} item(s) too short for meaningful summary (< 200 words)`);
  console.log(`  ✓  content:encoded provides clean article HTML — no page scraping needed`);
  console.log(`  ✓  HTML entities decoded before Claude — cleaner prompts`);
  if (ANTHROPIC_API_KEY && summaries.size > 0) {
    console.log(`  ✓  Claude successfully summarized ${summaries.size} article(s)`);
  }
  console.log();
};

main().catch((err) => {
  console.error("\nPOC error:", err.message);
  process.exit(1);
});
