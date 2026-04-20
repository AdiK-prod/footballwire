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
  return `<li style="margin:0 0 14px 0;list-style:none;">
<article style="border:1px solid #e8e8e8;border-radius:10px;padding:14px 14px 12px 14px;background:#ffffff;">
<p style="margin:0 0 6px 0;font-size:17px;font-weight:700;color:#111111;line-height:1.35;">${esc(a.title)}</p>
<p style="margin:0 0 9px 0;color:#404040;line-height:1.5;font-size:14px;">${summary}</p>
<p style="margin:0;color:#888888;font-size:12px;">${esc(formatDate(a.published_at))}</p>
<p style="margin:10px 0 0 0;"><a href="${esc(a.original_url)}" style="color:#0b57d0;text-decoration:underline;font-size:13px;">Read more</a></p>
</article>
</li>`;
};

const buildSection = (title: string, body: string): string => `<section style="margin:0 0 26px 0;">
<h2 style="margin:0 0 12px 0;font-size:20px;color:#111111;letter-spacing:-0.2px;">${esc(title)}</h2>
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

  const teamColor = params.team.primary_color || "#111111";
  const html = `<!doctype html>
<html>
  <body style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f6;color:#111111;padding:20px;">
    <main style="max-width:700px;margin:0 auto;background:#ffffff;border:1px solid #e8e8e8;border-radius:14px;overflow:hidden;">
      <header style="padding:14px 20px;background:#f2f2f0;border-bottom:1px solid #e8e8e8;">
        <p style="margin:0;font-size:11px;letter-spacing:1px;color:#666666;font-weight:700;">FOOTBALLWIRE</p>
      </header>
      <section style="padding:18px 20px 8px 20px;border-top:4px solid ${esc(teamColor)};">
        <h1 style="margin:0 0 8px 0;font-size:34px;line-height:1.15;">${esc(params.team.city)} ${esc(params.team.name)} Daily Briefing</h1>
        <p style="margin:0;color:#666666;font-size:15px;">A 5-minute morning read from Football Wire.</p>
      </section>
      <section style="padding:16px 20px 2px 20px;">
      ${sections.join("\n")}
      </section>
      <section style="margin:18px 0 0 0;border-top:1px solid #e8e8e8;padding-top:14px;">
        <section style="padding:0 20px 20px 20px;">
          <p style="margin:0 0 10px 0;font-weight:600;">Was this issue useful?</p>
          <p style="margin:0 0 10px 0;">
            <a href="${esc(tracking.thumbsUpUrl)}" style="display:inline-block;padding:8px 12px;border-radius:8px;background:#f2f2f0;border:1px solid #e8e8e8;color:#111111;text-decoration:none;">Helpful</a>
            <a href="${esc(tracking.thumbsDownUrl)}" style="display:inline-block;padding:8px 12px;border-radius:8px;background:#f2f2f0;border:1px solid #e8e8e8;color:#111111;text-decoration:none;margin-left:8px;">Not helpful</a>
          </p>
          <p style="margin:0;">
            <a href="${esc(tracking.unsubscribeUrl)}" style="color:#666666;font-size:12px;text-decoration:underline;">Unsubscribe instantly</a>
          </p>
        </section>
      </section>
      <footer style="padding:14px 20px;border-top:1px solid #e8e8e8;background:#fbfbfb;color:#888888;font-size:12px;">
        FootballWire | Daily team briefings
      </footer>
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
