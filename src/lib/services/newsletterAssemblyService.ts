import type { ArticleCategory } from "../pipeline/articleCategory";
import { createDraftNewsletter } from "../db/newsletterDb";
import type { Team } from "../types";

type SelectedArticle = {
  id: number;
  title: string;
  ai_summary: string | null;
  original_url: string;
  source_name: string;
  category: ArticleCategory | null;
  published_at: string;
};

const esc = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatShortDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
};

const formatLongDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
};

const extractStat = (
  note: string | null,
): { snippet: string; sourceName: string | null } | null => {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note) as {
      statSnippet?: string;
      statSourceName?: string | null;
    };
    const snippet = parsed.statSnippet?.trim();
    if (!snippet) return null;
    return { snippet, sourceName: parsed.statSourceName ?? null };
  } catch {
    return null;
  }
};

/** Section label bar — full width, colored background */
const sectionLabel = (text: string, bgColor: string): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:${bgColor};padding:8px 32px;">
<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#ffffff;line-height:1;">${esc(text)}</span>
</td></tr></table>`;

/** Top Story block */
const buildTopStory = (a: SelectedArticle, teamColor: string): string => {
  const summary = a.ai_summary ? esc(a.ai_summary) : "";
  const meta = `${esc(a.source_name)} · ${esc(formatShortDate(a.published_at))}`;
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:#ffffff;padding:24px 32px;">
<p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:700;color:#111111;line-height:1.2;">${esc(a.title)}</p>
${summary ? `<p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:400;color:#444444;line-height:1.6;">${summary}</p>` : ""}
<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;line-height:1.4;">${meta}</p>
<p style="margin:0;"><a href="${esc(a.original_url)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:${teamColor};text-decoration:none;">Read more &#8594;</a></p>
</td></tr></table>`;
};

/** Quick Hit block with left team-color accent bar */
const buildQuickHit = (a: SelectedArticle, teamColor: string, isLast: boolean): string => {
  const summary = a.ai_summary ? esc(a.ai_summary) : "";
  const meta = `${esc(a.source_name)} · ${esc(formatShortDate(a.published_at))}`;
  const borderBottom = isLast ? "" : "border-bottom:1px solid #eeeeee;";
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td width="3" style="background:${teamColor};width:3px;"></td>
<td style="background:#f9f9f9;padding:16px 32px 16px 20px;${borderBottom}">
<p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:600;color:#111111;line-height:1.3;">${esc(a.title)}</p>
${summary ? `<p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:400;color:#444444;line-height:1.55;">${summary}</p>` : ""}
<p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;line-height:1.4;">${meta}</p>
<p style="margin:0;"><a href="${esc(a.original_url)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:${teamColor};text-decoration:none;">Read more &#8594;</a></p>
</td></tr></table>`;
};

/** Injury article block */
const buildInjuryRow = (a: SelectedArticle, isLast: boolean): string => {
  const summary = a.ai_summary ? esc(a.ai_summary) : "";
  const borderBottom = isLast ? "" : "border-bottom:1px solid #fecaca;";
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:#fff5f5;padding:16px 32px;${borderBottom}">
<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:600;color:#111111;line-height:1.3;">
<span style="color:#dc2626;margin-right:6px;">&#9679;</span>${esc(a.title)}</p>
${summary ? `<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#666666;line-height:1.5;">${summary}</p>` : ""}
<p style="margin:0;"><a href="${esc(a.original_url)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#dc2626;text-decoration:none;">Read more &#8594;</a></p>
</td></tr></table>`;
};

/** Stat of the Day block */
const buildStatBlock = (
  snippet: string,
  sourceName: string | null,
  teamColor: string,
): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:#ffffff;padding:28px 32px;text-align:center;">
<p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:40px;font-weight:700;color:${teamColor};line-height:1.1;">${esc(snippet)}</p>
${sourceName ? `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;line-height:1.4;">Source: ${esc(sourceName)}</p>` : ""}
</td></tr></table>`;

/** Light news day notice */
const buildLightNewsDayNotice = (teamDisplayName: string): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
<td style="background:#fffbeb;border:1px solid #fde68a;padding:14px 32px;">
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#92400e;line-height:1.5;">
&#9888; Light news day for ${esc(teamDisplayName)} &#8212; Limited verified coverage today.</p>
</td></tr></table>`;

