import { useEffect, useState } from "react";
import type { AdminSourceRow } from "@/lib/db/adminDb";
import { getBrowserClient } from "@/lib/supabase/browser";

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

type TeamOption = { id: number; city: string; name: string };

type AddSourceState = {
  url: string;
  scope: "team_specific" | "general";
  feedType: "news" | "blog";
  teamId: string;
};

type AddSourceResult = {
  ok: boolean;
  message: string;
};

const AddSourceForm = ({
  accessToken,
  teams,
  onAdded,
  onCancel,
}: {
  accessToken: string;
  teams: TeamOption[];
  onAdded: () => void;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState<AddSourceState>({
    url: "",
    scope: "team_specific",
    feedType: "news",
    teamId: teams[0] ? String(teams[0].id) : "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AddSourceResult | null>(null);

  const handleSubmit = async () => {
    if (!form.url.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const payload: Record<string, unknown> = {
        url: form.url.trim(),
        sourceType: form.scope,
        feedType: form.feedType,
        submittedBy: "admin",
      };
      if (form.scope === "team_specific") {
        const tid = Number(form.teamId);
        if (!tid) {
          setResult({ ok: false, message: "Please select a team." });
          setSubmitting(false);
          return;
        }
        payload.teamId = tid;
      } else {
        payload.teamId = null;
      }

      const res = await fetch("/api/validate-source", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { status: string; reason: string; confidence: number | null };
        error?: string;
      };

      if (!json.ok || !json.data) {
        setResult({ ok: false, message: json.error ?? "Validation failed" });
      } else {
        const d = json.data;
        const conf = d.confidence !== null ? ` · Relevance: ${d.confidence}%` : "";
        setResult({
          ok: d.status !== "rejected",
          message: `${d.status === "approved" ? "✓ Approved" : d.status === "flagged" ? "⚠ Flagged" : "✗ Rejected"} — ${d.reason}${conf}`,
        });
        if (d.status !== "rejected") {
          onAdded();
        }
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-fw-border bg-fw-card p-5 space-y-4">
      <p className="text-[13px] font-semibold text-fw-ink">Add Source</p>

      <div className="space-y-3">
        {/* RSS URL */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[1.5px] text-fw-ink-faint">
            RSS Feed URL
          </label>
          <input
            type="url"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://example.com/feed"
            className="w-full rounded-lg border border-fw-border bg-fw-input-bg px-3 py-2 text-[13px] text-fw-ink placeholder:text-fw-ink-faint focus:outline-none focus:border-fw-border-mid"
          />
        </div>

        {/* Scope + Feed type row */}
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[1.5px] text-fw-ink-faint">
              Scope
            </label>
            <div className="flex gap-3">
              {(["team_specific", "general"] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5 cursor-pointer text-[13px] text-fw-ink">
                  <input
                    type="radio"
                    name="scope"
                    value={s}
                    checked={form.scope === s}
                    onChange={() => setForm((f) => ({ ...f, scope: s }))}
                  />
                  {s === "team_specific" ? "Team-specific" : "General (all teams)"}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[1.5px] text-fw-ink-faint">
              Feed Type
            </label>
            <div className="flex gap-3">
              {(["news", "blog"] as const).map((ft) => (
                <label key={ft} className="flex items-center gap-1.5 cursor-pointer text-[13px] text-fw-ink">
                  <input
                    type="radio"
                    name="feedType"
                    value={ft}
                    checked={form.feedType === ft}
                    onChange={() => setForm((f) => ({ ...f, feedType: ft }))}
                  />
                  {ft === "news" ? "News" : "Blog"}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Team dropdown — only when team-specific */}
        {form.scope === "team_specific" && (
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[1.5px] text-fw-ink-faint">
              Team
            </label>
            <select
              value={form.teamId}
              onChange={(e) => setForm((f) => ({ ...f, teamId: e.target.value }))}
              className="rounded-lg border border-fw-border bg-fw-input-bg px-3 py-2 text-[13px] text-fw-ink focus:outline-none focus:border-fw-border-mid"
            >
              <option value="">Select team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.city} {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <p
          className="text-[13px]"
          style={{ color: result.ok ? "#16a34a" : "#dc2626" }}
        >
          {result.message}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={submitting || !form.url.trim()}
          onClick={() => void handleSubmit()}
          className="rounded-lg bg-[#111111] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#333333] transition-colors disabled:opacity-50"
        >
          {submitting ? "Validating…" : "Validate & Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-fw-border px-4 py-2 text-[13px] text-fw-ink-muted hover:border-fw-border-mid hover:text-fw-ink transition-colors"
        >
          Cancel
        </button>
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [teams, setTeams] = useState<TeamOption[]>([]);

  useEffect(() => {
    const loadTeams = async () => {
      try {
        const supabase = getBrowserClient();
        const { data } = await supabase
          .from("teams")
          .select("id, city, name")
          .order("city")
          .returns<{ id: number; city: string; name: string }[]>();
        setTeams(
          (data ?? []).map((t) => ({
            id: t.id,
            city: t.city,
            name: t.name,
          })),
        );
      } catch {
        // non-critical — form still works without team list
      }
    };
    void loadTeams();
  }, []);

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold text-fw-ink">Source Queue</h2>
          <p className="text-[13px] text-fw-ink-muted">Pending and flagged sources awaiting review.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="flex-shrink-0 rounded-lg border border-fw-border px-4 py-2 text-[13px] font-medium text-fw-ink hover:border-fw-border-mid hover:bg-fw-card transition-colors"
        >
          {showAddForm ? "Close ▲" : "Add source ▾"}
        </button>
      </div>

      {/* Add Source inline form */}
      {showAddForm && (
        <AddSourceForm
          accessToken={accessToken}
          teams={teams}
          onAdded={() => {
            void fetchSources();
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

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
