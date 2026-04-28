/**
 * Strip control characters from any string before writing to Supabase.
 *
 * Raw \n, \r, \t and null bytes embedded in Claude-generated text are valid
 * JSON at the HTTP level but cause the Supabase PostgREST SDK to crash on its
 * internal JSON.parse() of the server response — corrupting the pipeline run.
 *
 * Apply to: selection_reasoning, rejection_reason, ai_summary, headline,
 * notes, and any other Claude text output before any DB insert or upsert.
 */
export const sanitizeForDb = (str: string | null | undefined): string => {
  if (!str) return str ?? "";
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // control chars (keep \t → strip below)
    .replace(/\r\n/g, " ")
    .replace(/[\r\n]/g, " ")
    .replace(/\t/g, " ")
    .trim();
};
