import { useEffect, useState } from "react";
import type { TeamSubscriberStat } from "@/lib/db/adminDb";

type Props = { accessToken: string };

const pct = (num: number, denom: number): string => {
  if (denom === 0) return "—";
  return `${Math.round((num / denom) * 100)}%`;
};

const StatCard = ({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) => (
  <div
    className="rounded-xl border p-5"
    style={{ borderColor: "#e8e8e8", borderLeft: `3px solid ${accent}` }}
  >
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[2px] text-fw-ink-faint">
      {label}
    </p>
    <p className="text-[30px] font-bold text-fw-ink">{value}</p>
    {sub && <p className="mt-0.5 text-[11px] text-fw-ink-muted">{sub}</p>}
  </div>
);

export const SubscribersTab = ({ accessToken }: Props) => {
  const [stats, setStats] = useState<TeamSubscriberStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/admin/subscribers", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = (await res.json()) as {
          ok: boolean;
          stats?: TeamSubscriberStat[];
          error?: string;
        };
        if (!json.ok) throw new Error(json.error ?? "Failed to load");
        setStats(json.stats ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    void fetchStats();
  }, [accessToken]);

  const totalActive = stats.reduce((s, t) => s + t.active_subscribers, 0);
  const totalSends7d = stats.reduce((s, t) => s + t.sends_total_7d, 0);
  const totalOpens7d = stats.reduce((s, t) => s + t.opens_total_7d, 0);
  const totalThumbsUp = stats.reduce((s, t) => s + t.thumbs_up_30d, 0);
  const totalThumbsDown = stats.reduce((s, t) => s + t.thumbs_down_30d, 0);
  const totalChurned = stats.reduce((s, t) => s + t.churned_7d, 0);

  // Delivery failure alert: teams with > 10% failure rate
  const failureAlerts = stats.filter(
    (t) => t.sends_total_7d > 0 && t.sends_failed_7d / t.sends_total_7d > 0.1,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-bold text-fw-ink">Subscribers</h2>
        <p className="text-[13px] text-fw-ink-muted">
          Engagement metrics computed from raw send data. Updated on each page load.
        </p>
      </div>

      {/* Delivery failure alert */}
      {failureAlerts.length > 0 && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fff5f5] p-4">
          <p className="text-[13px] font-semibold text-[#dc2626] mb-1">
            ⚠ Delivery failure rate &gt; 10%
          </p>
          {failureAlerts.map((t) => (
            <p key={t.team_id} className="text-[12px] text-[#dc2626]">
              {t.team_city} {t.team_name}: {pct(t.sends_failed_7d, t.sends_total_7d)} failure rate
              ({t.sends_failed_7d}/{t.sends_total_7d} sends)
            </p>
          ))}
        </div>
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Active subscribers"
          value={totalActive}
          sub="across all teams"
          accent="#16a34a"
        />
        <StatCard
          label="Day 1 open rate"
          value={pct(totalOpens7d, totalSends7d)}
          sub="last 7 days"
          accent="#2563eb"
        />
        <StatCard
          label="Satisfaction"
          value={pct(totalThumbsUp, totalThumbsUp + totalThumbsDown)}
          sub="30-day thumbs up"
          accent="#16a34a"
        />
        <StatCard
          label="Churned (7d)"
          value={totalChurned}
          sub="unsubscribed or inactive"
          accent="#dc2626"
        />
      </div>

      {/* Per-team table */}
      {loading && <p className="text-[13px] text-fw-ink-muted">Loading stats…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          {error}
        </p>
      )}

      {!loading && !error && stats.length === 0 && (
        <div className="rounded-xl border border-fw-border bg-fw-card p-12 text-center">
          <p className="text-[15px] font-semibold text-fw-ink mb-2">No active subscribers yet</p>
          <p className="text-[13px] text-fw-ink-muted">
            Subscriber stats will appear here once teams have active subscribers.
          </p>
        </div>
      )}

      {!loading && stats.length > 0 && (
        <div className="rounded-xl border border-fw-border overflow-hidden">
          {/* Table header */}
          <div
            className="grid grid-cols-6 gap-4 px-4 py-3 text-[11px] font-semibold uppercase tracking-[1.5px] text-fw-ink-faint"
            style={{ background: "#f2f2f0" }}
          >
            <div className="col-span-2">Team</div>
            <div className="text-right">Subscribers</div>
            <div className="text-right">Open rate (7d)</div>
            <div className="text-right">Satisfaction (30d)</div>
            <div className="text-right">Churned (7d)</div>
          </div>

          {/* Table rows */}
          {stats.map((t, i) => {
            const openRate = pct(t.opens_total_7d, t.sends_total_7d);
            const satisfaction = pct(t.thumbs_up_30d, t.thumbs_up_30d + t.thumbs_down_30d);
            const hasFailure =
              t.sends_total_7d > 0 && t.sends_failed_7d / t.sends_total_7d > 0.1;

            return (
              <div
                key={t.team_id}
                className="grid grid-cols-6 gap-4 px-4 py-4 items-center"
                style={{
                  borderTop: i > 0 ? "1px solid #e8e8e8" : undefined,
                  background: hasFailure ? "#fff5f5" : "#ffffff",
                }}
              >
                {/* Team pill */}
                <div className="col-span-2 flex items-center gap-3">
                  <div
                    className="h-full w-[3px] flex-shrink-0 rounded-full self-stretch"
                    style={{ backgroundColor: t.team_primary_color, minHeight: "24px" }}
                  />
                  <span
                    className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium"
                    style={{
                      backgroundColor: t.team_primary_color,
                      color: "#ffffff",
                    }}
                  >
                    {t.team_city} {t.team_name}
                  </span>
                </div>

                <div className="text-right text-[14px] font-semibold text-fw-ink">
                  {t.active_subscribers}
                </div>

                <div className="text-right">
                  <span className="text-[14px] font-semibold text-fw-ink">{openRate}</span>
                  {t.sends_total_7d > 0 && (
                    <p className="text-[10px] text-fw-ink-muted">
                      {t.opens_total_7d}/{t.sends_total_7d}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-[14px] font-semibold text-fw-ink">{satisfaction}</span>
                  {(t.thumbs_up_30d + t.thumbs_down_30d) > 0 && (
                    <p className="text-[10px] text-fw-ink-muted">
                      👍 {t.thumbs_up_30d} / 👎 {t.thumbs_down_30d}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <span
                    className="text-[14px] font-semibold"
                    style={{ color: t.churned_7d > 0 ? "#dc2626" : "#111111" }}
                  >
                    {t.churned_7d}
                  </span>
                  {hasFailure && (
                    <p className="text-[10px] font-medium text-[#dc2626]">
                      {pct(t.sends_failed_7d, t.sends_total_7d)} delivery failure
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
