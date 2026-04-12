import { getServiceRoleClient } from "@/lib/supabase/server";

export type SourceStatus = "pending" | "approved" | "rejected" | "flagged";
export type SourceType = "general" | "team_specific" | "user_submitted";

export type SourceRecord = {
  id: number;
  team_id: number | null;
  url: string;
  name: string;
  type: SourceType;
  status: SourceStatus;
  relevance_score: number | null;
};

export const createPendingSource = async (params: {
  url: string;
  teamId: number | null;
  type: SourceType;
  submittedBy: string;
}) => {
  const supabase = getServiceRoleClient();

  const { data, error } = await supabase
    .from("sources")
    .insert({
      url: params.url,
      team_id: params.teamId,
      type: params.type,
      status: "pending",
      paywall_rate: 0,
      name: new URL(params.url).hostname,
      submitted_by: params.submittedBy,
    })
    .select("id, team_id, url, name, type, status, relevance_score")
    .single<SourceRecord>();

  if (error) {
    throw new Error(`Failed to create source: ${error.message}`);
  }

  return data;
};

export const updateSourceStatus = async (params: {
  id: number;
  status: SourceStatus;
  relevanceScore: number | null;
  validationNotes: string;
}) => {
  const supabase = getServiceRoleClient();

  const { error } = await supabase
    .from("sources")
    .update({
      status: params.status,
      relevance_score: params.relevanceScore,
      validation_notes: params.validationNotes,
    })
    .eq("id", params.id);

  if (error) {
    throw new Error(`Failed to update source status: ${error.message}`);
  }
};

export const getTeamNameById = async (teamId: number) => {
  const supabase = getServiceRoleClient();

  const { data, error } = await supabase
    .from("teams")
    .select("city, name")
    .eq("id", teamId)
    .single<{ city: string; name: string }>();

  if (error) {
    throw new Error(`Failed to load team: ${error.message}`);
  }

  return `${data.city} ${data.name}`;
};
