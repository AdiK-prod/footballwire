import { getActiveSubscriberTeamIds } from "../db/pipelineDb";
import { runTeamPipeline } from "./runTeamPipeline";

const log = (msg: string, extra?: Record<string, unknown>) => {
  console.info(JSON.stringify({ scope: "pipeline-orchestrator", msg, ...extra }));
};

/** Step 0: active teams first; then one isolated run per team (PRD). */
export const runDailyPipeline = async (): Promise<void> => {
  const teamIds = await getActiveSubscriberTeamIds();
  log("active_teams", { count: teamIds.length, teamIds });

  for (const teamId of teamIds) {
    try {
      await runTeamPipeline(teamId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      log("team_run_failed_continuing", { teamId, message });
    }
  }
};
