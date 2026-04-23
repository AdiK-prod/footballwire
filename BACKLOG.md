# Football Wire — Backlog

## Active

/

---

## Completed (Phase 5 — Admin Dashboard)

- [x] Install react-router-dom; set up client-side routing in main.tsx — Phase 5
- [x] Add SPA rewrite to vercel.json so /admin/* routes serve index.html — Phase 5
- [x] Create browser Supabase client (src/lib/supabase/browser.ts) — Phase 5
- [x] Create server-side session verifier (src/lib/auth/verifyAdminSession.ts) — Phase 5
- [x] Create admin DB queries (src/lib/db/adminDb.ts): sources, newsletters, articles, subscriber stats — Phase 5
- [x] Create Vercel admin API routes: /api/admin/sources (GET+POST), /api/admin/newsletters, /api/admin/subscribers, /api/admin/send-now — Phase 5
- [x] Build AdminLogin page with Supabase magic link flow — Phase 5
- [x] Build AdminApp layout with auth guard, tab navigation, logout — Phase 5
- [x] Build SourceQueueTab: stat cards, filters, approve/reject actions, inline validation detail — Phase 5
- [x] Build ContentPreviewTab: per-team newsletters with article scores, selection_reasoning, Send All Drafts — Phase 5
- [x] Build SubscribersTab: summary stat cards, per-team table with open rate / satisfaction / churn, delivery failure alert — Phase 5
- [x] Wire admin API bundles into bundle-vercel-api.mjs — Phase 5

---

## Completed (prd_v3.md alignment)

- [x] Read prd_v3.md and identify delta from v2 — prd_v3 alignment
- [x] Add `checkTeamRelevance` Claude API call to `src/lib/ai/claudePipeline.ts` — prd_v3 alignment
- [x] Add non-NFL keyword pre-filter on article title before relevance check — prd_v3 alignment
- [x] Add same-day URL deduplication via `getAlreadyProcessedUrlsToday` in `pipelineDb.ts` — prd_v3 alignment
- [x] Replace `textMentionsTeam` relevance with Claude `checkTeamRelevance` in `runTeamPipeline.ts` — prd_v3 alignment
- [x] Dedup step now runs on relevance-passed articles only (not just quality-passed) — prd_v3 alignment
- [x] Populate `selection_reasoning` deterministic strings on all `article_scores_log` rows — prd_v3 alignment
- [x] Update `articlesPayload.selection_reasoning` to `Selected: [category] article (score: [score])` format — prd_v3 alignment
- [x] Rebuild `buildNewsletterHtml` to v3 Email Design Specification (table layout, dark header, section labels, quick hit accent bar, injury section, stat block, footer buttons) — prd_v3 alignment
- [x] Add `source_name` to `SelectedArticle` type and pass through from pipeline — prd_v3 alignment
- [x] Update `CLAUDE.md`: PRD reference → prd_v3.md, add v3 filter rules, selection_reasoning format — prd_v3 alignment

---

## Completed

### Phase 2 — Source Validation Engine

_All Phase 2 tasks completed; detail retained below for history._

**Validation API Route**

- [x] Create Vercel API route: `app/api/validate-source/route.ts`
- [x] Add Zod schema validation for request payload (`url`, `teamId`, `sourceType`)
- [x] Implement structured JSON responses with proper HTTP status codes
- [x] Keep all business logic in `src/lib/services/sourceService.ts` (no route-level business logic)
- [x] Add timeout-safe error handling for all async steps (10s RSS check cap)

**Reachability + RSS Parsing**

- [x] Validate submitted URL is reachable and parseable RSS via `rss-parser`
- [x] On unreachable/invalid RSS set source `status = rejected` with rejection reason
- [x] Verify parser extraction of `title`, `link`, `pubDate`, `description` for validation samples

**Claude Relevance Check**

- [x] Add server-side Claude relevance check for team-specific coverage
- [x] Enforce strict JSON response parsing: `{ relevant: boolean, confidence: number }`
- [x] Approve source when `confidence >= 60`
- [x] Flag source when `confidence < 60` and persist validation notes
- [x] Wrap Claude call in try/catch with safe fallback (never crash request)

**Source Type + Filtering Rules**

- [x] Enforce source types: `general | team_specific | user_submitted`
- [x] Ensure general sources never go through validation endpoint
- [x] Persist type/status transitions correctly in Supabase
- [x] Track paywall-rate metadata field for future queue highlighting

**Admin Notification + Verification**

- [x] Trigger admin notification flow for flagged sources
- [x] Add test cases for valid, unreachable, and low-confidence source scenarios
- [x] Verify DoD: valid team-specific URL -> approved
- [x] Verify DoD: unreachable URL -> rejected with reason
- [x] Verify DoD: non-team URL confidence < 60 -> flagged + admin notified
- [x] Verify DoD: general sources bypass validation
- [x] Verify DoD: source `type` stored correctly for all records

---

### Phase 1 & setup — flat history

- [x] Add Phase 2 tasks to Active section upon Phase 1 completion — Phase 1
- [x] Create repository on GitHub (private) — Phase 1
- [x] Connect local repo to GitHub remote (`git remote add origin`) — Phase 1
- [x] Push initial commit to main branch — Phase 1
- [x] Verify push succeeds and repo is visible on GitHub — Phase 1
- [x] Confirm branch protection on main — changes via PR only — Phase 1
- [x] Connect GitHub repo to Vercel — Phase 1
- [x] Configure environment variables in Vercel dashboard — Phase 1
- [x] Verify app loads correctly at Vercel preview URL — Phase 1
- [x] Verify deployment triggers automatically on push to main — Phase 1
- [x] Verify each seeded RSS feed URL is reachable and returns valid RSS — Phase 1
- [x] Confirm RSS parser can extract: title, link, pubDate, description from each feed — Phase 1
- [x] Verify all migrations run without errors on fresh Supabase project — Phase 1
- [x] Initialize git repository (`git init`) — Phase 1
- [x] Create initial commit with project scaffold — Phase 1
- [x] Create `develop` branch for active development — Phase 1
- [x] Initialize React + Vite + TypeScript project with strict mode — Phase 1
- [x] Install and configure Tailwind CSS — Phase 1
- [x] Install and configure Supabase client (`@supabase/supabase-js`) — Phase 1
- [x] Set up `src/lib/config.ts` as single source for all environment variables — Phase 1
- [x] Create `.env.example` documenting all required variables — Phase 1
- [x] Configure path aliases (`@/` → `src/`) — Phase 1
- [x] Create migration: `teams` table — Phase 1
- [x] Create migration: `subscribers` table — Phase 1
- [x] Create migration: `sources` table (with `type` column: general | team_specific | user_submitted) — Phase 1
- [x] Create migration: `articles` table — Phase 1
- [x] Create migration: `newsletters` table — Phase 1
- [x] Create migration: `newsletter_sends` table — Phase 1
- [x] Create migration: `newsletter_metrics` table — Phase 1
- [x] Create migration: `pipeline_runs` table — Phase 1
- [x] Create migration: `article_scores_log` table — Phase 1
- [x] Create migration: `engagement_snapshots` table — Phase 1
- [x] Create migration: all required indexes (team_id, fetch_date, source_id, passed_threshold, newsletter_id, run_at) — Phase 1
- [x] Seed all 32 NFL teams with correct name, city, abbreviation, slug, division, conference, primary_color, secondary_color, accent_color — Phase 1
- [x] Seed 4-5 general sources as pre-approved (ESPN NFL, NFL.com, AP Sports, Pro Football Talk, The Athletic NFL) with type = general, status = approved, team_id = NULL — Phase 1
- [x] Install `rss-parser` npm package for RSS feed parsing — Phase 1
- [x] Build team selection grid: 32 teams as cards, organized by division — Phase 1
- [x] AFC / NFC / All filter tabs — Phase 1
- [x] Team card: abbreviation icon, team name, team color top strip on hover/select — Phase 1
- [x] Dynamic hero headline updating to selected team name — Phase 1
- [x] Signup form appears only after team selection (fade + slide up animation) — Phase 1
- [x] Email input (`#fbfbfb` bg, `#e8e8e8` border) + subscribe button in team primary_color — Phase 1
- [x] Signup form submits to Supabase — creates subscriber row — Phase 1
- [x] Confirmation state after successful signup — Phase 1
- [x] All team colors loaded from Supabase — never hardcoded — Phase 1
- [x] Configure Tailwind with design tokens matching CLAUDE.md spec — Phase 1
- [x] DM Sans font loaded via Google Fonts — Phase 1
- [x] Global CSS variables for all color tokens — Phase 1
- [x] Create `.gitignore` — exclude `.env`, `node_modules`, `.vercel`, Supabase local config — Phase 1
