import type { ArticleCategory } from "../pipeline/articleCategory";
import { createDraftNewsletter } from "../db/newsletterDb";
import type { Team } from "../types";

type SelectedArticle = {
  id: number;
  title: string;
  ai_summary: string | null;
  original_url: string;
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

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
};

const buildArticleRow = (a: SelectedArticle): string => {
  const summary = a.ai_summary ? esc(a.ai_summary) : "Summary unavailable.";
  return `<li style="margin:0 0 16px 0;">
<p style="margin:0 0 4px 0;font-size:17px;font-weight:700;color:#111111;">${esc(a.title)}</p>
<p style="margin:0 0 8px 0;color:#444444;line-height:1.45;">${summary}</p>
<p style="margin:0;color:#666666;font-size:12px;">${esc(formatDate(a.published_at))}</p>
<p style="margin:8px 0 0 0;"><a href="${esc(a.original_url)}" style="color:#0b57d0;text-decoration:underline;">Read more</a></p>
</li>`;
};

const buildSection = (title: string, body: string): string => `<section style="margin:0 0 26px 0;">
<h2 style="margin:0 0 12px 0;font-size:20px;color:#111111;">${esc(title)}</h2>
${body}
</section>`;

const extractStat = (note: string | null): string | null => {
  if (!note) {
    return null;
  }
  try {
    const parsed = JSON.parse(note) as { statSnippet?: string };
    return parsed.statSnippet?.trim() || null;
  } catch {
    return null;
  }
};

export const buildNewsletterHtml = (params: {
  team: Team;
  selectedArticles: SelectedArticle[];
  pipelineNotes: string | null;
  appBaseUrl: string;
  trackingFor: (newsletterId: number, subscriberId: number) => {
    openPixelUrl: string;
    thumbsUpUrl: string;
    thumbsDownUrl: string;
    unsubscribeUrl: string;
  };
  newsletterIdForTemplate: number;
  subscriberIdForTemplate: number;
}): { subject: string; html: string } => {
  const nonInjury = params.selectedArticles.filter((a) => a.category !== "injury");
  const lead = nonInjury[0];
  const quick = nonInjury.slice(1, 5);
  const injuries = params.selectedArticles.filter((a) => a.category === "injury");
  const stat = extractStat(params.pipelineNotes);

  const sections: string[] = [];
  if (lead) {
    sections.push(buildSection("Top Story", `<ul style="padding-left:18px;margin:0;">${buildArticleRow(lead)}</ul>`));
  }
  if (quick.length > 0) {
    sections.push(
      buildSection(
        "Quick Hits",
        `<ul style="padding-left:18px;margin:0;">${quick.map(buildArticleRow).join("")}</ul>`,
      ),
    );
  }
  if (injuries.length > 0) {
    sections.push(
      buildSection(
        "Injury Report",
        `<ul style="padding-left:18px;margin:0;">${injuries.map(buildArticleRow).join("")}</ul>`,
      ),
    );
  }
  if (stat) {
    sections.push(
      buildSection(
        "Stat of the Day",
        `<p style="margin:0;color:#222222;font-size:16px;"><strong>${esc(stat)}</strong></p>`,
      ),
    );
  }
  if (params.selectedArticles.length < 3) {
    sections.push(
      buildSection(
        "Note",
        "<p style=\"margin:0;color:#666666;\">Reduced newsletter today due to limited verified coverage.</p>",
      ),
    );
  }

  const tracking = params.trackingFor(
    params.newsletterIdForTemplate,
    params.subscriberIdForTemplate,
  );

  const html = `<!doctype html>
<html>
  <body style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;color:#111111;padding:20px;">
    <main style="max-width:700px;margin:0 auto;">
      <h1 style="margin:0 0 8px 0;">${esc(params.team.city)} ${esc(params.team.name)} Daily Briefing</h1>
      <p style="margin:0 0 20px 0;color:#555555;">A 5-minute morning read from Football Wire.</p>
      ${sections.join("\n")}
      <section style="margin:18px 0 0 0;border-top:1px solid #e8e8e8;padding-top:14px;">
        <p style="margin:0 0 10px 0;">Was this issue useful?</p>
        <p style="margin:0 0 8px 0;">
          <a href="${esc(tracking.thumbsUpUrl)}">👍 Helpful</a> ·
          <a href="${esc(tracking.thumbsDownUrl)}">👎 Not helpful</a>
        </p>
        <p style="margin:0;">
          <a href="${esc(tracking.unsubscribeUrl)}">Unsubscribe instantly</a>
        </p>
      </section>
    </main>
    <img src="${esc(tracking.openPixelUrl)}" alt="" width="1" height="1" style="display:block;border:0;opacity:0;" />
  </body>
</html>`;

  return {
    subject: `${params.team.city} ${params.team.name} | Daily Briefing`,
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
