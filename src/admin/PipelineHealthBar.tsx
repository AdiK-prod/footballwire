import { useEffect, useState } from "react";

type PipelineHealthRun = {
  team_id: number;
  team_city: string;
  team_name: string;
  run_at: string;
  status: "partial" | "completed" | "failed";
  articles_selected: number;
  newsletter_sent: boolean;
  notes: string | null;
};

type Props = {
  accessToken: string;
};

const formatTime = (iso: string): string => {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getUTCFullYear() === now.getUTCFullYear() &&
      d.getUTCMonth() === now.getUTCMonth() &&
      d.getUTCDate() === now.getUTCDate();
    const time = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });
    return isToday ? `Today ${time}` : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` ${time}`;
  } catch {
    return iso;
  }
};

const RunRow = ({ run }: { run: PipelineHealthRun }) => {
  const isGreen = run.status === "completed" && run.newsletter_sent;
  const dot = isGreen ? "🟢" : "🔴";
  const teamName = `${run.team_city} ${run.team_name}`;

  let detail: string;
  if (run.status === "failed") {
    const errorMsg = run.notes ? run.notes.slice(0, 60) : "Pipeline failed";
    detail = `Failed — ${errorMsg}`;
  } else if (run.newsletter_sent) {
    detail = `${run.articles_selected} article${run.articles_selected !== 1 ? "s" : ""} selected · Newsletter sent`;
  } else {
    detail = `${run.articles_selected} article${run.articles_selected !== 1 ? "s" : ""} selected · Not sent`;
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-fw-ink-muted whitespace-nowrap">
      <span>{dot}</span>
      <span className="text-fw-ink font-medium">{formatTime(run.run_at)}</span>
      <span className="text-fw-ink-faint">·</span>
      <span>{teamName}</span>
      <span className="text-fw-ink-faint">·</span>
      <span>{detail}</span>
    </span>
  );
};

export const PipelineHealthBar = ({ accessToken }: Props) => {
  const [runs, setRuns] = useState<PipelineHealthRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/admin/pipeline-health", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean; runs: PipelineHealthRun[] };
        if (data.ok) setRuns(data.runs);
      } catch {
        // silently skip — bar is non-critical
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [accessToken]);

  if (loading) {
    return (
      <div className="border-b border-fw-border bg-[#f8f8f8] px-6 py-2">
        <p className="text-[11px] text-fw-ink-faint">Loading pipeline status…</p>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="border-b border-fw-border bg-[#f8f8f8] px-6 py-2">
        <p className="text-[11px] text-fw-ink-faint">No pipeline runs found</p>
      </div>
    );
  }

  return (
    <div className="border-b border-fw-border bg-[#f8f8f8]">
      <div className="mx-auto max-w-[1100px] px-6 py-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-[2px] text-fw-ink-faint shrink-0">
            Pipeline
          </span>
          {runs.map((run) => (
            <RunRow key={run.team_id} run={run} />
          ))}
        </div>
      </div>
    </div>
  );
};
