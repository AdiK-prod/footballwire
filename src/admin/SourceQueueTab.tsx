import { useEffect, useState } from "react";
import type { AdminSourceRow } from "@/lib/db/adminDb";

type Props = { accessToken: string };
type FilterStatus = "pending" | "flagged" | "approved" | "rejected" | "";
type FilterType = "general" | "team_specific" | "user_submitted" | "";

const TYPE_LABELS: Record<string, string> = {
  general: "General",
  team_specific: "Team-specific",
  user_submitted: "User-submitted",
};

const FEED_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  news: { label: "News feed", color: "#6b7280" },
  blog: { label: "Blog feed", color: "#7c3aed" },
};

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  pending: { bg: "#fffbeb", border: "#fde68a", text: "#d97706" },
  flagged: { bg: "#fff5f5", border: "#fecaca", text: "#dc2626" },
  approved: { bg: "#f0fdf4", border: "#bbf7d0", text: "#16a34a" },
  rejected: { bg: "#fff5f5", border: "#fecaca", text: "#dc2626" },
};

const StatCard = ({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) => (
  <div
    className="rounded-xl border p-5"
    style={{ borderColor: color === "#d97706" ? "#fde68a" : color === "#dc2626" ? "#fecaca" : "#e8e8e8" }}
  >
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[2px]" style={{ color }}>
      {label}
    </p>
    <p className="text-[30px] font-bold" style={{ color: "#111111" }}>
      {value}
    </p>
  </div>
);

const SourceRow = ({
  source,
  onAction,
}: {
  source: AdminSourceRow;
  onAction: (id: number, action: "approved" | "rejected") => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const sc = STATUS_COLORS[source.status] ?? STATUS_COLORS.pending;
  const teamDisplay =
    source.team_city && source.team_name
      ? `${source.team_city} ${source.team_name}`
      : "General";

  const act = async (action: "approved" | "rejected") => {
    setActing(true);
    onAction(source.id, action);
  };

  return (
    <div className="rounded-xl border border-fw-border bg-fw-white">
      <div className="flex items-start gap-3 p-4">
        {/* Status bar */}
        <div
          className="mt-1 h-8 w-[3px] flex-shrink-0 rounded-full"
          style={{ backgroundColor: sc.text }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-fw-ink truncate">{source.name}</p>
            {/* Type badge */}
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1px]"
              style={{ borderColor: "#d4d4d4", color: "#888888" }}
            >
              {TYPE_LABELS[source.type] ?? source.type}
            </span>
            {/* Feed type badge */}
            {(() => {
              const ft = FEED_TYPE_LABELS[source.feed_type] ?? FEED_TYPE_LABELS.news;
              return (
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1px]"
                  style={{ borderColor: ft.color, color: ft.color }}
                >
                  {ft.label}
                </span>
              );
            })()}
            {/* Status badge */}
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1px]"
              style={{ background: sc.bg, borderColor: sc.border, color: sc.text }}
            >
              {source.status}
            </span>
            {/* Team pill */}
            {source.team_primary_color && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: source.team_primary_color,
                  color: "#ffffff",
                }}
              >
                {teamDisplay}
              </span>
            )}
          </div>

          <p className="mt-0.5 truncate text-[12px] text-fw-ink-muted">{source.url}</p>

          {source.relevance_score !== null && (
            <p className="mt-1 text-[11px] text-fw-ink-muted">
              Relevance: <strong>{source.relevance_score}</strong>/100
            </p>
          )}

          {expanded && source.validation_notes && (
            <div className="mt-3 rounded-lg border border-fw-border bg-fw-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[1px] text-fw-ink-faint mb-1">
                Validation notes
              </p>
              <p className="text-[13px] text-fw-ink-mid whitespace-pre-wrap">
                {source.validation_notes}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {source.validation_notes && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-fw-border px-2.5 py-1.5 text-[12px] text-fw-ink-muted hover:border-fw-border-mid hover:text-fw-ink transition-colors"
            >
              {expanded ? "Hide" : "Details"}
            </button>
          )}
          {source.status !== "approved" && (
            <button
              type="button"
              disabled={acting}
              onClick={() => act("approved")}
              className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-1.5 text-[12px] font-medium text-[#16a34a] hover:bg-[#dcfce7] transition-colors disabled:opacity-50"
            >
              Approve
            </button>
          )}
          {source.status !== "rejected" && (
            <button
              type="button"
              disabled={acting}
              onClick={() => act("rejected")}
              className="rounded-lg border border-[#fecaca] bg-[#fff5f5] px-3 py-1.5 text-[12px] font-medium text-[#dc2626] hover:bg-[#fee2e2] transition-colors disabled:opacity-50"
            >
              Reject
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const SourceQueueTab = ({ accessToken }: Props) => {
  const [sources, setSources] = useState<AdminSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("");
  const [filterType, setFilterType] = useState<FilterType>("");

  const fetchSources = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterType) params.set("type", filterType);
      const res = await fetch(`/api/admin/sources?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = (await res.json()) as { ok: boolean; sources?: AdminSourceRow[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to load sources");
      setSources(json.sources ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterType]);

  const handleAction = async (id: number, action: "approved" | "rejected") => {
    try {
      const res = await fetch("/api/admin/sources", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, action }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error);
      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: action } : s)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    }
  };

  const pending = sources.filter((s) => s.status === "pending").length;
  const flagged = sources.filter((s) => s.status === "flagged").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-bold text-fw-ink">Source Queue</h2>
        <p className="text-[13px] text-fw-ink-muted">Pending and flagged sources awaiting review.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Pending" value={pending} color="#d97706" />
        <StatCard label="Flagged" value={flagged} color="#dc2626" />
        <StatCard label="Total shown" value={sources.length} color="#888888" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-fw-border bg-fw-card p-4">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[1.5px] text-fw-ink-faint">
            Status
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="rounded-lg border border-fw-border bg-fw-input-bg px-3 py-2 text-[13px] text-fw-ink focus:outline-none"
          >
            <option value="">Pending + Flagged</option>
            <option value="pending">Pending only</option>
            <option value="flagged">Flagged only</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[1.5px] text-fw-ink-faint">
            Type
          </label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            className="rounded-lg border border-fw-border bg-fw-input-bg px-3 py-2 text-[13px] text-fw-ink focus:outline-none"
          >
            <option value="">All types</option>
            <option value="team_specific">Team-specific</option>
            <option value="user_submitted">User-submitted</option>
            <option value="general">General</option>
          </select>
        </div>
        <div className="ml-auto flex items-end">
          <button
            type="button"
            onClick={() => void fetchSources()}
            className="rounded-lg border border-fw-border px-4 py-2 text-[12px] text-fw-ink-muted hover:border-fw-border-mid hover:text-fw-ink transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* List */}
      {loading && <p className="text-[13px] text-fw-ink-muted">Loading sources…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          {error}
        </p>
      )}
      {!loading && !error && sources.length === 0 && (
        <p className="rounded-xl border border-fw-border bg-fw-card p-8 text-center text-[14px] text-fw-ink-muted">
          No sources in queue.
        </p>
      )}
      {!loading && sources.length > 0 && (
        <div className="space-y-3">
          {sources.map((s) => (
            <SourceRow key={s.id} source={s} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
};
