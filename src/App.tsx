import { useEffect, useMemo, useState } from "react";
import { createSubscriber } from "@/lib/db/subscribers";
import { getTeams } from "@/lib/db/teams";
import type { Team } from "@/lib/types";

type ConferenceFilter = "All" | "AFC" | "NFC";

const conferenceFilters: ConferenceFilter[] = ["All", "AFC", "NFC"];

const isLightColor = (hexColor?: string) => {
  if (!hexColor || hexColor.length !== 7 || !hexColor.startsWith("#")) {
    return false;
  }

  const r = Number.parseInt(hexColor.slice(1, 3), 16);
  const g = Number.parseInt(hexColor.slice(3, 5), 16);
  const b = Number.parseInt(hexColor.slice(5, 7), 16);

  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
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
      <nav className="w-full border-b border-fw-border bg-fw-white">
        <div className="mx-auto flex w-full max-w-[860px] items-center justify-between px-4 py-3 sm:px-8 sm:py-4">
          <p className="text-[14px] font-bold uppercase tracking-[2px] text-fw-ink">
            Football Wire
          </p>
          <p className="text-[11px] text-fw-ink-faint">Free · Daily · 5 min</p>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-[860px] space-y-8 px-4 sm:px-8">
        <section className="space-y-4 pb-10 pt-12 text-left">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[2.5px] text-fw-ink-muted">
            <span
              className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full transition-colors duration-300"
              style={{ backgroundColor: selectedTeam?.primary_color ?? "#888888" }}
            />
            Daily team briefing
          </p>

          <h1 className="text-[clamp(38px,5vw,52px)] font-bold leading-[1.05] tracking-[-0.5px] text-fw-ink">
            <span className="block">Everything that matters.</span>
            <span
              className={`block ${
                selectedTeam ? "" : "text-fw-ink-faint"
              }`}
              style={
                selectedTeam ? { color: selectedTeam.primary_color } : undefined
              }
            >
              {selectedTeam ? `${selectedTeam.city} ${selectedTeam.name}.` : "Pick your team."}
            </span>
          </h1>

          <p className="text-[16px] font-normal leading-[1.7] text-fw-ink-mid">
            One newsletter. Your team. Every morning.
          </p>

          <div className="mb-7 flex flex-wrap gap-1.5">
            {["Top Stories", "Injuries", "Stat of the Day"].map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-fw-border-mid bg-fw-card px-3 py-[5px] text-[12px] font-medium text-fw-ink-muted"
              >
                {chip}
              </span>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="mb-[14px] flex items-center justify-between">
            <div className="inline-flex gap-0.5 rounded-lg border border-fw-border-mid bg-fw-white p-[3px]">
              {conferenceFilters.map((filter) => {
                const isActive = conferenceFilter === filter;
                return (
                  <button
                    type="button"
                    key={filter}
                    onClick={() => setConferenceFilter(filter)}
                    className="px-4 py-[7px] text-[12px] font-semibold uppercase tracking-[1.5px] transition-colors duration-150"
                    style={{
                      borderRadius: "5px",
                      backgroundColor: isActive ? "#e8e8e8" : "transparent",
                      color: isActive ? "#111111" : "#888888",
                    }}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
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
            <div className="space-y-0">
              {Object.entries(groupedTeams).map(([division, divisionTeams]) => (
                <div key={division} className="mb-6">
                  <h2 className="mb-2 mt-5 pl-[2px] text-[11px] font-semibold uppercase tracking-[2px] text-fw-ink-faint">
                    {division}
                  </h2>

                  <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-4">
                    {divisionTeams.map((team) => {
                      const isSelected = selectedTeam?.id === team.id;
                      return (
                        <button
                          type="button"
                          key={team.id}
                          onClick={() => setSelectedTeam(team)}
                          className={`relative overflow-hidden rounded-[10px] border-[1.5px] p-[16px_10px_14px] text-center transition-all duration-200 ${
                            isSelected ? "bg-fw-white" : "bg-fw-card"
                          }`}
                          style={{
                            borderColor: isSelected
                              ? team.primary_color
                              : `${team.primary_color}55`,
                            transform: "translateY(0)",
                          }}
                          onMouseEnter={(event) => {
                            const current = event.currentTarget;
                            current.style.transform = "translateY(-2px)";
                            current.style.borderColor = team.primary_color;
                            const strip = current.querySelector(".strip") as HTMLDivElement | null;
                            if (strip) {
                              strip.style.opacity = "1";
                            }
                          }}
                          onMouseLeave={(event) => {
                            const current = event.currentTarget;
                            current.style.transform = "translateY(0)";
                            current.style.borderColor = isSelected
                              ? team.primary_color
                              : `${team.primary_color}55`;
                            const strip = current.querySelector(".strip") as HTMLDivElement | null;
                            if (strip) {
                              strip.style.opacity = isSelected ? "1" : "0.4";
                            }
                          }}
                        >
                          <div
                            className="strip absolute left-0 top-0 h-[3px] w-full"
                            style={{
                              backgroundColor: team.primary_color,
                              opacity: isSelected ? 1 : 0.4,
                              transition: "opacity 0.2s ease",
                            }}
                          />

                          {isSelected ? (
                            <div
                              className="absolute right-[7px] top-[7px] flex h-4 w-4 items-center justify-center rounded-full"
                              style={{ backgroundColor: team.primary_color }}
                            >
                              <svg
                                width="8"
                                height="8"
                                viewBox="0 0 8 8"
                                fill="none"
                                aria-hidden
                              >
                                <path
                                  d="M1.5 4l2 2L6.5 2"
                                  stroke="white"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </div>
                          ) : null}

                          <div
                            className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg"
                            style={{ backgroundColor: `${team.primary_color}18` }}
                          >
                            <span
                              className="text-[12px] font-bold tracking-[0.3px]"
                              style={{ color: team.primary_color }}
                            >
                              {team.abbreviation}
                            </span>
                          </div>

                          <p
                            className="text-[13px] font-normal leading-[1.3] break-words"
                            style={{ color: isSelected ? "#444444" : "#888888" }}
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
            className={`mt-5 w-full rounded-xl border-[1.5px] border-fw-border-mid bg-fw-card p-6 transition-all duration-500 ${
              selectedTeam
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-5 opacity-0"
            }`}
            style={
              selectedTeam
                ? { borderLeft: `4px solid ${selectedTeam.primary_color}` }
                : { borderLeft: "4px solid #d4d4d4" }
            }
          >
            <h2 className="mb-1 text-[20px] font-bold text-fw-ink">
              Get{" "}
              <span style={selectedTeam ? { color: selectedTeam.primary_color } : undefined}>
                {selectedTeam?.name ?? "your team"}
              </span>{" "}
              Wire
            </h2>
            <p className="mb-[18px] text-[13px] font-light text-fw-ink-muted">
              Delivered every morning before you start your day.
            </p>

            <form className="space-y-3" onSubmit={handleSubscribe}>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 rounded-lg border border-fw-border bg-fw-input-bg px-4 py-3 text-[14px] text-fw-ink placeholder:text-fw-ink-faint focus:border-fw-border-mid focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedTeam}
                  className="whitespace-nowrap rounded-lg px-6 py-3 text-[12px] font-bold uppercase tracking-[1px] disabled:opacity-60"
                  style={
                    selectedTeam
                      ? {
                          backgroundColor: selectedTeam.primary_color,
                          color: isLightColor(selectedTeam.primary_color) ? "#111111" : "#ffffff",
                        }
                      : undefined
                  }
                >
                  {isSubmitting
                    ? "Submitting..."
                    : `Get ${selectedTeam?.abbreviation ?? ""} Wire`}
                </button>
              </div>

              {submitError ? (
                <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                  {submitError}
                </p>
              ) : null}

              <p className="text-[11px] text-fw-ink-faint">
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
      </div>

      <footer className="mt-12 w-full border-t border-fw-border">
        <div className="mx-auto flex w-full max-w-[860px] items-center justify-between px-4 py-3 sm:px-8 sm:py-7">
          <p className="text-[12px] font-bold uppercase tracking-[3px] text-fw-ink-faint">
            Football Wire
          </p>
          <p className="text-[11px] text-fw-ink-faint">© 2025 · Built for fans</p>
        </div>
      </footer>
    </main>
  );
};
