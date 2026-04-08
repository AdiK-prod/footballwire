import { assertSupabaseClientConfig, supabase } from "@/lib/supabase/client";
import type { Team } from "@/lib/types";

export const getTeams = async (): Promise<Team[]> => {
  try {
    assertSupabaseClientConfig();
    const { data, error } = await supabase
      .from("teams")
      .select(
        "id, name, city, slug, abbreviation, primary_color, secondary_color, accent_color, division, conference",
      )
      .order("conference", { ascending: true })
      .order("division", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to load teams: ${message}`);
  }
};
