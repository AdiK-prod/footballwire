import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "../config";

/**
 * Server-side: verifies a Supabase Bearer token from Authorization header.
 * Returns user info on success, null on failure/missing token.
 */
export const verifyAdminSession = async (
  authHeader: string | undefined,
): Promise<{ userId: string; email: string } | null> => {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const supabase = createClient(resolveSupabaseUrl(), resolveSupabaseAnonKey());
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return { userId: user.id, email: user.email ?? "" };
  } catch {
    return null;
  }
};
