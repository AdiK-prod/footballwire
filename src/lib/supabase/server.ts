import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

/** Service-role client for server-only code (cron, API routes). Never import in browser bundles. */
export const getServiceRoleClient = (): SupabaseClient => {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase URL or service role key. Set VITE_SUPABASE_URL or SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY (Vercel env for API routes).",
    );
  }

  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
