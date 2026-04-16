const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

const serverEnv = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;

/**
 * Browser: Vite injects `import.meta.env.VITE_*`.
 * Vercel Node serverless / API routes: use `process.env` (often same keys, or `SUPABASE_*` duplicates).
 */
const str = (value: string | undefined): string => (value ?? "").trim();

export const resolveSupabaseUrl = (): string =>
  str(viteEnv.VITE_SUPABASE_URL) ||
  str(serverEnv()?.VITE_SUPABASE_URL) ||
  str(serverEnv()?.SUPABASE_URL) ||
  str(serverEnv()?.NEXT_PUBLIC_SUPABASE_URL);

export const resolveSupabaseAnonKey = (): string =>
  str(viteEnv.VITE_SUPABASE_ANON_KEY) ||
  str(serverEnv()?.VITE_SUPABASE_ANON_KEY) ||
  str(serverEnv()?.SUPABASE_ANON_KEY) ||
  str(serverEnv()?.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Server-only. Read at call time (cron auth, tests). Prefer `CRON_SECRET`; `VERCEL_CRON_SECRET` supported as alias. */
export const getCronSecret = (): string => {
  const e = serverEnv();
  return e?.CRON_SECRET ?? e?.VERCEL_CRON_SECRET ?? "";
};

export const config = {
  get supabaseUrl(): string {
    return resolveSupabaseUrl();
  },
  get supabaseAnonKey(): string {
    return resolveSupabaseAnonKey();
  },
  // Server-only values are intentionally non-VITE so they stay private.
  get supabaseServiceRoleKey(): string {
    return str(serverEnv()?.SUPABASE_SERVICE_ROLE_KEY);
  },
  get anthropicApiKey(): string {
    return str(serverEnv()?.ANTHROPIC_API_KEY);
  },
  /** Override default model if snapshot ID is unavailable (400). See docs.anthropic.com models. */
  get anthropicModel(): string {
    return (
      str(serverEnv()?.ANTHROPIC_MODEL) ||
      str(serverEnv()?.CLAUDE_MODEL) ||
      "claude-haiku-4-5-20251001"
    );
  },
  get resendApiKey(): string {
    return str(serverEnv()?.RESEND_API_KEY);
  },
  get resendFrom(): string {
    return str(serverEnv()?.RESEND_FROM);
  },
  get adminAlertEmail(): string {
    return str(serverEnv()?.ADMIN_ALERT_EMAIL);
  },
} as const;
