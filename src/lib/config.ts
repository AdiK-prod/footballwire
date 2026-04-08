const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export const config = {
  supabaseUrl: env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY ?? "",
  // Server-only values are intentionally non-VITE so they stay private.
  supabaseServiceRoleKey:
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.SUPABASE_SERVICE_ROLE_KEY ?? "",
  anthropicApiKey:
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.ANTHROPIC_API_KEY ?? "",
  resendApiKey:
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.RESEND_API_KEY ?? "",
  resendFrom:
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.RESEND_FROM ?? "",
  adminAlertEmail:
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.ADMIN_ALERT_EMAIL ?? "",
} as const;
