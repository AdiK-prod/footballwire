import { useEffect, useMemo, useState } from "react";
import { createSubscriber } from "@/lib/db/subscribers";
import { getTeams } from "@/lib/db/teams";
import type { Team } from "@/lib/types";

type ConferenceFilter = "All" | "AFC" | "NFC";

const conferenceFilters: ConferenceFilter[] = ["All", "AFC", "NFC"];

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

  const teamColorCss = useMemo(() => {
    return teams
      .map((team) => {
        const key = `team-${team.id}`;
        return `
          .${key}-strip { background-color: ${team.primary_color}; }
          .${key}-abbr { color: ${team.secondary_color}; }
          .${key}-button { background-color: ${team.primary_color}; }
        `;
      })
      .join("\n");
  }, [teams]);

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
    <main className="min-h-screen bg-app-bg px-6 py-10">
      <style>{teamColorCss}</style>
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-faint">
            Football Wire
          </p>
          <h1 className="text-3xl font-bold text-text-primary">
            {selectedTeam
              ? `${selectedTeam.city} ${selectedTeam.name} Daily Briefing`
              : "Your Team. Every Morning."}
          </h1>
          <p className="text-sm text-text-secondary">
            Pick your NFL team and get a 5-minute morning newsletter.
          </p>
        </header>

        <section className="rounded-xl border border-border-default bg-surface-card p-4">
          <div className="mb-4 flex gap-2">
            {conferenceFilters.map((filter) => (
              <button
                type="button"
                key={filter}
                onClick={() => setConferenceFilter(filter)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                  conferenceFilter === filter
                    ? "border-border-mid bg-tab-active text-text-primary"
                    : "border-border-default bg-white text-text-secondary"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {isLoadingTeams ? (
            <p className="text-sm text-text-secondary">Loading teams...</p>
          ) : null}
          {teamLoadError ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {teamLoadError}
            </p>
          ) : null}

          {!isLoadingTeams && !teamLoadError ? (
            <div className="space-y-6">
              {Object.entries(groupedTeams).map(([division, divisionTeams]) => (
                <div key={division} className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-text-faint">
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
                          className="overflow-hidden rounded-lg border border-border-default bg-white text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                        >
                          <div className={`h-1.5 w-full team-${team.id}-strip`} />
                          <div className="space-y-1 p-3">
                            <p
                              className={`text-xs font-semibold uppercase tracking-[0.1em] team-${team.id}-abbr`}
                            >
                              {team.abbreviation}
                            </p>
                            <p className="text-sm font-semibold text-text-primary">
                              {team.city} {team.name}
                            </p>
                            {isSelected ? (
                              <p className="text-xs text-text-muted">
                                Selected
                              </p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {selectedTeam && !isSuccess ? (
          <section className="rounded-xl border border-border-default bg-white p-6 shadow-sm transition-all duration-300">
            <h2 className="text-lg font-semibold text-text-primary">
              Subscribe to {selectedTeam.city} {selectedTeam.name}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Enter your email to receive daily updates.
            </p>
            <form className="mt-4 space-y-3" onSubmit={handleSubscribe}>
              <label className="block text-sm font-medium text-text-secondary">
                Email address
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border-default bg-input-bg px-3 py-2 text-sm outline-none focus:border-border-mid"
                />
              </label>
              {submitError ? (
                <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                  {submitError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={isSubmitting}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 team-${selectedTeam.id}-button`}
              >
                {isSubmitting ? "Subscribing..." : "Subscribe"}
              </button>
            </form>
          </section>
        ) : null}

        {isSuccess ? (
          <section className="rounded-xl border border-green-200 bg-green-50 p-6">
            <h2 className="text-lg font-semibold text-green-800">
              You are subscribed.
            </h2>
            <p className="text-sm text-green-700">
              Your first newsletter arrives tomorrow morning.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
};
