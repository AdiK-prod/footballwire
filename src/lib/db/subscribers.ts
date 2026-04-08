import { assertSupabaseClientConfig, supabase } from "@/lib/supabase/client";

type CreateSubscriberParams = {
  email: string;
  teamId: number;
};

export const createSubscriber = async ({
  email,
  teamId,
}: CreateSubscriberParams): Promise<void> => {
  try {
    assertSupabaseClientConfig();
    const { error } = await supabase.from("subscribers").insert({
      email,
      team_id: teamId,
      is_active: true,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to create subscriber: ${message}`);
  }
};
