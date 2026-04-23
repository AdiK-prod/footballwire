import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "../config";

let _client: ReturnType<typeof createClient> | null = null;

/** Singleton browser Supabase client — uses anon key, respects RLS. */
export const getBrowserClient = () => {
  if (!_client) {
    _client = createClient(resolveSupabaseUrl(), resolveSupabaseAnonKey());
  }
  return _client;
};
