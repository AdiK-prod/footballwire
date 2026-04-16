/**
 * Bundles Vercel serverless handlers so `src/lib` is inlined (not deployed as /var/task/src).
 * Run after `vite build` via npm run build.
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
    external: ["@vercel/node"],
    logLevel: "info",
  });
}
