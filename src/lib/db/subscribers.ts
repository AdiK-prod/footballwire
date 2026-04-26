import { assertSupabaseClientConfig, supabase } from "@/lib/supabase/client";

type CreateSubscriberParams = {
  email: string;
  teamId: number;
};

/**
 * Subscribe an email to a team.
 * One email can follow multiple teams — uniqueness is enforced on (email, team_id).
 * If the subscription already exists but is inactive, it is reactivated.
 */
export const createSubscriber = async ({
  email,
  teamId,
}: CreateSubscriberParams): Promise<void> => {
  try {
    assertSupabaseClientConfig();
    const { error } = await supabase
      .from("subscribers")
      .upsert(
        { email, team_id: teamId, is_active: true },
        { onConflict: "email,team_id", ignoreDuplicates: false },
      );

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to create subscriber: ${message}`);
  }
};