export const buildNewsletterHtml = (params: {
  team: Team;
  selectedArticles: SelectedArticle[];
  pipelineNotes: string | null;
  appBaseUrl: string;
  trackingFor: (
    newsletterId: number,
    subscriberId: number,
  ) => {
    openPixelUrl: string;
    thumbsUpUrl: string;
    thumbsDownUrl: string;
    unsubscribeUrl: string;
  };
  newsletterIdForTemplate: number;
  subscriberIdForTemplate: number;
}): { subject: string; html: string } => {
  const teamColor = params.team.primary_color || "#111111";
  const teamDisplayName = `${params.team.city} ${params.team.name}`;
  const dateStr = formatLongDate(new Date().toISOString());

  const nonInjury = params.selectedArticles.filter((a) => a.category !== "injury");
  const lead = nonInjury[0];
  const quick = nonInjury.slice(1, 5);
  const injuries = params.selectedArticles.filter((a) => a.category === "injury");
  const statData = extractStat(params.pipelineNotes);

  const tracking = params.trackingFor(
    params.newsletterIdForTemplate,
    params.subscriberIdForTemplate,
  );

  const bodyBlocks: string[] = [];

  // Light news day notice (< 3 articles)
  if (params.selectedArticles.length < 3) {
    bodyBlocks.push(buildLightNewsDayNotice(teamDisplayName));
  }

  // Top Story
  if (lead) {
    bodyBlocks.push(sectionLabel("TOP STORY", teamColor));
    bodyBlocks.push(buildTopStory(lead, teamColor));
  }

  // Quick Hits
  if (quick.length > 0) {
    bodyBlocks.push(sectionLabel("QUICK HITS", teamColor));
    quick.forEach((a, i) => {
      bodyBlocks.push(buildQuickHit(a, teamColor, i === quick.length - 1));
    });
  }

  // Injury Report
  if (injuries.length > 0) {
    bodyBlocks.push(sectionLabel("INJURY REPORT", "#dc2626"));
    injuries.forEach((a, i) => {
      bodyBlocks.push(buildInjuryRow(a, i === injuries.length - 1));
    });
  }

  // Stat of the Day
  if (statData) {
    bodyBlocks.push(sectionLabel("STAT OF THE DAY", teamColor));
    bodyBlocks.push(buildStatBlock(statData.snippet, statData.sourceName, teamColor));
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
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
<p style="margin:10px 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:22px;font-weight:700;color:#ffffff;line-height:1.2;">${esc(teamDisplayName)} Daily Briefing</p>
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;color:#999999;line-height:1.4;">${esc(dateStr)} &middot; 5-min read</p>
</td></tr>
</table>
</td></tr>

<!-- BODY CONTENT -->
<tr><td>
${bodyBlocks.join("\n")}
</td></tr>

<!-- FOOTER -->
<tr><td style="background:#f4f4f4;border-top:1px solid #e0e0e0;padding:24px 32px;text-align:center;">
<p style="margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#888888;line-height:1.4;">Was this useful?</p>
<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:0 auto 16px auto;">
<tr>
<td style="padding-right:8px;">
<a href="${esc(tracking.thumbsUpUrl)}" style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#444444;text-decoration:none;border:1px solid #dddddd;background:#ffffff;padding:8px 20px;border-radius:4px;">&#128077; Yes</a>
</td>
<td>
<a href="${esc(tracking.thumbsDownUrl)}" style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#444444;text-decoration:none;border:1px solid #dddddd;background:#ffffff;padding:8px 20px;border-radius:4px;">&#128078; No</a>
</td>
</tr>
</table>
<p style="margin:0 0 8px 0;">
<a href="${esc(tracking.unsubscribeUrl)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;text-decoration:none;">Unsubscribe</a>
<span style="color:#bbbbbb;margin:0 6px;">&#183;</span>
<a href="${esc(params.appBaseUrl)}/submit-source" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#888888;text-decoration:none;">Submit a source</a>
</p>
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#bbbbbb;line-height:1.4;">FOOTBALLWIRE &middot; Daily team briefings</p>
</td></tr>

</table>

</td></tr>
</table>

<img src="${esc(tracking.openPixelUrl)}" alt="" width="1" height="1" style="display:block;border:0;width:1px;height:1px;" />
</body>
</html>`;

  return {
    subject: `${teamDisplayName} | Daily Briefing`,
    html,
  };
};

export const createDraftFromSelectedArticles = async (params: {
  team: Team;
  selectedArticles: SelectedArticle[];
  pipelineNotes: string | null;
  appBaseUrl: string;
  placeholderSubscriberId?: number;
}): Promise<number | null> => {
  if (params.selectedArticles.length === 0) {
    return null;
  }

  const placeholderSubscriberId = params.placeholderSubscriberId ?? 0;
  const placeholderNewsletterId = 0;
  const template = buildNewsletterHtml({
    team: params.team,
    selectedArticles: params.selectedArticles,
    pipelineNotes: params.pipelineNotes,
    appBaseUrl: params.appBaseUrl,
    newsletterIdForTemplate: placeholderNewsletterId,
    subscriberIdForTemplate: placeholderSubscriberId,
    trackingFor: (newsletterId, subscriberId) => {
      const base = params.appBaseUrl.replace(/\/+$/, "");
      return {
        openPixelUrl: `${base}/api/track/open?nid=${newsletterId}&sid=${subscriberId}&sig=SIGNATURE`,
        thumbsUpUrl: `${base}/api/track/feedback?nid=${newsletterId}&sid=${subscriberId}&v=thumbs_up&sig=SIGNATURE`,
        thumbsDownUrl: `${base}/api/track/feedback?nid=${newsletterId}&sid=${subscriberId}&v=thumbs_down&sig=SIGNATURE`,
        unsubscribeUrl: `${base}/api/unsubscribe?sid=${subscriberId}&sig=SIGNATURE`,
      };
    },
  });

  return createDraftNewsletter({
    team_id: params.team.id,
    subject_line: template.subject,
    html_content: template.html,
    status: "draft",
  });
};
