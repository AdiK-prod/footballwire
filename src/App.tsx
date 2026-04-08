import { useEffect, useMemo, useState } from "react";
import { createSubscriber } from "@/lib/db/subscribers";
import { getTeams } from "@/lib/db/teams";
import type { Team } from "@/lib/types";

type ConferenceFilter = "All" | "AFC" | "NFC";

const conferenceFilters: ConferenceFilter[] = ["All", "AFC", "NFC"];

const getContrastTextColor = (hexColor: string) => {
  const normalized = hexColor.replace("#", "");
  if (normalized.length !== 6) {
    return "#ffffff";
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  return luminance > 180 ? "#111111" : "#ffffff";
};

export const App = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [teamLoadError, setTeamLoadError] = useState("");
  const [conferenceFilter, setConferenceFilter] =
    useState<ConferenceFilter>("All");
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const loadTeams = async () => {
      try {
        const allTeams = await getTeams();
        setTeams(allTeams);
      } catch (error) {
        setTeamLoadError(
          error instanceof Error ? error.message : "Failed to load teams",
        );
      } finally {
        setIsLoadingTeams(false);
      }
    };

    void loadTeams();
  }, []);

  const groupedTeams = useMemo(() => {
    const filteredTeams =
      conferenceFilter === "All"
        ? teams
        : teams.filter((team) => team.conference === conferenceFilter);

    return filteredTeams.reduce<Record<string, Team[]>>((groups, team) => {
      const existing = groups[team.division] ?? [];
      groups[team.division] = [...existing, team];
      return groups;
    }, {});
  }, [conferenceFilter, teams]);

  const handleSubscribe = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");

    if (!selectedTeam) {
      setSubmitError("Select a team first.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createSubscriber({
        email,
        teamId: selectedTeam.id,
      });
      setIsSuccess(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Could not complete subscription.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-fw-white">
      <div className="border-b border-fw-border bg-fw-white px-8 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <p className="text-sm font-bold uppercase tracking-[2px] text-fw-ink">
            FOOTBALL WIRE
          </p>
          <p className="text-xs text-fw-ink-faint">Free · Daily · 5 min</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-8 px-8 py-10">
        <section className="space-y-4">
          <p className="text-[9px] font-semibold uppercase tracking-[2.5px] text-fw-ink-muted">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-fw-ink-muted" />
            DAILY TEAM BRIEFING
          </p>

          <h1 className="text-[32px] font-bold leading-tight tracking-[-0.5px] text-fw-ink">
            <span className="block">Everything that matters.</span>
            <span
              className={`block ${
                selectedTeam ? "" : "text-fw-ink-faint"
              }`}
              style={
                selectedTeam ? { color: selectedTeam.primary_color } : undefined
              }
            >
              {selectedTeam ? `${selectedTeam.city} ${selectedTeam.name}` : "Pick your team."}
            </span>
          </h1>

          <p className="text-base font-light leading-relaxed text-fw-ink-mid">
            One newsletter. Your team. Every morning.
          </p>

          <div className="flex flex-wrap gap-2">
            {["Top Stories", "Injuries", "Stat of the Day"].map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-fw-border-mid bg-fw-card px-3 py-1 text-[10px] font-medium text-fw-ink-muted"
              >
                {chip}
              </span>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="inline-flex gap-0.5 rounded-lg border border-fw-border-mid bg-fw-white p-1">
            {conferenceFilters.map((filter) => (
              <button
                type="button"
                key={filter}
                onClick={() => setConferenceFilter(filter)}
                className={`rounded-md px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[1px] ${
                  conferenceFilter === filter
                    ? "bg-fw-tab-active text-fw-ink"
                    : "text-fw-ink-muted"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {isLoadingTeams ? (
            <p className="text-sm text-fw-ink-muted">Loading teams...</p>
          ) : null}
          {teamLoadError ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {teamLoadError}
            </p>
          ) : null}

          {!isLoadingTeams && !teamLoadError ? (
            <div className="space-y-5">
              {Object.entries(groupedTeams).map(([division, divisionTeams]) => (
                <div key={division}>
                  <h2 className="mb-2 mt-4 text-[9px] font-semibold uppercase tracking-[2px] text-fw-ink-faint">
                    {division}
                  </h2>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {divisionTeams.map((team) => {
                      const isSelected = selectedTeam?.id === team.id;
                      return (
                        <button
                          type="button"
                          key={team.id}
                          onClick={() => setSelectedTeam(team)}
                          className={`group relative overflow-hidden rounded-[10px] border-[1.5px] bg-fw-card p-3.5 text-center transition-all duration-200 ${
                            isSelected
                              ? "bg-fw-white"
                              : "border-fw-border hover:-translate-y-[2px] hover:border-fw-border-mid"
                          }`}
                          style={isSelected ? { borderColor: team.primary_color } : undefined}
                        >
                          <div
                            className={`absolute left-0 top-0 h-[3px] w-full origin-left bg-transparent transition-transform duration-200 ${
                              isSelected ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                            }`}
                            style={{ backgroundColor: team.primary_color }}
                          />

                          <div
                            className={`absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full text-white transition-all duration-200 ${
                              isSelected ? "scale-100 opacity-100" : "scale-50 opacity-0"
                            }`}
                            style={{ backgroundColor: team.primary_color }}
                            aria-hidden={!isSelected}
                          >
                            <svg viewBox="0 0 20 20" className="h-2.5 w-2.5 fill-current">
                              <path d="M7.6 13.2 4.8 10.4l-1.4 1.4 4.2 4.2 9-9-1.4-1.4z" />
                            </svg>
                          </div>

                          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-fw-tab-active">
                            <span
                              className="text-[10px] font-bold"
                              style={{ color: team.primary_color }}
                            >
                              {team.abbreviation}
                            </span>
                          </div>

                          <p
                            className={`text-[10.5px] leading-snug ${
                              isSelected
                                ? "font-medium text-fw-ink-mid"
                                : "font-normal text-fw-ink-muted"
                            }`}
                          >
                            {team.city} {team.name}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {!isSuccess ? (
          <section
            className={`rounded-xl border-[1.5px] border-l-4 border-fw-border-mid bg-fw-card p-6 transition-all duration-500 ${
              selectedTeam
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-4 opacity-0"
            }`}
            style={selectedTeam ? { borderLeftColor: selectedTeam.primary_color } : undefined}
          >
            <h2 className="text-lg font-bold text-fw-ink">
              Subscribe to{" "}
              <span style={selectedTeam ? { color: selectedTeam.primary_color } : undefined}>
                {selectedTeam ? `${selectedTeam.city} ${selectedTeam.name}` : "your team"}
              </span>
            </h2>
            <p className="mb-4 text-xs font-light text-fw-ink-muted">
              Enter your email to receive daily updates.
            </p>

            <form className="space-y-3" onSubmit={handleSubscribe}>
              <label className="block text-sm font-medium text-fw-ink-mid">
                Email address
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-lg border border-fw-border bg-fw-input-bg px-4 py-3 text-sm text-fw-ink placeholder:text-fw-ink-faint focus:border-fw-border-mid focus:outline-none"
                />
              </label>

              {submitError ? (
                <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                  {submitError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || !selectedTeam}
                className="rounded-lg px-6 py-3 text-[11px] font-bold uppercase tracking-[1px] disabled:opacity-60"
                style={
                  selectedTeam
                    ? {
                        backgroundColor: selectedTeam.primary_color,
                        color: getContrastTextColor(selectedTeam.primary_color),
                      }
                    : undefined
                }
              >
                {isSubmitting ? "Subscribing..." : "Subscribe"}
              </button>

              <p className="mt-2.5 text-[10px] text-fw-ink-faint">
                Free forever · No spam · Unsubscribe anytime
              </p>
            </form>
          </section>
        ) : null}

        {isSuccess ? (
          <section className="rounded-xl border border-green-200 bg-green-50 p-6">
            <h2 className="text-lg font-semibold text-green-800">You are subscribed.</h2>
            <p className="text-sm text-green-700">
              Your first newsletter arrives tomorrow morning.
            </p>
          </section>
        ) : null}

        <footer className="mt-12 flex items-center justify-between border-t border-fw-border pt-8">
          <p className="text-[11px] font-bold uppercase tracking-[3px] text-fw-ink-faint">
            FOOTBALL WIRE
          </p>
          <p className="text-[11px] text-fw-ink-faint">© 2025 · Built for fans</p>
        </footer>
      </div>
    </main>
  );
};
