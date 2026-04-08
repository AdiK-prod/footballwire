import { createClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);

export const supabase = createClient(
  hasSupabaseConfig ? config.supabaseUrl : "https://placeholder.supabase.co",
  hasSupabaseConfig ? config.supabaseAnonKey : "placeholder-anon-key",
);

export const assertSupabaseClientConfig = () => {
  if (!hasSupabaseConfig) {
    throw new Error(
      "Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.",
    );
  }
};
