/**
 * Bundles Vercel serverless handlers so `src/lib` is inlined (not deployed as /var/task/src).
 * Run after `vite build` via npm run build.
 *
 * Outputs are committed to `api/` so Git deployments always ship serverless functions even if
 * a build step is skipped. After changing `server/vercel/*.ts` or `src/lib` used by API routes,
 * run `npm run build` and commit the updated JS bundles under `api/` (e.g. cron and validate-source).
 */
import * as esbuild from "esbuild";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const bundles = [
  {
    entry: join(root, "server/vercel/run-pipeline.ts"),
    outfile: join(root, "api/cron/run-pipeline.js"),
  },
  {
    entry: join(root, "server/vercel/validate-source.ts"),
    outfile: join(root, "api/validate-source.js"),
  },
  {
    entry: join(root, "server/vercel/send-newsletters.ts"),
    outfile: join(root, "api/cron/send-newsletters.js"),
  },
  {
    entry: join(root, "server/vercel/track-open.ts"),
    outfile: join(root, "api/track/open.js"),
  },
  {
    entry: join(root, "server/vercel/track-feedback.ts"),
    outfile: join(root, "api/track/feedback.js"),
  },
  {
    entry: join(root, "server/vercel/unsubscribe.ts"),
    outfile: join(root, "api/unsubscribe.js"),
  },
];

for (const { entry, outfile } of bundles) {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile,
    format: "esm",
    sourcemap: false,
    // rss-parser uses require("http"/"https"); bundling breaks with "Dynamic require is not supported".
    // Supabase client also expects normal Node resolution for optional deps.
    external: ["@vercel/node", "rss-parser", "@supabase/supabase-js"],
    logLevel: "info",
  });
}
