import { useEffect, useState } from "react";
import type { AdminArticleRow, AdminNewsletterRow } from "@/lib/db/adminDb";

type EnrichedNewsletter = AdminNewsletterRow & { articles: AdminArticleRow[] };
type Props = { accessToken: string };

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  transaction: { bg: "#eff6ff", text: "#2563eb" },
  injury: { bg: "#fff5f5", text: "#dc2626" },
  game_analysis: { bg: "#f0fdf4", text: "#16a34a" },
  rumor: { bg: "#fffbeb", text: "#d97706" },
  general: { bg: "#f2f2f0", text: "#888888" },
};

const ArticleRow = ({ article }: { article: AdminArticleRow }) => {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_COLORS[article.category ?? "general"] ?? CATEGORY_COLORS.general;
  const isPassed = article.passed_threshold;

  return (
    <div className="rounded-lg border border-fw-border bg-fw-white">
      <div className="flex items-start gap-3 p-4">
        {/* Status accent bar */}
        <div
          className="mt-1 h-8 w-[3px] flex-shrink-0 rounded-full"
          style={{ backgroundColor: isPassed ? "#16a34a" : "#d4d4d4" }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {/* Category badge */}
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1px]"
              style={{ background: cat.bg, color: cat.text }}
            >
              {article.category ?? "general"}
            </span>
            {isPassed ? (
              <span className="rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-2 py-0.5 text-[10px] font-semibold text-[#16a34a] uppercase tracking-[1px]">
                Selected
              </span>
            ) : (
              <span className="rounded-full border border-fw-border bg-fw-card px-2 py-0.5 text-[10px] font-semibold text-fw-ink-muted uppercase tracking-[1px]">
                Filtered
              </span>
            )}
            {article.composite_score !== null && (
              <span className="text-[11px] font-semibold text-fw-ink-muted">
                Score: <strong className="text-fw-ink">{article.composite_score}</strong>
              </span>
            )}
          </div>

          <p className="text-[14px] font-semibold text-fw-ink leading-snug">{article.headline}</p>
          <p className="mt-0.5 text-[12px] text-fw-ink-muted">
            {article.source_name} · {article.source_type}
          </p>

          {article.selection_reasoning && (
            <p className="mt-1.5 text-[12px] text-fw-ink-mid italic">
              {article.selection_reasoning}
            </p>
          )}

          {expanded && (
            <div className="mt-3 space-y-2">
              {article.ai_summary && (
                <div className="rounded-lg border border-fw-border bg-fw-card p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-fw-ink-faint">
                    AI Summary
                  </p>
                  <p className="text-[13px] text-fw-ink-mid">{article.ai_summary}</p>
                </div>
              )}
              <a
                href={article.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-[12px] text-[#2563eb] hover:underline"
              >
                View original →
              </a>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 rounded-lg border border-fw-border px-2.5 py-1.5 text-[12px] text-fw-ink-muted hover:border-fw-border-mid hover:text-fw-ink transition-colors"
        >
          {expanded ? "Hide" : "Expand"}
        </button>
      </div>
    </div>
  );
};

const NewsletterCard = ({
  newsletter,
  onSend,
  sending,
}: {
  newsletter: EnrichedNewsletter;
  onSend: () => void;
  sending: boolean;
}) => {
  const selected = newsletter.articles.filter((a) => a.passed_threshold);
  const filtered = newsletter.articles.filter((a) => !a.passed_threshold);

  return (
    <div className="rounded-xl border border-fw-border overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ background: "#f2f2f0", borderBottom: `3px solid ${newsletter.team_primary_color}` }}
      >
        <div>
          <p className="text-[15px] font-bold text-fw-ink">
            {newsletter.team_city} {newsletter.team_name}
          </p>
          <p className="text-[12px] text-fw-ink-muted">{newsletter.subject_line}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] text-fw-ink-muted">
              <span className="font-semibold text-fw-ink">{selected.length}</span> selected ·{" "}
              <span className="font-semibold text-fw-ink-muted">{filtered.length}</span> filtered
            </p>
          </div>
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className="rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: newsletter.team_primary_color }}
          >
            {sending ? "Sending…" : "Send Now"}
          </button>
        </div>
      </div>

      {/* Articles */}
      <div className="space-y-2 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-fw-ink-faint mb-3">
          Selected articles ({selected.length})
        </p>
        {selected.length === 0 ? (
          <p className="text-[13px] text-fw-ink-muted py-2">No articles selected today.</p>
        ) : (
          selected.map((a) => <ArticleRow key={a.id} article={a} />)
        )}

        {filtered.length > 0 && (
          <>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[1.5px] text-fw-ink-faint mb-3">
              Filtered out ({filtered.length})
            </p>
            {filtered.map((a) => (
              <ArticleRow key={a.id} article={a} />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export const ContentPreviewTab = ({ accessToken }: Props) => {
  const [newsletters, setNewsletters] = useState<EnrichedNewsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sendResult, setSendResult] = useState("");

  useEffect(() => {
    const fetchNewsletters = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/admin/newsletters", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = (await res.json()) as {
          ok: boolean;
          newsletters?: EnrichedNewsletter[];
          error?: string;
        };
        if (!json.ok) throw new Error(json.error ?? "Failed to load");
        setNewsletters(json.newsletters ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    void fetchNewsletters();
  }, [accessToken]);

  const handleSendAll = async () => {
    setSendingId(-1);
    setSendResult("");
    try {
      const res = await fetch("/api/admin/send-now", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = (await res.json()) as {
        ok: boolean;
        sent?: number;
        failed?: number;
        error?: string;
      };
      if (!json.ok) throw new Error(json.error ?? "Send failed");
      setSendResult(`Sent: ${json.sent ?? 0}, Failed: ${json.failed ?? 0}`);
    } catch (err) {
      setSendResult(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-bold text-fw-ink">Content Preview</h2>
          <p className="text-[13px] text-fw-ink-muted">
            Today's draft newsletters with article scores.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sendResult && (
            <p className="text-[12px] text-fw-ink-mid">{sendResult}</p>
          )}
          <button
            type="button"
            onClick={() => void handleSendAll()}
            disabled={sendingId !== null}
            className="rounded-lg bg-[#111111] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {sendingId !== null ? "Sending…" : "Send All Drafts"}
          </button>
        </div>
      </div>

      {loading && <p className="text-[13px] text-fw-ink-muted">Loading newsletters…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          {error}
        </p>
      )}
      {!loading && !error && newsletters.length === 0 && (
        <div className="rounded-xl border border-fw-border bg-fw-card p-12 text-center">
          <p className="text-[15px] font-semibold text-fw-ink mb-2">No draft newsletters today</p>
          <p className="text-[13px] text-fw-ink-muted">
            Run the pipeline to generate today's content.
          </p>
        </div>
      )}
      {!loading && newsletters.length > 0 && (
        <div className="space-y-6">
          {newsletters.map((nl) => (
            <NewsletterCard
              key={nl.id}
              newsletter={nl}
              onSend={() => void handleSendAll()}
              sending={sendingId !== null}
            />
          ))}
        </div>
      )}
    </div>
  );
};
